import { useEffect, useRef, useState } from "react";
import { BackendApiError } from "@/lib/backend";
import { usePortalMemory } from "./portalMemory";

/** Volatile read results, bound to the exact query and authenticated scope. */
export function useScopedRead<T>(path: string, reader: (path: string) => Promise<T>, expire: () => void) {
  const memory = usePortalMemory();
  const token = memory.token;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; token: number; attempt: number; data: T | null; error: string; loading: boolean }>({ path: "", token: -1, attempt: -1, data: null, error: "", loading: false });
  const expireRef = useRef(expire); expireRef.current = expire;
  useEffect(() => {
    if (!path || !memory.isCurrent(token)) return;
    let active = true;
    setState({ path, token, attempt, data: null, error: "", loading: true });
    void reader(path).then((data) => {
      if (active && memory.isCurrent(token)) setState({ path, token, attempt, data, error: "", loading: false });
    }).catch((error: unknown) => {
      if (!active || !memory.isCurrent(token)) return;
      setState({ path, token, attempt, data: null, error: error instanceof Error ? error.message : "No se pudo consultar. Reintenta manualmente.", loading: false });
      if (error instanceof BackendApiError && error.status === 401) expireRef.current();
    });
    return () => { active = false; };
  }, [path, token, attempt, memory, reader]);
  const current = state.path === path && state.token === token && state.attempt === attempt && memory.isCurrent(token);
  return { data: current ? state.data : null, error: current ? state.error : "", loading: Boolean(path) && (!current || state.loading), retry: () => setAttempt((n) => n + 1) };
}
