interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export interface PwaState {
  supported: boolean;
  installAvailable: boolean;
  updateAvailable: boolean;
  registrationFailed: boolean;
}
let installEvent: InstallEvent | null = null;
const installChanged = "ambusync:install-changed";

export async function installPwa(): Promise<void> {
  const event = installEvent;
  if (!event) return;
  installEvent = null;
  window.dispatchEvent(new Event(installChanged));
  try { await event.prompt(); await event.userChoice; } catch { /* Native installation remains optional. */ }
}

export function registerPwa(onChange: (state: PwaState) => void): () => void {
  const supported = window.isSecureContext && "serviceWorker" in navigator;
  let disposed = false;
  let registration: ServiceWorkerRegistration | null = null;
  const state: PwaState = { supported, installAvailable: !!installEvent, updateAvailable: false, registrationFailed: false };
  const removers: (() => void)[] = [];
  const emit = () => { if (!disposed) onChange({ ...state }); };
  const listen = (target: EventTarget, name: string, callback: EventListener) => {
    target.addEventListener(name, callback);
    removers.push(() => target.removeEventListener(name, callback));
  };
  const install = () => { state.installAvailable = !!installEvent; emit(); };
  listen(window, "beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event as InstallEvent;
    install();
  });
  listen(window, installChanged, install);
  listen(window, "appinstalled", () => { installEvent = null; install(); });
  const updateState = () => {
    state.updateAvailable = !!registration?.waiting;
    emit();
  };
  const watchInstalling = () => {
    if (registration?.installing) listen(registration.installing, "statechange", updateState);
    updateState();
  };
  emit();
  if (supported && import.meta.env.PROD) {
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((result) => {
      if (disposed) return;
      registration = result;
      listen(result, "updatefound", watchInstalling);
      watchInstalling();
      // Check on a human return, not on a timer, and never activate or reload.
      listen(window, "focus", () => { void result.update().catch(() => {}); });
    }).catch(() => { state.registrationFailed = true; emit(); });
  }
  return () => { disposed = true; for (const remove of removers) remove(); };
}
