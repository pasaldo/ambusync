import { useState } from "react";
import { getAdministrativeAudit } from "@/lib/backend";
import { PageControls, ReadStatus, readButton, readControl } from "./ReportsPanel";
import { useScopedRead } from "./useScopedRead";

const actions = ["account.created", "account.activated", "account.activation_resent", "account.deactivated", "ambulance.created", "ambulance.deactivated", "ambulance.assignment_started", "ambulance.assignment_ended", "institution_admin.provisioned", "permission.manage_symptoms_granted", "permission.deactivate_patients_granted", "permission.view_reports_granted"];
export function AdministrativeAuditPanel({ expireSession }: { expireSession: () => void }) {
  const empty = { date_from: "", date_to: "", action: "", object_type: "" };
  const [draft, setDraft] = useState(empty), [applied, setApplied] = useState(empty);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), page_size: "25" });
  for (const [key, value] of Object.entries(applied)) if (value) query.set(key, value);
  const result = useScopedRead(`/api/v1/institutions/audit/?${query}`, getAdministrativeAudit, expireSession);
  const edit = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <section className="mt-5 min-w-0 space-y-4"><h2 className="text-lg font-bold">Auditoría administrativa de la institución</h2>
    <p className="text-sm text-muted-dark">Solo acciones administrativas autorizadas. No incluye antecedentes de pacientes, eventos clínicos ni logs técnicos. Fechas en America/Santiago.</p>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied({ ...draft }); if (JSON.stringify(draft) === JSON.stringify(applied) && page === 1) result.retry(); }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Desde (fecha del evento)<input type="date" value={draft.date_from} onChange={(e) => edit("date_from", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Hasta (fecha del evento)<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => edit("date_to", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Acción administrativa<select aria-label="Acción administrativa" value={draft.action} onChange={(e) => edit("action", e.target.value)} className={readControl}><option value="">Todas las autorizadas</option>{actions.map((action) => <option key={action}>{action}</option>)}</select></label>
        <label className="block text-sm">Tipo de objeto<select aria-label="Tipo de objeto" value={draft.object_type} onChange={(e) => edit("object_type", e.target.value)} className={readControl}><option value="">Todos</option><option value="account">Cuenta</option><option value="ambulance">Unidad</option><option value="ambulance_assignment">Asignación</option></select></label>
      </div><button className={readButton}>Aplicar filtros de auditoría</button>
      {JSON.stringify(draft) !== JSON.stringify(applied) && <p className="text-xs text-muted-dark">Filtros editados sin aplicar. El resultado corresponde a la consulta anterior.</p>}
    </form>
    <ReadStatus loading={result.loading} error={result.error} retry={result.retry} />
    {result.data && <><p className="font-semibold">{result.data.count} {result.data.count === 1 ? "evento administrativo" : "eventos administrativos"}</p><ul className="space-y-3">{result.data.results.map((row) => <li key={row.id} className="space-y-1 break-words border-b border-white/10 pb-3 text-sm"><strong>{row.action}</strong><p>Actor: {row.actor_id ?? "Proceso técnico"} · {new Date(row.occurred_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p><p>Objeto: {row.object_type} · {row.object_id}</p><p className="text-xs text-muted-dark">Resultado: {row.result} · Correlación: {row.correlation_id}</p></li>)}</ul>{!result.data.results.length && <p className="text-sm text-muted-dark">No hay eventos administrativos para estos filtros.</p>}<PageControls page={page} next={result.data.next} previous={result.data.previous} busy={result.loading} onPage={setPage} /></>}
  </section>;
}
