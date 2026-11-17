# Block L Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar y verificar localmente el despliegue sintético Render de costo$0,
sin dominio propio, sin crear servicios ni ejecutar operaciones remotas.

**Architecture:** Un servicio ASGI sirve React compilado, API yWS bajo un mismo
origen. PostgreSQL conserva autoridad/sesiones/cuotas; KeyValue lleva avisos.
Brevo usa HTTPS desde backend; respaldo adicionalRestic local cifrado yR2 condicionado.

**Tech Stack:** Node24.20.0/npm11.19.0, Python3.14.10, Django/DRF/Channels/Daphne,
PostgreSQL, Redis-compatible/Valkey, Docker yPowerShell/Restic.

**Spec:** `docs/superpowers/plans/2026-11-16-block-l-design.md`, aprobado17/11/2026.

**Estado:** plan para revisión; sin implementación. Cada tarea exige RED→GREEN.
Los valores técnicos de este plan, incluidos los márgenes locales de correo,
se someten a aprobación con el plan; no son condiciones contractuales del proveedor.

## Global Constraints

- Costo estrictamente$0, sin dominio propio, tarjetas, planes/addons pagados.
- Solo datos sintéticos; ninguna conexión de pruebas a proveedores, cuentas oDB remotos.
- No modificar `.env`, datos, asignaciones, permisos, CA/firewall ni servicios locales existentes.
- Migraciones nuevas solo enTESTbase exclusiva por ejecución; no migrar desarrollo.
- No cambiar contratosA–K de sesión, permisos, escrituras inciertas, GPS, caché ni actualizaciónPWA.
- Sin alta de servicios, secretos reales, correo real, backups/restores reales, push/merge/despliegue/M.
- Los envíos aceptados porAPI no prueban entrega; cuota local no representa saldo globalBrevo.
- R2 no se automatiza sin control verificable de cargos; pendiente no equivale aL aprobado.
- Mantener lockfiles y runtimes fijados. Dependencias nuevas solo si son necesarias,
  con bloqueo/auditoría explícitos; preferir librería estándar paraHTTPS/estáticos.

## Review Focus

- Ruta codificada/traversal/symlink o fallbackSPA puede exponer archivos o convertir401/404 en200.
- Token de activación, consultaURL o excepción externa puede filtrarse en accesslogs/referer.
- Alta transaccional rechazada/rollback tras intento externo puede devolver indebidamente cuota o duplicar correo.
- Base equivocada, migración pendiente oSHA distinto puede arrancar o alterar un destino no aprobado.
- Respaldo conURL en argv, falloRestic o repositorioR2 puede filtrar secretos, borrar archivos ajenos o generar cargos.

## Mapa y dependencias

Task1: perfil seguro, HTTP/SPA/estáticos/salud. Task2: correo/cuota.
Task3: integración de activación/recuperación sobreTask2.
Task4: imagen/arranque sobreTasks1–3. Task5: respaldos locales con guardias.
Task6: regresión, CI opt-in y documentación sobreTasks1–5.
Las altas/pruebas remotas son una fase posterior con puertas separadas al final.

## Runner de pruebas

Crear `backend/scripts/test_isolated.py`: asignar `DATABASES.default.TEST.NAME`
como `test_ambusync_l_<PID>` antes de iniciar el runnerDjango y aceptar etiquetas
de tests como argumentos. Sin editarsettings/env ni imprimirURL/secretos.
El runner sin etiquetas ejecuta toda la suite. Cualquier hijo que acceda aDB
debe recibir la conexión **efectiva** del padre, incluida laTESTbase, no heredar
por error `DATABASE_URL` de desarrollo. Añadir prueba de aislamiento del runner.
Comando desde `backend/`: `uv run python scripts/test_isolated.py <labels>`.

### Task 1: Perfil remoto, HTTP público seguro y sondas

**Files:**
- Create: `backend/config/deployment_settings.py`, `backend/config/frontend.py`,
  `backend/config/health.py`, `backend/config/tests_deployment_http.py`,
  `backend/scripts/test_isolated.py`.
- Modify: `backend/config/settings.py`, `backend/config/urls.py`.

**Interfaces:**
- Perfil explícito `DJANGO_SETTINGS_MODULE=config.deployment_settings`; desarrollo
  conserva su configuración. `AMBUSYNC_FRONTEND_ROOT` apunta solo aldist inmutable.
