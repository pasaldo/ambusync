# Buzón de pruebas privado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Modalidad inlineTDD y una revisión independiente final aprobada por el responsable. No delegar tareas de implementación.

**Goal:** Capturar activaciones/recuperaciones con Mailpit real, privado y efímero en el WebServiceFree existente, sin envíos reales.

**Architecture:** Caddy es el único ingreso público y separa Django de laUI/API/WS de Mailpit protegida porBasicAuth independiente. Mailpit yDaphne son hijosloopback de un supervisor no-root que conserva las guardias de destino/SHA/migraciones. SMTPcaptura es un modo explícito, sin fallback externo.

**Tech Stack:** Python3.14/Django5.2/Channels/Daphne, React18/TypeScript/Vite/Playwright, PostgreSQL17 de prueba, DockerLinux, Mailpit/Caddy oficiales fijados por digest.

**Spec:** [Diseño](2026-11-17-test-mailbox-design.md).

**Estado de ejecución17/11:** tareas1–5 completas localmente. Tarea6:
documentación/revisiónindependiente/correccionesTDD verificadas; publicación,
credencialreal,configuraciónRender/deploy yaceptaciónmanual siguen bloqueadas
por sus puertas explícitas, no son autorizadas por completar el plan local.
Evidencia: [pruebas](../../PRUEBAS_BUZON_PRUEBAS.md) y
[revisión](../../REVISION_BUZON_PRUEBAS.md).

## Global Constraints

- Solo sintéticos; costo$0; sin segundo servicio, dominio, disco ni upgrade.
- Diseño/plan aprobados; implementación local verificada; **publicación/Render pendientes**.
- No arrancar servicioslocales previos. Pruebas con dobles o contenedores
  temporales aislados y puertos libres, autorizados al aprobar ejecución.
- No tocar `.env`, datosdev, cuentas remotas,Geoapify ni secretosBrevo.
- No enviosexternos, fallback, relay, forwarding o logs de enlaces/credenciales.
- Inboxmáximo100mensajes/24h/efímero, credencialoperador independiente≥20caracteres.
- Preservar activación24h/recuperación30min/unuso/sin autologin, revocación yCSRF.
- Mantener Node24.20.0/npm11.19.0 y dependenciasbloqueadas del proyecto.
- No afirmar todas las herramientasMailpit soportadas: funciones delcontrato.

## Review Focus

1. Prefijos/rutas codificadas/API/WS que evitenBasicAuth: pruebaTask2 de401/403/404.
2. MutacionesBasicAuth desde origenajeno ySSRFetch del correo: pruebasTask2 sin tráfico externo.
3. Mensaje perdido trasreinicio con cuenta inicialpendiente: carrera/reenvíoTask4 y reinicioTask5.
4. Proceso muerto, SMTPno disponible o503confields{}: pruebasTasks1/3/4 sin éxito ficticio.
5. ProxyHTTPS/cookies/activaciónfragmento y consumo512MB: smoke completoTask5; no asumir compatibilidad.

## File structure

| Archivo | Responsabilidad |
|---|---|
| `backend/config/test_mailbox.py` (nuevo) | Validar modo y construir settings/env fijados |
| `backend/config/deployment_settings.py` | Selección explícita de backendcorreo |
| `ops/deploy/mailbox/versions.json` (nuevo) | Versiones/digests/fuentes/licencias y rutasAPI verificadas |
| `ops/deploy/mailbox/Caddyfile` (nuevo) | Ingreso único/rutas/auth/origin/cabeceras |
| `backend/config/deployment_processes.py` (nuevo) | Supervisar procesos no-root y señales |
| `backend/config/deployment_start.py`, `backend/config/health.py` | Preservar gate y readinessmodo |
| `Dockerfile` | Binarios fijados/configs no secretas |
| `backend/institutions/system_activation.py` (nuevo) | Capacidad y reenvío primera activación |
| `backend/institutions/system_management.py`, `backend/config/urls.py` | Capacidad/endpoint del sistema |
| `frontend/src/screens/system/SystemInstitutionsPanel.tsx` | Errores visibles/copia/capacidadreenvío |
| `frontend/src/lib/backend.ts` | Contrato deAPI/capacidad/modo y llamada explícita |
| `backend/config/tests_test_mailbox.py` (nuevo) | Contrato settings/procesos |
| `backend/institutions/tests_system_activation.py` (nuevo) | Reenvío/permisos/races/rollback |
| `frontend/scripts/test-mailbox-test.mjs` (nuevo) | UI con transporte sintético |
| `ops/deploy/test-mailbox.ps1` (nuevo) | Smokeimagen/red/reinicio/recursos |
| `docs/PRUEBAS_BUZON_PRUEBAS.md` (nuevo) | Evidencia y manual |

