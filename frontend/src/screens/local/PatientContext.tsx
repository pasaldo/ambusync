import { useState } from "react";
import type { BackendEmergency } from "@/lib/backend";
import { usePortalMemory } from "./portalMemory";
import { patientDisplayLabel } from "./queuePresentation";

const input = "mt-1 block min-h-10 w-full rounded-lg border border-white/15 bg-ink px-3 py-2";
const button = "rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50";
export function identityDescription(patient: BackendEmergency["patient"]): string {
  const unit = patient.age_unit === "years" ? "años" : patient.age_unit === "months" ? "meses" : "días";
  return `${patientDisplayLabel(patient)} · ${patient.age_value === null ? "Edad no informada" : `${patient.age_value} ${unit}`} · Sexo: ${patient.recorded_sex ?? "No informado"}`;
}
export function PatientContextHistory({ emergency }: { emergency: BackendEmergency }) {
  const history = emergency.patient_context_corrections ?? [];
  if (!history.length) return null;
  return <details className="mt-3 rounded-lg border border-white/10 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Historial de identificación de este episodio ({history.length})</summary>
    <ul className="mt-3 space-y-3">{history.map((row) => <li key={row.id} className="space-y-1 border-b border-white/10 pb-3">
      <p>Anterior: {identityDescription(row.previous_patient)}</p><p>Corregida: {identityDescription(row.corrected_patient)}</p>
      <p className="whitespace-pre-wrap">{row.reason}</p><p className="break-words text-xs text-muted-dark">Autor: {row.recorded_by_id} · {new Date(row.recorded_at).toLocaleString()} · Versión {row.episode_version}</p>
    </li>)}</ul>
  </details>;
}
export function PatientContextEditor({ emergency, busy, pending, onSave }: {
  emergency: BackendEmergency; busy: boolean; pending: boolean;
  onSave: (values: Record<string, unknown>, version: number) => Promise<void>;
}) {
  const memory = usePortalMemory();
  const [expanded, setExpanded] = useState(false);
  const [, render] = useState(0);
  const p = emergency.patient;
  const draft = memory.patientContextDrafts.get(emergency.id) ?? { version: emergency.version, unknown: p.identity_unknown, alias: p.alias ?? "", age: p.age_value === null ? "" : String(p.age_value), unit: p.age_unit ?? "", sex: p.recorded_sex ?? "", reason: "" };
  const changed = draft.version !== emergency.version;
  const disabled = busy || pending || changed;
  const open = ["notificada", "en_traslado"].includes(emergency.status);
  function edit(patch: Partial<typeof draft>) { memory.patientContextDrafts.set(emergency.id, { ...draft, ...patch }); render((n) => n + 1); }
  return <div className="mt-3 space-y-3">
    {open && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={button}>Corregir identificación de este episodio</button>}
    {open && expanded && <form onSubmit={(event) => {
      event.preventDefault(); if (disabled) return;
      void onSave({ patient_identity_unknown: draft.unknown, patient_alias: draft.unknown ? "" : draft.alias, ...(draft.age !== "" ? { age_value: Number(draft.age), age_unit: draft.unit } : {}), ...(draft.sex ? { recorded_sex: draft.sex } : {}), reason: draft.reason }, draft.version);
    }} className="space-y-3 rounded-xl border border-white/10 p-4">
      <p className="text-sm text-muted-dark">Solo este episodio y su destino verán la corrección. No cambia el registro maestro ni otros episodios; la identificación anterior queda conservada.</p>
      {changed && <div role="alert" className="space-y-2 text-sm text-amber-100"><p>El episodio cambió; revisa antes de corregir su identificación. Tu borrador conserva su versión.</p><button type="button" disabled={busy || pending} onClick={() => { memory.patientContextDrafts.delete(emergency.id); render((n) => n + 1); }} className={button}>Cargar identificación actual</button></div>}
      <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-50"><legend className="font-semibold">Identificación de este episodio</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.unknown} onChange={(event) => edit({ unknown: event.target.checked, ...(event.target.checked ? { alias: "" } : {}) })} />Identidad desconocida de este episodio</label>
        <label className="block text-sm">Alias de este episodio<input disabled={draft.unknown} maxLength={160} value={draft.alias} onChange={(event) => edit({ alias: event.target.value })} className={input} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">Edad de este episodio<input type="number" min="0" max="130" step="1" value={draft.age} onChange={(event) => edit({ age: event.target.value })} className={input} /></label>
          <label className="block text-sm">Unidad de edad de este episodio<select aria-label="Unidad de edad de este episodio" required={draft.age !== ""} value={draft.unit} onChange={(event) => edit({ unit: event.target.value })} className={input}><option value="">No informada</option><option value="years">Años</option><option value="months">Meses</option><option value="days">Días</option></select></label>
          <label className="block text-sm">Sexo de este episodio<select aria-label="Sexo de este episodio" value={draft.sex} onChange={(event) => edit({ sex: event.target.value })} className={input}><option value="">No informado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Indeterminado</option></select></label>
        </div>
        <label className="block text-sm">Motivo de corrección de identificación<textarea required minLength={3} maxLength={2000} value={draft.reason} onChange={(event) => edit({ reason: event.target.value })} className={input} /></label>
        <button className={button}>Guardar identificación de este episodio</button>
      </fieldset>
    </form>}
    <PatientContextHistory emergency={emergency} />
  </div>;
}