- `frontend_entry(request)` y `frontend_asset(request, asset_path)` sirven únicamente
  archivos de un mapa seguro de artefactos; rutasSPA exactas `/`, `/local`,
  `/sistema`, `/ambulancia`, `/urgencias`, `/activar-cuenta`, `/recuperar-cuenta`,
  `/restablecer-cuenta`, con barra final opcional. No catch-all global.
- `live(request)` en `/health/live/`:200 JSON `{"status":"ok"}` sinSQL.
- `ready(request)` en `/health/ready/`:SELECT1 con statementtimeout1s;200 igual o
  503 JSON `{"status":"unavailable"}`. Sin detallesDB ni modificación del timeout de conexiones ajenas.
- `HealthProbeMiddleware`, después deSecurityMiddleware yantes deSessionMiddleware,
  atiende solo esasdos rutas conGET/HEAD, sin resolverrequest.user/sesión.
  Eximir únicamente esasrutas deSECURE_SSL_REDIRECT para elprobe internoRender;
  restoHTTP conserva redirecciónHTTPS. Respuestasno-store sin Set-Cookie.
- KeyValue no condiciona readinessHTTP; su fallo se prueba como degradación
  de avisos, no como pérdida de datos. Sondas no renuevan sesión.

- [ ] Escribir tests de respuestas reales:SPA200 sin datos protegidos;API401
  yAPIinexistente404 no se vuelvenHTML; POSTaSPA405; GET/HEADestáticos MIME correcto.
- [ ] Probar `..`, separadores codificados, doblescodificaciones y symlink fuera
  dedist →404, sin devolver `.env`/código. `index.html`/`sw.js`/manifest no-store;
  únicamente assets hashados cacheablesimmutable; no cachear respuestas privadas.
- [ ] Probar perfil en subproceso con variables sintéticas: DEBUGfalse, host y
  origenHTTPS exactos, sinwildcards/CORS, cookiesSecure, Referrer-Policyno-referrer,
  nosniff, sin iframe; falta secreto/DB/Valkey/origen/dist → fallo cerrado.
  DB externa:sslmode=verify-full/hostname/cadena validada; internaRender: URLprivada
  exacta ysslmode=require (TLSautofirmado documentado porRender, no afirmar
  autenticación delcertificado). No degradar automáticamente entre modos ni
  usar require para conexiones públicas. `AMBUSYNC_DATABASE_NETWORK=internal`
  oexternal explícito, validado contra elhost esperado; connect_timeout3s.
  Smoke solo con `AMBUSYNC_LOCAL_SMOKE=1` ydestinosloopback o los aliases
  `ambusync-l-pg`/`ambusync-l-kv` de laredDocker propia verificada por elrunner;
  nunca unaURLpública conesa excepción.
  No cargar `.env` local en perfilremoto: fijar `AMBUSYNC_LOAD_DOTENV=false`
  antes delimportdeconfig.settings; settingsbase respeta esa bandera y conserva
  true por defecto para desarrollo. Probar que una `.env` señuelo no se consume.
- [ ] Ejecutar runner con `config.tests_deployment_http`; confirmarRED por rutas/perfil ausentes.
- [ ] Implementar interfaces y pruebas de sondas:DBcaída →503 acotado, live200
  sinSQL incluso si llega una cookie de sesión caducada; noconsultar/renovar sesión.
  Sin host/usuario/URL/token en cuerpo/logs. Mantener reglasAPI/WS actuales.
- [ ] Repetir hastaGREEN; ejecutar `uv run python manage.py check`, Ruff/check/formato.
  Commit local acotado con testlogs ysin archivos de entorno.

### Task 2: BackendBrevoHTTPS y presupuesto persistente

**Files:**
- Create: `backend/accounts/mail_backend.py`, `backend/accounts/brevo_worker.py`,
  `backend/accounts/mail_budget.py`, `backend/accounts/tests_brevo_mail.py`.
- Modify: `backend/accounts/models.py`, `backend/config/deployment_settings.py`.
- Create: migración siguiente deaccounts (actualmente0006), soloTESTdurante implementación.

**Interfaces:**
- `BrevoEmailBackend(BaseEmailBackend).send_messages(email_messages) -> int`,
  seleccionada solo por perfilremoto. LocalSMTP/Mailpit/locmem no cambian.
