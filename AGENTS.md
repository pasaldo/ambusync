# AmbuSync — instrucciones para agentes

## Estado y límites

- **Desarrollo local retomado y plan aprobado el 12/11/2026.** Autoridad: decisiones de ETAPA_0 y acuerdos actuales, no el borrador del informe académico. Base `main`: `4091db9`, CI remoto del 11/11 en verde; integración WebSocket `47dfe36`. Trabajo de entrega en `feature/pilot-completion`, empezando por integridad/sesiones (bloque A). Plan: `docs/superpowers/plans/2026-11-12-pilot-completion.md`. No inferir autorización de merge, push, despliegue, contratación ni envío externo. Solo iniciar servicios locales necesarios, sin reiniciar servicios ajenos. Sin uso clínico.
- **Acuerdos del 12/11:** PWA instalable con conexión, sin persistencia clínica en navegador; Render como destino a preparar; D-007 confirmado para ordenar bandeja (su cambio aún pendiente); evaluar correo por API HTTPS, proveedor/remitente aprobados antes de usar; conservar Restic/R2 externo. Entrega 18/11; defensa 14–16/12. Un desarrollador, unas 48 h disponibles; domingo 15 no disponible. No prometer cierre ni métricas no verificadas.
- Consultar `docs/ETAPA_0.md` y `docs/ETAPA_1.md` antes de planificar trabajo. La nueva administración global se valida localmente antes de publicarse; no inferir autorización para producción clínica, servicios externos ni despliegue.
- El inicio de la SPA exige sesión Django y dirige por grupo: ambulancia/urgencias a `/local`, administración global exclusiva a `/sistema`. `system_admin` se aprovisiona solo mediante el comando local `create_system_admin` y no usa `is_staff`, `is_superuser` ni membresía institucional. Solo administra instituciones; no obtiene acceso clínico. La cuenta administrativa de Urgencias puede crear cuentas de Urgencias/ambulancia y gestionar subpaneles de creación, historial y unidades. Puede crear unidades vinculadas a una institución operadora habilitada y asignarlas/reasignarlas a cuentas de ambulancia; las cuentas de administración de ambulancias no pueden crear usuarios. Los permisos y ámbitos se validan también en backend. Las altas usan activación por correo local y no conceden permisos clínicos implícitos. La demo se conserva en `/ambulancia` y `/urgencias` detrás de sesión; sus casos siguen separados del backend. `/local` integra el flujo de emergencias y administración institucional. No persiste datos backend en `localStorage`; usa WebSocket autenticado (`/ws/emergencies/`) solo como aviso para refrescar desde la API, con PostgreSQL/HTTP como autoridad. Valkey (protocolo Redis) queda en loopback y se accede vía Daphne; nunca exponerlo a la red. Recuperación, GPS, cambios de destino y despliegue siguen pendientes. Consulta `docs/ETAPA_1.md` para alcance y estado verificado.
- El piloto usa únicamente datos sintéticos y no está autorizado para atención clínica real. No introduzcas datos personales o clínicos reales ni presentes funciones planificadas como existentes.
- Para decisiones aprobadas y alcance, consulta `docs/ETAPA_0.md` y `docs/ARQUITECTURA_PILOTO.md`. No amplíes el alcance aprobado sin confirmación.
- `CLAUDE.md` aporta contexto adicional, pero menciona un roadmap que no está en este repositorio; no lo trates como fuente vigente frente a los documentos de decisiones.

## Frontend y comandos

- El único manifiesto de paquetes está en `frontend/package.json`; el lockfile correspondiente es `frontend/package-lock.json`. Instala de forma reproducible desde `frontend/` con `npm ci`.
- Usa Node 24.20.0 (`.nvmrc`) y npm 11.19.0 (`packageManager`); `engines.node` restringe el frontend a Node 24.
- El arranque es `frontend/src/main.tsx` → `frontend/src/App.tsx`; las rutas `/ambulancia` y `/urgencias` muestran el flujo de ambulancia y el tablero de urgencias.
- El store Zustand (`frontend/src/store/useCases.ts`) se sincroniza entre pestañas del mismo navegador mediante `frontend/src/store/sync.ts` (BroadcastChannel y respaldo `localStorage`); no es sincronización entre dispositivos ni backend.
- Desde `frontend/`: `npm run dev` inicia Vite en el puerto `5173`; `npm run build` ejecuta `tsc -b` y luego Vite; `npm run lint` ejecuta `tsc --noEmit` (no hay script ESLint configurado).
- La integración de backend vive en `frontend/src/screens/local/LocalPortal.tsx`, ruta `/local`, y usa el proxy Vite de loopback configurado en `frontend/vite.config.ts`. No la conectes al store demo/localStorage.
- `npm run test:unit` ejecuta pruebas del extractor Mermaid y el manejo de errores con el runner integrado de Node.
- `npm run test:sync` requiere el servidor en `http://localhost:5173` (o `BASE_URL`) y Chromium de Playwright; verifica transmisión entre dos pestañas y no deja capturas.
- `npm run test:accounts` prueba localmente cuentas/urgencias con mocks sintéticos; `npm run test:system-admin` cubre alta, edición, baja y reactivación del panel global.
- `npm run test:local-integrity` cubre la SPA con transporte sintético: respuestas perdidas, reintentos, expiración, cambio de ámbito y respuestas tardías. Requiere Vite; configura `BASE_URL` para el servidor de esta rama. No sustituye aceptación real entre dispositivos/backend.
- `npm run shots` requiere el servidor y Playwright, y sobrescribe capturas en `docs/screenshots/`. Captura `/local` y `/sistema` con mock sintético —no las rutas demo `/ambulancia` y `/urgencias`—; revisa README y las salidas nuevas después de regenerarlas.
- `npm run check:diagrams` valida los bloques Mermaid de `README.md` y `docs/` usando el paquete local; falla si no encuentra diagramas o detecta sintaxis inválida. Requiere Chromium de Playwright, no el servidor de desarrollo ni acceso al CDN.
- Para preparar Chromium una vez en un entorno nuevo: `npx playwright install chromium`.
- La guía reproducible de entorno, ramas, releases y checklist está en `docs/GUIA_DESARROLLO.md`; la fuente de verdad del estado de cierre es la sección 11 de `docs/ETAPA_0.md`.

## Cambios en documentación

- `docs/ETAPA_0.md` registra alcance y decisiones; `docs/ARQUITECTURA_PILOTO.md` describe la arquitectura futura. Mantén explícita la diferencia entre acuerdos, propuestas pendientes e implementación verificada.
- `README.md` y `docs/GUIA_DESARROLLO.md` describen las capturas actuales de `/local` y `/sistema`. Si se regeneran, comprueba que no vuelvan a aparecer referencias o archivos de las capturas antiguas del simulador demo.
- No afirmes que una prueba o función funciona sin haberla ejecutado/verificado en esta rama.
