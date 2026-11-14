import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Ambulance, UserPlus, UserRoundX } from "lucide-react";
import {
  BackendApiError,
  createManagedAccount,
  createManagedAmbulance,
  assignManagedAccount,
  deactivateManagedAccount,
  deactivateManagedAmbulance,
  getAccountManagementConfig,
  listManagedAccounts,
  listManagedAmbulances,
  resendManagedActivation,
  requestManagedRecovery,
  type ManagedAccount,
  type ManagedAmbulance,
  type ManagedInstitution,
} from "@/lib/backend";

function errorText(error: unknown) {
  if (error instanceof BackendApiError) {
    const fields = Object.values(error.fields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
    return fields.length ? fields.join(" ") : error.message;
  }
  return "No se pudo conectar con el backend local.";
}

export function AdminAccountsPanel({ currentUserId, institutionName }: { currentUserId: string; institutionName: string }) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [ambulances, setAmbulances] = useState<ManagedAmbulance[]>([]);
  const [operatorInstitutions, setOperatorInstitutions] = useState<ManagedInstitution[]>([]);
  const [canCreateAccounts, setCanCreateAccounts] = useState(false);
  const [delegableGroups, setDelegableGroups] = useState<string[]>([]);
  const [resolvedInstitutionName, setResolvedInstitutionName] = useState(institutionName);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [ambulanceId, setAmbulanceId] = useState("");
  const [operatorInstitutionId, setOperatorInstitutionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitInstitutionId, setUnitInstitutionId] = useState("");
  const mounted = useRef(false);
  const busy = useRef(false);
  const refreshVersion = useRef(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [activePanel, setActivePanel] = useState<"create" | "history" | "units">("create");

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const current = () => mounted.current && version === refreshVersion.current;
    setLoading(true);
    setError("");
    try {
      const [nextAccounts, nextAmbulances, config] = await Promise.all([
        listManagedAccounts(),
        listManagedAmbulances(),
        getAccountManagementConfig(),
      ]);
      if (!current()) return false;
      setAccounts(nextAccounts);
      setAmbulances(nextAmbulances);
      setDelegableGroups(config.delegable_groups);
      setResolvedInstitutionName(config.institution_name);
      setOperatorInstitutions(config.operator_institutions);
      setCanCreateAccounts(config.can_create_accounts);
      setOperatorInstitutionId((id) => id || config.operator_institutions[0]?.id || "");
      setUnitInstitutionId((id) => id || config.operator_institutions[0]?.id || "");
      setNeedsRefresh(false);
      return true;
    } catch (requestError) {
      if (current()) { setError(errorText(requestError)); setNeedsRefresh(true); }
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; refreshVersion.current += 1; };
  }, [refresh]);

  async function mutate(action: (isCurrent: () => boolean) => Promise<unknown>, success: string, reset = () => {}) {
    if (busy.current || loading || needsRefresh || !mounted.current) return;
    busy.current = true;
    setSubmitting(true);
    setError("");
    setMessage("");
    const current = () => mounted.current;
    try {
      await action(current);
      if (!current()) return;
      reset();
      // A successful write followed by a failed refresh is not a failed write.
      setMessage(success);
      await refresh();
    } catch (requestError) {
      if (!current()) return;
      setError(errorText(requestError));
      if (!(requestError instanceof BackendApiError) || requestError.status >= 500 || requestError.status === 409 || requestError.status === 401 || requestError.status === 403) {
        setNeedsRefresh(true);
      }
    } finally {
      busy.current = false;
      if (current()) setSubmitting(false);
    }
  }

  function toggleGroup(group: string) {
    setGroups((selected) => selected.includes(group) ? [] : [group]);
    setAmbulanceId("");
    setOperatorInstitutionId("");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate((current) => createManagedAccount({
        username: username.trim(),
        email: email.trim(),
        groups,
        ...(groups.includes("ambulance") ? { ambulance_id: ambulanceId, institution_id: operatorInstitutionId } : {}),
      }, current), "Cuenta creada. Se envió un enlace de activación de un solo uso al correo de prueba configurado.", () => {
      setUsername("");
      setEmail("");
      setGroups([]);
      setAmbulanceId("");
      setOperatorInstitutionId("");
    });
  }

  async function deactivate(account: ManagedAccount) {
    const action = account.active ? "desactivar esta cuenta" : "cancelar esta invitación";
    if (!window.confirm(`¿Quieres ${action}? Se revocará su acceso y no se borrarán registros históricos.`)) return;
    await mutate((current) => deactivateManagedAccount(account.id, current), account.active ? "Cuenta desactivada y sesiones revocadas." : "Invitación cancelada.");
  }

  async function resendActivation(account: ManagedAccount) {
    await mutate((current) => resendManagedActivation(account.id, current), "Se envió un nuevo enlace de activación; los enlaces anteriores dejaron de ser válidos.");
  }

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unitInstitutionId) return;
    await mutate((current) => createManagedAmbulance(unitCode.trim(), unitInstitutionId, current), "Unidad creada y vinculada a la institución operadora seleccionada.", () => setUnitCode(""));
  }

  async function assignUnit(account: ManagedAccount, ambulanceId: string | null) {
    if (ambulanceId === null && !window.confirm(`¿Retirar la unidad de ${account.username}? La cuenta seguirá activa. No se borrará el historial.`)) return;
    await mutate((current) => assignManagedAccount(account.id, ambulanceId, account.ambulance?.id ?? null, current), ambulanceId ? `Unidad asignada a ${account.username}.` : `Unidad retirada de ${account.username}; la cuenta conserva sus permisos.`);
  }

  async function requestRecovery(account: ManagedAccount) {
    if (!window.confirm(`¿Solicitar recuperación de ${account.username} al correo registrado? No recibirás su contraseña ni un enlace. Si perdió el correo, debe intervenir soporte técnico.`)) return;
    await mutate((current) => requestManagedRecovery(account.id, current), "Recuperación solicitada. Si la cuenta está disponible, recibirá instrucciones en su correo registrado; no se garantiza la entrega.");
  }

  async function deactivateUnit(unit: ManagedAmbulance) {
    if (!window.confirm(`¿Desactivar ${unit.code}? Se retirarán sus asignaciones. El historial se conservará. No se permite con episodios activos.`)) return;
    await mutate((current) => deactivateManagedAmbulance(unit.id, current), "Unidad desactivada; historial conservado.");
  }

  return (
    <section className="mt-5 space-y-6">
      {needsRefresh && <div role="alert" className="space-y-2 text-sm text-amber-100"><p>No se pudo confirmar el estado actual. Actualiza y revisa los datos antes de decidir si debes repetir la acción. No se reenviará automáticamente.</p><button disabled={submitting || loading} onClick={() => void refresh()} className="rounded-lg border border-white/15 px-3 py-2">Actualizar administración</button></div>}
      <fieldset disabled={submitting || loading || needsRefresh} className="min-w-0 space-y-6 disabled:opacity-70">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-dark">Administración institucional</p>
        <h2 className="mt-1 text-lg font-bold">Cuentas de {resolvedInstitutionName || "tu establecimiento"}</h2>
        <p className="mt-1 text-sm text-muted-dark">La creación de cuentas está reservada a la administración de Urgencias. Los operadores se vinculan a una institución operadora habilitada.</p>
      </div>

      {!canCreateAccounts && <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">Este perfil de administración no puede crear cuentas. La función está reservada al perfil administrativo de Urgencias.</p>}

      {canCreateAccounts && <>
      <nav className="flex flex-wrap gap-2" aria-label="Subpaneles de administración">
        <button onClick={() => setActivePanel("create")} className={`rounded-lg border px-3 py-2 text-sm ${activePanel === "create" ? "border-signal bg-signal/15" : "border-white/10"}`}>Crear cuentas</button>
        <button onClick={() => setActivePanel("history")} className={`rounded-lg border px-3 py-2 text-sm ${activePanel === "history" ? "border-signal bg-signal/15" : "border-white/10"}`}>Historial de cuentas</button>
        <button onClick={() => setActivePanel("units")} className={`rounded-lg border px-3 py-2 text-sm ${activePanel === "units" ? "border-signal bg-signal/15" : "border-white/10"}`}>Unidades de ambulancia</button>
      </nav>
      {activePanel === "create" && <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-white/10 bg-ink/60 p-4">
        <h3 className="font-semibold">Crear una cuenta personal</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Nombre de usuario
            <input required minLength={1} maxLength={150} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white" />
          </label>
          <label className="block text-sm">Correo institucional o de prueba
            <input required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white" />
          </label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Permisos operativos delegables</legend>
          {delegableGroups.includes("ambulance") && <label className="flex items-center gap-2 text-sm"><input type="radio" name="new-account-group" checked={groups.includes("ambulance")} onChange={() => toggleGroup("ambulance")} /> Ambulancia</label>}
          {delegableGroups.includes("urgencias") && <label className="flex items-center gap-2 text-sm"><input type="radio" name="new-account-group" checked={groups.includes("urgencias")} onChange={() => toggleGroup("urgencias")} /> Urgencias</label>}
        </fieldset>
        {groups.includes("ambulance") && (
          <>
          <label className="block text-sm">Institución operadora
            <select required value={operatorInstitutionId} onChange={(event) => { setOperatorInstitutionId(event.target.value); setAmbulanceId(""); }} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white">
              <option value="">Selecciona una institución</option>
              {operatorInstitutions.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Unidad asignada
            <select required value={ambulanceId} onChange={(event) => setAmbulanceId(event.target.value)} disabled={!operatorInstitutionId} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white disabled:opacity-50">
              <option value="">Selecciona una ambulancia</option>
              {ambulances.filter((ambulance) => ambulance.enabled && ambulance.institution_id === operatorInstitutionId).map((ambulance) => <option key={ambulance.id} value={ambulance.id}>{ambulance.code}</option>)}
            </select>
            {operatorInstitutionId && !ambulances.some((ambulance) => ambulance.enabled && ambulance.institution_id === operatorInstitutionId) && <span className="mt-1 block text-xs text-amber-100">Esta institución no tiene ambulancias habilitadas.</span>}
          </label>
          </>
        )}
        <p className="text-xs leading-relaxed text-muted-dark">La cuenta queda pendiente hasta que la persona abra el correo local y establezca su propia contraseña. El enlace vence en 24 horas. No se envían contraseñas.</p>
        <button disabled={submitting || groups.length === 0 || (groups.includes("ambulance") && !ambulanceId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-signal px-4 text-sm font-bold text-ink disabled:opacity-50"><UserPlus className="h-4 w-4" />{submitting ? "Creando…" : "Crear y enviar activación"}</button>
      </form>}
      {activePanel === "units" && <div className="space-y-4">
        <form onSubmit={handleCreateUnit} className="space-y-4 rounded-xl border border-white/10 bg-ink/60 p-4">
          <h3 className="font-semibold">Crear unidad de ambulancia</h3>
          <label className="block text-sm">Institución de la nueva unidad<select required value={unitInstitutionId} onChange={(event) => setUnitInstitutionId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">Selecciona una institución</option>{operatorInstitutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <label className="block text-sm">Código de unidad<input required maxLength={40} value={unitCode} onChange={(event) => setUnitCode(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3" /></label>
          <button disabled={!unitInstitutionId} className="inline-flex h-10 items-center gap-2 rounded-lg bg-signal px-4 text-sm font-bold text-ink disabled:opacity-50"><Ambulance className="h-4 w-4" />Crear unidad</button>
        </form>
        <h4 className="font-semibold">Unidades administradas</h4>
        {!ambulances.length && <p className="text-sm text-muted-dark">No hay unidades disponibles.</p>}
        {ambulances.map((unit) => <div key={unit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"><p className="min-w-0 break-words">{unit.code} · {unit.institution_name} · {unit.enabled ? "Habilitada" : "Desactivada"}</p>{unit.enabled && unit.can_deactivate && <button aria-label={`Desactivar ${unit.code}`} onClick={() => void deactivateUnit(unit)} className="rounded-lg border border-rose-300/20 px-3 py-2 text-rose-100">Desactivar unidad</button>}</div>)}
      </div>}
      </>}

      {activePanel === "history" && <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Cuentas administradas</h3>
          <button onClick={() => void refresh()} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">Actualizar</button>
        </div>
        {loading ? <p role="status" className="mt-3 text-sm text-muted-dark">Cargando cuentas…</p> : accounts.length === 0 ? <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">No hay cuentas gestionables en este establecimiento.</p> : (
          <ul className="mt-3 space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{account.username} <span className="text-xs font-normal text-muted-dark">· {account.active ? "Activa" : "Pendiente de activación"}</span></p>
                  <p className="truncate text-sm text-muted-dark">{account.email}</p>
                  <p className="mt-1 text-xs text-muted-dark">{account.institution_name} · {account.groups.filter((group) => group !== "institution_admin").join(" + ") || "Administración institucional"}{account.ambulance ? ` · Unidad ${account.ambulance.code}` : ""}</p>
                  {account.groups.includes("ambulance") && <div className="mt-2 flex flex-wrap items-center gap-2"><label className="text-xs">Unidad de {account.username}<select value={account.ambulance?.id ?? ""} onChange={(event) => { if (event.target.value) void assignUnit(account, event.target.value); }} className="ml-2 h-9 max-w-full rounded-lg border border-white/15 bg-ink px-2 text-xs"><option value="">Sin unidad asignada</option>{ambulances.filter((unit) => unit.enabled && unit.institution_id === account.institution_id).map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select></label>{account.ambulance && <button onClick={() => void assignUnit(account, null)} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-100">Retirar unidad</button>}</div>}
                </div>
                {account.id !== currentUserId && <div className="flex gap-2">
                  {!account.active && <button onClick={() => void resendActivation(account)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-dark hover:bg-white/5">Reenviar activación</button>}
                  {account.active && <button aria-label={`Solicitar recuperación de ${account.username}`} onClick={() => void requestRecovery(account)} className="rounded-lg border border-signal/30 px-3 py-2 text-xs text-signal-soft">Solicitar recuperación</button>}
                  <button onClick={() => void deactivate(account)} className="inline-flex items-center gap-2 rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-100 hover:bg-rose-300/10"><UserRoundX className="h-4 w-4" />{account.active ? "Desactivar" : "Cancelar invitación"}</button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </div>}
      </fieldset>
      {message && <p role="status" className="rounded-lg bg-white/5 p-3 text-sm text-muted-dark">{message}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
      <p className="text-xs leading-relaxed text-muted-dark">Entorno de prueba local; utiliza solo datos sintéticos. No usar para gestión clínica real.</p>
    </section>
  );
}
