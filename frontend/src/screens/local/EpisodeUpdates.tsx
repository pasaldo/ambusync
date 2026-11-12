import { useState, type FormEvent } from "react";
import type { BackendEmergency, EmergencyAction, VitalMeasurement } from "@/lib/backend";
import { usePortalMemory } from "./portalMemory";
import { clinicalDraft, localMeasurementTime, MEASUREMENT_OPTIONS, type ClinicalDraft } from "./clinicalUpdates";

const inputClass = "mt-1 block min-h-10 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-white";
const buttonClass = "rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50";

export function MeasurementHistory({ measurements, onRectify }: { measurements: VitalMeasurement[]; onRectify?: (item: VitalMeasurement) => void }) {
  return <div className="mt-4 space-y-2">
    <h4 className="font-semibold">Historial de mediciones</h4>
    <p className="text-xs text-muted-dark">Se conservan las muestras originales. Vigente indica el último eslabón de una rectificación, no necesariamente la muestra más reciente.</p>
    {!measurements.length && <p className="text-sm text-muted-dark">No se registraron mediciones.</p>}
    <ul className="space-y-3">{measurements.map((item, index) => <li key={item.id ?? index} className="border-b border-white/10 pb-3 text-sm">
      <p>{MEASUREMENT_OPTIONS.find((option) => option.kind === item.kind)?.label ?? item.kind}: <strong className={item.is_current === false || item.rectified_by_id ? "line-through text-muted-dark" : "text-white"}>{item.value} {item.unit}</strong></p>
      <p className="text-xs text-muted-dark">Medida: {new Date(item.measured_at).toLocaleString()} · Registrada: {new Date(item.recorded_at).toLocaleString()} · Autor: {item.recorded_by_id ?? "Sin registro legado"}</p>
      {Date.parse(item.measured_at) > Date.parse(item.recorded_at) + 60_000 && <p className="text-xs text-amber-100">Revisar reloj: la hora de medición es posterior a la recepción en servidor. No se ajustó automáticamente.</p>}
      {item.rectified_by_id ? <p className="text-amber-100">Rectificada → {item.rectified_by_id}</p> : <p className="text-xs text-muted-dark">Vigente en su cadena</p>}
      {item.rectifies_id && <p className="text-xs text-muted-dark">Rectifica medición {item.rectifies_id}</p>}
      {item.rectification_reason && <p className="mt-1 whitespace-pre-wrap">{item.rectification_reason}</p>}
      {onRectify && item.id && item.is_current !== false && !item.rectified_by_id && <button type="button" onClick={() => onRectify(item)} className={`${buttonClass} mt-2`} aria-label={`Rectificar medición ${item.id}`}>Rectificar</button>}
    </li>)}</ul>
  </div>;
}

