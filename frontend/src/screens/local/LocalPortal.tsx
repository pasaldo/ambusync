import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Ambulance, Archive, ClipboardList, HeartPulse, LogOut, RefreshCw, Server } from "lucide-react";
import { VitalsStrip } from "@/components/VitalsStrip";
import { TRIAGE } from "@/data/triage";
import type { Vitals } from "@/types";
import { AdminAccountsPanel } from "@/screens/local/AdminAccountsPanel";
import {
  BackendApiError,
  sendEmergencyOperation,
  sendDestinationChangeOperation,
  isUncertainWrite,
  getCurrentUser,
  listDestinations,
  listEmergencies,
  logout,
  prepareEmergencyTransition,
  type EmergencyAction,
  type BackendEmergency,
  type BackendUser,
  type Destination,
} from "@/lib/backend";
import { connectEmergencyEvents, type EmergencySocketStatus } from "@/lib/emergencySocket";
import { preserveNewerEmergencyVersions } from "@/lib/emergencyReconciliation";
import { prepareOperation, type PendingOperation } from "@/lib/pendingOperation";
import { emptyDraft, VITAL_FIELDS, type EmergencyDraft } from "./emergencyDraft";
import { usePortalMemory } from "./portalMemory";
import { EpisodeUpdates, MeasurementHistory } from "./EpisodeUpdates";
import { currentMeasurements, reconcileClinicalDraft } from "./clinicalUpdates";
import { cancellationLabel, partitionTriageQueue, patientDisplayLabel } from "./queuePresentation";
import { EmergencyMilestones } from "./EmergencyMilestones";
import { DestinationChange, ReplacementLink } from "./DestinationChange";
import { usePatientCatalog } from "./usePatientCatalog";
import { PatientCatalogPanel } from "./PatientCatalogPanel";
import { UnitPatientPicker } from "./UnitPatientPicker";
import { PatientContextEditor, PatientContextHistory, identityDescription } from "./PatientContext";
import { ReportsPanel } from "./ReportsPanel";
import { AdministrativeAuditPanel } from "./AdministrativeAuditPanel";

