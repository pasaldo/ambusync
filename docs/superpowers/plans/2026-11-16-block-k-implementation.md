# Bloque K — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Ejecución inline conforme al plan maestro, con revisión independiente al cierre. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar una PWA instalable con conexión y comportamiento móvil accesible sin persistencia clínica ni actualización destructiva.

**Architecture:** manifest e iconos públicos locales; service worker sin Cache Storage, sin colas y con red como única fuente de respuestas de aplicación/API. Una versión nueva espera el cierre de todos los clientes de la anterior; nunca se fuerza activación o recarga de una pestaña de trabajo. La UI comunica instalación, desconexión y actualización sin recibir contenido clínico.

**Tech Stack:** React18/TypeScript/Vite7, APIs nativas de manifest/service worker, Node24, Playwright existente. Sin dependencias nuevas.

**Spec:** `docs/superpowers/plans/2026-11-16-block-k-design.md`, confirmado16/11/2026.

## Global Constraints

- Piloto sintético; sin tokens ni datos protegidos en almacenamiento web o caché.
- No caché offline: manifest/iconos son recursos públicos, pero el worker no persiste ni siquiera el shell.
- No replay automático de mutaciones, background sync ni datos clínicos en mensajes entre pestañas.
- No skipWaiting, clients.claim ni reload por controllerchange; activar por ciclo de vida nativo cuando no queden clientes de la versión anterior.
- No botones que cierren pestañas o recarguen formularios: el aviso de actualización pide resolver pendientes y cerrar/reabrir todas las ventanas de AmbuSync manualmente. Una ventana oculta también cuenta.
- HTTPS/dispositivo físico requieren aceptación posterior; localhost no equivale a aceptación móvil.
- Sin desplegar, contratar, modificar secretos/migraciones o publicar nuevos commits sin autorización.
- PostgreSQL sigue como incidencia separada. No declarar suites backend aprobadas sin ejecución completa, ni correr dos suites sobre la misma base.

## Review Focus

- Actualización recibida durante POST incierto: conservar UUID/cuerpo y no recargar.
- Otra pestaña oculta con trabajo: no forzar su controlador ni activación.
- Logout seguido de desconexión: no recuperar respuestas clínicas desde caché.
- Navegador sin instalación programática/SW: conservar acceso web y explicar limitaciones.
- Formulario móvil con zoom/teclado y error: conservar legibilidad, foco y acceso a acciones.

## Mapa de archivos

- `frontend/public/manifest.webmanifest`, `frontend/public/icons/`: identidad pública e iconos PNG192/512 y apple-touch180; derivar del favicon existente, no introducir identidad nueva.
- `frontend/public/sw.js`: worker network-only, sin escritura persistente; fallback de navegación genérico y sin datos cuando no hay red.
- `frontend/src/lib/pwa.ts`: registro solo en build/secure context, suscripciones de instalación/actualización y cleanup.
- `frontend/src/components/PwaStatus.tsx`: avisos accesibles e instrucciones, sin contenido protegido.
- `frontend/src/App.tsx`: incorporar avisos fuera del contenido de cada ruta, dentro del proveedor existente.
- `frontend/index.html`: manifest/iconos y viewport sin prohibición de zoom.
- `frontend/scripts/pwa.test.mjs`, `frontend/scripts/pwa-test.mjs`: contrato y pruebas reales del worker sobre build.
- `frontend/package.json`, `.github/workflows/frontend-ci.yml`: comandos y verificación aislada.
- `docs/PRUEBAS_K.md`, ETAPA_0/ETAPA_1/AGENTS: evidencia, límites e instrucciones.

### Task 1: Manifest, worker e instalación

**Interfaces:** `registerPwa(onChange: (state: PwaState) => void): () => void`; `PwaState` expone únicamente disponibilidad de instalación/actualización y estado de soporte, nunca cuenta, URL con secretos ni datos de episodio. El registro usa `/sw.js`, scope `/`, exclusivamente `import.meta.env.PROD` y contexto seguro.

