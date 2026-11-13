import { useState } from "react";
import type { PatientRecord } from "@/lib/resourceOperation";
import { patientDisplayLabel } from "./queuePresentation";

const control = "mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-ink px-3 py-2";
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim().replace(/\s+/g, " ");

export function UnitPatientPicker({ patients, value, onChange, label, searchLabel, emptyLabel, ready = true }: {
  patients: PatientRecord[]; value: string; onChange: (id: string) => void;
  label: string; searchLabel: string; emptyLabel: string; ready?: boolean;
}) {
  const [query, setQuery] = useState("");
  const needle = normalize(query);
  const matches = patients.filter((row) => normalize(`${row.patient.alias ?? ""} ${row.id}`).includes(needle));
  const selected = patients.find((row) => row.id === value);
  const outside = Boolean(selected && !matches.some((row) => row.id === value));
  return <div className="min-w-0 space-y-2">
    <label className="block text-sm">{searchLabel}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} autoComplete="off" className={control} /></label>
    <label className="block text-sm">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={control}>
      <option value="">{emptyLabel}</option>
      {value && !selected && <option value={value} disabled>{ready ? "Registro seleccionado no disponible" : "Registro seleccionado pendiente de consulta"}</option>}
      {outside && selected && <option value={selected.id}>{patientDisplayLabel(selected.patient)} · {selected.id} · fuera del filtro</option>}
      {matches.map((row) => <option key={row.id} value={row.id}>{patientDisplayLabel(row.patient)} · {row.id}</option>)}
    </select></label>
    {needle && matches.length === 0 && <p role="status" className="text-sm text-muted-dark">Sin coincidencias para esta búsqueda.</p>}
    {outside && <p className="text-xs text-muted-dark">La selección actual está fuera del filtro; buscar no la cambia.</p>}
  </div>;
}
