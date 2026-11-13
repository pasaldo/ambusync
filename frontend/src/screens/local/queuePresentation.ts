import type { BackendEmergency, VitalMeasurement } from "../../lib/backend";

/** A reason mentioning a destination is not proof that a replacement exists. */
export function cancellationLabel(emergency: Pick<BackendEmergency, "status" | "replaced_by_id">): string {
  return emergency.status === "cancelada" && emergency.replaced_by_id
    ? "Cancelado por cambio de destino"
    : "Cancelado";
}

interface TriageQueueItem {
  id: string;
  created_at: string;
  triage?: string | null;
}

const categories = ["C1", "C2", "C3", "C4", "C5"];

function byAgeAndId(a: TriageQueueItem, b: TriageQueueItem): number {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  const age = (Number.isFinite(aTime) ? aTime : Infinity) - (Number.isFinite(bTime) ? bTime : Infinity);
  return age || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Presentation only: no classification, diagnosis, status changes or input mutation. */
export function partitionTriageQueue<T extends TriageQueueItem>(items: T[]): { classified: T[]; unclassified: T[] } {
  const classified = items.filter((item) => categories.includes(item.triage ?? ""));
  const unclassified = items.filter((item) => !categories.includes(item.triage ?? ""));
  classified.sort((a, b) => categories.indexOf(a.triage!) - categories.indexOf(b.triage!) || byAgeAndId(a, b));
  unclassified.sort(byAgeAndId);
  return { classified, unclassified };
}

export function rectificationDescription(item: VitalMeasurement, measurements: VitalMeasurement[]): string | null {
  if (!item.rectified_by_id) return item.is_current === false ? "Rectificada; referencia del reemplazo no disponible." : null;
  const replacement = measurements.find((candidate) => candidate.id === item.rectified_by_id);
  return replacement
    ? `Rectificada: reemplazo de ${replacement.value} ${replacement.unit} (medición #${replacement.id}).`
    : `Rectificada: reemplazo en medición #${item.rectified_by_id}; valor no disponible en este historial.`;
}