Antes de editar, confirmar rutas reales deURL/tests/API con búsqueda; no crear
estructuras duplicadas si un módulo equivalente ya existe. Sinmigración prevista:
derivar última emisión deAccountActivation.expires_at menos24h para60s, renovar
expires_at al reenviar y conservarcreated_at inmutable.

### Task 1: Modo de captura y guardias fail-closed

**Files:** crear `backend/config/test_mailbox.py`, `backend/config/tests_test_mailbox.py`;
modificar `backend/config/deployment_settings.py`.

**Interfaces:** `validate_mail_mode(environment: Mapping[str,str]) -> str` devuelve
`brevo|mailpit`; `mailpit_settings() -> dict` fija host127.0.0.1/puerto1025/
timeout3/sinTLSenloopback/sincredencialesSMTP. EnBrevo no cambia contrato actual.

- [ ] Escribir tests `test_default_preserves_brevo`,
  `test_mailpit_uses_only_fixed_loopback`, `test_unknown_mode_refused`,
  `test_capture_never_calls_brevo`, `test_missing_mailbox_hash_refused`,
  `test_relay_forward_webhook_overrides_refused`. Afirmar ningún host/MP_*ambiente
  puede introducir destinoexterno y ningún cambio en perfil localSMTP.
- [ ] EjecutarRED: `uv run --directory backend python manage.py test config.tests_test_mailbox --noinput`.
  Usar SimpleTestCase/overrideenv sinDB; si Django descubrepruebasDB, aislarconfig
  enrunnerunittest sin conexión. No usarPGdev.
- [ ] Implementar modo/settings yplantilla remitente de pruebas; modo ydestinocaptura
  explícitos, sin reutilizar autorizaciónBrevo/allowlist para denegar correosficticios.
- [ ] EjecutarGREEN y regresión deperfildeployment/Brevo existente con dobles;
  evidencia debe indicarSMTPno aceptado→excepción, nunca retornoéxito.
- [ ] Commitlocal soloarchivosTask1; no push.

### Task 2: Frontera privada de Mailpit real

**Files:** crear `ops/deploy/mailbox/versions.json`, `ops/deploy/mailbox/Caddyfile`;
modificar `Dockerfile`, `ops/deploy/tests/container-contract-test.mjs`.

**Interfaces:** ingreso`$PORT`→Daphne127.0.0.1:8000;
`/buzon-pruebas/`→Mailpit127.0.0.1:8025 con webroot`buzon-pruebas`.
BasicAuthusuario`operador`/hashvariableprivada; nunca valor enarchivoGit.

- [ ] Consultar releases/imágenes oficialesMailpit/Caddy, fijarLinuxamd64tag+digest
  ylicencias enmanifiesto; inspeccionarOpenAPI/version yregistrar lista exacta de
  rutas/métodosnecesarios antes de escribirproxy. Bloquearcualquier rutaAPI no listada.
- [ ] EscribirRED contractual ysmokeDockeraislado: anónimo401entodo elprefijo,
  credencialesincorrectas401, válidaslistado200, rutasnormalizadas sinbypass,
  mutaciones/WSorigenajeno403, send/release/linkcheck/settings/metrics denegados.
  Credenciales sintéticas generadas enmemoria; no mostrarlas en comandos/salidas.
- [ ] AñadirCOPYdebinariosdesdestagesfijados yconfig no-root; protecciónBasicAuth
  delprefijo antes de upstream,stripcookieDjango/Authorization ySet-Cookie haciaMailpit.
  Forzar no-store/no-referrer/X-Robots-Tag; no accesslogs ni cuerpos enerrores.
  Preservar elrestoHTTP/WSS/Host/esquemaHTTPS deDjango.
- [ ] EjecutarGREEN conMailpitreal: SMTPacepta mensaje sintético,UIlista/abre/
  marcayborra,fragmentodelenlace intacto. Probar que APIsauxiliares no hacen
  requestsDNS/HTTPexternos; no limitarse a comprobar menúoculto.
