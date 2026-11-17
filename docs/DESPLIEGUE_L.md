# L — runbook sintético; primer despliegue verificado, aceptación pendiente

**Estado17/11/2026:** preparación local y primer despliegue Render verificados.
URL: **https://ambusync-pilot.onrender.com/**. Correo externo, aprovisionamiento
inicial, pruebas autenticadas/dispositivos y aceptación L siguen pendientes.
Las operaciones remotas siguientes se autorizaron posteriormente y se registran
por fase; el plan/Docker por sí solos no las autorizaban. Sin backups/restores,
upgrades ni M por inferencia. Solo datos sintéticos, costo **$0**.

## Verificación Render de solo lectura —17/11/2026

Responsable autorizó comprobar Render sin crear recursos ni modificar pagos.
Acceso humano completado; agente inspeccionó el dashboard, no secretos/APIkeys.
En el workspace actual «My Workspace» se observó:

- Plan **Hobby**, **sin tarjeta**, sin cargos pendientes; factura anterior$0.
- Sin servicios creados. Uso incluido:0/750horasFree,0/5GBbandwidth,
  0/500minpipeline,0/25servicios.
- BuildPipelineStarter:500minincluidos y **límite mensual de gasto$0**.
- FormularioPG ofreceFree$0, pero el default es compute$6+storage$4.50=$10.50/mes.
- FormularioKeyValue ofreceFree$0/25MB/50conexiones/sinpersistencia, pero default$10/mes.
- No se seleccionó/confirmó ningún plan ni se pulsóCreate. Formularios abandonados;
  navegador dejado enBilling, reconfirmando Hobby/sintarjeta/sincargos/0servicios.
- WebServiceGitProvider muestra «No repositories found»: loginGitHub no equivale
  a autorizar acceso del GitHubApp al repo privado. Conexión pendiente y separada.
- Banner anuncia mantenimiento17/11a23:00GMT−3 (18/11a02:00UTC).

DocumentaciónFree consultada17/11: Web/PG/KeyValue soportados; PG1GB/30d y web
idle15min. Sin método de pago, excesos de bandwidth suspendenFree y excesos de
pipeline bloquean nuevos builds; no es garantía de disponibilidad. La fecha de
caducidadPG solo se registra al crear realmente la base, aún no creada.
No se instaló plugin/MCP ni se modificó OpenCode: la guíaRender muestra formato
distinto al nativoV2; esta comprobación se hizo por navegador autorizado.
No autoriza push, accesoGitHubApp, creación, secretos, migraciones o primerdeploy.

**Autorización posterior17/11:** responsable autorizó publicar los commits locales
en `origin/feature/pilot-completion` y conectar Render **únicamente** al repositorio
`pasaldo/ambusync`. Incluye el registro documental de la verificación/autorización;
no incluye otros archivos no relacionados ni otros repositorios. Publicación y
conexión en curso, aún sin acreditarlas. Sin crear servicios, desplegar, aplicar
migraciones remotas, añadir pagos o acceder/configurar secretos por inferencia.

**Resultado verificado17/11:** push normal (sinforce) completado y `ls-remote`
coincidió con HEAD `78c9b7a0209bc87da46240318088e1869cd4ba0c` en la rama autorizada.
Incluyó siete commitsL y registro de verificación/autorización; sin merge ni PR.
Usuario completó instalaciónGitHubApp. Render ahora lista `pasaldo/ambusync`;
agente abrió la configuración de la instalación y comprobó **Only select
repositories**, **Selected1repository**, `pasaldo/ambusync`, con Allrepositories
desmarcado. No se cambió el alcance ni se accedió a otros repositorios.
ConexiónGitProvider verificada; no confundirla con un MCPRender configurado.
Sigue pendiente autorización específica para crear datastoresFree y posteriormente
configurar/crear WebService y primerdeploy. No recursos/secretos/migraciones creados.

## Datastores Free creados con autorización —17/11/2026

Responsable autorizó «crear ambos en oregon». Se crearon únicamente:

| Recurso | Configuración observada | Estado verificado |
|---|---|---|
| `ambusync-pilot-db` | PostgreSQL17, Free, Oregon; nombre de DB `ambusync_pilot`; sinHA/autoscaling |Available |
| `ambusync-pilot-kv` | KeyValueFree, Oregon,25MB/50conexiones, persistenciaOff; política defaultallkeys-lru |Available |

