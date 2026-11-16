// Versioned by the build. No precache, runtime cache, forced activation or write queue.
// The browser activates an update only after ALL clients of the old worker close.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>AmbuSync — Sin conexión</title><body><main><h1>Sin conexión</h1><p>AmbuSync necesita conexión para abrir la aplicación. Esta pantalla no contiene información clínica.</p><p>Cuando recuperes la conexión, abre AmbuSync de nuevo. No se han guardado ni reenviado operaciones desde esta pantalla.</p></main></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    )),
  );
});