- `run_brevo_worker(payload: dict, *, timeout: float = 5) -> bool`: subprocess
  `sys.executable -m accounts.brevo_worker`, sin shell, stdin≤64KiB, stderr
  descartado y plazo total5s conkill/wait. Máximo2hijos concurrentes, rechazo
  inmediato al saturarse, sin cola persistente ni reenvío automático.
- Worker:POST fijo `https://api.brevo.com/v3/smtp/email`, TLS verificado,
  noredirect, timeout de socket≤3s, respuesta≤64KiB; solo201 conJSON ymessageId
  no vacío confirma aceptación. No exponer cuerpo/headers/messageId ni claves en errores.
- Un destinatario explícitamente autorizado por mensaje; From coincide con
  `BREVO_SENDER_EMAIL` configurado. Texto plano, sin adjuntos/CC/BCC/campañas.
  APIkey en `BREVO_API_KEY`, nuncaVITE ni argumentosCLI.
  Payloadde texto/credenciales/conexión efectiva enstdin, jamás logueado.
  Validar tamaño/estructura antes de reservarcuota; sin inventar seguimiento
  de enlaces delproveedor: comprobar enla prueba autorizada que nolointerfiere.
- `OutboundMailBudget`: fila singleton sinFK ni datos de usuarios, díaUTC y
  intentos reservados. `reserve_mail_budget() -> bool` dentro delworker con
  conexión efectiva delpadre ytransacción independiente antes deHTTP.
  `BREVO_DAILY_LIMIT` default100, rango1–100 para este piloto (cuota reportada300).
  Este margen no garantiza saldo compartido ni coincide necesariamente con el díaBrevo.
- La reserva se conserva ante timeout, respuesta rechazada, caída o rollback
  exterior; no restituir capacidad de forma optimista. Solo fecha nueva reinicia
  contador; sin historial por destinatario ni cuerpo/token persistido.
- Rechazo/fallo lanza `OSError` genérico con `fail_silently=False` y devuelve0
  contrue; nunca convierte fallo en un correo aceptado.

- [ ] Escribir tests201válido→1,2xxJSONincompleto/3xx/400/401/429/5xx/timeout/
  oversize→OSError sin secretos. MockHTTP solo en unitarias; ningúnAPIkey real.
- [ ] Probar From/Toajenos/CC/BCC/adjunto/configfaltante→rechazo antes de red/cuota.
  Allowlistde destinatarios explícita `BREVO_ALLOWED_RECIPIENTS`, no copiar
  indiscriminadamente cuentas locales. Mantener verificaciones originales deemail.
- [ ] Probar100reservas→101bloqueada; dos intentos concurrentes por la última
  plaza→una sola salida; rolloverUTC; no devolución tras rollbackdealta.
  Verificar con TransactionTestCase yDB exclusiva; worker recibe nombreTESTefectivo.
- [ ] Ejecutar runner `accounts.tests_brevo_mail`; observarRED antes delbackend/modelo.
- [ ] Implementar worker/adaptador/cuota, sin referenciarusuarios bloqueados por
  elpadre. Probar terminación de hijo lento, saturación y limpieza de conexión.
- [ ] Ejecutar testsnuevos+accounts+institutions, makemigrations--check yRuff.
  Migración soloTEST, no `migrate` en desarrollo. Commit local delbackend/tests/migración.

### Task 3: Activación y recuperación con correo remoto sin fuga de secretos

**Files:**
- Modify: `backend/institutions/account_management.py`,
  `backend/accounts/recovery_delivery.py` solo si requiere compatibilidad delbackend,
  `frontend/src/screens/ActivateAccountScreen.tsx`.
- Create: `backend/accounts/tests_deployment_mailflows.py`,
  `frontend/scripts/activation-links-test.mjs`.
- Modify: `frontend/scripts/accounts-test.mjs`, `frontend/package.json`.

**Interfaces:**
- `send_activation_email` conserva firma/retorno; emitir enlace
  `/activar-cuenta#uid=...&token=...` para nuevas invitaciones. Frontend acepta
  fragmento yquery legado sin cambiar cuerpoPOSTni plazo24h. Preferencia por
  fragmento completo; entrada parcial/mezclada no combina secretos de dos enlaces.
- Ante cambio de enlace enmisma pestaña descartar contraseña/confirmación/error
  anterior yevitar que unsubmit/resultado tardío confirme otra invitación.