Se eligió explícitamenteFree antes de cadaCreate y se comprobó total$0.
PGcreado17/11/2026a09:48:35UTC; Render muestra vencimiento exacto
**17/12/2026a09:48:35.192619UTC**, no estimación. Por fecha cubre defensa14–16/12,
sin garantizar disponibilidad ni recuperación. No contar con gracia/upgrade.
KeyValuecreado17/11/2026a09:49:27.753899UTC. Ambos estaban inicialmenteCreating;
PG pasóAvailable y KV se confirmóAvailable tras recarga de su página.

Billing posterior: Hobby, sin tarjeta,2/25servicios incluidos, Datastores$0.00,
total acumulado$0.00USD y proyección noviembre$0.00USD. No se cambiaron pagos ni
límites. NingúnWebService creado ni build/deploy de aplicación iniciado.
Las credenciales que genera el proveedor no se revelaron/copiaron a chat/Git;
no se abrieron conexionesSQL/Redis, no migraciones, cuentaspiloto, datos,
envíoscorreo, backups/restores ni cambios de desarrollo.
Esta autorización no incluye crear/configurarWebService, cargar secretos,
migrar la DB ni primerdeploy: pedirlos explícitamente antes de continuar.

## WebService y primer despliegue autorizados — en curso17/11

Responsable respondió «autorizo continuar» a la petición explícita de crear/
configurarWebServiceFree, cargar variables privadas y migrar únicamente la nueva
`ambusync_pilot`, seguido de primerdeploy. No incluye correos reales, usuarios/
permisos piloto, backups/restores, cambios de desarrollo, upgrades, merge ni M.

Se creó `ambusync-pilot` desde `pasaldo/ambusync`, rama
`feature/pilot-completion`, SHA `c07faec4305e6f6d4ed14f0cc19bbe0a5a22f53e`.
Antes de confirmar: Docker, Oregon, Free0.1CPU/512MB, total$0, autodeployOff,
Dockerfile`./Dockerfile`, contexto`.`, rootvacío, health`/health/ready/`.
BuildSHA y aprobaciónmigración coinciden con ese commit; perfildeployment explícito,
destinosprivadosPG/KeyValue contrastados con recursoscreados y DBambusync_pilot.
PGinternoSSL`require` según criterio aprobado (sin afirmar identidadTLS).

Durante el borrador apareció un bloque con URLsloopback y contraseñaadministrativa
local. Antes de crear, se sustituyeron ambasconexiones por las privadasRender,
retiróPOSTGRES_ADMIN_PASSWORD y generóSECRETKEY nueva con WebCrypto, sin reutilizar
la de desarrollo. ClaveGeoapify introducida enRender se conservó, sin mostrarla
ni hacer búsquedas. Credenciales transferidas a los camposprivados sin devolver
valores en mensajes; `.env` local no leído/modificado para esta configuración.
BrevoAPI/remitente/allowlist todavía no configurados; no afirmar correo operativo.
Servicio creado y primerbuild observadoBuilding; éxito de build/arranque/migración/
HTTPS/WSS aún pendiente de evidencia posterior. No repetirCreate si hay demora.

### Resultado del primer despliegue —17/11/2026

Render confirmó **Deploy succeeded | Live**, SHA`c07faec`, FirstDeploy,
inicio07:03:23GMT−3 y servicioLive07:05:04GMT−3, duración1m41s.
Origen real asignado `https://ambusync-pilot.onrender.com`, coincidente con la
configuración. BuildDocker/TypeScript/Vite terminaron; aviso bundle>500kB previo.
El entrypoint superó validación de destino/SHA y `migrate --check`/migración
autorizada antes de escuchar: se acredita el arranque protegido, no una consulta
SQL independiente de la tabla de migraciones ni nuevas pruebasbackend remotas.

Comprobaciones reales externas, sin login ni datos creados:

- TLS verificado por clientes estándar, sin omitir validación ni instalarCA.
- `/health/live/` y `/health/ready/`:200JSONstatusok/no-store.
- `/`:200shellReact y navegador muestra formulario AmbuSync «Iniciar sesión».
- Manifest200application/manifest+json, worker200text/javascript/icon192PNG200,
  no-store y Referrer-Policyno-referrer.
- `/api/v1/auth/me/`:401JSON; ruta desconocidaAPI404sin shellReact.
- CSRF200/cookiecsrftokenSecure/SameSiteLax, sin registrar valor de cookie/token.
- GETanónimoUUIDsintéticoenreactivate:401(rutacargada), sinPOST/cambios de unidad.
- HandshakeWSSanónimo403, TLSverificado. **No** acredita WSautenticado entre usuarios.

