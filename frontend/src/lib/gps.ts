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
export function createGpsCapture(geo: Pick<Geolocation, "watchPosition" | "clearWatch">, onSample: (sample: Omit<PositionBody, "operation_id">) => void, onError: (message: string) => void) {
  let watch: number | null = null, generation = 0;
  function stop() { generation++; if (watch !== null) geo.clearWatch(watch); watch = null; }
  return {
    stop,
    start() {
      stop();
      const token = generation;
      watch = geo.watchPosition((position) => {
        if (generation !== token) return;
        const { latitude, longitude, accuracy } = position.coords;
        if (!valid({ latitude, longitude }) || !Number.isFinite(position.timestamp)) { onError("La posición recibida no es válida."); return; }
        onSample({ latitude, longitude, accuracy_m: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, captured_at: new Date(position.timestamp).toISOString() });
      }, (error) => {
        if (generation !== token) return;
        stop();
        onError(error.code === 1 ? "Permiso de ubicación denegado. Puedes continuar sin GPS." : "Ubicación no disponible. Reintenta cuando tengas señal.");
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    },
  };
}
