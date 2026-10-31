import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus, UserRoundX } from "lucide-react";
import {
  BackendApiError,
  createManagedAccount,
  deactivateManagedAccount,
  getAccountManagementConfig,
  listManagedAccounts,
  listManagedAmbulances,
  resendManagedActivation,
  type ManagedAccount,
  type ManagedAmbulance,
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
  const [delegableGroups, setDelegableGroups] = useState<string[]>([]);
  const [resolvedInstitutionName, setResolvedInstitutionName] = useState(institutionName);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [ambulanceId, setAmbulanceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextAccounts, nextAmbulances, config] = await Promise.all([
        listManagedAccounts(),
        listManagedAmbulances(),
        getAccountManagementConfig(),
      ]);
      setAccounts(nextAccounts);
      setAmbulances(nextAmbulances);
      setDelegableGroups(config.delegable_groups);
      setResolvedInstitutionName(config.institution_name);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function toggleGroup(group: string) {
    setGroups((selected) => selected.includes(group)
      ? selected.filter((item) => item !== group)
      : [...selected, group]);
    if (group === "ambulance" && groups.includes("ambulance")) setAmbulanceId("");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await createManagedAccount({
        username: username.trim(),
        email: email.trim(),
        groups,
        ...(groups.includes("ambulance") ? { ambulance_id: ambulanceId } : {}),
      });
      setUsername("");
      setEmail("");
      setGroups([]);
      setAmbulanceId("");
      setMessage("Cuenta creada. Se envió un enlace de activación de un solo uso al correo de prueba configurado.");
      await refresh();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(account: ManagedAccount) {
    const action = account.active ? "desactivar esta cuenta" : "cancelar esta invitación";
    if (!window.confirm(`¿Quieres ${action}? Se revocará su acceso y no se borrarán registros históricos.`)) return;
    setError("");
    setMessage("");
    try {
      await deactivateManagedAccount(account.id);
      setMessage(account.active ? "Cuenta desactivada y sesiones revocadas." : "Invitación cancelada.");
      await refresh();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function resendActivation(account: ManagedAccount) {
    setError("");
    setMessage("");
    try {
      await resendManagedActivation(account.id);
      setMessage("Se envió un nuevo enlace de activación; los enlaces anteriores dejaron de ser válidos.");
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  return (
    <section className="mt-5 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-dark">Administración institucional</p>
        <h2 className="mt-1 text-lg font-bold">Cuentas de {resolvedInstitutionName || "tu establecimiento"}</h2>
        <p className="mt-1 text-sm text-muted-dark">Solo puedes gestionar cuentas y unidades de tu establecimiento. La administración no concede acceso clínico.</p>
      </div>

      <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-white/10 bg-ink/60 p-4">
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
          {delegableGroups.includes("ambulance") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groups.includes("ambulance")} onChange={() => toggleGroup("ambulance")} /> Ambulancia</label>}
          {delegableGroups.includes("urgencias") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groups.includes("urgencias")} onChange={() => toggleGroup("urgencias")} /> Urgencias</label>}
        </fieldset>
        {groups.includes("ambulance") && (
          <label className="block text-sm">Unidad asignada
            <select required value={ambulanceId} onChange={(event) => setAmbulanceId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white">
              <option value="">Selecciona una ambulancia</option>
              {ambulances.map((ambulance) => <option key={ambulance.id} value={ambulance.id}>{ambulance.code}</option>)}
            </select>
            {ambulances.length === 0 && <span className="mt-1 block text-xs text-amber-100">No hay ambulancias habilitadas. Deben provisionarse antes de crear una cuenta operadora.</span>}
          </label>
        )}
        <p className="text-xs leading-relaxed text-muted-dark">La cuenta queda pendiente hasta que la persona abra el correo local y establezca su propia contraseña. El enlace vence en 24 horas. No se envían contraseñas.</p>
        <button disabled={submitting || groups.length === 0 || (groups.includes("ambulance") && !ambulanceId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-signal px-4 text-sm font-bold text-ink disabled:opacity-50"><UserPlus className="h-4 w-4" />{submitting ? "Creando…" : "Crear y enviar activación"}</button>
      </form>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Cuentas del establecimiento</h3>
          <button onClick={() => void refresh()} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">Actualizar</button>
        </div>
        {loading ? <p role="status" className="mt-3 text-sm text-muted-dark">Cargando cuentas…</p> : accounts.length === 0 ? <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">No hay cuentas gestionables en este establecimiento.</p> : (
          <ul className="mt-3 space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{account.username} <span className="text-xs font-normal text-muted-dark">· {account.active ? "Activa" : "Pendiente de activación"}</span></p>
                  <p className="truncate text-sm text-muted-dark">{account.email}</p>
                  <p className="mt-1 text-xs text-muted-dark">{account.groups.filter((group) => group !== "institution_admin").join(" + ") || "Administración institucional"}{account.ambulance ? ` · Unidad ${account.ambulance.code}` : ""}</p>
                </div>
                {account.id !== currentUserId && <div className="flex gap-2">
                  {!account.active && <button onClick={() => void resendActivation(account)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-dark hover:bg-white/5">Reenviar activación</button>}
                  <button onClick={() => void deactivate(account)} className="inline-flex items-center gap-2 rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-100 hover:bg-rose-300/10"><UserRoundX className="h-4 w-4" />{account.active ? "Desactivar" : "Cancelar invitación"}</button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && <p role="status" className="rounded-lg bg-white/5 p-3 text-sm text-muted-dark">{message}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
      <p className="text-xs leading-relaxed text-muted-dark">Entorno de prueba local; utiliza solo datos sintéticos. No usar para gestión clínica real.</p>
    </section>
  );
}
