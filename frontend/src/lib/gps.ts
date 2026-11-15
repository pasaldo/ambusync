export interface Coordinates { latitude: number; longitude: number }
export interface PositionBody extends Coordinates { operation_id: string; accuracy_m: number | null; captured_at: string }
export interface GpsPosition extends Coordinates { id: string; sequence: number; accuracy_m: number | null; captured_at: string; received_at: string; clock_consistent: boolean }
export interface PositionSnapshot { latest: GpsPosition | null; last_received: GpsPosition | null; target: Coordinates | null; server_time: string; status: string }

function valid(value: Coordinates | null): value is Coordinates {
  return !!value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function haversineKm(a: Coordinates | null, b: Coordinates | null): number | null {
  if (!valid(a) || !valid(b)) return null;
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude-a.latitude)*rad/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function positionAge(position: Pick<GpsPosition, "captured_at" | "clock_consistent">, now: number) {
  const seconds = Math.floor((now-Date.parse(position.captured_at))/1000);
  const inconsistent = !position.clock_consistent || !Number.isFinite(seconds) || seconds < -5;
  return { seconds: Math.max(0, seconds), stale: inconsistent || seconds > 30, inconsistent };
}
interface CaptureTimers {
  setInterval: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
}
export function createGpsCapture(
  geo: Pick<Geolocation, "watchPosition" | "clearWatch" | "getCurrentPosition">,
  onSample: (sample: Omit<PositionBody, "operation_id">) => void,
  onError: (message: string) => void,
  configuration: { periodic?: boolean; timers?: CaptureTimers } = {},
) {
  const timers = configuration.timers ?? {
    setInterval: (callback: () => void, delay: number) => globalThis.setInterval(callback, delay),
    clearInterval: (timer: ReturnType<typeof setInterval>) => globalThis.clearInterval(timer),
  };
  let watch: number | null = null, generation = 0;
  let renewal: ReturnType<typeof setInterval> | null = null;
  function stop() {
    generation++;
    if (watch !== null) geo.clearWatch(watch);
    if (renewal !== null) timers.clearInterval(renewal);
    watch = null; renewal = null;
  }
  return {
    stop,
    start() {
      stop();
      const token = generation;
      let pending = false, lastTimestamp: number | null = null;
      const fail = (error: Pick<GeolocationPositionError, "code">) => {
        if (generation !== token) return;
        stop();
        onError(error.code === 1 ? "Permiso de ubicación denegado. Puedes continuar sin GPS." : "Ubicación no disponible. Reintenta cuando tengas señal.");
      };
      const deliver = (position: GeolocationPosition) => {
        if (generation !== token) return;
        const { latitude, longitude, accuracy } = position.coords;
        const captured = new Date(position.timestamp);
        if (!valid({ latitude, longitude }) || !Number.isFinite(position.timestamp) || !Number.isFinite(captured.getTime())) { stop(); onError("La posición recibida no es válida."); return; }
        // A repeated cached fix is not a new capture. Never replace its time with Date.now().
        if (position.timestamp === lastTimestamp) return;
        lastTimestamp = position.timestamp;
        onSample({ latitude, longitude, accuracy_m: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, captured_at: captured.toISOString() });
      };
      const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
      try {
        const id = geo.watchPosition(deliver, fail, options);
        if (generation !== token) { geo.clearWatch(id); return; }
        watch = id;
        if (!configuration.periodic) return;
        renewal = timers.setInterval(() => {
          if (generation !== token || pending) return;
          pending = true;
          try {
            geo.getCurrentPosition((position) => {
              if (generation !== token) return;
              pending = false; deliver(position);
            }, (error) => {
              if (generation !== token) return;
              pending = false; fail(error);
            }, options);
          } catch { fail({ code: 2 }); }
        }, 15000);
      } catch { fail({ code: 2 }); }
    },
  };
}
