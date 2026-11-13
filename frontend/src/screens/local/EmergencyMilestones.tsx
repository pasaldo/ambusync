import type { BackendEmergency } from "@/lib/backend";
import { hasMilestoneProof } from "@/lib/milestoneProof";

function milestoneTime(value: string): string {
  return new Date(value).toLocaleString("es-CL", { timeZone: "America/Santiago" });
}

export function EmergencyMilestones({ emergency, busy = false, pending = false, onRead, onPrepare, onRetry }: {
  emergency: BackendEmergency; busy?: boolean; pending?: boolean;
  onRead?: () => void; onPrepare?: () => void; onRetry?: () => void;
}) {
  const read = hasMilestoneProof(emergency.read_at, emergency.read_by_id);
  const prepared = hasMilestoneProof(emergency.prepared_at, emergency.prepared_by_id);
  const canAct = Boolean(onRead && onPrepare);
  const beforeReception = ["notificada", "en_traslado"].includes(emergency.status);
  return <section aria-label="Lectura y preparación de Urgencias" className="mt-4 space-y-2 border-t border-white/10 pt-3 text-sm">
    <h4 className="font-semibold">Lectura y preparación de Urgencias</h4>
    {read ? <p>Primera lectura confirmada: {milestoneTime(emergency.read_at!)} · Autor: {emergency.read_by_id}</p> : <p className="text-muted-dark">Lectura no confirmada.</p>}
    {prepared ? <p>Primera preparación registrada: {milestoneTime(emergency.prepared_at!)} · Autor: {emergency.prepared_by_id}</p> : <p className="text-muted-dark">Preparación no registrada.</p>}
    <p className="text-xs text-muted-dark">Abrir el detalle o recibir un aviso no confirma lectura. Preparación no significa box disponible ni inicio de atención. La primera lectura no certifica revisiones posteriores.</p>
    {canAct && beforeReception && <div className="flex flex-wrap gap-2">
      {!read && <button type="button" disabled={busy || pending} onClick={onRead} className="rounded-lg border border-signal/40 px-3 py-2 text-signal-soft disabled:opacity-50">Confirmar lectura</button>}
      {!prepared && <button type="button" disabled={!read || busy || pending} onClick={onPrepare} title={!read ? "Confirma primero la lectura" : undefined} className="rounded-lg border border-signal/40 px-3 py-2 text-signal-soft disabled:opacity-50">Registrar preparación</button>}
    </div>}
    {pending && onRetry && <div role="alert" className="space-y-2 text-amber-100"><p>Hay una operación de este episodio con resultado sin confirmar. No se enviará otra automáticamente; resuelve el intento pendiente.</p><button type="button" disabled={busy} onClick={onRetry} className="rounded-lg border border-amber-300/30 px-3 py-2 disabled:opacity-50">Reintentar operación del episodio</button></div>}
  </section>;
}
