import { useEffect, useState } from "react";

/**
 * Devuelve `Date.now()` y se actualiza cada `intervalMs`.
 * Alimenta los countdown de ETA vivos del tablero de Urgencias.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