function archiveEventDate(emergency: BackendEmergency): string {
  if (emergency.status === "cancelada") return emergency.cancelled_at ?? emergency.created_at;
  if (emergency.status === "cerrada") return emergency.closed_at ?? emergency.arrived_at ?? emergency.created_at;
  return emergency.arrived_at ?? emergency.created_at;
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
  const memory = usePortalMemory();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [role, setRole] = useState<"ambulance" | "urgencias" | "administration" | "reports" | "audit" | "archive" | null>(null);
  const [ambulanceView, setAmbulanceView] = useState<"form" | "episodes">("form");
  const [draft, setDraft] = useState<EmergencyDraft>(emptyDraft);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [emergencies, setEmergencies] = useState<BackendEmergency[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<BackendEmergency | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const writeInFlight = useRef(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const transitionsInFlight = useRef(new Set<string>());
  const [uncertainTransitions, setUncertainTransitions] = useState<Record<string, PendingOperation>>({});
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [socketStatus, setSocketStatus] = useState<EmergencySocketStatus>("disconnected");
  const lastInteractionRefresh = useRef(0);
  const userRef = useRef<BackendUser | null>(null);

  const acceptUser = useCallback((nextUser: BackendUser) => {
    const changed = memory.bind(nextUser);
    setDraft(memory.draft);
    setCreationUncertain(memory.creationUncertain);
    setUncertainTransitions(memory.uncertainTransitions);
    if (changed) {
      writeInFlight.current = false;
      transitionsInFlight.current = new Set();
      setSubmitting(false);
      setTransitionBusy(false);
      setEmergencies([]);
      setDestinations([]);
      setLastCreated(null);
      setSelectedId(null);
      setOperationError("");
      setMessage("Cambió la cuenta o el ámbito; el borrador anterior se descartó sin enviarse.");
    }
    userRef.current = nextUser;
    setUser(nextUser);
    setRole((current) => {
      if (!changed && current === "administration" && nextUser.groups.includes("urgencias") && nextUser.groups.includes("institution_admin")) return current;
      if (!changed && current === "ambulance" && nextUser.groups.includes("ambulance")) return current;
      if (!changed && current === "urgencias" && nextUser.groups.includes("urgencias")) return current;
      if (!changed && current === "reports" && nextUser.groups.includes("urgencias") && nextUser.groups.includes("view_reports")) return current;
      if (!changed && current === "archive" && nextUser.groups.includes("urgencias")) return current;
      if (!changed && current === "audit" && nextUser.groups.includes("institution_admin")) return current;
      return nextUser.groups.includes("ambulance") ? "ambulance" : nextUser.groups.includes("urgencias") ? "urgencias" : nextUser.groups.includes("institution_admin") ? "audit" : null;
    });
  }, [memory]);

  const expireSession = useCallback(() => {
    memory.suspend();
    setEmergencies([]);
    setDestinations([]);
    setLastCreated(null);
    setSelectedId(null);
    setMessage("");
    setOperationError("");
    userRef.current = null;
    setUser(null);
    navigate("/", {
      replace: true,
      state: { notice: "La sesión expiró. Inicia sesión nuevamente; ningún borrador se enviará automáticamente." },
    });
  }, [navigate, memory]);

  useEffect(() => () => memory.suspend(), [memory]);

  const refreshUser = useCallback(async (humanInteraction = false) => {
    const token = memory.token;
    try {
      const current = await getCurrentUser(humanInteraction);
      if (!memory.isCurrent(token)) return;
      acceptUser(current);
      setError("");
    } catch (requestError) {
      if (!memory.isCurrent(token)) return;
      if (isUnauthenticated(requestError)) {
        expireSession();
      } else {
        setError(displayError(requestError));
      }
    }
  }, [acceptUser, expireSession, memory]);

  const refreshEmergencyList = useCallback(async () => {
    const token = memory.token;
    try {
      const incoming = await listEmergencies();
      if (!memory.isCurrent(token)) return;
      setEmergencies((current) => preserveNewerEmergencyVersions(current, incoming));
      setError("");
    } catch (requestError) {
      if (!memory.isCurrent(token)) return;
      if (isUnauthenticated(requestError)) expireSession();
      else setError(displayError(requestError));
    }
  }, [expireSession, memory]);

  const resources = usePatientCatalog(user, expireSession);
  const SYMPTOMS = resources.symptoms.filter((item) => item.enabled).map((item) => item.description);
  const draftPatient = resources.patients.find((item) => item.id === draft.patientId);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => {
        if (!active) return;
        if (current.groups.includes("system_admin")) {
          navigate("/sistema", { replace: true });
          return;
        }
        acceptUser(current);
        setRole(current.groups.includes("ambulance") ? "ambulance" : current.groups.includes("urgencias") ? "urgencias" : null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (!isUnauthenticated(requestError)) {
          setError(displayError(requestError));
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [acceptUser, navigate]);

  useEffect(() => {
    if (!loading && !user && location.pathname !== "/") navigate("/", { replace: true });
  }, [loading, user, navigate, location.pathname]);

  useEffect(() => {
    if (!user || (!user.groups.includes("ambulance") && !user.groups.includes("urgencias"))) {
      setSocketStatus("disconnected");
      return;
    }
    return connectEmergencyEvents({
      onStatus: (status) => {
        setSocketStatus(status);
        if (status === "connected") {
          void refreshEmergencyList();
        }
      },
      onEvent: () => void refreshEmergencyList(),
    });
  }, [user?.id, user?.groups, expireSession, refreshEmergencyList]);

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
      const token = memory.token;
      listDestinations().then((incoming) => {
        if (memory.isCurrent(token)) setDestinations(incoming);
      }).catch((requestError) => {
        if (!memory.isCurrent(token)) return;
        if (isUnauthenticated(requestError)) expireSession();
        else setError(displayError(requestError));
      });
    }
    if (user.groups.includes("ambulance") || user.groups.includes("urgencias")) {
      const refreshList = () => void refreshEmergencyList();
      void refreshList();
      const interval = window.setInterval(refreshList, socketStatus === "connected" ? 60_000 : 15_000);
      return () => window.clearInterval(interval);
    }
  }, [user?.id, user?.groups, refreshEmergencyList, socketStatus, memory, expireSession]);

  const expiresAt = user ? Math.min(user.session.idle_expires_at, user.session.absolute_expires_at) * 1000 : 0;
  const remainingMs = expiresAt - now;
  const sessionWarning = user && remainingMs > 0 && remainingMs <= 120_000;
  const canAmbulance = user?.groups.includes("ambulance") ?? false;
  const canUrgencias = user?.groups.includes("urgencias") ?? false;
  const canReports = canUrgencias && user?.groups.includes("view_reports") === true;
  const canAudit = user?.groups.includes("institution_admin") === true;
  // La administración de cuentas pertenece exclusivamente a la cuenta administrativa de Urgencias.
  // Una cuenta de ambulancia no debe heredar este módulo aunque comparta la institución.
  const canAdminister = user?.groups.includes("institution_admin") === true && user?.groups.includes("urgencias") === true;
  const selected = emergencies.find((item) => item.id === selectedId) ?? null;
  const urgencyQueues = useMemo(() => {
    const mainQueue = emergencies.filter((item) => ["en_traslado", "llegado", "notificada"].includes(item.status));
    const grouped = partitionTriageQueue(mainQueue);
    return { mainQueue, ...grouped };
  }, [emergencies]);

  async function handleLogout() {
    memory.clear();
    userRef.current = null;
    setUser(null);
    try {
      await logout();
    } catch (logoutError) {
      setError(displayError(logoutError));
    }
    setDraft(emptyDraft());
    setLastCreated(null);
    setRole(null);
    userRef.current = null;
    setUser(null);
    navigate("/", {
      replace: true,
      state: { notice: "Sesión cerrada; el borrador en memoria fue descartado." },
    });
  }

  function updateDraft(patch: Partial<EmergencyDraft>) {
    if (!userRef.current || !memory.isCurrent(memory.token) || memory.creation) return;
    const next = { ...memory.draft, ...patch };
    memory.draft = next;
    setDraft(next);
  }

  async function submitEmergency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userRef.current?.ambulance || !memory.isCurrent(memory.token) || writeInFlight.current) return;
    writeInFlight.current = true;
    const token = memory.token;
    setError("");
    setOperationError("");
    setSubmitting(true);
    const vitalValues = Object.fromEntries(
      Object.entries(draft.vitals)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [key, key === "spo2" || key === "temp_c" ? Number(value) : Number.parseInt(value, 10)]),
    );
    try {
      memory.creation ??= prepareOperation("/api/v1/emergencies/", {
        destination_id: draft.destinationId,
        transfer_started: draft.transferStarted,
        ...(draft.patientId ? { patient_id: draft.patientId, patient_version: draft.patientVersion } : {
        patient_identity_unknown: draft.identityUnknown,
        ...(draft.identityUnknown || !draft.alias.trim() ? {} : { patient_alias: draft.alias.trim() }),
        ...(draft.ageValue.trim() || draft.ageUnit
          ? {
              ...(draft.ageValue.trim() ? { age_value: Number.parseInt(draft.ageValue, 10) } : {}),
              ...(draft.ageUnit ? { age_unit: draft.ageUnit } : {}),
            }
          : {}),
        ...(draft.sex ? { recorded_sex: draft.sex } : {}),
        }),
        reason: draft.reason,
        symptoms: draft.symptoms,
        notes: draft.notes,
        ...(draft.triage ? { triage: draft.triage } : {}),
        ...(Object.keys(vitalValues).length
          ? { vitals: { ...vitalValues, taken_at: new Date().toISOString() } }
          : {}),
      });
      const created = await sendEmergencyOperation(memory.creation, () => memory.isCurrent(token));
      if (!memory.isCurrent(token)) return;
      memory.creation = null;
      memory.creationUncertain = false;
      setCreationUncertain(false);
      setLastCreated(created);
      setEmergencies((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      memory.draft = emptyDraft();
      setDraft(memory.draft);
      setMessage("Episodio guardado en el backend local.");
      void resources.refresh();
    } catch (submitError) {
      if (!memory.isCurrent(token)) return;
      // A rejection of this retry cannot disprove a previous unacknowledged commit.
      const uncertain = memory.creationUncertain || isUncertainWrite(submitError) || (submitError instanceof BackendApiError && submitError.status === 401);
      setCreationUncertain(uncertain);
      memory.creationUncertain = uncertain;
      if (!uncertain) memory.creation = null;
      if (submitError instanceof BackendApiError && submitError.status === 401) expireSession();
      else setOperationError(displayError(submitError));
    } finally {
      if (memory.isCurrent(token)) {
        writeInFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  async function confirmArrival(emergencyId: string, reason: string) {
    const emergency = emergencies.find((item) => item.id === emergencyId);
    if (!emergency) return;
    await runTransition(emergency, "arrival", "Llegada a Urgencias registrada.", { reason });
  }

  function confirmArrivalFromCard(emergency: BackendEmergency) {
    let reason = "";
    if (emergency.status === "notificada") {
      const entered = window.prompt("No hay inicio de traslado registrado. Indica el motivo de la llegada excepcional:");
      if (entered === null) return;
      reason = entered.trim();
      if (!reason) return;
    }
    void confirmArrival(emergency.id, reason);
  }

  async function executeTransition(emergencyId: string, operation: PendingOperation, successMessage: string) {
    if (!userRef.current || !memory.isCurrent(memory.token) || transitionsInFlight.current.has(emergencyId)) return;
    transitionsInFlight.current.add(emergencyId);
    const token = memory.token;
    setTransitionBusy(true);
    setOperationError("");
    try {
      const destinationChange = operation.path.endsWith("/change-destination/");
      const pair = destinationChange ? await sendDestinationChangeOperation(operation, () => memory.isCurrent(token)) : null;
      const updated = pair ? pair.original : await sendEmergencyOperation(operation, () => memory.isCurrent(token));
      if (!memory.isCurrent(token)) return;
      const clinicalAction = operation.path.match(/\/(update|measurements(?:\/rectify)?)\/$/);
      const clinicalDraft = memory.episodeDrafts.get(emergencyId);
      if (clinicalAction && clinicalDraft) memory.episodeDrafts.set(emergencyId, reconcileClinicalDraft(clinicalDraft, updated, clinicalAction[1], JSON.parse(operation.body).expected_version));
      if (operation.path.endsWith("/patient-context/")) memory.patientContextDrafts.delete(emergencyId);
      memory.transitions.delete(emergencyId);
      const next = { ...memory.uncertainTransitions }; delete next[emergencyId];
      memory.uncertainTransitions = next;
      setUncertainTransitions(next);
      if (pair) {
        memory.destinationDrafts.delete(emergencyId);
        memory.episodeDrafts.delete(emergencyId);
        memory.patientContextDrafts.delete(emergencyId);
        setEmergencies((current) => preserveNewerEmergencyVersions(current, [pair.replacement, pair.original, ...current.filter((item) => item.id !== pair.original.id && item.id !== pair.replacement.id)]));
      } else setEmergencies((current) => current.map((item) => item.id === updated.id && item.version <= updated.version ? updated : item));
      setMessage(successMessage);
    } catch (requestError) {
      if (!memory.isCurrent(token)) return;
      if (memory.uncertainTransitions[emergencyId] || isUncertainWrite(requestError) || (requestError instanceof BackendApiError && requestError.status === 401)) {
        memory.uncertainTransitions = { ...memory.uncertainTransitions, [emergencyId]: operation };
        setUncertainTransitions(memory.uncertainTransitions);
      } else {
        memory.transitions.delete(emergencyId);
        const next = { ...memory.uncertainTransitions }; delete next[emergencyId];
        memory.uncertainTransitions = next;
        setUncertainTransitions(next);
        if (requestError instanceof BackendApiError && requestError.status === 409) await refreshEmergencyList();
      }
      if (!memory.isCurrent(token)) return;
      if (requestError instanceof BackendApiError && requestError.status === 401) expireSession();
      else setOperationError(displayError(requestError));
    } finally {
      if (memory.isCurrent(token)) {
        transitionsInFlight.current.delete(emergencyId);
        setTransitionBusy(transitionsInFlight.current.size > 0);
      }
    }
  }

  async function runTransition(emergency: BackendEmergency, action: EmergencyAction, successMessage: string, extra: Record<string, unknown> = {}, expectedVersion = emergency.version) {
    if (!userRef.current || !memory.isCurrent(memory.token)) return;
    if (memory.transitions.has(emergency.id)) {
      setOperationError("Resuelve la operación pendiente de este episodio antes de realizar otra acción.");
      return;
    }
    const operation = prepareEmergencyTransition({ ...emergency, version: expectedVersion }, action, extra);
    memory.transitions.set(emergency.id, operation);
    await executeTransition(emergency.id, operation, successMessage);
  }

  async function refreshEmergencies() {
    await refreshEmergencyList();
  }

  function cancelFromAmbulance(emergency: BackendEmergency) {
    const reason = window.prompt("Indica el motivo de cancelación (datos sintéticos):");
    if (reason === null || reason.trim().length < 3) return;
    void runTransition(emergency, "cancel", "Episodio cancelado.", { reason: reason.trim() });
  }

  async function deactivatePatient(emergency: BackendEmergency | null = selected) {
    if (!emergency?.patient_id || !emergency.patient_record_version || !user?.groups.includes("deactivate_patients") || !user.groups.includes("urgencias")) return;
    if (!window.confirm("¿Desactivar este paciente sintético? Se conservará el historial; se rechazará si tiene episodios pendientes.")) return;
    await resources.run(`patient:${emergency.patient_id}`, "patient-deactivate", emergency.patient_id, `/api/v1/emergencies/${encodeURIComponent(emergency.id)}/patient-deactivate/`, emergency.patient_record_version, {}, "Paciente sintético desactivado; historial conservado.");
    await refreshEmergencyList();
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {(canAmbulance || canUrgencias) && (
                    <span role="status" aria-live="polite" data-realtime-status={socketStatus} className={`inline-flex items-center rounded-lg border px-3 py-2 text-xs ${socketStatus === "connected" ? "border-signal/30 bg-signal/10 text-signal-soft" : "border-amber-300/30 bg-amber-300/10 text-amber-100"}`}>
                      {socketStatus === "connected" ? "Tiempo real conectado · conciliación API cada 60 s" : socketStatus === "connecting" ? "Conectando tiempo real · consulta API cada 15 s" : socketStatus === "reconnecting" ? "Tiempo real degradado · respaldo API cada 15 s" : "Tiempo real desconectado · respaldo API cada 15 s"}
                    </span>
                  )}
                  {canAmbulance && user.ambulance && <span className="inline-flex items-center gap-2 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft"><Ambulance className="h-4 w-4" /><span><span className="text-xs text-muted-dark">Unidad</span> <strong className="font-mono">{user.ambulance.code}</strong></span></span>}
                  <button onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
                </div>
              </div>

              {canAmbulance && !user.ambulance && <div role="status" aria-label="Estado de asignación de ambulancia" className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100"><strong>Sin unidad asignada.</strong> Tu cuenta sigue activa, pero no puedes crear emergencias como ambulancia hasta que la administración de Urgencias te asigne una unidad habilitada. La asignación se actualizará al revalidar la sesión, sin recargar la página.</div>}

              {sessionWarning && (
                <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                  La sesión vence en menos de dos minutos. Continúa interactuando o vuelve a autenticarte. El envío requiere una acción manual.
                  <span className="ml-2 font-mono">{Math.max(1, Math.ceil(remainingMs / 60_000))} min</span>
                </div>
              )}

              {(canAmbulance || canUrgencias || canAdminister || canAudit) && (
                <div className="mt-4 flex flex-wrap gap-2" aria-label="Seleccionar módulo">
                  {canAmbulance && <RoleButton active={role === "ambulance" && ambulanceView === "form"} onClick={() => { setRole("ambulance"); setAmbulanceView("form"); }} icon={<Ambulance className="h-4 w-4" />}>Ambulancia</RoleButton>}
                  {canAmbulance && <RoleButton active={role === "ambulance" && ambulanceView === "episodes"} onClick={() => { setRole("ambulance"); setAmbulanceView("episodes"); }} icon={<ClipboardList className="h-4 w-4" />}>Episodios de la unidad</RoleButton>}
                  {canUrgencias && <RoleButton active={role === "urgencias"} onClick={() => { setRole("urgencias"); setSelectedId(null); }} icon={<HeartPulse className="h-4 w-4" />}>Urgencias</RoleButton>}
                  {canReports && <RoleButton active={role === "reports"} onClick={() => { setRole("reports"); setSelectedId(null); }} icon={<Archive className="h-4 w-4" />}>Histórico e informes</RoleButton>}
                  {canUrgencias && <RoleButton active={role === "archive"} onClick={() => { setRole("archive"); setSelectedId(null); }} icon={<Archive className="h-4 w-4" />}>Archivo de Urgencias</RoleButton>}
                  {canAdminister && <RoleButton active={role === "administration"} onClick={() => setRole("administration")} icon={<Activity className="h-4 w-4" />}>Administración</RoleButton>}
                  {canAudit && <RoleButton active={role === "audit"} onClick={() => { setRole("audit"); setSelectedId(null); }} icon={<ClipboardList className="h-4 w-4" />}>Auditoría administrativa</RoleButton>}
                </div>
              )}

              {Object.entries(uncertainTransitions).map(([id, operation]) => <div key={id} role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                <p>Resultado sin confirmar para el episodio {id}. Consulta su estado o reintenta la misma operación; no se repetirá automáticamente.</p>
                <button disabled={transitionBusy} onClick={() => void executeTransition(id, operation, "Operación confirmada en el servidor.")} className="mt-2 rounded-lg border border-amber-300/30 px-3 py-2 disabled:opacity-50">Reintentar operación</button>
              </div>)}

              <PatientCatalogPanel key={memory.token} user={user} state={resources} />

              {!role ? (
                <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-muted-dark">La cuenta inició sesión, pero no tiene un rol operativo disponible en este entorno.</p>
              ) : role === "ambulance" && canAmbulance ? (
                <section className="mt-5">
                  {ambulanceView === "episodes" ? <>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-bold">Episodios de la unidad</h2>
                      <button onClick={() => void refreshEmergencies()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Actualizar</button>
                    </div>
                    {emergencies.length === 0 ? <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-muted-dark">No hay episodios para esta unidad.</p> : <div className="mt-3 space-y-2">{emergencies.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-ink/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{patientDisplayLabel(item.patient)}</strong><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{item.status === "cancelada" && item.replaced_by_id ? cancellationLabel(item) : emergencyStatusLabel(item.status)}</span></div>
                      <p className="mt-1 text-sm text-muted-dark">{item.reason} · {item.destination_name}</p>
                      <p className="mt-1 text-sm text-muted-dark">{identityDescription(item.patient)}</p>
                      <EmergencyMilestones emergency={item} />
                      <ReplacementLink emergency={item} />
                      <DestinationChange emergency={item} destinations={destinations} busy={transitionBusy} pending={Boolean(uncertainTransitions[item.id])} onConfirm={(values, version) => runTransition(item, "change-destination", "Destino cambiado; original cancelado y reemplazo vinculado confirmado.", values, version)} />
                      {(item.status === "notificada" || item.status === "en_traslado") && <div className="mt-3 flex flex-wrap gap-2">
                        {item.status === "notificada" && <button disabled={transitionBusy || Boolean(uncertainTransitions[item.id])} onClick={() => void runTransition(item, "transfer-start", "Inicio de traslado registrado.")} className="rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-ink">Iniciar traslado</button>}
                        <button onClick={() => cancelFromAmbulance(item)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm text-rose-100">Cancelar episodio</button>
                      </div>}
                      <EpisodeUpdates emergency={item} busy={transitionBusy} pending={Boolean(uncertainTransitions[item.id])} symptoms={SYMPTOMS} onSave={(action, values, version) => runTransition(item, action, action === "update" ? "Antecedentes actualizados." : action === "measurements" ? "Medición agregada." : "Rectificación registrada; original conservado.", values, version)} />
                      <PatientContextEditor key={`${memory.token}:${item.id}`} emergency={item} busy={transitionBusy} pending={Boolean(uncertainTransitions[item.id])} onSave={(values, version) => runTransition(item, "patient-context", "Identificación del episodio corregida; original conservado.", values, version)} />
                    </div>)}</div>}
                  </> : <>
                  <h2 className="text-lg font-bold">Nueva emergencia</h2>
                  <p className="mt-1 text-sm text-muted-dark">La unidad se toma de la asignación del servidor. Las mediciones son opcionales y se conservan individualmente.</p>
                  {destinations.length === 0 ? (
                    <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">No hay destinos receptores habilitados para esta cuenta.</p>
                  ) : (
                    <form onSubmit={submitEmergency} className="mt-5 space-y-5">
                      {creationUncertain && <p role="alert" className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Resultado sin confirmar. El servidor podría haber guardado el episodio. Puedes consultar los episodios o reintentar el mismo envío; no se enviará automáticamente. No recargues ni cierres esta página mientras lo revisas.</p>}
                      <fieldset disabled={submitting || creationUncertain || !user.ambulance} className="space-y-5 disabled:opacity-70">
                      <label className="block text-sm font-medium">Destino receptor <span className="text-rose-300">*</span>
                        <select required value={draft.destinationId} onChange={(event) => updateDraft({ destinationId: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white">
                          <option value="">Selecciona un destino</option>
                          {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                        </select>
                      </label>

                      <fieldset className="space-y-3 rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Datos de identidad (opcionales)</legend>
                        <UnitPatientPicker key={memory.token} patients={resources.patients} value={draft.patientId ?? ""} onChange={(id) => { const patient = resources.patients.find((item) => item.id === id); updateDraft({ patientId: patient?.id ?? "", patientVersion: patient?.version }); }} label="Paciente de la unidad" searchLabel="Buscar paciente de la unidad por alias o ID" emptyLabel="Paciente nuevo" ready={resources.ready} />
                        {draft.patientId ? <><p className="rounded-lg border border-white/10 p-3 text-sm">Identificación desde el registro seleccionado: {patientDisplayLabel(draftPatient?.patient)}. Solo se conserva identificación; no se copian antecedentes ni historial. {draftPatient?.version !== draft.patientVersion && "El registro cambió o no está disponible: revisa y selecciona nuevamente antes de enviar."}</p>{draftPatient && draftPatient.version !== draft.patientVersion && <button type="button" onClick={() => updateDraft({ patientVersion: draftPatient.version })} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm text-amber-100">Actualizar selección del paciente</button>}</> : <>
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
                        </>}
                      </fieldset>

                      <label className="block text-sm font-medium">Motivo de consulta <span className="text-rose-300">*</span>
                        <textarea required minLength={3} maxLength={2000} rows={3} value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-white outline-none focus:border-signal" />
                      </label>

                       <fieldset className="rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Síntomas (opcionales)</legend>
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          {SYMPTOMS.map((symptom) => <label key={symptom} className="flex items-center gap-2 text-sm text-muted-dark"><input type="checkbox" checked={draft.symptoms.includes(symptom)} onChange={(event) => updateDraft({ symptoms: event.target.checked ? [...draft.symptoms, symptom] : draft.symptoms.filter((item) => item !== symptom) })} /> {symptom}</label>)}
                        </div>
                        <p className="mt-2 text-xs text-muted-dark">Catálogo activo de tu institución operadora. Texto libre en notas no crea síntomas. {draft.symptoms.some((label) => !SYMPTOMS.includes(label)) && "Hay selecciones que ya no están activas; revísalas antes de enviar."}</p>
                        {resources.ready && draft.symptoms.filter((label) => !SYMPTOMS.includes(label)).map((label) => <div key={label} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-100"><span>{label} · Selección no activa</span><button type="button" aria-label={`Quitar selección inactiva ${label}`} onClick={() => updateDraft({ symptoms: draft.symptoms.filter((item) => item !== label) })} className="rounded-lg border border-amber-300/30 px-3 py-2">Quitar selección</button></div>)}
                      </fieldset>

                      <fieldset className="rounded-xl border border-white/10 p-4">
                        <legend className="px-1 text-sm font-semibold">Signos vitales (todos opcionales)</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {VITAL_FIELDS.map((field) => <label key={field.key} className="block text-sm text-muted-dark">{field.label} <span className="font-mono">({field.unit})</span>
                            <input type="number" min={"min" in field ? field.min : "0"} max={"max" in field ? field.max : undefined} step={field.step} value={draft.vitals[field.key] ?? ""} onChange={(event) => updateDraft({ vitals: { ...draft.vitals, [field.key]: event.target.value } })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3 text-white" />
                          </label>)}
                        </div>
                       </fieldset>
                       <div className="rounded-xl border border-signal/20 bg-signal/5 p-4">
                         <p className="text-xs font-semibold uppercase tracking-widest text-signal-soft">Vista previa al confirmar</p>
                         <p className="mt-1 text-xs text-muted-dark">Así verá Urgencias los signos vitales enviados con este episodio.</p>
                         <VitalsStrip vitals={draftVitalsToDisplay(draft.vitals)} tone="dark" dense className="mt-3" />
                       </div>

                       <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">Triaje (opcional)
                          <select value={draft.triage} onChange={(event) => updateDraft({ triage: event.target.value as EmergencyDraft["triage"] })} className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">Sin clasificar</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={`C${level}`}>C{level}</option>)}</select>
                        </label>
                        <label className="block text-sm">Notas adicionales (opcional)
                          <textarea maxLength={2000} rows={2} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2" />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.transferStarted} onChange={(event) => updateDraft({ transferStarted: event.target.checked })} /> Traslado iniciado</label>
                      </fieldset>
                      <button disabled={submitting || !user.ambulance || (!creationUncertain && !resources.ready)} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-bold text-ink disabled:opacity-50"><Activity className="h-4 w-4" /> {submitting ? "Guardando…" : creationUncertain ? "Reintentar envío" : "Guardar emergencia"}</button>
                    </form>
                  )}
                  </>}
                </section>
              ) : role === "urgencias" && canUrgencias ? (
                <section className="mt-5">
                  <div className="flex items-end justify-between gap-3">
                    <div><h2 className="text-lg font-bold">Episodios entrantes</h2><p className="mt-1 text-sm text-muted-dark">{socketStatus === "connected" ? "Avisos por WebSocket; conciliación HTTP de respaldo cada 60 s." : "WebSocket no conectado; consulta HTTP de respaldo cada 15 s."}</p><p className="mt-1 text-xs text-muted-dark">Los llegados pendientes permanecen visibles hasta su cierre.</p></div>
                    <button onClick={() => void refreshEmergencies()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Actualizar</button>
                  </div>
                  {(
                    urgencyQueues.mainQueue.length === 0 ? <p className="mt-5 rounded-xl bg-white/5 p-4 text-sm text-muted-dark">No hay episodios entrantes.</p> : (
                      <div className="mt-4 space-y-6">
                        {urgencyQueues.unclassified.length > 0 && <section aria-label="Sin clasificar: pendientes de revisión" className="space-y-2"><h3 className="font-semibold text-amber-100">Sin clasificar · Pendientes de revisión</h3><p className="text-xs text-muted-dark">Sin categoría asignada; no equivale a C5 ni a menor gravedad. No se clasifica automáticamente.</p>{urgencyQueues.unclassified.map((item) => <UrgenciasEmergencyCard key={item.id} emergency={item} onSelect={() => setSelectedId(item.id)} onMarkArrived={() => confirmArrivalFromCard(item)} />)}</section>}
                        {urgencyQueues.classified.length > 0 && <section aria-label="Clasificados por triaje" className="space-y-2"><h3 className="font-semibold">Clasificados por triaje</h3><p className="text-xs text-muted-dark">C1 a C5; primero el más antiguo de cada categoría. Orden de presentación, no decisión automática de atención.</p>{urgencyQueues.classified.map((item) => <UrgenciasEmergencyCard key={item.id} emergency={item} onSelect={() => setSelectedId(item.id)} onMarkArrived={() => confirmArrivalFromCard(item)} />)}</section>}
                      </div>
                    )
                  )}
                  {selected && <EmergencyDetail emergency={selected} busy={transitionBusy || resources.busy} pending={Boolean(uncertainTransitions[selected.id])} onDeactivatePatient={user.groups.includes("deactivate_patients") && selected.patient_id && selected.patient_record_enabled !== false ? () => void deactivatePatient(selected) : undefined} onRead={() => void runTransition(selected, "read", "Lectura confirmada; primer autor y fecha conservados.")} onPrepare={() => void runTransition(selected, "prepare", "Preparación registrada; no acredita inicio de atención.")} onRetry={() => { const attempt = uncertainTransitions[selected.id]; if (attempt) void executeTransition(selected.id, attempt, "Operación confirmada en el servidor."); }} onClose={() => setSelectedId(null)} onMarkArrived={(reason) => void confirmArrival(selected.id, reason)} onCloseEmergency={() => void runTransition(selected, "close", "Episodio cerrado.")} />}
                </section>
              ) : role === "administration" && canAdminister ? (
                <AdminAccountsPanel key={JSON.stringify([user.id, user.institutions.map((item) => item.id).sort(), [...user.groups].sort(), user.ambulance?.id ?? null])} currentUserId={user.id} institutionName={user.institutions[0]?.name ?? ""} />
              ) : role === "archive" && canUrgencias ? (
                <ReportsPanel archive key={`archive:${memory.token}`} expireSession={expireSession} onDeactivatePatient={user.groups.includes("deactivate_patients") ? deactivatePatient : undefined} patientBusy={resources.busy} patientPending={(id) => resources.memory.resourceAttempts.has(`patient:${id}`)} />
              ) : role === "reports" && canReports ? (
                <ReportsPanel key={`reports:${memory.token}`} expireSession={expireSession} onDeactivatePatient={user.groups.includes("deactivate_patients") ? deactivatePatient : undefined} patientBusy={resources.busy} patientPending={(id) => resources.memory.resourceAttempts.has(`patient:${id}`)} />
              ) : role === "audit" && canAudit ? (
                <AdministrativeAuditPanel key={`audit:${memory.token}`} expireSession={expireSession} />
              ) : null}

              {lastCreated && <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">Guardado: {lastCreated.id}. Persistencia en servidor, no lectura humana; consulta los hitos del episodio.</p>}
            </>
          )}

          {message && <p role="status" className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">{message}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
          {operationError && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{operationError}</p>}
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
  if (status === "cancelada") return "Cancelada";
  if (status === "cerrada") return "Cerrada";
  return "Notificada";
}

function urgenciasStatusLabel(status: BackendEmergency["status"]) {
  if (status === "en_traslado") return "Llegando · En traslado";
  if (status === "notificada") return "Pendiente de traslado";
  return emergencyStatusLabel(status);
}

function draftVitalsToDisplay(values: Record<string, string>): Vitals {
  return {
    hr: values.hr ? Number(values.hr) : null,
    bpSys: values.bp_sys ? Number(values.bp_sys) : null,
    bpDia: values.bp_dia ? Number(values.bp_dia) : null,
    spo2: values.spo2 ? Number(values.spo2) : null,
    rr: values.rr ? Number(values.rr) : null,
    tempC: values.temp_c ? Number(values.temp_c) : null,
    glasgow: values.glasgow ? Number(values.glasgow) : null,
    takenAt: 0,
  };
}

function backendVitalsToDisplay(emergency: BackendEmergency): Vitals {
  const values: Vitals = {
    hr: null,
    bpSys: null,
    bpDia: null,
    spo2: null,
    rr: null,
    tempC: null,
    glasgow: null,
    takenAt: 0,
  };
  const kindToKey: Record<string, keyof Omit<Vitals, "takenAt">> = {
    heart_rate: "hr",
    systolic_pressure: "bpSys",
    diastolic_pressure: "bpDia",
    spo2: "spo2",
    respiratory_rate: "rr",
    temperature: "tempC",
    glasgow: "glasgow",
  };
  for (const measurement of currentMeasurements(emergency.vital_measurements)) {
    const key = kindToKey[measurement.kind];
    if (key) values[key] = measurement.value;
  }
  return values;
}

function UrgenciasEmergencyCard({ emergency, archived = false, onSelect, onMarkArrived }: { emergency: BackendEmergency; archived?: boolean; onSelect: () => void; onMarkArrived?: () => void }) {
  const triageLevel = emergency.triage ? Number(emergency.triage.slice(1)) as 1 | 2 | 3 | 4 | 5 : null;
  const triage = triageLevel ? TRIAGE[triageLevel] : null;
  return <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-ink/60 p-4 pl-5 text-left transition hover:border-signal/40 hover:bg-white/5">
    <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: triage?.color ?? "#64748B" }} aria-hidden="true" />
    <button type="button" onClick={onSelect} className="block w-full rounded-xl text-left"><span className="flex flex-wrap items-center justify-between gap-2"><strong>{patientDisplayLabel(emergency.patient)}</strong><span className="rounded-full bg-white/10 px-2 py-1 text-xs" style={triage ? { color: triage.color } : undefined}>{emergency.triage ?? "Sin clasificar"} · {emergency.status === "cancelada" && emergency.replaced_by_id ? cancellationLabel(emergency) : urgenciasStatusLabel(emergency.status)}</span></span>
    <span className="mt-1 block text-sm text-muted-dark">{emergency.reason}</span>
    <span className="mt-3 block text-[10px] font-semibold uppercase tracking-widest text-muted-dark">Signos vitales</span>
    <VitalsStrip vitals={backendVitalsToDisplay(emergency)} tone="dark" dense className="mt-4" />
     <span className="mt-2 block text-xs text-muted-dark">{emergency.destination_name} · {emergency.ambulance_code} · {new Date(archived ? archiveEventDate(emergency) : emergency.created_at).toLocaleString()}</span>
     <span className="mt-1 block text-xs text-muted-dark">{emergency.read_at && emergency.read_by_id ? "Lectura confirmada" : "Lectura pendiente"} · {emergency.prepared_at && emergency.prepared_by_id ? "Preparación registrada" : "Preparación no registrada"}</span>
    </button>
    {onMarkArrived && (emergency.status === "notificada" || emergency.status === "en_traslado") && <button type="button" onClick={(event) => { event.stopPropagation(); onMarkArrived(); }} className="absolute right-4 top-[3.75rem] inline-flex h-8 items-center gap-2 rounded-lg bg-signal px-3 text-xs font-semibold text-ink hover:brightness-110"><Activity className="h-3.5 w-3.5" />Marcar como llegado</button>}
  </div>;
}

function EmergencyDetail({ emergency, busy, pending, onRead, onPrepare, onRetry, onClose, onMarkArrived, onCloseEmergency, onDeactivatePatient }: { emergency: BackendEmergency; busy: boolean; pending: boolean; onRead: () => void; onPrepare: () => void; onRetry: () => void; onClose: () => void; onMarkArrived: (reason: string) => void; onCloseEmergency: () => void; onDeactivatePatient?: () => void }) {
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
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-dark">Detalle de emergencia</p><h3 className="mt-1 text-xl font-bold">{patientDisplayLabel(emergency.patient)}</h3></div><button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted-dark hover:bg-white/5">Cerrar</button></div>
      <p className="mt-3 rounded-lg bg-white/5 p-3">{emergency.reason}</p>
      <p className="mt-2 text-sm text-muted-dark">Edad: {emergency.patient.age_value === null ? "No informada" : `${emergency.patient.age_value} ${ageUnit}`} · Sexo: {emergency.patient.recorded_sex ?? "No informado"}</p>
      <p className="mt-2 text-sm text-muted-dark">Síntomas: {emergency.symptoms.length ? emergency.symptoms.join(", ") : "No informados"}</p>
      <EmergencyMilestones emergency={emergency} busy={busy} pending={pending} onRead={onRead} onPrepare={onPrepare} onRetry={onRetry} />
      <ReplacementLink emergency={emergency} />
      <PatientContextHistory emergency={emergency} />
      {onDeactivatePatient && <button type="button" disabled={busy || pending} onClick={onDeactivatePatient} className="mt-3 rounded-lg border border-rose-300/30 px-3 py-2 text-sm text-rose-100 disabled:opacity-50">Desactivar paciente sintético</button>}
       <MeasurementHistory measurements={emergency.vital_measurements} />
      {emergency.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm">{emergency.notes}</p>}
      {emergency.arrived_at && <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">Llegada registrada: {new Date(emergency.arrived_at).toLocaleString()}{emergency.arrival_reason ? ` · Motivo: ${emergency.arrival_reason}` : ""}</p>}
      {(emergency.status === "notificada" || emergency.status === "en_traslado") && <button disabled={busy || pending} onClick={confirmArrival} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-semibold text-ink disabled:opacity-50"><Activity className="h-4 w-4" />Marcar como llegado a Urgencias</button>}
      {emergency.status === "llegado" && <button disabled={busy || pending} onClick={onCloseEmergency} className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-signal/40 px-4 font-semibold text-signal-soft disabled:opacity-50">Cerrar episodio</button>}
      {emergency.status === "cancelada" && <p className="mt-4 rounded-lg bg-rose-300/10 p-3 text-sm text-rose-100">{cancellationLabel(emergency)}: {emergency.cancellation_reason}</p>}
      {emergency.status === "cerrada" && <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">Episodio cerrado el {emergency.closed_at ? new Date(emergency.closed_at).toLocaleString() : ""}.</p>}
      <p className="mt-4 text-xs text-muted-dark">Destino: {emergency.destination_name} · Unidad: {emergency.ambulance_code} · Creado: {new Date(emergency.created_at).toLocaleString()}</p>
    </div>
  </div>;
}