Settings persistidos: autodeployOff, healthready, Dockerfile`./Dockerfile`,
contexto`.`. Billing posterior: Hobby/sintarjeta/3servicios; Services$0.00,
Datastores$0.00, PipelineMinutes$0.00, totalmes$0.00USD/proyecciónnoviembre$0.00USD,
0.05/750hFree y 0/500min reportados al consultar (contadores pueden demorarse).
Ningún upgrade/pago/secretfile se añadió. No nuevaCIremota acreditada.

Pendientes: primera cuentaadministrativa por comando técnico autorizado/canal
privado, configuraciónBrevoAPI/remitente/allowlist, prueba de correo controlada
autorizada, login/WSautenticado/Android/frío/reinicio y respaldo/restore/R2$0.
No se crearon cuentas ni se enviaron correos. Rótulo «Acceso local de demostración»
del login es texto heredado, no prueba de que el origen público sea local.
No cerrar L ni iniciar M por este primer despliegue.

### Aprovisionamiento inicial system_admin — autorizado, pendiente de entrada privada

Responsable pidió crear la cuenta administrativa inicial administradora del
sistema. Se reutiliza `create_system_admin`, no superuser/staff ni administración
institucional. Consola privada temporal fueraGit solicita URL externaRender,
usuario/correo y contraseña con getpass; ningún secreto por chat/argv/archivo.
No se copia desarrollo ni se envían correos. Exige host público exacto del recurso,
DBambusync_pilot, TLSverify-full con CA pública confiable, comprobación efectiva
de destino/TLS y migrate--check sin aplicar. Rechaza si ya hay system_admin.
Alta/guardia de concurrencia/verificación de rol y ausencia de membresía/unidad
se ejecutan transaccionalmente; luego reconecta y verifica persistencia.
Consola lanzada, resultado aún pendiente: no afirmar cuenta creada ni repetir
automáticamente ante resultado incierto. Archivo de resultado solo flags/etapa,
sin usuario, correo, URL, contraseña ni hash.

Diagnóstico posterior: primer intento terminó en configuration/RuntimeError,
antes de la etapa de conexión/alta; no cuenta creada por ese intento.
Operador reportó cierre tras pegar URL. Prueba separada de consola confirmó TTY;
se añadieron etapas/flags no sensibles al auxiliar externoGit. Ejecución privada
configuration-only posterior: configuration_verified/createdfalse/
database_connection_attemptedfalse. Causa inicial no reproducida ni atribuida
al operador. Se abrió nuevo intento de alta autorizada con guardias intactas,
rechazo de administrador existente y verificación de persistencia; resultado
todavía pendiente, sin login/correo ni repetición automática ante incertidumbre.

**Resultado posterior confirmado17/11:** consola de alta terminó con
`created_and_verified`, `created:true`, rol exclusivo`system_admin`,
stafffalse/superuserfalse/membresíainstitucionalfalse/asignaciónunidadfalse,
TLSverifiedtrue/destinationverifiedtrue. El auxiliar comprobó cuenta activa,
contraseña utilizable y ausencia de permisos directos en transacción; reconectó
y verificó persistencia y ámbito. No registrar usuario/correo/contraseña/URLDB.
Sustituye pendiente de aprovisionamiento inicial, no pendientes de correo,
login manual/WSautenticado/dispositivos/respaldo/aceptaciónL. No repetir el alta.
Responsable debe iniciar sesión personalmente en el origen público y comprobar
acceso a `/sistema`; no login realizado por el agente ni correo enviado.

**Aceptación de acceso por reporte del responsable17/11:** confirmó «si se pudo
acceder a la cuenta de sistema». Se acredita inicio de sesión manual satisfactorio
por reporte, sin atribuir al agente el login ni inventar dispositivo/navegador o
pruebas de gestión institucional. No implica aceptación integralL ni entrega de
correo, WSautenticado clínico, Android o respaldo/restore verificados.

### Configuración Brevo en Render autorizada — entrada privada pendiente

Responsable autorizó continuar con configuración en Render, sin autorizar envío
real. Se prepararon en borrador del servicio existente los campos BREVO_API_KEY,
BREVO_SENDER_EMAIL y BREVO_ALLOWED_RECIPIENTS; BREVO_DAILY_LIMIT100 ya existente.
Operador introducirá claveAPI(noSMTP), remitente verificado y lista explícita de
destinatarios controlados directamente en Render, nunca por chat. Aún sin guardar
ni aplicar/redeploy, sin consultaBrevo ni correo enviado. Guardar configuración
no acredita credenciales válidas ni entrega; aplicación y prueba deben verificarse
por separado. No tocar demás variables ni planes/autodeploy/desarrollo.