- Nuevos enlaces de recuperación conservan fragmento/plazo30min,202genérico,
  worker volátil, verificaciónD-013 y revocaciónHTTP/WS. No autologin.
- Deshabilitar accesslogDaphne en elarranque remoto y filtrar logsDjango/errores
  para no incluir query/cuerpos/excepciones con tokens; no degradar auditoría.
  La eliminación de query de enlaces nuevos también protege frente al proxy externo.

- [ ] PruebasDjango: backendHTTPSfake aceptado permite alta/reenvío; rechazado/
  timeout/quotagotada revierte alta como hoy y reserva permanece; pruebas equivalentes
  para institución+primeradmin. Sin direcciones ni enlaces de entrega en respuestas.
- [ ] Probar recuperación existente/inexistente devuelve el mismo202, y worker
  fallido no expone cuenta ni simula entrega; conservarpruebasI/D-013.
- [ ] PruebasPlaywright: fragmento yquery legado funcionan, URLde nueva invitación
  no contienequerysecreto; cambiarenlace descarta borradores y respuestas viejas.
  `POST/auth/activate/` conserva uid/token/password y rechazo de reutilización.
- [ ] Ejecutar runner `accounts.tests_deployment_mailflows` y nuevo
  `npm run test:activation-links` con transporte sintético; confirmarRED.
- [ ] Implementar cambiosmínimos y test de captura de logs con secretos señuelo.
  Texto de activación no debe afirmar que unentorno remoto es «local».
- [ ] Ejecutar accounts/institutions/systemmanagement/recovery más frontendaccounts/
  systemadmin/recovery/activation-links/unit ybuild; GREEN, commit local.

### Task 4: Imagen y arranque remoto reproducibles, probados sin infraestructura externa

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `backend/config/deployment_start.py`,
  `backend/config/tests_deployment_start.py`, `ops/deploy/README.md`,
  `ops/deploy/test-container.ps1`, `ops/deploy/tests/container-contract-test.mjs`.
- Modify: `backend/config/deployment_settings.py` según contratoTask1.

**Interfaces:**
- Node24.20.0/npm11.19.0 en etapafrontend con `npm ci`; Python3.14.10, uvversión
  fijada porCI y `uv sync --locked --no-dev` en backend. Imágenes por digest
  verificado durante implementación, no taglatest ni digests inventados.
- Imagenruntime no-root con solo backend,dist ydependencias; sin `.env`,Git,
  scratch, dumps, certificadosLAN, claves, node_modules/buildtoolsinnecesarios.
- `python -m config.deployment_start`: valida perfil/destino, `migrate --check`
  antes de escuchar; luego execDaphne en `0.0.0.0:$PORT`, ASGIactual. Sin accountsreset.
- Pendientes de migración solo se aplican con `AMBUSYNC_MIGRATION_APPROVAL_SHA`
  igual alSHAinmutable de laimagen yhost/nombreDBesperados coincidentes con
  conexión efectiva. Usar lockasesorPG, ejecutar/check yliberar; SHAajeno→abort.
  Sin aprobación yconpendientes→abort. No migrar durantebuild.
- BuildSHA no es secreto; origen/DB/Valkey/APIkey solo enruntime. ExigirURLpública
  HTTPS exacta, readinessTask1 yseñales de apagado alprocesoASGI.
- No crear `render.yaml` autoaplicable: instrucciones de altaFree manual para
  evitar recursos implícitos/cargos. Autodeploy apagado, una sola instancia.

- [ ] Tests con comandos/DBsimulados: entornoincompleto/destinodistinto/SHAincorrecto/
  migraciónfallida→nuncaexec; repetir arranque sinpendientes no alteracuenta/datos.
  Ejercitar migraciónreal solo dentro deTESTbaseexclusiva.
- [ ] Test de construcción real deimagen yarranque local con PG/Valkey sintéticos
  propios; no vincular puertos existentes ni montar desarrollo/envprivado.
  Antes de cambios, test debe fallar por ausencia deimagen/entrypoint.
- [ ] Inspeccionar imagen/historial/capas con secretos señuelo; comprobar que
  imágenes finales no contienen secretos ni herramientas que permitanbuildaccidental.
