import { useState } from "react";
import { getReportDetail, getReportPage, type BackendEmergency } from "@/lib/backend";
import { useScopedRead } from "./useScopedRead";
import { identityDescription, PatientContextHistory } from "./PatientContext";
import { MeasurementHistory } from "./EpisodeUpdates";
import { EmergencyMilestones } from "./EmergencyMilestones";
import { cancellationLabel } from "./queuePresentation";
import { ReplacementLink } from "./DestinationChange";

export const readControl = "mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-ink px-3 py-2";
export const readButton = "rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50";
export const statusNames: Record<string, string> = { notificada: "Notificada", en_traslado: "En traslado", llegado: "Llegado pendiente de cierre", cancelada: "Cancelada", cerrada: "Cerrada" };

export function ReadStatus({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return <>{loading && <p role="status" className="mt-4 text-sm text-muted-dark">Consultando en servidor…</p>}{error && <div role="alert" className="mt-4 space-y-2 rounded-lg border border-amber-300/30 p-3 text-sm text-amber-100"><p>{error}</p><button type="button" className={readButton} onClick={retry}>Reintentar consulta</button></div>}</>;
}
export function PageControls({ page, next, previous, busy, onPage }: { page: number; next: string | null; previous: string | null; busy: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="Paginación de consulta" className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={busy || !previous} onClick={() => onPage(page - 1)} className={readButton}>Página anterior</button><span className="text-sm">Página {page}</span><button type="button" disabled={busy || !next} onClick={() => onPage(page + 1)} className={readButton}>Página siguiente</button></nav>;
}
export function ReportsPanel({ expireSession, onDeactivatePatient, patientBusy = false, patientPending }: {
  expireSession: () => void; onDeactivatePatient?: (emergency: BackendEmergency) => Promise<void>; patientBusy?: boolean; patientPending?: (id: string) => boolean;
}) {
  const empty = { date_from: "", date_to: "", status: "", ambulance_id: "", triage: "" };
  const [draft, setDraft] = useState(empty), [applied, setApplied] = useState(empty);
  const [page, setPage] = useState(1), [selected, setSelected] = useState("");
  const query = new URLSearchParams({ page: String(page), page_size: "25" });
  for (const [key, value] of Object.entries(applied)) if (value) query.set(key, value);
  const listing = useScopedRead(`/api/v1/reports/emergencies/?${query}`, getReportPage, expireSession);
  const detail = useScopedRead(selected ? `/api/v1/reports/emergencies/${encodeURIComponent(selected)}/` : "", getReportDetail, expireSession);
  const data = listing.data;
  const edit = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <section className="mt-5 min-w-0 space-y-4">
    <h2 className="text-lg font-bold">Histórico e informes del destino</h2>
    <p className="text-sm text-muted-dark">Consulta autorizada de episodios, no de pacientes únicos ni traslados únicos. Sin exportación ni edición histórica. Fechas de creación en America/Santiago.</p>
    <form onSubmit={(event) => { event.preventDefault(); setSelected(""); setPage(1); setApplied({ ...draft }); if (JSON.stringify(applied) === JSON.stringify(draft) && page === 1) listing.retry(); }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Desde (fecha de creación)<input type="date" value={draft.date_from} onChange={(e) => edit("date_from", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Hasta (fecha de creación)<input type="date" value={draft.date_to} min={draft.date_from || undefined} onChange={(e) => edit("date_to", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Estado del informe<select aria-label="Estado del informe" value={draft.status} onChange={(e) => edit("status", e.target.value)} className={readControl}><option value="">Todos los estados</option>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm">Unidad del informe<select aria-label="Unidad del informe" value={draft.ambulance_id} onChange={(e) => edit("ambulance_id", e.target.value)} className={readControl}><option value="">Todas las autorizadas</option>{data?.ambulances.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}{draft.ambulance_id && !data?.ambulances.some((unit) => unit.id === draft.ambulance_id) && <option value={draft.ambulance_id}>Unidad seleccionada · {draft.ambulance_id}</option>}</select></label>
        <label className="block text-sm">Triaje del informe<select aria-label="Triaje del informe" value={draft.triage} onChange={(e) => edit("triage", e.target.value)} className={readControl}><option value="">Todos</option>{["C1", "C2", "C3", "C4", "C5"].map((value) => <option key={value}>{value}</option>)}<option value="unclassified">Sin clasificar</option></select></label>
      </div>
      <button className={readButton}>Aplicar filtros</button>
      <p className="text-xs text-muted-dark">{JSON.stringify(draft) !== JSON.stringify(applied) ? "Hay filtros editados sin aplicar. El resultado sigue correspondiendo a la consulta aplicada." : "El listado y las cantidades corresponden a los filtros aplicados en servidor."}</p>
    </form>
    <ReadStatus loading={listing.loading} error={listing.error} retry={listing.retry} />
    {data && <>
      <p className="font-semibold">{data.count} {data.count === 1 ? "episodio" : "episodios"}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="font-semibold">Por estado</h3><dl className="mt-2 space-y-1 text-sm">{Object.entries(data.summary.by_status).map(([key, count]) => <div key={key} className="flex justify-between gap-3"><dt>{statusNames[key] ?? key}</dt><dd className="tabular-nums">{count}</dd></div>)}</dl></div>
        <div><h3 className="font-semibold">Por triaje</h3><dl className="mt-2 space-y-1 text-sm">{Object.entries(data.summary.by_triage).map(([key, count]) => <div key={key} className="flex justify-between gap-3"><dt>{key === "unclassified" ? "Sin clasificar" : key}</dt><dd className="tabular-nums">{count}</dd></div>)}</dl></div>
      </div>
      {!data.results.length && <p className="text-sm text-muted-dark">No hay episodios para estos filtros. Revisa el período o amplía la consulta.</p>}
      <ul className="space-y-2">{data.results.map((row) => <li key={row.id} className="border-b border-white/10 py-3 text-sm"><button type="button" aria-label={`Ver episodio ${row.reason}`} onClick={() => setSelected(row.id)} className="w-full text-left hover:text-signal-soft"><strong>{row.reason}</strong><span className="mt-1 block text-muted-dark">{identityDescription(row.patient)}</span><span className="mt-1 block text-muted-dark">{row.status === "cancelada" ? cancellationLabel(row) : statusNames[row.status]} · {row.ambulance_code} · {new Date(row.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span></button></li>)}</ul>
      <PageControls page={page} next={data.next} previous={data.previous} busy={listing.loading} onPage={(next) => { setSelected(""); setPage(next); }} />
    </>}
    {selected && <section aria-label="Consulta del episodio histórico" className="space-y-3 rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Detalle histórico</h3><button type="button" className={readButton} onClick={() => setSelected("")}>Volver al listado</button></div>
      <ReadStatus loading={detail.loading} error={detail.error} retry={detail.retry} />
      {detail.data && <><p className="text-sm">{identityDescription(detail.data.patient)}</p><p className="whitespace-pre-wrap text-sm">{detail.data.reason}</p><p className="whitespace-pre-wrap text-sm text-muted-dark">Notas: {detail.data.notes || "No informadas"}</p><p className="text-sm">Síntomas: {detail.data.symptoms.join(", ") || "No informados"}</p><EmergencyMilestones emergency={detail.data} /><PatientContextHistory emergency={detail.data} /><MeasurementHistory measurements={detail.data.vital_measurements} /></>}
      {detail.data && <div className="space-y-3 border-t border-white/10 pt-3 text-sm">
        <p>Estado: {statusNames[detail.data.status]} · Triaje: {detail.data.triage ?? "Sin clasificar"}</p>
        <dl className="space-y-2">{[
          { label: "Creación", at: detail.data.created_at, by: null },
          { label: "Triaje registrado", at: detail.data.triage_recorded_at, by: detail.data.triage_recorded_by_id },
          { label: "Llegada registrada", at: detail.data.arrived_at, by: detail.data.arrived_by_id },
          { label: "Cierre registrado", at: detail.data.closed_at, by: detail.data.closed_by_id },
          { label: "Cancelación registrada", at: detail.data.cancelled_at, by: detail.data.cancelled_by_id },
        ].map((row) => <div key={row.label}><dt className="font-medium">{row.label}</dt><dd className="break-words text-muted-dark">{row.at ? <time dateTime={row.at}>{new Date(row.at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</time> : "Sin fecha registrada"}{row.by ? ` · Autor: ${row.by}` : ""}</dd></div>)}</dl>
        {detail.data.arrival_reason && <div><p className="font-medium">Motivo de llegada excepcional</p><p className="whitespace-pre-wrap">{detail.data.arrival_reason}</p></div>}
      </div>}
      {detail.data && <><ReplacementLink emergency={detail.data} />{detail.data.status === "cancelada" && <p className="whitespace-pre-wrap text-sm text-rose-100">{cancellationLabel(detail.data)}: {detail.data.cancellation_reason || "Sin motivo registrado"}</p>}</>}
      {detail.data && detail.data.patient_id && detail.data.patient_record_enabled !== false && onDeactivatePatient && <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-xs text-muted-dark">Gestión del paciente sintético con permiso adicional. No modifica este episodio ni su historial.</p><button type="button" disabled={patientBusy || patientPending?.(detail.data.patient_id)} className={readButton} onClick={() => { const episode = detail.data!; void onDeactivatePatient(episode).then(() => detail.retry()); }}>Desactivar paciente sintético</button></div>}
    </section>}
  </section>;
}
