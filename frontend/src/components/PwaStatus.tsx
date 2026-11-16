import { useEffect, useState } from "react";
import { installPwa, registerPwa, type PwaState } from "@/lib/pwa";

export function PwaStatus() {
  const [state, setState] = useState<PwaState>({ supported: false, installAvailable: false, updateAvailable: false, registrationFailed: false });
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => registerPwa(setState), []);
  useEffect(() => {
    const change = () => setOffline(!navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); };
  }, []);
  return (
    <aside aria-label="Aplicación y conexión" className="border-b border-white/15 bg-ink px-4 py-2 text-sm text-slate-100">
      <div className="mx-auto max-w-7xl space-y-2">
        {offline && <p role="status">Sin conexión detectada. Los envíos pueden quedar sin confirmar; comprueba su resultado antes de reintentar. No cierres esta ventana si tienes trabajo pendiente.</p>}
        {state.updateAvailable && <div role="status">
          <p className="font-semibold">Nueva versión disponible</p>
          <p>Resuelve los envíos sin confirmar y guarda los borradores. Después, cierra todas las ventanas y pestañas de AmbuSync y vuelve a abrir la aplicación. No se recargará automáticamente; el trabajo en memoria se pierde al cerrar.</p>
        </div>}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-medium underline decoration-white/40 underline-offset-4">Instalar AmbuSync</summary>
          <div className="max-w-prose space-y-2 pb-3 leading-relaxed">
            <p>La aplicación instalada requiere conexión. No guarda información clínica para trabajar sin red y no mantiene el GPS con la pantalla bloqueada.</p>
            {state.registrationFailed ? <p>No se pudo preparar la instalación. Puedes seguir usando la web; vuelve a abrirla con conexión para intentarlo de nuevo.</p>
              : !state.supported ? <p>Este navegador no permite preparar la instalación en este contexto. Usa un navegador compatible y HTTPS; puedes continuar en la web.</p>
              : <p>En Android o Chrome, busca «Instalar aplicación» en el menú del navegador. En iPhone o iPad, abre Safari y usa Compartir → Añadir a pantalla de inicio, si está disponible.</p>}
            {state.installAvailable && <button type="button" onClick={() => { void installPwa(); }} className="min-h-11 rounded-md border border-white/40 px-4 py-2 font-semibold hover:bg-white/10 focus-visible:outline-signal">Instalar aplicación</button>}
            <p>Para actualizar, resuelve los envíos sin confirmar y guarda los borradores antes de cerrar todas las ventanas de AmbuSync. Al volver a abrir, se usará la versión disponible.</p>
          </div>
        </details>
      </div>
    </aside>
  );
}
