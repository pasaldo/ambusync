import { useEffect, useRef, useState } from "react";
import { BackendApiError, getPositions, sendPosition } from "@/lib/backend";
import { createGpsCapture, haversineKm, positionAge, type PositionBody, type PositionSnapshot } from "@/lib/gps";
import { usePortalMemory } from "./portalMemory";

export function LocationPanel({ id, status, canWrite = false, expireSession }: { id: string; status: string; canWrite?: boolean; expireSession?: () => void }) {
  const memory = usePortalMemory();
  const [snapshot, setSnapshot] = useState<PositionSnapshot | null>(null);
  const [notice, setNotice] = useState("GPS detenido. Actívalo solo para este episodio.");
  const [running, setRunning] = useState(false), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(() => memory.gpsAttempts.has(id));
  const [now, setNow] = useState(performance.now());
  const serverClock = useRef<{ server: number; monotonic: number } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const active = useRef(false), inFlight = useRef(false), lastSent = useRef(0);
  const capture = useRef<ReturnType<typeof createGpsCapture> | null>(null);
  const generation = useRef(0), memoryToken = memory.token;
  const readSequence = useRef(0), acceptedRead = useRef(0);
  const allowed = canWrite && (status === "notificada" || status === "en_traslado") && (!snapshot || ["notificada", "en_traslado"].includes(snapshot.status));
  const allowedRef = useRef(allowed); allowedRef.current = allowed;
  const expireRef = useRef(expireSession); expireRef.current = expireSession;

  function stop(text = "GPS pausado. Pulsa Compartir ubicación para reanudar.") {
    generation.current++; capture.current?.stop(); capture.current = null;
    if (active.current) { setRunning(false); setNotice(text); }
  }
  async function refresh() {
    const sequence = ++readSequence.current;
    const started = performance.now();
    try {
      const result = await getPositions(id);
      if (active.current && memory.isCurrent(memoryToken) && sequence >= acceptedRead.current) {
        const received = performance.now();
        serverClock.current = { server: Date.parse(result.server_time) + Math.max(0, received-started), monotonic: received };
        acceptedRead.current = sequence; setSnapshot(result); setUnavailable(false); setNow(received);
      }
    } catch (error) {
      if (!active.current || !memory.isCurrent(memoryToken)) return;
      setUnavailable(true);
      if (error instanceof BackendApiError && error.status === 401) {
        stop();
        if (expireRef.current) expireRef.current();
        else window.dispatchEvent(new Event("ambusync:session-expired"));
      }
    }
  }
  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = window.setInterval(() => { setNow(performance.now()); if (document.visibilityState === "visible") void refresh(); }, 5000);
    const hidden = () => { if (document.visibilityState !== "visible") stop("GPS pausado al ocultar la aplicación. Reanuda explícitamente al volver."); };
    document.addEventListener("visibilitychange", hidden);
    const changed = (event: Event) => { if ((event as CustomEvent).detail === id && document.visibilityState === "visible") void refresh(); };
    window.addEventListener("ambusync:position", changed);
    return () => { active.current = false; stop(); window.clearInterval(interval); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("ambusync:position", changed); };
  }, [id, memoryToken]);
  useEffect(() => { if (!allowed) stop("Seguimiento detenido por estado del episodio."); }, [allowed]);

  async function transmit(body: PositionBody, captureToken?: number) {
    if (inFlight.current || !memory.isCurrent(memoryToken) || (!allowedRef.current && !memory.gpsAttempts.has(id))) return;
    inFlight.current = true; setBusy(true); memory.gpsAttempts.set(id, body); setPending(true);
    try {
      await sendPosition(id, body, () => active.current && memory.isCurrent(memoryToken) && document.visibilityState === "visible" && (captureToken === undefined || captureToken === generation.current));
      if (!active.current || !memory.isCurrent(memoryToken)) return;
      memory.gpsAttempts.delete(id); setPending(false);
      await refresh();
      if (status !== "en_traslado") stop("Primera posición enviada. Inicia el traslado y activa GPS para continuar.");
    } catch (error) {
      if (!active.current || !memory.isCurrent(memoryToken)) return;
      stop("Posición sin confirmar. El seguimiento está pausado; revisa y reintenta el mismo envío explícitamente.");
      if (error instanceof BackendApiError && [400, 403, 404, 409, 429].includes(error.status)) {
        memory.gpsAttempts.delete(id); setPending(false);
        setNotice(`${error.message} GPS detenido; revisa el episodio antes de reanudar.`);
      }
      if (error instanceof BackendApiError && error.status === 401) expireRef.current?.();
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  function start() {
    if (!allowedRef.current || memory.gpsAttempts.has(id) || !memory.isCurrent(memoryToken)) return;
    if (!window.isSecureContext || !navigator.geolocation) { setNotice("Ubicación no disponible: el dispositivo requiere HTTPS y GPS compatible. Puedes continuar sin ubicación."); return; }
    stop();
    const token = generation.current;
    lastSent.current = -Infinity;
    capture.current = createGpsCapture(navigator.geolocation, (sample) => {
      if (!active.current || !allowedRef.current || document.visibilityState !== "visible" || !memory.isCurrent(memoryToken) || generation.current !== token || inFlight.current || memory.gpsAttempts.has(id)) return;
      const monotonicNow = performance.now();
      if (monotonicNow-lastSent.current < 10000) return;
      lastSent.current = monotonicNow;
      void transmit({ ...sample, operation_id: crypto.randomUUID() }, token);
    }, (text) => stop(text), { periodic: status === "en_traslado" });
    setRunning(true); setNotice("GPS activo en primer plano: solicita una muestra nueva cada 15 s, incluso sin movimiento. Sin señal o con pantalla bloqueada no se garantiza actualización.");
    capture.current.start();
  }
  const latest = snapshot?.latest ?? null;
  const ageNow = serverClock.current ? serverClock.current.server + Math.max(0, now-serverClock.current.monotonic) : Date.now();
  const age = latest ? positionAge(latest, ageNow) : null;
  const distance = haversineKm(latest, snapshot?.target ?? null);
  return <section aria-label="Ubicación del episodio" className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
    <h3 className="font-semibold">Ubicación y distancia</h3>
    <p>{distance === null ? "Distancia no disponible" : `${distance.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km · Distancia aproximada en línea recta`}</p>
    <p className="text-xs text-muted-dark">No es ruta vial ni tiempo de llegada. {unavailable ? "No se pudo actualizar; los datos visibles podrían estar desactualizados." : ""}</p>
    {latest ? <div className="space-y-1 text-xs text-muted-dark">
      <p>Última posición: {latest.latitude}, {latest.longitude} · Precisión {latest.accuracy_m === null ? "no informada" : `±${latest.accuracy_m} m`}</p>
      <p>Captura: {new Date(latest.captured_at).toLocaleString("es-CL")} · Recepción: {new Date(latest.received_at).toLocaleString("es-CL")}</p>
      <p className={age?.stale ? "text-amber-100" : ""}>{age?.inconsistent ? "Reloj inconsistente: frescura desconocida" : `Antigüedad: ${age?.seconds} s${age?.stale ? " · Ubicación desactualizada (más de30segundos)" : ""}`}</p>
    </div> : <p className="text-muted-dark">Ubicación no disponible.</p>}
    {snapshot?.last_received && !snapshot.last_received.clock_consistent && <p className="text-amber-100">La última captura recibida tiene un reloj inconsistente y no reemplaza la posición válida.</p>}
    {!canWrite && <p className="text-xs text-muted-dark">{["notificada", "en_traslado"].includes(status) ? "Última muestra recibida; no garantiza seguimiento activo." : "Seguimiento detenido. Posición conservada como histórica."}</p>}
    {canWrite && <>
      <p role="status">{notice}</p>
      <p className="text-xs text-muted-dark">Al activar, compartes el GPS de este dispositivo con el destino autorizado. No se envía a Geoapify. Ocultar la aplicación pausa el seguimiento.</p>
      <div className="flex flex-wrap gap-2">
        {running ? <button type="button" onClick={() => stop()} className="min-h-11 rounded-lg border border-white/15 px-3">Pausar GPS</button> : <button type="button" disabled={!allowed || pending || busy} onClick={start} className="min-h-11 rounded-lg border border-signal/30 px-3 text-signal-soft disabled:opacity-50">Compartir ubicación</button>}
        {pending && <button type="button" disabled={busy} onClick={() => { const body = memory.gpsAttempts.get(id); if (body) void transmit(body); }} className="min-h-11 rounded-lg border border-amber-300/30 px-3 text-amber-100 disabled:opacity-50">Reintentar posición</button>}
      </div>
    </>}
    {snapshot?.target && <p className="text-xs text-muted-dark">Destino: Powered by <a className="underline" href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>}
  </section>;
}