Operador confirmó variablesBrevo guardadas. Relectura de Environment muestra
BREVO_ALLOWED_RECIPIENTS/API_KEY/DAILY_LIMIT/SENDER_EMAIL y formulario en modo
lectura(Edit, no Saveonly/Cancel), consistente con guardado. No se revelaron
valores ni validaron credenciales/remitente/entrega. Aplicación al proceso activo
no acreditada; pedir autorización de despliegue de la misma versión para aplicar
variables antes de prueba real separadamente autorizada.

Responsable autorizó desplegar nuevamente la misma versión para aplicar variables.
Se utilizó ManualDeploy→Deployaspecificcommit seleccionando el enlace SHAcompleto
`c07faec4305e6f6d4ed14f0cc19bbe0a5a22f53e` y verificando selección antes de confirmar.
Nuevo deploy`dep-dbu2tmmk1f9s73a5lh00`, inicio17/11/202607:39:22GMT−3,
triggerManualDashboard/sourcec07faec; observadoBuilding. No latestcommit implícito,
cacheclear, cambioscódigo, planes, nuevas cuentas ni correos. ResultadoLive/salud
pendiente; guardar variables o iniciar build no valida entregaBrevo.

Resultado del redeploy: Render`Deploy succeeded|Live`, sourcec07faec,
duración50,6s. Verificación externa posterior: healthlive/ready200JSONstatusok,
raíz200HTML y authme401JSON sin sesión. Configuración guardada aplicada mediante
redeploy de la misma versión, sin cambiar código ni enviar correos; validez de
clave/remitente/allowlist ante Brevo y entrega siguen sin probarse. Sin afirmar
nueva verificaciónBilling, WSautenticado, aceptaciónL ni cierre demás pendientes.

### Cierre local solicitado y verificado17/11

Responsable preguntó si procesoslocales eran necesarios y pidió cerrarlos si no:
Render no depende de ellos. Identidad/rutas/PID contrastados antes de cerrar
Vite5174, preview4174, HTTPSLAN8443, Daphne8000/8001 y Mailpit1025/8025.
PG55432 del directorioAmbuSync detenido con pg_ctlfast/wait; checkpointshutdown
y databasesystemisshutdown confirmados. ValkeyUbuntu identificado en6379 como
serviciovalkey-server; systemctlstop y estadoinactive/dead confirmado.
Verificaciónposterior:0listenersen5173/5174/4174/8000/8001/8443/55432/6379/1025/8025,
0procesosnode/python/daphne/esbuildconrutadelproyecto. Editor/Docker/WSLgeneral
intactos, sin borrar datos, certificados ni reglasfirewall o editar.env.
Notificaciones de shells históricos incluyen logs previos/exit1 por parada de
procesos; no son nueva prueba fallida ni falloRender. ReadyRender200JSONok
verificado después del cierre. Sin enviar correos; prueba real aún no autorizada.

### Una prueba de correo autorizada — pendiente entrada privada

Responsable autorizó una única prueba a buzón controlado. Se abrió formulario
público`/recuperar-cuenta` para correo de cuenta existente controlada, incluido
en allowlistBrevo. Entrada directamente por operador, sin dirección por chat;
una sola solicitud sin reintentos, sin completar cambio de contraseña ni crear
cuentas. Aún no enviada. Respuesta genérica del formulario no acredita entrega:
requiere confirmación de recepción por operador. TextoMailpit/pruebaslocales
en formulario es heredado, no verificación de backend SMTP en Render.

Operador confirmó correo introducido en formulario. Se verificaron únicamente
presencia/validezHTML y origen/ruta, sin leer/devolver dirección. Ejecutado un solo
clicSolicitarrecuperación con guardia de intento único, sin reintentos. Lectura
posterior muestra statusgenérico«Si la cuenta está disponible, recibirás
instrucciones en su correo registrado. Revisa el correo; la solicitud no garantiza
la entrega.» y ningún alert. Acredita respuestaUI, no aceptaciónBrevo/entrega:
recepción pendiente de reporte del responsable. Sin abrir token/cambiarpassword.