export function EpisodeUpdates({ emergency, busy, pending, symptoms, onSave }: {
  emergency: BackendEmergency; busy: boolean; pending: boolean; symptoms: string[];
  onSave: (action: EmergencyAction, values: Record<string, unknown>, version: number) => Promise<void>;
}) {
  const memory = usePortalMemory();
  const [expanded, setExpanded] = useState(false);
  const [, rerender] = useState(0);
  const draft = memory.episodeDrafts.get(emergency.id) ?? clinicalDraft(emergency);
  const open = ["notificada", "en_traslado"].includes(emergency.status);
  const changed = draft.version !== emergency.version;
  const disabled = busy || pending || changed;
  const option = MEASUREMENT_OPTIONS.find((item) => item.key === draft.measurementKey) ?? MEASUREMENT_OPTIONS[0];
  function edit(patch: Partial<ClinicalDraft>) {
    memory.episodeDrafts.set(emergency.id, { ...draft, ...patch });
    rerender((value) => value + 1);
  }
  function loadCurrent() { memory.episodeDrafts.delete(emergency.id); rerender((value) => value + 1); }
  async function saveBackground(event: FormEvent) {
    event.preventDefault();
    if (disabled || !open) return;
    await onSave("update", { reason: draft.reason, notes: draft.notes, symptoms: draft.symptoms, triage: draft.triage }, draft.version);
  }
  async function saveMeasurement(event: FormEvent) {
    event.preventDefault();
    if (disabled || !open) return;
    const captured = new Date(draft.measuredAt).toISOString();
    await onSave(draft.rectifiesId ? "measurements/rectify" : "measurements", draft.rectifiesId
      ? { measurement_id: draft.rectifiesId, value: Number(draft.value), unit: option.unit, measured_at: captured, reason: draft.rectificationReason }
      : { vitals: { [option.key]: Number(draft.value), taken_at: captured } }, draft.version);
  }
  function rectify(item: VitalMeasurement) {
    edit({ rectifiesId: item.id ?? "", measurementKey: MEASUREMENT_OPTIONS.find((entry) => entry.kind === item.kind)?.key ?? "hr", value: String(item.value), measuredAt: localMeasurementTime(item.measured_at), rectificationReason: "" });
  }
  return <div className="mt-3">
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className={buttonClass}>{expanded ? "Ocultar antecedentes y mediciones" : open ? "Actualizar antecedentes y mediciones" : "Ver antecedentes y mediciones"}</button>
    {expanded && <div className="mt-4 space-y-5">
      <p className="text-sm">Triaje: <strong>{emergency.triage ?? "Sin clasificar"}</strong> · Autor: {emergency.triage_recorded_by_id ?? "Sin registro legado"}{emergency.triage_recorded_at ? ` · ${new Date(emergency.triage_recorded_at).toLocaleString()}` : ""}</p>
      {!open && <p className="text-sm text-amber-100">Episodio recibido o terminal: solo consulta, sin edición ordinaria.</p>}
      {open && <>
        {changed && <div role="alert" className="space-y-2 text-sm text-amber-100"><p>El episodio cambió mientras editabas (formulario v{draft.version}, servidor v{emergency.version}). Revisa el historial; no se actualizará tu versión silenciosamente.</p><button type="button" disabled={busy || pending} onClick={loadCurrent} className={buttonClass}>Cargar versión actual</button><p className="text-xs">Cargar reemplaza el formulario por los datos vigentes.</p></div>}
        <form onSubmit={saveBackground}>
          <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-60">
            <legend className="font-semibold">Antecedentes del episodio</legend>
            <label className="block text-sm">Motivo del episodio<textarea aria-label="Motivo del episodio" required minLength={3} maxLength={2000} value={draft.reason} onChange={(event) => edit({ reason: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">Notas del episodio<textarea aria-label="Notas del episodio" maxLength={2000} value={draft.notes} onChange={(event) => edit({ notes: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">Triaje del episodio<select aria-label="Triaje del episodio" value={draft.triage ?? ""} onChange={(event) => edit({ triage: (event.target.value || null) as ClinicalDraft["triage"] })} className={inputClass}><option value="">Sin clasificar</option>{["C1", "C2", "C3", "C4", "C5"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <fieldset><legend className="text-sm">Síntomas del episodio</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{[...new Set([...symptoms, ...draft.symptoms])].map((name) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.symptoms.includes(name)} onChange={() => edit({ symptoms: draft.symptoms.includes(name) ? draft.symptoms.filter((item) => item !== name) : [...draft.symptoms, name] })} />{name}</label>)}</div></fieldset>
            <button className={buttonClass}>Guardar antecedentes</button>
          </fieldset>
        </form>
        <form onSubmit={saveMeasurement}>
          <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-60">
            <legend className="font-semibold">{draft.rectifiesId ? `Rectificar medición ${draft.rectifiesId}` : "Agregar medición seriada"}</legend>
            <label className="block text-sm">Tipo de medición<select aria-label="Tipo de medición" disabled={Boolean(draft.rectifiesId)} value={draft.measurementKey} onChange={(event) => edit({ measurementKey: event.target.value, value: "" })} className={inputClass}>{MEASUREMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.unit})</option>)}</select></label>
            <label className="block text-sm">Nuevo valor<input required type="number" step={option.step} min={"min" in option ? option.min : undefined} max={"max" in option ? option.max : undefined} value={draft.value} onChange={(event) => edit({ value: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">Hora de medición<input required type="datetime-local" step="0.001" value={draft.measuredAt} onChange={(event) => edit({ measuredAt: event.target.value })} className={inputClass} /></label>
            {draft.rectifiesId && <label className="block text-sm">Motivo de rectificación<textarea aria-label="Motivo de rectificación" required minLength={3} maxLength={2000} value={draft.rectificationReason} onChange={(event) => edit({ rectificationReason: event.target.value })} className={inputClass} /></label>}
            <div className="flex flex-wrap gap-2"><button className={buttonClass}>{draft.rectifiesId ? "Registrar rectificación" : "Agregar medición"}</button>{draft.rectifiesId && <button type="button" onClick={() => edit({ rectifiesId: "", value: "", rectificationReason: "", measuredAt: localMeasurementTime() })} className={buttonClass}>Cancelar rectificación</button>}</div>
          </fieldset>
        </form>
      </>}
      <fieldset disabled={disabled} className="min-w-0"><MeasurementHistory measurements={emergency.vital_measurements} onRectify={open ? rectify : undefined} /></fieldset>
      {!open && <p className="whitespace-pre-wrap text-sm text-muted-dark">Notas: {emergency.notes || "No informadas"}</p>}
    </div>}
  </div>;
}
