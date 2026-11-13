import { Activity } from "lucide-react";
import { VitalsStrip } from "@/components/VitalsStrip";
import { TRIAGE } from "@/data/triage";
import type { Vitals } from "@/types";
import type { BackendEmergency } from "@/lib/backend";
import { currentMeasurements } from "./clinicalUpdates";
import { cancellationLabel, patientDisplayLabel } from "./queuePresentation";

function backendVitalsToDisplay(emergency: BackendEmergency): Vitals {
  const values: Vitals = { hr: null, bpSys: null, bpDia: null, spo2: null, rr: null, tempC: null, glasgow: null, takenAt: 0 };
  const kindToKey: Record<string, keyof Omit<Vitals, "takenAt">> = {
    heart_rate: "hr", systolic_pressure: "bpSys", diastolic_pressure: "bpDia",
    spo2: "spo2", respiratory_rate: "rr", temperature: "tempC", glasgow: "glasgow",
  };
  for (const measurement of currentMeasurements(emergency.vital_measurements)) {
    const key = kindToKey[measurement.kind];
    if (key) values[key] = measurement.value;
  }
  return values;
}

export function UrgenciasEmergencyCard({ emergency, archived = false, eventDate, onSelect, onMarkArrived }: {
  emergency: BackendEmergency; archived?: boolean; eventDate?: string; onSelect: () => void; onMarkArrived?: () => void;
}) {
  const triageLevel = emergency.triage ? Number(emergency.triage.slice(1)) as 1 | 2 | 3 | 4 | 5 : null;
  const triage = triageLevel ? TRIAGE[triageLevel] : null;
  const labels = { en_traslado: "Llegando · En traslado", notificada: "Pendiente de traslado", llegado: "Llegado a Urgencias", cancelada: "Cancelada", cerrada: "Cerrada" };
  const date = archived ? eventDate ?? (emergency.status === "cancelada" ? emergency.cancelled_at ?? emergency.created_at : emergency.closed_at ?? emergency.arrived_at ?? emergency.created_at) : emergency.created_at;
  return <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-ink/60 p-4 pl-5 text-left transition hover:border-signal/40 hover:bg-white/5">
    <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: triage?.color ?? "#64748B" }} aria-hidden="true" />
    <button type="button" aria-label={archived ? `Ver episodio ${emergency.reason}` : undefined} onClick={onSelect} className="block w-full rounded-xl text-left"><span className="flex flex-wrap items-center justify-between gap-2"><strong>{patientDisplayLabel(emergency.patient)}</strong><span className="rounded-full bg-white/10 px-2 py-1 text-xs" style={triage ? { color: triage.color } : undefined}>{emergency.triage ?? "Sin clasificar"} · {emergency.status === "cancelada" && emergency.replaced_by_id ? cancellationLabel(emergency) : labels[emergency.status]}</span></span>
      <span className="mt-1 block text-sm text-muted-dark">{emergency.reason}</span>
      <span className="mt-3 block text-[10px] font-semibold uppercase tracking-widest text-muted-dark">Signos vitales</span>
      <VitalsStrip vitals={backendVitalsToDisplay(emergency)} tone="dark" dense className="mt-4" />
      <span className="mt-2 block text-xs text-muted-dark">{emergency.destination_name} · {emergency.ambulance_code} · {archived ? "Fecha del hito: " : ""}<time dateTime={date}>{new Date(date).toLocaleString(undefined, archived ? { timeZone: "America/Santiago" } : undefined)}</time></span>
      <span className="mt-1 block text-xs text-muted-dark">{emergency.read_at && emergency.read_by_id ? "Lectura confirmada" : "Lectura pendiente"} · {emergency.prepared_at && emergency.prepared_by_id ? "Preparación registrada" : "Preparación no registrada"}</span>
    </button>
    {onMarkArrived && (emergency.status === "notificada" || emergency.status === "en_traslado") && <button type="button" onClick={(event) => { event.stopPropagation(); onMarkArrived(); }} className="absolute right-4 top-[3.75rem] inline-flex h-8 items-center gap-2 rounded-lg bg-signal px-3 text-xs font-semibold text-ink hover:brightness-110"><Activity className="h-3.5 w-3.5" />Marcar como llegado</button>}
  </div>;
}