Responsable reportó no recepción y aclaró que el correo usado no corresponde a
cuenta existente; además, la cuenta inicial de sistema se creó con correo
inexistente. Rechazó expresamente otra solicitud de recuperación. Prueba no
concluyente para Brevo: respuesta genérica no demuestra envío al proveedor ni
fallo de entrega. No repetir/envíar ni modificar correo/cuenta sin autorización
nueva. Login de sistema aceptado previamente no acredita recuperación operativa.
Entrega real y recuperación de esa cuenta siguen pendientes; eventual prueba
técnica a buzón controlado sin cuenta requiere propuesta/autorización separada.

### Diagnóstico privado de activación503 autorizado17/11

Operador adjuntó log de consola: POST`/api/v1/system/institutions/`503;
avisoPWA independiente. Revisión del código: falloenvíoactivación produce503 y
rollbackalta; errorText del panel devuelve cadena vacía ante fields{}, ocultando
mensaje. Reproducción localNode con error sintético confirmó mensajevacío(exit1),
sin servicios/red/cambiosproducto. Log no incluye cuerporespuesta: no atribuir
por sí solo todos los503 a activación.

Autorizado específicamente diagnóstico privado de configuración; sin cambios
ni correos. VariablesBrevo leídas temporalmente y reocultadas enRender; solo
flagsdevueltos. Clavepresente/prefijoAPI/sinespaciosniquotes; remitenteemailbare/
sinespacios; límite1–100válido. GETBrevo`/v3/account`200: relayenabledtrue,
planfree/sendLimit300. GET`/v3/senders`200: remitenteconfigurado encontradoactivo.
No POSTproveedor/envíos/consumocuotaenvío ni nombres/direcciones/claves enregistro.

Hallazgo: allowlistcontiene4entradas; ninguna coincidecase-insensitive con
BREVO_SENDER_EMAIL. Cada entrada trasstrip tiene formatoemailbare sinquotes/
semicolon/newline; existen separadoresnewline envalorraw, sin demostrar que sean
error trasstrip. Responsable había indicado destinatarioigualaremitente: si ese
es el correo efectivamente usado enfirst_email, backendlo rechazaantesBrevo por
allowlist. No se leyó destinatario del formulario de su navegador ni se comprobó
POSToriginal. Pendiente autorización de correcciónprivada/guardado/redeploy y
nuevointentoactivación; no modificar por autorización de diagnóstico únicamente.
Geoapify no diagnosticado anteproveedor: no atribuir su unavailable a esta clave.

Responsable autorizó añadir remitente a allowlist y redeploy. Se añadió únicamente
BREVO_SENDER_EMAIL a BREVO_ALLOWED_RECIPIENTS, conservando texto previo de4entradas;
Saveonly y relectura confirmaron5entradas/remitenteincluidotrue sin revelar valores.
No otras variables/claves/planes/código modificados. Se confirmó ManualDeploy de
SHAcompleto`c07faec4305e6f6d4ed14f0cc19bbe0a5a22f53e`, no latestcommit; resultado
pendiente. No repetición de alta ni correo enviado por agente durante operación.

Redeploy`dep-dbu3cluk1f9s73a72i9g`17/11/202608:11:19GMT−3,
duración49,2s, sourcec07faec confirmado`Deploy succeeded|Live`.
Sondas posterioreslive/ready200JSONstatusok y authme401sin sesión.
Allowlist corregida aplicada; entrega/alta no reintentadas ni acreditadas.
Geoapify y errorUIoculto siguen pendientes, sin publicacióncódigo ni nuevaBilling.

### Cambio a buzón de pruebas — diseño aprobado, plan pendiente17/11

Responsable prefirió buzón tipoMailpit enRender en lugar de más diagnóstico/envíos
Brevo; aceptó mensajesefímeros alreinicio y aprobó diseño funcional. Se prepararon
`docs/superpowers/plans/2026-11-17-test-mailbox-design.md` y
`docs/superpowers/plans/2026-11-17-test-mailbox-implementation.md`.
Propuesta: Mailpitreal+ingresoCaddy enmismoWebFree,puertosinternosloopback,
BasicAuthoperadorindependiente,noenvíoreal,100mensajes/24h,supervisiónno-root,
reenvíoexplícitodeprimeraactivaciónpendiente/rotaciónsegura yerror503legible.
Detalle técnico y planTDD6tareas pendientes de revisión/aprobación; no código,
dependencias, imágenes construidas, servicios arrancados ni cambiosRender/Gitpush.
Mantener servicioslocales apagados; ejecución futura solo temporalesaislados
si se autoriza. Publicación/secretos/deploy requieren puertas posteriores.