- [ ] SmokeHTTP/WSS con datos sintéticos: sesión/cookieCSRF, SPA/API404separados,
  worker/manifest/iconos, nueva ruta de reactivación cargada, persistenciaDB
  tras reinicio deapp; pérdida deKeyValue no elimina DB ni crea escrituras.
  HTTPtimeouttotal ylogsredactados conquerysecreto falso.
- [ ] Si Docker no está disponible, no instalarlo ni aceptar licencias porinferir:
  documentar bloqueo devalidación deimagen y solicitar entorno; no declararTask4GREEN.
- [ ] Ejecutar runner `config.tests_deployment_start` y
  `powershell -File ops/deploy/test-container.ps1`; GREEN antes delcommit.
  Elscript crea/limpia solo recursoslocalessintéticos propios y nunca subeimagen.

### Task 5: Copia local cifrada con origen remoto verificado, sin automatizaciónR2

**Files:**
- Create: `ops/backups/backup-deployment.ps1`,
  `ops/backups/tests/backup-deployment.tests.ps1`.
- Modify: `ops/backups/README.md`, `ops/backups/tests/restore-postgres.tests.ps1`
  si hace falta cubrir repositorioResticlocal; no ampliar destinosrestore.

**Interfaces:**
- Nuevo wrapper exige `-ConfirmSyntheticSource`, `-ExpectedSourceHost`,
  `-ExpectedSourceDatabase`; conexión desde variableprivada no argumentos.
  Verificar destinoefectivoTLS (hostname/certificado), no solo cadenaURL declarada.
- RepositorioResticlocal fueraGit, distinto deTemporal/dist/origen, previamente
  inicializado bajo aprobación. Rechazar `s3:`,URL remota o path ambiguo sin
  ejecutar Restic/red; no implementar bypass `AllowRemote` en esta tarea.
- `pg_dump` con referencia de servicio/variablesPG y credenciales fueraargv;
  servicio/passfile temporal único con permisosdelusuario y eliminación enfinally.
  No invocar settings que recarguen inadvertidamente la `.env` de desarrollo.
- Dumpcustom+metadata no sensibles→Restic cifrado→checkobligatorio; solo éxito
  completo informa copia verificada. Archivo temporal en carpetaúnica, jamásGit.
  Restauración conserva guardiasC loopback/DBreservada/retención obligatoria.
- No programar tareas delSO ni ejecutar backup/restore real durante implementación.
  No modificar/activar automatizacionesR2 existentes porinferencia.

- [ ] Con dobleslocales, probar origenajeno/sinTLS/repositorioR2/payloadmalformado/
  faltaConfirm→cero pg_dump/restic/red; URLs/claves nunca enargv/stdout/stderr.
- [ ] Probar pg_dumpfallido/resticfallido/checkfallido→exitno0 ysinéxito; error
  limpia solo temporaIpropio, conserva archivosajenos yrepoexistente.
- [ ] Ejecutar `powershell -File ops/backups/tests/backup-deployment.tests.ps1`
  antes delwrapper; RED.
- [ ] Implementar wrapper ypruebas deguardias. Documentar inicialización
  explícita, copia separadadeclave ylapolítica existente24horarios/14diarios:
  programar/forget/prune reales necesita aprobación; no afirmarRPO/RTO por doubles.
- [ ] Repetir pruebasnuevas y `powershell -File ops/backups/tests/restore-postgres.tests.ps1`;
  GREEN, commitlocal. R2queda con puerta decosto ysin nuevas subidas.

### Task 6: Integración, regresión y paquete operativo

**Files:**
- Create: `.github/workflows/deployment-checks.yml` (solo workflow_dispatch,
  sin secretos externos), `docs/PRUEBAS_L.md`, `docs/DESPLIEGUE_L.md`.
- Modify: `backend/openapi.json`, `README.md`, `docs/GUIA_DESARROLLO.md`,
  `docs/ETAPA_1.md`, `AGENTS.md`, `.github/workflows/frontend-ci.yml`
  para integrar testsnuevos enlosjobs ya existentes.

**Interfaces:**
- Registroúnico de estado: «L preparado/verificado localmente; remoto/aceptación
  pendientes», salvo evidencia real autorizada posterior. No presentar despliegue
  como existente ni modificar labelsclínicas/alcance para la entrega.
- Workflowmanual deimagen sin despliegue ni proveedor; no ejecutarlo remotamente
  hasta comprobar cuotas/minutos/costo$0 yautorizarpush/dispatch.