- [ ] CommitlocalTask2 con fuentes/digests verificados, sin binariosdescargados enGit.

### Task 3: Ciclo de vida supervisado y readiness

**Files:** crear `backend/config/deployment_processes.py`; modificar
`backend/config/deployment_start.py`, `backend/config/health.py`,
`backend/config/tests_test_mailbox.py`.

**Interfaces:** `run_deployment_processes(port: int, mode: str) -> int` espera y
supervisaCaddy/Daphne/Mailpit, devuelvefallo sihijo muere.
ModoBrevo preserva arranqueactual sin procesosMailpit/Caddy innecesarios.

- [ ] REDconprocesosdobles: gateDB/SHA falla→0hijos; startupSMTP/UItimeout→fallo;
  hijomuere→resto termina; SIGTERM→terminación hijos/reap yexitlimpio; entornos
  hijosMailpit/Caddyno contienenPG/Brevo/Geoapify; readiness503sinSMTPenmodocaptura.
- [ ] Ejecutar `uv run --directory backend python manage.py test config.tests_test_mailbox --noinput`
  con mismas guardias sinDBTask1; confirmarRED.
- [ ] ImplementarPopenargumentosfijos sin shell, entornosallowlist,storage temporal
  permisorestrictivo,máximo100/24h/versioncheckOff/quiet/sinrelayforwardwebhook.
  Comprobar todoslistos antes de anunciarready;SIGTERMgracia10s, luego kill/reap.
  No auto-restartindividual ni imprimir stderrraw dehijos.
- [ ] GREENunitario+imagen: readiness200soloSMTP/UI/Daphne operativos; recrearcontenedor
  vacíaMailpit;procesos UID10001,soloCaddy en0.0.0.0.
- [ ] CommitlocalTask3.

### Task 4: Reenvío de primera activación y errores legibles

**Files:** crear `backend/institutions/system_activation.py`,
`backend/institutions/tests_system_activation.py`, `frontend/scripts/test-mailbox-test.mjs`;
modificar system_management/urls/backend.ts/SystemInstitutionsPanel/package.json.

**Interfaces:** `can_resend_first_activation(institution) -> bool`;
POST`/api/v1/system/institutions/{id}/resend-first-activation/` cuerpo{}→204,
503activation_delivery_unavailable con rollback. Payloadinstitución añade
`can_resend_first_activation: bool` y`mail_delivery_mode: "brevo"|"mailpit"`.
Frontend`resendSystemFirstActivation(id, isCurrent)` sigue guardiasCSRFexistentes.

- [ ] REDbackend: anónimo401/rolinstitucional403, habilitación yámbitoexactos,
  soloidentidadauditadafirstadmin conmembershipvigente/no password/inactiva/
  activaciónnoconsumida(inclusocaducada); activada/trasladada/deshabilitada deniega.
  Reenvíobien crea0cuentas, invalidaenlaceanterior, audita sinsecreto;60s limita
  dobles/carrera;fallocaptura mantiene tokenanterior. Sinupdatesgrupos/permisos.
- [ ] Ejecutar conPGTESTaislado encontenedor, nombreexclusivo porPID;usar suite
  TransactionTestCase pararaces. No conectar aPG55432/Render. ConfirmarRED.
- [ ] Implementar resoluciónporAuditEventinitial,locks/revalidación/guardia60s con
  timestamps existentes;reutilizar generacióndetoken/hash/send_activation_email.
  Revisarordenlocks contra creaciónglobal/gestióncuentas ytestear carreras cruzadas.
- [ ] REDfrontend: error503confields{}muestra`message`,lookupunavailable noimpide
  POSTnullselection; altaMailpit etiqueta«capturado en buzón de pruebas», botónreenvío
  solocapacidadtrue/confirmación/unintento;respuesta perdida no se reenvía sola.
- [ ] Corregir `errorText`: usarlistaerrorescampono vacía, de lo contrario
  mensajeBackendApiError, de lo contrariofallback. Integrarcapacidad/modo/reenvío sin
  credencialdelbuzón ni nuevo accesoclínico;anunciar pérdidaefímerayaccesooperador.