Plan aprobado posteriormente por responsable17/11. Ejecucióninline iniciada en
worktreeexistente;Task1commitlocal`9e033a2` añade selectorBrevo/mailpit y settings
captura SMTPloopback con guardiasfailclosed, sin tocarperfilSMTPdesarrollo.
RED→GREEN15testssettings/perfil,RuffPASS,0conexionesDB/proveedor. Sinbuzón
operativotodavía:binarios/proxy/supervisión/reenvío/integración/revisiónpendientes.
DockerCLIexiste eninstalaciónuserlocal,pero daemonLinux no disponible(pipeausente);
no se inicióDocker ni servicioslocales. SolicitararranqueDockerDesktop antes de
ensayoscontenedorizados;noequivaleaautorizaciónreiniciarserviciosAmbuSyncanteriores.
Sinpublicación/remoto/envíos,nirevisiónindependienterealizada.

Responsable autorizó iniciarDockerDesktop;motorLinux29.9.3verificado. Tasks2–3
commitslocales`7d63d03`/`0599cbc`:Mailpit1.34.0/Caddy2.11.9oficialesdigestsamd64
fijados,fronteraprivada realSMTP/UI/API/listarabrirborrar/Origin/CSPPASS;runtimeen
redinternal sin egreso,relaydeingresotemporal por limitaciónDocker29 alpublicar
puertosinternal. Credencialycorreosúnicamentesintéticos. Supervisorunitario27PASS.
Todavía falta validar imagenfinalintegrada,límites512MB/reinicio/flujoextremoextremo.

Task4enprogreso sincommit:reenvíoprimeradministradorauditadopendiente yUIerror503
confields{}visible;backend19/19,frontend3/3,tipo/build/Ruff/detector[]PASS.
Añadidos3testsCSRF/carrerascruzadaspendientes:Dockerdejódeestardisponibledurante
nuevorun,npipeausenteysinprocesosDesktop/backend. No se reabrió/reinstaló ni se
atribuyó causa. Pedirconfirmación antes de reabrir porposiblecierreintencional.
Testsanterioreslimpiaronsuscontenedores;enúltimorunfallóprimerCreateporDaemon.
Sin Render/push/correoexterno/arranquedeservicioslocalesanteriores/revisiónfinal.

Tras autorización de reabrirDocker,Tasks4–5 completadaslocalmente:backend22gestión/
reenvío y3frontendnuevosPASS;fullbackend386=385PASS/1skipWindows(112.114s);
18scriptsfrontendPASS,Ruff/check/OpenAPI/audits/Mermaid/PSdoblesPASS.
Imagenfinal512MiB/0.1CPUenredinternal:smtpcaptura→activación→login,recuperación
unuso/sinautologin,reinicio→buzónvacío/cuentasPGintactas,reenvíoprimerapendiente,
BasicAuthindependiente/HTTPS-CSRFSecure-WSS/stop0/muertehijoexit1PASS.
Se eliminan filecapabilitiesheredadas de binariosenbuild trasREDreal.
DefaultBrevo smokeimagen/migración/reinicio/pérdidaKeyValue/symlinkLinuxPASS.
Revisiónindependientefinalpendiente antes depresentarpromociónremota.
PGlocal55432reaparecióPID46620,creado07:56:04 ajenoaensayoscontenedorizados;
preservado,sinconexiónniarranqueagente. Otrospuertoslocalespreviosvacíos y
0contenedorespropiosrestantes alcomprobar09:30. Noafirmartodoslosservicioslocales
apagados despuésdeeserearranqueexterno.NoRender/push/envíoreal.

## Puertas de costo y continuidad

Antes de cada operación remota, pedir autorización y comprobar condiciones reales
en las cuentas: no suponerlas por documentación histórica. Propuesta: un Web
Service Docker Free, PostgreSQL Free y Key Value Free, compatibles en región,
una instancia, autodeploy apagado. Ningún addon/upgrade/autoscaling/recurso pagado.
No hay `render.yaml` autoaplicable. Origen único HTTPS `onrender.com`, sin dominio
comprado ni CA LAN; listener HTTP accesible solo a través del proxy TLS confiable.

