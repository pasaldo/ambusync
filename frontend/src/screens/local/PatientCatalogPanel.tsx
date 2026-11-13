import { useState } from "react";
import { createPortal } from "react-dom";
import type { BackendUser } from "@/lib/backend";
import type { PatientRecord } from "@/lib/resourceOperation";
import type { PatientCatalogState } from "./usePatientCatalog";
import { UnitPatientPicker } from "./UnitPatientPicker";

const field = "mt-1 block min-h-10 w-full rounded-lg border border-white/15 bg-ink px-3 py-2";
const button = "rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50";

export function PatientCatalogPanel({ user, state, feedbackTarget }: { user: BackendUser; state: PatientCatalogState; feedbackTarget?: HTMLDivElement | null }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const canPatients = user.groups.includes("ambulance") && Boolean(user.ambulance);
  const canCatalog = user.groups.includes("manage_symptoms");
  const patient = state.patients.find((row) => row.id === selected);
  const catalogDraft = state.memory.resourceDrafts.get("symptom-new")?.fields.description ?? "";
  const feedback = <>
    {state.message && <p role="status" className="rounded-lg bg-signal/10 p-3 text-sm">{state.message}</p>}
    {state.error && <p role="alert" className="rounded-lg bg-amber-300/10 p-3 text-sm text-amber-100">{state.error}</p>}
    {[...state.memory.resourceAttempts.entries()].map(([key, entry]) => entry.uncertain && <div key={key} role="alert" className="space-y-2 rounded-lg border border-amber-300/30 p-3 text-sm text-amber-100"><p>Resultado de registro sin confirmar. No se reenviará automáticamente. Recargar/cerrar puede perder el intento en memoria.</p><button type="button" disabled={state.busy} onClick={() => void state.execute(key)} className={button}>Reintentar operación de registro</button></div>)}
  </>;
  return <section className="mt-4 space-y-3">
    {(canPatients || canCatalog) && <button type="button" onClick={() => setOpen(!open)} className={button} aria-expanded={open}>Pacientes y catálogo</button>}
    {feedbackTarget ? createPortal(feedback, feedbackTarget) : feedback}
    {open && <div className="space-y-5 rounded-xl border border-white/10 p-4">
      <p className="text-sm text-muted-dark">Pacientes solo de la unidad asignada. Corregir el registro no cambia la identificación conservada en episodios anteriores ni abre sus historiales.</p>
      <button type="button" disabled={state.busy} onClick={() => void state.refresh()} className={button}>Actualizar pacientes y catálogo</button>
      {canPatients && <div className="space-y-3"><h3 className="font-semibold">Registros de pacientes de la unidad</h3>{state.patients.length === 0 && <p className="text-sm text-muted-dark">No hay pacientes activos registrados para esta unidad.</p>}<UnitPatientPicker patients={state.patients} value={selected ?? ""} onChange={setSelected} label="Registro del paciente" searchLabel="Buscar registro por alias o ID" emptyLabel="Selecciona un registro" ready={state.ready} />{patient && <PatientEditor patient={patient} state={state} />}</div>}
      {canCatalog && <div className="space-y-3"><h3 className="font-semibold">Catálogo institucional de síntomas</h3><p className="text-xs text-muted-dark">Permiso adicional explícito; no modifica descripciones ya guardadas en episodios.</p>
        <form onSubmit={(event) => { event.preventDefault(); void state.run("symptom-new", "symptom-create", "", "/api/v1/institutions/symptoms/", 1, { description: String(catalogDraft).trim() }, "Síntoma registrado en el catálogo institucional.", user.institutions[0]?.id); }}>
          <fieldset disabled={state.busy || state.memory.resourceAttempts.has("symptom-new")} className="space-y-2 disabled:opacity-50"><label className="block text-sm">Descripción del síntoma<input required maxLength={120} value={String(catalogDraft)} onChange={(event) => { state.memory.resourceDrafts.set("symptom-new", { version: 1, fields: { description: event.target.value } }); state.rerender(); }} className={field} /></label><button className={button}>Agregar al catálogo</button></fieldset>
        </form>
        <ul className="space-y-2">{state.symptoms.map((symptom) => <li key={symptom.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-sm"><span>{symptom.description} · {symptom.enabled ? "Activo" : "Desactivado"}</span>{symptom.enabled && <button type="button" aria-label={`Desactivar síntoma ${symptom.description}`} disabled={state.busy || state.memory.resourceAttempts.has(`symptom:${symptom.id}`)} onClick={() => void state.run(`symptom:${symptom.id}`, "symptom-deactivate", symptom.id, `/api/v1/institutions/symptoms/${encodeURIComponent(symptom.id)}/deactivate/`, symptom.version, {}, "Síntoma desactivado; descripciones históricas conservadas.", symptom.institution_id)} className={button}>Desactivar</button>}</li>)}</ul>
      </div>}
    </div>}
  </section>;
}

function PatientEditor({ patient, state }: { patient: PatientRecord; state: PatientCatalogState }) {
  const key = `patient:${patient.id}`;
  const initial = () => ({ version: patient.version, fields: { unknown: patient.patient.identity_unknown, alias: patient.patient.alias ?? "", age: patient.patient.age_value === null ? "" : String(patient.patient.age_value), unit: patient.patient.age_unit ?? "", sex: patient.patient.recorded_sex ?? "" } });
  const draft = state.memory.resourceDrafts.get(key) ?? initial();
  const changed = draft.version !== patient.version;
  const edit = (name: string, value: string | boolean) => { state.memory.resourceDrafts.set(key, { ...draft, fields: { ...draft.fields, [name]: value, ...(name === "unknown" && value ? { alias: "" } : {}) } }); state.rerender(); };
  return <form onSubmit={(event) => { event.preventDefault(); if (changed) return; const f = draft.fields; void state.run(key, "patient-update", patient.id, `/api/v1/patients/${encodeURIComponent(patient.id)}/update/`, draft.version, { patient_identity_unknown: Boolean(f.unknown), patient_alias: f.unknown ? "" : String(f.alias), ...(String(f.age) !== "" ? { age_value: Number(f.age), age_unit: String(f.unit) } : {}), ...(f.sex ? { recorded_sex: f.sex } : {}) }, "Registro del paciente actualizado; episodios anteriores conservados."); }} className="mt-4 space-y-3">
    {changed && <div role="alert" className="space-y-2 text-sm text-amber-100"><p>El registro del paciente cambió. Revisa antes de enviar; no se rebasó tu formulario.</p><button type="button" disabled={state.busy || state.memory.resourceAttempts.has(key)} onClick={() => { state.memory.resourceDrafts.delete(key); state.rerender(); }} className={button}>Cargar registro actual</button></div>}
    <fieldset disabled={changed || state.busy || state.memory.resourceAttempts.has(key)} className="min-w-0 space-y-3 disabled:opacity-50"><legend className="font-semibold">Corregir maestro sintético</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.fields.unknown)} onChange={(e) => edit("unknown", e.target.checked)} />Identidad desconocida del registro</label>
      <label className="block text-sm">Alias del registro<input disabled={Boolean(draft.fields.unknown)} maxLength={160} value={String(draft.fields.alias)} onChange={(e) => edit("alias", e.target.value)} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm">Edad del registro<input type="number" min="0" max="130" step="1" value={String(draft.fields.age)} onChange={(e) => edit("age", e.target.value)} className={field} /></label><label className="block text-sm">Unidad de edad del registro<select aria-label="Unidad de edad del registro" value={String(draft.fields.unit)} onChange={(e) => edit("unit", e.target.value)} className={field}><option value="">No informada</option><option value="years">Años</option><option value="months">Meses</option><option value="days">Días</option></select></label><label className="block text-sm">Sexo del registro<select aria-label="Sexo del registro" value={String(draft.fields.sex)} onChange={(e) => edit("sex", e.target.value)} className={field}><option value="">No informado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Indeterminado</option></select></label></div>
      <button className={button}>Guardar registro del paciente</button>
    </fieldset>
  </form>;
}