- [ ] GREENbackend+`npm run test:mailbox`(nuevo script,Playwrighttransporte sintético)
  yregresiones system-admin/accounts/activation-links/recovery. Requiere servidor
  frontaltemporalaislado enpuertolibre, no5174/4174/8443previos.
- [ ] CommitlocalTask4.

### Task 5: Integración real aislada y regresiones

**Files:** crear `ops/deploy/test-mailbox.ps1`; ampliar contratoDockerexistente.

**Interfaces:** script guarda soloestados/códigossanitizados, no credenciales/
tokens/correos; crea yretira únicamenterecursosdeprueba etiquetados porrunID.

- [ ] REDsmoke añade: captura→lecturaprivada→activación→login, recuperación
  unuso/sinautologin;reinicioMailpit borra mensajes noPG;reenvío inicialtrasrecreación.
- [ ] Ejecutarsmoke conimagenreal yPG/ValkeyTEST,origenHTTPSlocalhostcertconfiable.
  Bloquearegresoexterno del runtime para probar0correoexterno;ningúnkeyreal.
- [ ] Verificarbrevomodocon dobles,health/API/SPA/CSRF/cookies/WSS no degradados,
  accesoinboxindependiente;credenciales falsas/enlaces/Authorization ausentes de logs.
  Medir RAMtotal/CPUenreposo yduranteflujoreal bajo512MB;documentar muestras,
  no garantizar cuotaCPU0.1/Render a partir deDocker.
- [ ] Regresiónbackend completa conDBTESTaislada/Ruff/check/makemigrations--check/
  OpenAPI;frontendunitarias/tipos/build/suitesexistentes/Mermaid/audits ycontratosops.
  Capturas sintéticas320/390/1280sincredsvisibles;revisar visualmente.
- [ ] Parar temporalespropios aunalfallar, comprobarprocesospreviossiguen apagados.
  CommitlocalTask5.

### Task 6: Evidencia, revisión y puertas remotas

**Files:** crear `docs/PRUEBAS_BUZON_PRUEBAS.md`;actualizar
`docs/DESPLIEGUE_L.md`, `ops/deploy/README.md`, `docs/ETAPA_0.md`,
`docs/ETAPA_1.md`, `README.md`, `AGENTS.md` solo con evidencia correspondiente.

- [ ] Registrar excepcióndepiloto a entregaexternaD-008: captura no es entrega,
  expiraciones vigentes,operadorpuedeactivarcualquiersintético;Brevo no probado.
- [ ] Documentar credencialindependiente,cómoabrirbuzón,reinicio/reenvíoinicial,
  límitesyretorno aBrevo sinenvíosautomáticos;modo nunca cambia por fallback.
- [ ] Autorrevisiónspec/test coverage;una revisiónindependiente final si responsable
  autoriza ese método. CorregirhallazgosconRED→GREEN yrevalidar.
- [ ] Presentarevidencia local/SHA/cambios de variables y solicitar autorización
  separada para commit/push si no cubiertos, cargaHashprivada y deploySHAexacto.
- [ ] Solo tras autorizaciónremota:publicaciónenramaautorizada,sinmerge;
  verificarbuildSHA/migrationapproval(no nuevasmigracionesprevistas),variablemailpit/hash,
  desplegar yhealth/securitysmoke. No retirarBrevoGeoapifykey ni cargarcredenciales
  porchat. Pedir prueba manual de captura/activación/inicio sesión.
- [ ] Si512MB/proxy/seguridad falla,detenerpromoción;volveraversiónanterior requiere
  autorización yno restaurardatos/cuentas. No autorizarpagos ni reiniciarlocals.

## Self-review del plan (sin ejecución)

Cobertura: captura/settingsTask1;privacidad/proxyTask2;ephemeral/supervisiónTask3;
reenvíoyUIlegibleTask4;flujoreal/recursosTask5;operación/aceptaciónTask6.
ReviewFocus vinculado a tareas. Las rutas auxiliares/versiones deMailpit se fijan
por manifiesto verificableTask2antesdeproxy; no se adivinan. No se promete entrega,
diagnósticoGeoapify ni validaciónRender desde suiteslocales.

**Handoff:** ejecuciónlocalinlineTDD+unarevisiónfinalautorizada y realizada.
Pendiente decisión del responsable para publicación/configuraciónprivada/deploy;
sin cambiosRender ni conexión/arranque de losservicioslocalesprevios por esta ejecución.