El diseño parte de suspensión web tras15min y PGFree1GB/30d: **reconfirmarlos**.
Registrar creación/caducidad real y cobertura de defensa14–16/12; no prometer
continuidad ni contar con gracia/recreaciones indefinidas. Si se exige pago o
no se acredita$0, detener: no añadir tarjeta ni reciclar trials/cuentas.
R2free no es un tope de cargo: sin control verificable no automatizar nuevas subidas.
Una copia local adicional no sustituye el requisito externo pendiente.

`deployment-checks.yml` es manual y no despliega. No hacer push/dispatch remoto
sin autorización y comprobación previa de minutos/cuota/costo$0.

## Artefacto, perfil y configuración

Ver [ops/deploy](../ops/deploy/README.md). Build desde commit limpio/aprobado con
SHA completo; conservar digest/commit. No publicar imagen por inferencia.
Node24.20.0/npm11.19.0/Python3.14.10/uv0.11.26 y bases por digest verificado.
Build no migra ni recibe secretos. Runtime UID10001 guarda SHA en archivo no
escribible por ese usuario; no confiar en un SHA sobrescribible mediante entorno.

Configurar solo por canal privado, nunca chat/Git/logs:

| Variable | Condición |
|---|---|
| `DJANGO_SECRET_KEY` | Única/fuerte, al menos50caracteres; distinta de desarrollo |
| `DJANGO_SETTINGS_MODULE` | `config.deployment_settings` |
| `FRONTEND_BASE_URL` | HTTPS exacto `onrender.com`, sin ruta/query/credenciales |
| `DATABASE_URL` | Base nueva aprobada, nunca `ambusync_dev` |
| `AMBUSYNC_DATABASE_NETWORK` | `internal` en Render; `external` desde equipo confiable |
| `AMBUSYNC_EXPECTED_DATABASE_HOST` | Host exacto aprobado |
| `AMBUSYNC_EXPECTED_DATABASE_NAME` | Nombre exacto aprobado |
| `VALKEY_URL` | Servicio privado aprobado, no expuesto al público |
| `AMBUSYNC_EXPECTED_VALKEY_HOST` | Host privado exacto |
| `AMBUSYNC_FRONTEND_ROOT` | `/app/frontend-dist`, predeterminado de imagen |
| `PORT` | Puerto proveedor1024–65535; default10000 |
| `BREVO_API_KEY` | Solo backend, nunca `VITE_*` |
| `BREVO_SENDER_EMAIL` | Remitente aprobado; no documentar dirección privada |
| `BREVO_ALLOWED_RECIPIENTS` | Allowlist explícita de destinatarios controlados, separados por coma |
| `BREVO_DAILY_LIMIT` | Default/máximo100intentos/díaUTC |
| `AMBUSYNC_MIGRATION_APPROVAL_SHA` | SHA específico autorizado para ese destino |

No configurar `AMBUSYNC_LOCAL_SMOKE=1` en remoto: admite solo origen loopback y
hosts de pruebas. No es bypass público. No se carga `.env` de desarrollo.
El perfil rechaza variables de entorno `PG*` no vacías y opciones de routing/
servicio libpq (`hostaddr`, `service`, etc.) antes de conectar. La URL solo admite
`sslmode` y `sslrootcert` explícitos, sin duplicados; timeout se fija en código.
Usar `sslrootcert` en la URL si hace falta CA pública, no `PGSSLROOTCERT`.
La misma guardia se ejecuta antes del arranque y al preparar la conexión del
worker de correo, sin alterar el perfil de desarrollo/SMTP.
PGinterno exige host privado exacto y `sslmode=require`: cifrado, **no**
autenticación de identidad del servidor autofirmado. PGexterno requiere host
público exacto y `verify-full`/CA confiable; nunca degradar si falla.

## Migración y aprovisionamiento sin shell Render

Autorizar imagen/SHA/base nueva/operación. No importar ni resetear desarrollo.
Arranque contrasta host efectivo del driver y `current_database()`, toma lock
asesor y hace `migrate --check`. Con pendientes solo migra bajo aprobaciónSHA
coincidente; vuelve a verificar antes de escuchar. Sin aprobación, aborta.
Nueva `accounts/0006` solo agrega contador operativo, sin destinatarios/tokens;
no aplicada a desarrollo. No hay migración durante build.

Si Free no tiene shell, aprovisionar desde el contenedor exacto en equipo confiable,
sin puertos publicados, entorno privado temporal y DBexterna `verify-full`,
solo con autorización específica. Antes de cualquier comando administrativo,
ejecutar `django.setup()` y `config.deployment_start.verify_database()` **en el
mismo proceso**; abortar si difiere. No omitirlo al sobrescribir entrypoint.

