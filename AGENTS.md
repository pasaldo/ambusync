# AmbuSync — instrucciones para agentes

## Estado y límites

- **Proyecto en pausa desde el 10/11/2026.** No reiniciar servicios ni hacer cambios/push adicionales hasta una nueva solicitud. Último commit funcional verificado y publicado: `55cac2b` (`feat: configure institution operator visibility`); árbol de trabajo limpio tras registrar la pausa. Estado detallado y condiciones al retomar: `docs/ETAPA_1.md`.
- Consultar `docs/ETAPA_0.md` y `docs/ETAPA_1.md` antes de planificar trabajo. La nueva administración global se valida localmente antes de publicarse; no inferir autorización para producción clínica, servicios externos ni despliegue.
- El inicio de la SPA exige sesión Django y dirige por grupo: ambulancia/urgencias a `/local`, administración global exclusiva a `/sistema`. `system_admin` se aprovisiona solo mediante el comando local `create_system_admin` y no usa `is_staff`, `is_superuser` ni membresía institucional. Solo administra instituciones; no obtiene acceso clínico. La cuenta administrativa de Urgencias puede crear cuentas de Urgencias/ambulancia y gestionar subpaneles de creación, historial y unidades. Puede crear unidades vinculadas a una institución operadora habilitada y asignarlas/reasignarlas a cuentas de ambulancia; las cuentas de administración de ambulancias no pueden crear usuarios. Los permisos y ámbitos se validan también en backend. Las altas usan activación por correo local y no conceden permisos clínicos implícitos. La demo se conserva en `/ambulancia` y `/urgencias` detrás de sesión; sus casos siguen separados del backend. `/local` integra el flujo de emergencias y administración institucional. No persiste datos backend en `localStorage` ni usa WebSocket. Recuperación, Channels/Valkey en runtime, GPS, cambios de destino, sincronización WebSocket y despliegue siguen pendientes. Consulta `docs/ETAPA_1.md` para alcance y estado verificado.
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
- `npm run shots` requiere el servidor y Playwright, y sobrescribe capturas en `docs/screenshots/`. Captura `/local` y `/sistema` con mock sintético —no las rutas demo `/ambulancia` y `/urgencias`—; revisa README y las salidas nuevas después de regenerarlas.
- `npm run check:diagrams` valida los bloques Mermaid de `README.md` y `docs/` usando el paquete local; falla si no encuentra diagramas o detecta sintaxis inválida. Requiere Chromium de Playwright, no el servidor de desarrollo ni acceso al CDN.
- Para preparar Chromium una vez en un entorno nuevo: `npx playwright install chromium`.
- La guía reproducible de entorno, ramas, releases y checklist está en `docs/GUIA_DESARROLLO.md`; la fuente de verdad del estado de cierre es la sección 11 de `docs/ETAPA_0.md`.

## Cambios en documentación

- `docs/ETAPA_0.md` registra alcance y decisiones; `docs/ARQUITECTURA_PILOTO.md` describe la arquitectura futura. Mantén explícita la diferencia entre acuerdos, propuestas pendientes e implementación verificada.
- `README.md` y `docs/GUIA_DESARROLLO.md` describen las capturas actuales de `/local` y `/sistema`. Si se regeneran, comprueba que no vuelvan a aparecer referencias o archivos de las capturas antiguas del simulador demo.
- No afirmes que una prueba o función funciona sin haberla ejecutado/verificado en esta rama.
