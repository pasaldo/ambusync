import type { CaseRecord } from "@/types";

// Sincronización entre pestañas del MISMO navegador.
// BroadcastChannel da el push instantáneo; localStorage persiste el estado y
// sirve a las pestañas que se abren más tarde (y de respaldo si no hay BC).

const STORAGE_KEY = "ambusync:cases:v1";
const CHANNEL_NAME = "ambusync-sync";

export interface SyncPayload {
  cases: CaseRecord[];
  lastTransmittedId: string | null;
}

type Message =
  | { type: "state"; cases: CaseRecord[]; lastTransmittedId: string | null }
  | { type: "request" };

const hasWindow = typeof window !== "undefined";
const channel: BroadcastChannel | null =
  hasWindow && "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

/** Lee el estado persistido (pestaña recién abierta o tras recargar). */
export function loadCases(): CaseRecord[] | null {
  if (!hasWindow) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CaseRecord[]) : null;
  } catch {
    return null;
  }
}

/** Persiste y difunde el estado a las demás pestañas. */
export function publish(payload: SyncPayload) {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.cases));
  } catch {
    /* cuota / modo privado */
  }
  channel?.postMessage({
    type: "state",
    cases: payload.cases,
    lastTransmittedId: payload.lastTransmittedId,
  } satisfies Message);
}

/**
 * Conecta esta pestaña a la red de sincronización.
 * - `apply`: aplica un estado entrante de otra pestaña (sin reenviarlo).
 * - `getState`: provee el estado actual para responder a quien lo pida al abrir.
 */
export function connect(apply: (payload: SyncPayload) => void, getState: () => SyncPayload) {
  if (!hasWindow) return;

  channel?.addEventListener("message", (e: MessageEvent<Message>) => {
    const msg = e.data;
    if (msg?.type === "state") {
      apply({ cases: msg.cases, lastTransmittedId: msg.lastTransmittedId });
    } else if (msg?.type === "request") {
      const s = getState();
      channel?.postMessage({ type: "state", cases: s.cases, lastTransmittedId: s.lastTransmittedId } satisfies Message);
    }
  });

  // Respaldo si no hay BroadcastChannel: evento storage entre pestañas.
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const cases = JSON.parse(e.newValue);
      if (Array.isArray(cases)) apply({ cases, lastTransmittedId: getState().lastTransmittedId });
    } catch {
      /* ignore */
    }
  });

  // Al abrir, pide el estado vigente a las pestañas ya abiertas.
  channel?.postMessage({ type: "request" } satisfies Message);
}