- [ ] Escribir tests de contrato: manifest `name=AmbuSync`, `start_url=/`, `scope=/`, `display=standalone`, iconos PNG192/512 válidos; worker no usa caches/IndexedDB/sync ni activación forzada.
- [ ] Ejecutar `node --test scripts/pwa.test.mjs` desde frontend y registrar RED por recursos ausentes.
- [ ] Crear recursos y controlador nativo. Worker deja API/escrituras en red sin interceptarlas; solo navegación GET puede devolver un HTML genérico sin red, con HTTP503 y `Cache-Control: no-store`, sin shell clínico ni scripts de aplicación.
- [ ] Añadir registro idempotente y cleanup compatible con StrictMode; manejar error de registro sin bloquear login. No instalar worker en Vite dev.
- [ ] Ejecutar contrato, tipos y build; registrar GREEN y commit acotado.

### Task 2: Avisos seguros, varias pestañas y móvil

**Interfaces:** `PwaStatus` consume `PwaState`; la instalación solo llama al prompt diferido en respuesta al clic. Actualizar no envía mensajes de activación ni recarga; ofrece instrucciones de resolución de pendientes/cierre de todas las ventanas. No necesita leer `PortalMemory` ni copiar borradores.

- [ ] Escribir prueba Playwright sobre dos versiones del build servido en loopback con origen/puerto propios: versión2 queda waiting mientras cualquier cliente de versión1 siga abierto.
- [ ] Registrar RED antes de integración; cubrir POST retenido/incierto con cuerpo/UUID intactos, borrador sin recarga, pestaña oculta, cierre de una sola pestaña y activación al cerrar todos los clientes.
- [ ] Implementar avisos con `role=status`, instalación cancelada/no soportada y conectividad como señal orientativa, no confirmación del servidor. No deducir éxito de `navigator.onLine`.
- [ ] Retirar `maximum-scale=1.0,user-scalable=no`; revisar /local y /sistema en390px/tablet con teclado/foco/errores. Corregir únicamente desbordes o controles inaccesibles observados.
- [ ] Probar desconexión/reconexión y logout: cero reenvíos de POST, Cache Storage vacío e IndexedDB sin datos backend. Probar navegación offline como respuesta503 genérica y recuperación explícita.
- [ ] Ejecutar `npm run test:pwa`, tipos/build y regresiones de integridad/cuentas/system-admin/GPS; registrar GREEN y commit acotado.

### Task 3: Regresión, revisión y entrega

- [ ] Añadir `test:pwa` al workflow existente con servidor build dedicado; limpiar solo procesos propios. No reutilizar el Vite del responsable para pruebas de reemplazo de versiones.
- [ ] Ejecutar frontend unitarias, todas las suites A–J, tipos/build/Mermaid y diff--check. Ejecutar suite backend solo tras disponibilidad comprobada dePG/Valkey y sin otro runner sobre la misma base; registrar cualquier bloqueo sin ocultarlo.
- [ ] Revisar independientemente diff K completo: aislamiento de datos, actualizaciones con múltiples clientes/pendientes, lifecycle, instalación y accesibilidad móvil. Corregir importantes con RED→GREEN.
- [ ] Escribir PRUEBAS_K con instalación Android/Chrome e iOS/Safari según capacidades reales, HTTPS pendiente, cierre/reapertura de ventanas para actualizar y pérdida de borradores al cierre.
- [ ] Actualizar estado sin confundir pruebas sintéticas con instalación real ni incidentes previos con pruebas verdes. Commit local y entrega para aceptación manual; sin push/despliegue/L–M.

## Autorrevisión del plan

Instalación y privacidad: Task1; conexión/actualización/múltiples ventanas/GPS sin ampliación: Task2; móvil: Task2; build real, regresión, revisión y aceptación HTTPS: Task3. La estrategia sin caché evita ampliar el almacenamiento del piloto y el lifecycle nativo evita invalidar trabajo de otras pestañas.
