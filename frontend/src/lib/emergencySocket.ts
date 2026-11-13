export type EmergencySocketStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface EmergencyEvent {
  event_id: string;
  type:
    | "emergency.created"
    | "emergency.transfer_started"
    | "emergency.arrived"
    | "emergency.cancelled"
    | "emergency.closed"
    | "emergency.updated"
    | "emergency.measurements_added"
    | "emergency.measurement_rectified"
    | "emergency.read_confirmed"
    | "emergency.preparation_recorded"
    | "emergency.destination_changed";
  emergency_id: string;
  version: number;
}

interface TimerScheduler {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

interface EmergencySocketOptions {
  onEvent: (event: EmergencyEvent) => void;
  onStatus: (status: EmergencySocketStatus) => void;
  createSocket?: (url: string) => WebSocket;
  timers?: TimerScheduler;
  random?: () => number;
}

const EVENT_TYPES = new Set<EmergencyEvent["type"]>([
  "emergency.created",
  "emergency.transfer_started",
  "emergency.arrived",
  "emergency.cancelled",
  "emergency.closed",
  "emergency.updated",
  "emergency.measurements_added",
  "emergency.measurement_rectified",
  "emergency.read_confirmed",
  "emergency.preparation_recorded",
  "emergency.destination_changed",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const MAX_SEEN_EVENTS = 256;

function websocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/emergencies/`;
}

function parseEmergencyEvent(data: unknown): EmergencyEvent | null {
  if (typeof data !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.event_id !== "string" ||
    !UUID_PATTERN.test(candidate.event_id) ||
    typeof candidate.emergency_id !== "string" ||
    !UUID_PATTERN.test(candidate.emergency_id) ||
    typeof candidate.type !== "string" ||
    !EVENT_TYPES.has(candidate.type as EmergencyEvent["type"]) ||
    !Number.isSafeInteger(candidate.version) ||
    (candidate.version as number) < 1
  ) {
    return null;
  }

  // Copy only the public envelope; ignore any unexpected server fields.
  return {
    event_id: candidate.event_id,
    type: candidate.type as EmergencyEvent["type"],
    emergency_id: candidate.emergency_id,
    version: candidate.version as number,
  };
}

export function connectEmergencyEvents({
  onEvent,
  onStatus,
  createSocket = (url) => new WebSocket(url),
  timers = { setTimeout, clearTimeout },
  random = Math.random,
}: EmergencySocketOptions): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let stopped = false;
  const seenEventIds = new Set<string>();

  const setStatus = (status: EmergencySocketStatus) => onStatus(status);

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== null) return;
    const exponentialDelay = Math.min(INITIAL_RETRY_MS * 2 ** retryAttempt, MAX_RETRY_MS);
    const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
    const delay = Math.min(MAX_RETRY_MS, Math.round(exponentialDelay * jitter));
    retryAttempt += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      if (stopped) return;
      setStatus("connecting");
      openSocket();
    }, delay);
  };

  const openSocket = () => {
    if (stopped) return;
    try {
      socket = createSocket(websocketUrl());
    } catch {
      setStatus("reconnecting");
      scheduleReconnect();
      return;
    }

    const activeSocket = socket;
    activeSocket.addEventListener("open", () => {
      if (stopped || socket !== activeSocket) return;
      retryAttempt = 0;
      setStatus("connected");
    });
    activeSocket.addEventListener("message", (message) => {
      if (stopped || socket !== activeSocket) return;
      const event = parseEmergencyEvent(message.data);
      if (!event || seenEventIds.has(event.event_id)) return;
      seenEventIds.add(event.event_id);
      if (seenEventIds.size > MAX_SEEN_EVENTS) {
        seenEventIds.delete(seenEventIds.values().next().value as string);
      }
      onEvent(event);
    });
    activeSocket.addEventListener("error", () => {
      if (!stopped && socket === activeSocket) setStatus("reconnecting");
    });
    activeSocket.addEventListener("close", () => {
      if (stopped || socket !== activeSocket) return;
      socket = null;
      setStatus("reconnecting");
      scheduleReconnect();
    });
  };

  setStatus("connecting");
  openSocket();

  return () => {
    if (stopped) return;
    stopped = true;
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
    const activeSocket = socket;
    socket = null;
    activeSocket?.close();
    setStatus("disconnected");
  };
}