Usar `create_system_admin` interactivo/getpass; nunca contraseña en argv.
Cuenta exclusiva `system_admin`, no staff/superuser/membresía/acceso clínico.
Instituciones y primeras cuentas por flujos ya aprobados. Cada concesión mediante
`grant_pilot_permissions` requiere autorización; administrar no concede clínica.
D-013 conserva contacto previo y verificación humana registrada mediante
`register_recovery_contact`, `start_email_recovery`, `verify_email_recovery`;
sin cambio web de correo ni verificaciones fabricadas. Custodiar/eliminar el
archivo privado temporal conforme al acuerdo, sin subirlo como evidencia.

## Correo y cuotas

BrevoFree aprobado como candidato;300/día y remitente personalAmbuSync verificado
son reportes del usuario, con avisosDKIM/DMARC. No se inspeccionó cuenta ni probó
habilitación/entrega/autenticación de dominio. Una eventual sustitución del
remitente por Brevo no es garantía permanente.

Tras autorización, probar activación y recuperación a destinatario controlado.
Registrar resultado/fecha/estado, no dirección/enlace/token/messageId/headers/cuerpo.
Verificar llegada real, spam y remitente; aceptación API no equivale a entrega.
Solo201conmessageId válido confirma aceptación. HTTPS fijo/TLSverificado,
sin redirects, máximo2hijos/deadline5s, sin cola persistente/reintento automático.
Antes del intento se reserva cuota global persistente, independiente del alta.
Timeout/rechazo/rollback no reembolsa; alta fallida no conserva cuenta nueva.
DíaUTC solo avanza; margen100 no representa saldo globalBrevo y comparte capacidad
con otros usos. No resetear contador para sortear cuota.

Timeout puede dejar aceptación incierta: no reenviar automáticamente. Contrastar
cuenta/invitación antes de reenvío manual. Recuperación202genérico/worker volátil
no garantiza entrega. Activaciónfragmento24h, query legado compatible sin mezclas;
recuperaciónfragmento30min. No copiar enlaces en tickets/capturas.

## Smoke remoto y logs — pendientes

Autorizar antes: HTTPSRender real, cookiesSecure/CSRF, API401/404sin shell HTML,
SPA/recursos/PWA, login/ámbitos, WS entre dispositivos, reinicio/frío/reconexión.
`live` no consultaDB; `ready` compruebaPG sin renovar sesión ni dependerKeyValue.
PérdidaKeyValue degrada avisos; HTTP/PG siguen autoridad. Smoke local no acredita
red/proveedor remoto ni Android físico. PWALAN no migra sola al nuevo origen.
No instalarCA local para Render; offline sigue genérico, sin datos/colas.

Daphne sin accesslog; Django filtra petición/excepción, sin alterar auditoríaDB.
Proxy externo aún puede registrar query **legada** antes del backend: no prometer
borrado de logs ajenos. Fragmentos nuevos evitan enviar credenciales en la URLHTTP.

## Respaldo, rollback y contingencia

Ver [backups](../ops/backups/README.md): copia local adicional cifrada, origen
verify-full/host/base, servicio/passfile privado, dumpcustom y
`restic check --read-data` obligatorio. Repo fueraGit, clave bajo custodia separada.
Inicialización/copia real/horarios/forget/prune requieren autorización.
Restore real: destino loopback reservado/aislado y retenciónC con cierre real
independiente del snapshot. No restaurar sobre activo ni inventar cierre.
Dobles no acreditan backup/restore/RPO/RTO; R2 mantiene puerta costo$0.

Rollback no es simplemente cambiar imagen después de migrar. Confirmar compatibilidad
de esquema con commit anterior, conservar digest/esquema, preparar respaldo autorizado
y ensayar reversión en aislado. No revertir/borrar migraciones/datos por inferencia.
Si no es compatible, detener y acordar recuperación, no experimentar sobre la base.
Mantener entorno local existente como contingencia sintética sin alterar sus
servicios/CA/firewall. Distinguir demo local de despliegue público.

## Cierre

Costo$0 acreditado, configuración/migración/aprovisionamiento autorizados y
verificados, entrega real de correo, HTTPS/WSS/dispositivos, backup/restore y
rollback ensayados, requisito externo resuelto y aceptación explícita.
Ninguna suite local cierra L ni autoriza M/uso clínico.