- [ ] Integrar las suitesnuevas y verificar configCI con pruebas decommands
  existentes. Testear ejecución real de scripts, no solo buscar texto enYAML.
- [ ] Ejecutar fullbackend con runnerTESTexclusivo; Django checks/makemigrationscheck/
  Ruff/formato/OpenAPI/pip-audit. No usar SQLite, sharedtestDB ni migrateendev.
- [ ] Ejecutar todas las suites de `frontend/package.json` sobre servidorespropios
  aislados, incluidasPWA/activación/regresionesA–K, tipos/build/Mermaid/npm-audit.
  No regenerar/sobrescribir capturas históricas sin necesidad; usar scratch.
- [ ] Repetir pruebasPS debackup/restore con dobles ysmoke deimagen real; registrar
  resultados/limitaciones exactos. No llenar evidencias con resultados esperados.
- [ ] Revisar incremento frente alSpec yReviewFocus; revisiónindependiente solo
  si método elegido la autoriza, deotro modo auto-revisión declarada con limitación.
- [ ] Documentar runbookde cuotas, expiryDB, remitente, permisos, aprovisionamiento
  sin shellRender, backup/restore, rollbackcompatible ydemolocal de contingencia.
  No guardar direcciones privadas, claves,URLcredenciales ni cuerpos de correo.
- [ ] Guardar commitslocales acotados y presentar resultado; no push/merge/deploy,
  no cerrarL por aprobarpruebaslocales ni iniciarM.

## Fase remota posterior — no autorizada por este plan

Requiere aprobación explícita antes de cada tipo de operación:

1. Comprobar cuentas/Free/cuotas/métodopagoausente/nombre/región/fechaDB ycontrolR2.
   Si el proveedor requiere pago, detener; no eludir límites ni crear cuentas para
   reciclar pruebasgratuitas. La graciaDB no equivale a servicio gratis disponible.
2. Crear únicamente losrecursosFree aprobados; guardar URLpública yfechadevencimiento
   reales. Confirmar cobertura de defensa14–16/12, sin promesa de continuidad.
3. Configurar secretos porcanal seguro, destinoDB/TLS, accesosrestringidos ySHA.
   Autorizar migración/aprovisionamiento deldestino nuevo; nada de desarrollo.
4. Autorizar y realizar correo de prueba a undestinatariocontrolado; comprobar
   aceptación/entrega/remitentesustituido/cuotareal sin mostrar enlaces otokens.
5. Autorizar primerdeploy; smokeHTTPS/WSSweb/Android, reinicio/arranquefrío yreconexión.
   No instalarCA local para eldominioRender ni suponer que migra unaPWALAN instalada.
6. Autorizar respaldolocalreal yrestoreaislado; R2solo tras comprobar elcriterio
   aprobado. Con requisitoexternopendiente no declararLcerrado.
7. Validar reversión y aceptarL por responsable; M sigue separado. Ninguna prueba
   parcial acredita todas las anteriores ni habilita uso clínico.

## Auto-revisión del plan

Spec1–3→Tasks1/4; correo→Tasks2/3; presupuesto→constraints/faseremota;
respaldo/reversión→Tasks4/5/6; salud/aceptación→Tasks1/4/6.
Los cincoReviewFocus tienen tests explícitos enTasks1/3/2/4/5 respectivamente.
Interfaces leídas contra elcódigo: altas llaman send_mail dentro deatomic;
recuperación usa worker volátil yget_connection(timeout=5); activar consumequery,
recuperaciónfragmento; API/WS no sirven elfrontend actualmente; backupactual
exigeAWS incluso para reposlocal. Elplan no presupone que esos detalles ya estén resueltos.

Compatibilidad deTLSDBcontrastada con documentaciónoficialRender17/11:
https://render.com/docs/postgresql-creating-connecting — conexiones internas
opcionalesTLS conautofirmado; externasTLS. Exigir verify-full a laURLinterna
sin unaCAverificable sería uncontrato no demostrado. Las dos políticas quedan
explícitas, sin vender encryption-only como validación deidentidad.

Preflight de herramientas17/11: `docker` no se encontró enPATH. La aprobación
delplan no autoriza instalarDockerDesktop ni aceptar sus términos; Task4tendrá
una puerta de disponibilidad deDocker/entornoLinux y no podrá declararse completa
solo con mocks si sigue faltando. No se ejecutó ninguna pruebaL al escribir elplan.
