import { useState, type FormEvent } from "react";
import type { BackendEmergency, Destination } from "@/lib/backend";
import { usePortalMemory } from "./portalMemory";

export function ReplacementLink({ emergency }: { emergency: BackendEmergency }) {
  return <div className="mt-2 space-y-1 break-words text-xs text-muted-dark">
    {emergency.replaces_id && <p>Reemplaza al episodio {emergency.replaces_id}</p>}
    {emergency.replaced_by_id && <p>Reemplazado por episodio {emergency.replaced_by_id}</p>}
    {(emergency.replaces_id || emergency.replaced_by_id) && <p>Vínculo informativo; no concede acceso al otro episodio.</p>}
    {emergency.replaces_id && emergency.transfer_declared_at && <p>Traslado ya iniciado: se conserva la declaración original, no es una nueva hora de salida.</p>}
  </div>;
}

export function DestinationChange({ emergency, destinations, busy, pending, onConfirm }: {
  emergency: BackendEmergency; destinations: Destination[]; busy: boolean; pending: boolean;
  onConfirm: (values: Record<string, unknown>, version: number) => Promise<void>;
}) {
  const memory = usePortalMemory();
  const [expanded, setExpanded] = useState(false);
  const [, rerender] = useState(0);
  if (!["notificada", "en_traslado"].includes(emergency.status)) return null;
  const empty = () => ({ version: emergency.version, destinationId: "", reason: "" });
  const draft = memory.destinationDrafts.get(emergency.id) ?? empty();
  const changed = draft.version !== emergency.version;
  const disabled = busy || pending || changed;
  function edit(patch: Partial<typeof draft>) {
    memory.destinationDrafts.set(emergency.id, { ...draft, ...patch });
    rerender((value) => value + 1);
  }
  function open() {
    if (!memory.destinationDrafts.has(emergency.id)) memory.destinationDrafts.set(emergency.id, empty());
    setExpanded(!expanded);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !draft.destinationId || draft.destinationId === emergency.destination_id || draft.reason.trim().length < 3) return;
    await onConfirm({ destination_id: draft.destinationId, reason: draft.reason.trim() }, draft.version);
  }
  return <section aria-label="Cambio de destino" className="mt-3">
    <button type="button" disabled={busy || pending} onClick={open} aria-expanded={expanded} className="rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50">{expanded ? "Ocultar cambio de destino" : "Cambiar destino"}</button>
    {expanded && <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <p className="text-sm">Se cancelará este episodio y se creará otro para el nuevo destino en una sola transacción. Se conservan antecedentes y mediciones vigentes como heredadas, sin lectura ni preparación del receptor anterior. Solo se copian datos guardados en servidor, no borradores sin enviar.</p>
      {changed && <div role="alert" className="space-y-2 text-sm text-amber-100"><p>El episodio cambió desde que preparaste el cambio de destino (formulario v{draft.version}, servidor v{emergency.version}). Revisa antes de enviar.</p><button type="button" disabled={busy || pending} onClick={() => { memory.destinationDrafts.delete(emergency.id); rerender((value) => value + 1); }} className="rounded-lg border border-amber-300/30 px-3 py-2">Cargar versión actual para destino</button><p className="text-xs">Reemplaza destino y motivo del formulario; no envía nada.</p></div>}
      <form onSubmit={submit}><fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-50">
        <label className="block text-sm">Nuevo destino<select aria-label="Nuevo destino" required value={draft.destinationId} onChange={(event) => edit({ destinationId: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-ink px-3"><option value="">Selecciona otro destino</option>{destinations.filter((item) => item.id !== emergency.destination_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Motivo del cambio de destino<textarea required minLength={3} maxLength={2000} value={draft.reason} onChange={(event) => edit({ reason: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-white/15 bg-ink px-3 py-2" /></label>
        <button disabled={!draft.destinationId || draft.reason.trim().length < 3} className="rounded-lg border border-signal/40 px-3 py-2 text-sm text-signal-soft disabled:opacity-50">Confirmar cambio de destino</button>
      </fieldset></form>
    </div>}
  </section>;
}
