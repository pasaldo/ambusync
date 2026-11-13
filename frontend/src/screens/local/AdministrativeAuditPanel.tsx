import { useState } from "react";
import { getAdministrativeAudit } from "@/lib/backend";
import { PageControls, ReadStatus, readButton, readControl } from "./ReportsPanel";
import { useScopedRead } from "./useScopedRead";

const actions: Record<string, string> = {
  "account.created": "Cuenta creada",
  "account.activated": "Cuenta activada",
  "account.activation_resent": "Invitación de activación reenviada",
  "account.deactivated": "Cuenta desactivada",
  "ambulance.created": "Unidad creada",
  "ambulance.deactivated": "Unidad desactivada",
  "ambulance.assignment_started": "Unidad asignada a una cuenta",
  "ambulance.assignment_ended": "Asignación de unidad retirada",
  "institution_admin.provisioned": "Administración institucional habilitada",
  "permission.manage_symptoms_granted": "Permiso para gestionar síntomas concedido",
  "permission.deactivate_patients_granted": "Permiso para desactivar pacientes concedido",
  "permission.view_reports_granted": "Permiso de informes concedido",
};
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
    <p className="text-sm text-muted-dark">Identificación actual de las cuentas y unidades, no nombres conservados en la fecha del evento. Si una referencia no está disponible en esta institución, se indica sin reconstruirla.</p>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied({ ...draft }); if (JSON.stringify(draft) === JSON.stringify(applied) && page === 1) result.retry(); }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Desde (fecha del evento)<input type="date" value={draft.date_from} onChange={(e) => edit("date_from", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Hasta (fecha del evento)<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => edit("date_to", e.target.value)} className={readControl} /></label>
        <label className="block text-sm">Acción administrativa<select aria-label="Acción administrativa" value={draft.action} onChange={(e) => edit("action", e.target.value)} className={readControl}><option value="">Todas las autorizadas</option>{Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm">Tipo de objeto<select aria-label="Tipo de objeto" value={draft.object_type} onChange={(e) => edit("object_type", e.target.value)} className={readControl}><option value="">Todos</option><option value="account">Cuenta</option><option value="ambulance">Unidad</option><option value="ambulance_assignment">Asignación</option></select></label>
      </div><button className={readButton}>Aplicar filtros de auditoría</button>
      {JSON.stringify(draft) !== JSON.stringify(applied) && <p className="text-xs text-muted-dark">Filtros editados sin aplicar. El resultado corresponde a la consulta anterior.</p>}
    </form>
    <ReadStatus loading={result.loading} error={result.error} retry={result.retry} />
    {result.data && <><p className="font-semibold">{result.data.count} {result.data.count === 1 ? "evento administrativo" : "eventos administrativos"}</p><ul className="space-y-5">{result.data.results.map((row) => <li key={row.id} className="min-w-0 space-y-3 break-words border-b border-white/10 pb-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{actions[row.action] ?? "Evento administrativo"}</h3><span className="text-xs text-signal-soft">{row.result === "success" ? "Confirmado" : "Resultado no reconocido"}</span></div>
      <p className="text-xs text-muted-dark"><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</time></p>
      <dl className="space-y-2">{row.display.account !== null && <div><dt className="text-xs text-muted-dark">Cuenta afectada</dt><dd>{row.display.account}</dd></div>}{row.display.unit !== null && <div><dt className="text-xs text-muted-dark">Unidad afectada</dt><dd>{row.display.unit}</dd></div>}<div><dt className="text-xs text-muted-dark">Realizado por</dt><dd>{row.display.actor}</dd></div></dl>
      <details className="text-xs text-muted-dark"><summary className="cursor-pointer py-1 hover:text-white">Detalles técnicos</summary><dl className="mt-2 space-y-2 [overflow-wrap:anywhere]">{[["Código del evento", row.action], ["Tipo de objeto", row.object_type], ["ID del objeto", row.object_id], ["ID del responsable", row.actor_id ?? "Sin cuenta: proceso técnico"], ["Resultado técnico", row.result], ["Correlación", row.correlation_id], ["ID del evento", row.id]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
    </li>)}</ul>{!result.data.results.length && <p className="text-sm text-muted-dark">No hay eventos administrativos para estos filtros.</p>}<PageControls page={page} next={result.data.next} previous={result.data.previous} busy={result.loading} onPage={setPage} /></>}
  </section>;
}
