# J — implementación GPS y geocodificación

> Ejecución inline con executing-plans y TDD; revisión independiente única final, dinámica A–I conservada.

**Goal:** ubicación de primer plano por episodio y distancia al destino confirmado desde su dirección.
**Architecture:** Geoapify solo backend con caché/cuota PostgreSQL. Selección de candidato validada contra dirección original. Posiciones/recibos por episodio sin cambiar versión clínica; API autoridad y aviso WS separado. Frontend solo memoria/consentimiento.
**Tech Stack:** Django/DRF/PostgreSQL/Channels y React/TypeScript existentes; sin nuevas dependencias.
**Spec:** `2026-11-14-block-j-design.md`, alcance aprobado expresamente el15/11/2026.

## Global Constraints
- Sintéticos; mocks de Geoapify y GPS, sin clave/chat/captura real ni consumo externo durante tests.
- No migraciones/datos/grants desarrollo, push/merge/despliegue/K–M.
- GPS no renueva sesión, no confirma llegada ni cambia versión clínica. Frescura30s, Haversine no ruta/ETA.
- Clave privada backend, endpoint fijo HTTPS/no redirects,100consultas/día compartidas persistentes, fallos cuentan, cachear resultados, sin retries automáticos.
- No bloquear registro por proveedor/GPSausente. Dirección modificada invalida destino; captura/sesión ocultas se suspenden explícitamente.

## Review Focus
- Respuestas de candidato tardías o dirección editada: nunca destino de otra consulta/institución; servidor confirma contra caché, no coordenadas arbitrarias.
- Cuota/concurrencia/falloHTTPS/redirect/malformado: ninguna clave o URL secreta sale por logs/respuestas ni desborde de consumo.
- Arrival/F racing posición y replay: ninguna captura posterior permitida ni filtración cruzada; recibo exacto conserva namespaceactorUUID.
- GPS futuro/retrasado/múltiples emisores: última muestra no retrocede por red ni se declara fresca por reloj incorrecto.
- Navegación/logout/ocultar en captura o CSRF: liberar watcher y descartar callbacks viejos, no autoenvío al reautenticar/reanudar.

### Task 1: geocodificación institucional
**Files:** institutions/{geocoding,geocoding_views,tests_geocoding}.py, models.py/migrations0006, system_management.py/system_urls.py, config/settings.py; frontend SystemInstitutionsPanel/backend types.
**Interfaces:** POST`/system/geocoding/`{address,retry?}→{lookup_id,candidates,status}; create/update `location_selection:{lookup_id,index}|null` opcional, servidor valida address. Institución`location`confirmed|null, `location_status`.
- [x] REDendpoint404/candidatoausentebrowser→GREEN, cache/cuota/fallo/permissions/GETsinred.
- [x] Adaptador HTTPSstdlib aislado enproceso con deadline5s kill/wait,128KiB/no redirects, salida mínima/atribución/filtroChile, no exceptions raw.
- [x] UI preguardar/confirmar/pendiente, existentes edición yrespuesta tardía no cambiaotroformulario, sin clave.

### Task 2: posiciones independientes
**Files:** emergencies/{position_models,positions,tests_positions}.py, models.py/migrations0011, urls.py, events.py/consumers.py, apply_retention.py.
**Interfaces:** POST`/emergencies/{id}/positions/`{operation_id,latitude,longitude,accuracy_m,captured_at}; GETmismaruta→latest/target/server_time/status; recibo immutableposition y seq. Namespace ProcessedOperation actorUUID/emergency. Primera captura notificada solo una poractor; periódicas en_traslado; timestampsretrasados/futuros conservados peroselecciónlastporcapturaadmisible.
- [x] REDAPI404→GREEN, autorización/idempotencia/rangos/0,0/version/arrival/F/retención.
- [x] CarrerasPostgreSQLduplicado/arrival/F/múltiplesemisores ycuotageocoding, WSsequence/no coords, lecturaámbitoH.

### Task 3: GPS frontend
**Files:** lib/{gps,backend,emergencySocket}.ts, screens/local/{LocationPanel,LocalPortal}.tsx, scripts/{gps.test,gps-test}.mjs.
**Interfaces:** ubicaciónpanel por episodio, consentimientodeenvío primeracaptura/traslado; start/resume explícito, clearWatchhidden/logout/unmount/terminal; HTTP polling existente independiente clínica.
- [x] REDGPSlib/controls/callbackWS→GREEN; Haversine/frescura/callbacksgeneration/noautoresume/uncertain/replay.
- [x] Primera captura opcional, rechazo de permisos, readstardíos/ocultamiento/logouts/401readonly yrelojreceptordesfasado.

### Task 4: cierre
- [x] Backend309/309 sin keepdb/checks/Ruff115/OpenAPI; frontend43unit+11J y regresionesA–I/tipos/build/Mermaid/PSrestore dobles.
- [x] Revisión independiente única, tresimportantesRED→GREEN; GETtardío y401readonlyadditionalautorfindingRED→GREEN. Sin nuevosmenores; Hpreviosdocumentados.
- [x] PRUEBAS_J/progreso/AGENTS/ETAPA docs y entrega commitlocalacotado, sin publicar.
- [ ] Autorizaciónpreparacióndev/migraciones/reinicioDaphne y claveprivada delresponsable, consultasexternascontroladas/aceptaciónmanual.
