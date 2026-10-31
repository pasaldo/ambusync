import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Ambulance, HeartPulse, LogOut, RefreshCw, Server } from "lucide-react";
import { AdminAccountsPanel } from "@/screens/local/AdminAccountsPanel";
import {
  BackendApiError,
  createEmergency,
  getCurrentUser,
  listDestinations,
  listEmergencies,
  logout,
  markEmergencyArrived,
  type BackendEmergency,
  type BackendUser,
  type Destination,
} from "@/lib/backend";

const SYMPTOMS = [
  "Disnea",
  "Dolor torácico",
  "Sudoración",
  "Náuseas",
  "Mareo",
  "Pérdida de conciencia",
  "Hemorragia",
  "Convulsión",
];

const VITAL_FIELDS = [
  { key: "hr", label: "Frecuencia cardíaca", unit: "lpm", step: "1" },
  { key: "bp_sys", label: "Presión sistólica", unit: "mmHg", step: "1" },
  { key: "bp_dia", label: "Presión diastólica", unit: "mmHg", step: "1" },
  { key: "spo2", label: "SpO₂", unit: "%", step: "0.01", max: "100" },
  { key: "rr", label: "Frecuencia respiratoria", unit: "rpm", step: "1" },
  { key: "temp_c", label: "Temperatura", unit: "°C", step: "0.1" },
  { key: "glasgow", label: "Glasgow", unit: "puntos", step: "1", min: "3", max: "15" },
] as const;

interface EmergencyDraft {
  destinationId: string;
  identityUnknown: boolean;
  alias: string;
  ageValue: string;
  ageUnit: "" | "years" | "months" | "days";
  sex: "" | "F" | "M" | "X";
  reason: string;
  symptoms: string[];
  notes: string;
  triage: "" | "C1" | "C2" | "C3" | "C4" | "C5";
  transferStarted: boolean;
  vitals: Record<string, string>;
}

function emptyDraft(): EmergencyDraft {
  return {
    destinationId: "",
    identityUnknown: true,
    alias: "",
    ageValue: "",
    ageUnit: "",
    sex: "",
    reason: "",
    symptoms: [],
    notes: "",
    triage: "",
    transferStarted: false,
    vitals: Object.fromEntries(VITAL_FIELDS.map(({ key }) => [key, ""])),
  };
}

function displayError(error: unknown): string {
  if (error instanceof BackendApiError) {
    if (error.status === 429) return "Demasiados intentos de acceso. Espera antes de volver a intentarlo.";
    if (error.status === 401) return "La sesión terminó. Inicia sesión nuevamente para continuar.";
    if (error.fields) return Object.values(error.fields).flatMap((item) => Array.isArray(item) ? item : [item]).join(" ");
    return error.message;
  }
  return "No se pudo conectar con el backend local. Comprueba que Django esté activo.";
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof BackendApiError && (error.status === 401 || error.status === 403);
}

export function LocalPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<"ambulance" | "urgencias" | "administration" | null>(null);
  const [draft, setDraft] = useState<EmergencyDraft>(emptyDraft);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [emergencies, setEmergencies] = useState<BackendEmergency[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<BackendEmergency | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastAccountId = useRef<string | null>(null);
  const lastInteractionRefresh = useRef(0);
  const userRef = useRef<BackendUser | null>(null);

  const acceptUser = useCallback((nextUser: BackendUser) => {
    if (lastAccountId.current && lastAccountId.current !== nextUser.id) {
      setDraft(emptyDraft());
      setLastCreated(null);
      setSelectedId(null);
      setMessage("Cambió la cuenta; el borrador anterior se descartó sin enviarse.");
    }
    userRef.current = nextUser;
    setUser(nextUser);
    lastAccountId.current = nextUser.id;
  }, []);

  const expireSession = useCallback(() => {
    userRef.current = null;
    setUser(null);
    navigate("/", {
      replace: true,
      state: { notice: "La sesión expiró. Inicia sesión nuevamente; ningún borrador se enviará automáticamente." },
    });
  }, [navigate]);

  const refreshUser = useCallback(async (humanInteraction = false) => {
    try {
      acceptUser(await getCurrentUser(humanInteraction));
      setError("");
    } catch (requestError) {
      if (isUnauthenticated(requestError)) {
        expireSession();
      } else {
        setError(displayError(requestError));
      }
    }
  }, [acceptUser, expireSession]);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => {
        if (!active) return;
        acceptUser(current);
        setRole(current.groups.includes("ambulance") ? "ambulance" : current.groups.includes("urgencias") ? "urgencias" : current.groups.includes("institution_admin") ? "administration" : null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (!isUnauthenticated(requestError)) {
          setError(displayError(requestError));
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [acceptUser]);

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/") navigate("/", { replace: true });
  }, [loading, user, navigate, location.pathname]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => void refreshUser(false), 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(tick);
    };
  }, [user?.id, refreshUser]);

  // Human input may extend idle expiry; automatic list/session polling never carries this marker.
  useEffect(() => {
    if (!user) return;
    const onHumanInput = () => {
      const currentTime = Date.now();
      if (currentTime - lastInteractionRefresh.current < 30_000) return;
      lastInteractionRefresh.current = currentTime;
      void refreshUser(true);
    };
    window.addEventListener("pointerdown", onHumanInput, { passive: true });
    window.addEventListener("keydown", onHumanInput);
    window.addEventListener("touchstart", onHumanInput, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onHumanInput);
      window.removeEventListener("keydown", onHumanInput);
      window.removeEventListener("touchstart", onHumanInput);
    };
  }, [user?.id, refreshUser]);

  useEffect(() => {
    if (!user) return;
    if (user.groups.includes("ambulance")) {
      listDestinations().then(setDestinations).catch((requestError) => setError(displayError(requestError)));
    }
    if (user.groups.includes("urgencias")) {
      const refreshList = () => listEmergencies().then(setEmergencies).catch((requestError) => {
        if (isUnauthenticated(requestError)) expireSession();
        else setError(displayError(requestError));
      });
      void refreshList();
      const interval = window.setInterval(refreshList, 15_000);
      return () => window.clearInterval(interval);
    }
  }, [user?.id, user?.groups, expireSession]);

  const expiresAt = user ? Math.min(user.session.idle_expires_at, user.session.absolute_expires_at) * 1000 : 0;
  const remainingMs = expiresAt - now;
  const sessionWarning = user && remainingMs > 0 && remainingMs <= 120_000;
  const canAmbulance = user?.groups.includes("ambulance") ?? false;
  const canUrgencias = user?.groups.includes("urgencias") ?? false;
  const canAdminister = user?.groups.includes("institution_admin") ?? false;
  const selected = emergencies.find((item) => item.id === selectedId) ?? null;
  const sortedEmergencies = useMemo(() => [...emergencies].sort((a, b) => {
    const triageOrder = (a.triage ?? "C9").localeCompare(b.triage ?? "C9");
    return triageOrder || a.created_at.localeCompare(b.created_at);
  }), [emergencies]);

  async function handleLogout() {
    try {
      await logout();
    } catch (logoutError) {
      setError(displayError(logoutError));
    }
    setDraft(emptyDraft());
    setLastCreated(null);
    setRole(null);
    lastAccountId.current = null;
    userRef.current = null;
    setUser(null);
    navigate("/", {
      replace: true,
      state: { notice: "Sesión cerrada; el borrador en memoria fue descartado." },
    });
  }

  function updateDraft(patch: Partial<EmergencyDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function submitEmergency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const vitalValues = Object.fromEntries(
      Object.entries(draft.vitals)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [key, key === "spo2" || key === "temp_c" ? Number(value) : Number.parseInt(value, 10)]),
    );
    try {
      const created = await createEmergency({
        operation_id: crypto.randomUUID(),
        destination_id: draft.destinationId,
        transfer_started: draft.transferStarted,
        patient_identity_unknown: draft.identityUnknown,
        ...(draft.identityUnknown || !draft.alias.trim() ? {} : { patient_alias: draft.alias.trim() }),
        ...(draft.ageValue.trim() || draft.ageUnit
          ? {
              ...(draft.ageValue.trim() ? { age_value: Number.parseInt(draft.ageValue, 10) } : {}),
              ...(draft.ageUnit ? { age_unit: draft.ageUnit } : {}),
            }
          : {}),
        ...(draft.sex ? { recorded_sex: draft.sex } : {}),
        reason: draft.reason,
        symptoms: draft.symptoms,
        notes: draft.notes,
        ...(draft.triage ? { triage: draft.triage } : {}),
        ...(Object.keys(vitalValues).length
          ? { vitals: { ...vitalValues, taken_at: new Date().toISOString() } }
          : {}),
      });
      setLastCreated(created);
      setDraft(emptyDraft());
      setMessage("Episodio guardado en el backend local.");
    } catch (submitError) {
      if (submitError instanceof BackendApiError && submitError.status === 401) expireSession();
      else setError(displayError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmArrival(emergencyId: string, reason: string) {
    setError("");
    try {
      const updated = await markEmergencyArrived(emergencyId, reason);
      setEmergencies((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage("Llegada a Urgencias registrada.");
    } catch (requestError) {
      if (requestError instanceof BackendApiError && requestError.status === 401) expireSession();
      else setError(displayError(requestError));
    }
  }

  return (
    <main className="grid-monitor min-h-[100dvh] bg-ink px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          {(canAmbulance || canUrgencias) && (
            <button
              onClick={() => navigate(role === "urgencias" && canUrgencias ? "/urgencias" : "/ambulancia")}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-dark hover:bg-white/5"
            >
              {role === "urgencias" && canUrgencias ? <HeartPulse className="h-4 w-4" /> : <Ambulance className="h-4 w-4" />}
              Abrir simulador demo
            </button>
          )}
          <span className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-soft">
            <Server className="h-3.5 w-3.5" /> Backend local
          </span>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-dark">Comprobando sesión local…</p>
          ) : !user ? (
            <p role="status" className="py-10 text-center text-sm text-muted-dark">Redirigiendo al inicio de sesión…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-dark">Sesión local</p>
                  <h1 className="mt-1 text-xl font-bold">{user.username}</h1>
                </div>
                <button onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
              </div>

              {sessionWarning && (
                <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                  La sesión vence en menos de dos minutos. Continúa interactuando o vuelve a autenticarte. El envío requiere una acción manual.
                  <span className="ml-2 font-mono">{Math.max(1, Math.ceil(remainingMs / 60_000))} min</span>
                </div>
              )}

              {(canAmbulance && canUrgencias || canAdminister) && (
                <div className="mt-4 flex flex-wrap gap-2" aria-label="Seleccionar módulo">
                  {canAmbulance && <RoleButton active={role === "ambulance"} onClick={() => setRole("ambulance")} icon={<Ambulance className="h-4 w-4" />}>Ambulancia</RoleButton>}
                  {canUrgencias && <RoleButton active={role === "urgencias"} onClick={() => setRole("urgencias")} icon={<HeartPulse className="h-4 w-4" />}>Urgencias</RoleButton>}
                  {canAdminister && <RoleButton active={role === "administration"} onClick={() => setRole("administration")} icon={<Activity className="h-4 w-4" />}>Administración</RoleButton>}
                </div>
              )}

              {!role ? (
                <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-muted-dark">La cuenta inició sesión, pero no tiene un rol operativo disponible en este entorno.</p>
              ) : role === "ambulance" && canAmbulance ? (
                <section className="mt-5">
                  <h2 className="text-lg font-bold">Nueva emergencia</h2>
                  <p className="mt-1 text-sm text-muted-dark">La unidad se toma de la asignación del servidor. Las mediciones son opcionales y se conservan individualmente.</p>
                  {destinations.length === 0 ? (
                    <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">No hay destinos receptores habilitados para esta cuenta.</p>
                  ) : (
                    <form onSubmit={submitEmergency} className="mt-5 space-y-5">
                      <label className="block text-sm font-medium">Destino receptor <span className="text-rose-300">*</span>
                        <select required value={draft.destinationId} onChange={(event) => updateDraft({ destinationId: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white">
                          <option value="">Selecciona un destino</option>
                          {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                        </select>
                      </label>

                      <fieldset className="space-y-3 rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Datos de identidad (opcionales)</legend>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.identityUnknown} onChange={(event) => updateDraft({ identityUnknown: event.target.checked, alias: event.target.checked ? "" : draft.alias })} /> Identidad desconocida</label>
                        {!draft.identityUnknown && <label className="block text-sm">Alias
                          <input maxLength={160} placeholder="Ej.: Paciente A" value={draft.alias} onChange={(event) => updateDraft({ alias: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3" />
                        </label>}
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block text-sm">Edad
                            <input type="number" min="0" max="130" step="1" value={draft.ageValue} onChange={(event) => updateDraft({ ageValue: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3" />
                          </label>
                          <label className="block text-sm">Unidad
                            <select value={draft.ageUnit} onChange={(event) => updateDraft({ ageUnit: event.target.value as EmergencyDraft["ageUnit"] })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">No informada</option><option value="years">Años</option><option value="months">Meses</option><option value="days">Días</option></select>
                          </label>
                          <label className="block text-sm">Sexo registrado
                            <select value={draft.sex} onChange={(event) => updateDraft({ sex: event.target.value as EmergencyDraft["sex"] })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">No informado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Indeterminado</option></select>
                          </label>
                        </div>
                      </fieldset>

                      <label className="block text-sm font-medium">Motivo de consulta <span className="text-rose-300">*</span>
                        <textarea required minLength={3} maxLength={2000} rows={3} value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-white outline-none focus:border-signal" />
                      </label>

                      <fieldset className="rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Síntomas (opcionales)</legend>
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          {SYMPTOMS.map((symptom) => <label key={symptom} className="flex items-center gap-2 text-sm text-muted-dark"><input type="checkbox" checked={draft.symptoms.includes(symptom)} onChange={(event) => updateDraft({ symptoms: event.target.checked ? [...draft.symptoms, symptom] : draft.symptoms.filter((item) => item !== symptom) })} /> {symptom}</label>)}
                        </div>
                        <p className="mt-2 text-xs text-muted-dark">Ejemplos de selección; el catálogo institucional aún no está conectado.</p>
                      </fieldset>

                      <fieldset className="rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Signos vitales (todos opcionales)</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {VITAL_FIELDS.map((field) => <label key={field.key} className="block text-sm text-muted-dark">{field.label} <span className="font-mono">({field.unit})</span>
                            <input type="number" min={"min" in field ? field.min : "0"} max={"max" in field ? field.max : undefined} step={field.step} value={draft.vitals[field.key] ?? ""} onChange={(event) => updateDraft({ vitals: { ...draft.vitals, [field.key]: event.target.value } })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white" />
                          </label>)}
                        </div>
                      </fieldset>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">Triaje (opcional)
                          <select value={draft.triage} onChange={(event) => updateDraft({ triage: event.target.value as EmergencyDraft["triage"] })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">Sin clasificar</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={`C${level}`}>C{level}</option>)}</select>
                        </label>
                        <label className="block text-sm">Notas adicionales (opcional)
                          <textarea maxLength={2000} rows={2} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2" />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.transferStarted} onChange={(event) => updateDraft({ transferStarted: event.target.checked })} /> Traslado iniciado</label>
                      <button disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-bold text-ink disabled:opacity-50"><Activity className="h-4 w-4" /> {submitting ? "Guardando…" : "Guardar emergencia"}</button>
                    </form>
                  )}
                </section>
              ) : role === "urgencias" && canUrgencias ? (
                <section className="mt-5">
                  <div className="flex items-end justify-between gap-3">
                    <div><h2 className="text-lg font-bold">Episodios autorizados</h2><p className="mt-1 text-sm text-muted-dark">Actualización periódica local; sin WebSocket.</p></div>
                    <button onClick={() => void listEmergencies().then(setEmergencies).catch((requestError) => setError(displayError(requestError)))} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Actualizar</button>
                  </div>
                  {sortedEmergencies.length === 0 ? <p className="mt-5 rounded-xl bg-white/5 p-4 text-sm text-muted-dark">No hay episodios en el ámbito de esta cuenta.</p> : (
                    <div className="mt-4 space-y-2">{sortedEmergencies.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className="w-full rounded-xl border border-white/10 bg-ink/60 p-4 text-left transition hover:border-signal/40 hover:bg-white/5">
                      <span className="flex flex-wrap items-center justify-between gap-2"><strong>{item.patient.alias ?? "Paciente no identificado"}</strong><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{item.triage ?? "Sin clasificar"} · {emergencyStatusLabel(item.status)}</span></span>
                      <span className="mt-1 block text-sm text-muted-dark">{item.reason}</span><span className="mt-2 block text-xs text-muted-dark">{item.destination_name} · {item.ambulance_code} · {new Date(item.created_at).toLocaleString()}</span>
                    </button>)}</div>
                  )}
                  {selected && <EmergencyDetail emergency={selected} onClose={() => setSelectedId(null)} onMarkArrived={(reason) => void confirmArrival(selected.id, reason)} />}
                </section>
              ) : role === "administration" && canAdminister ? (
                <AdminAccountsPanel currentUserId={user.id} institutionName={user.institutions[0]?.name ?? ""} />
              ) : null}

              {lastCreated && <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">Guardado: {lastCreated.id}</p>}
            </>
          )}

          {message && <p role="status" className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">{message}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
        </section>
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs leading-relaxed text-muted-dark">Entorno de demostración local: no usar para atención clínica ni introducir información de personas reales. No expone servicios a la red y no persiste respuestas del backend en localStorage.</p>
      </div>
    </main>
  );
}

function RoleButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-signal bg-signal/15 text-signal-soft" : "border-white/10 text-muted-dark hover:bg-white/5"}`}>{icon}{children}</button>;
}

function emergencyStatusLabel(status: BackendEmergency["status"]) {
  if (status === "en_traslado") return "En traslado";
  if (status === "llegado") return "Llegado a Urgencias";
  return "Notificada";
}

function EmergencyDetail({ emergency, onClose, onMarkArrived }: { emergency: BackendEmergency; onClose: () => void; onMarkArrived: (reason: string) => void }) {
  const ageUnit = emergency.patient.age_unit === "years" ? "años" : emergency.patient.age_unit === "months" ? "meses" : emergency.patient.age_unit === "days" ? "días" : "";
  function confirmArrival() {
    let reason = "";
    if (emergency.status === "notificada") {
      const entered = window.prompt("No hay inicio de traslado registrado. Indica el motivo de la llegada excepcional:");
      if (entered === null) return;
      reason = entered.trim();
      if (!reason) return;
    }
    onMarkArrived(reason);
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Detalle de episodio">
    <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-ink p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-dark">Detalle de emergencia</p><h3 className="mt-1 text-xl font-bold">{emergency.patient.alias ?? "Paciente no identificado"}</h3></div><button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted-dark hover:bg-white/5">Cerrar</button></div>
      <p className="mt-3 rounded-lg bg-white/5 p-3">{emergency.reason}</p>
      <p className="mt-2 text-sm text-muted-dark">Edad: {emergency.patient.age_value === null ? "No informada" : `${emergency.patient.age_value} ${ageUnit}`} · Sexo: {emergency.patient.recorded_sex ?? "No informado"}</p>
      <p className="mt-2 text-sm text-muted-dark">Síntomas: {emergency.symptoms.length ? emergency.symptoms.join(", ") : "No informados"}</p>
      <div className="mt-4"><h4 className="text-sm font-semibold">Mediciones vitales</h4>{emergency.vital_measurements.length ? <ul className="mt-2 space-y-1 text-sm text-muted-dark">{emergency.vital_measurements.map((measurement, index) => <li key={`${measurement.kind}-${index}`}>{measurement.kind}: <strong className="text-white">{measurement.value} {measurement.unit}</strong> · {new Date(measurement.measured_at).toLocaleString()}</li>)}</ul> : <p className="mt-1 text-sm text-muted-dark">No medidas</p>}</div>
      {emergency.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm">{emergency.notes}</p>}
      {emergency.status === "llegado" ? <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">Llegada registrada: {emergency.arrived_at ? new Date(emergency.arrived_at).toLocaleString() : "hora no disponible"}{emergency.arrival_reason ? ` · Motivo: ${emergency.arrival_reason}` : ""}</p> : <button onClick={confirmArrival} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-semibold text-ink"><Activity className="h-4 w-4" />Marcar como llegado a Urgencias</button>}
      <p className="mt-4 text-xs text-muted-dark">Destino: {emergency.destination_name} · Unidad: {emergency.ambulance_code} · Creado: {new Date(emergency.created_at).toLocaleString()}</p>
    </div>
  </div>;
}
