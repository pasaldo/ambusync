# Buzón de pruebas privado en Render — diseño

## Estado y autoridad

El responsable eligió sustituir temporalmente la entrega real por un buzón de
pruebas, aceptó perder mensajes al reiniciar Render y aprobó el diseño funcional
el17/11/2026. Esto autoriza preparar el plan, no implementarlo/publicarlo/desplegarlo.
Los detalles técnicos siguientes concretan esa propuesta para revisión del plan.

Posteriormente aprobó el plan y la ejecucióninlineTDD con una revisiónfinal:
implementación verificada localmente, sin publicación ni deploy. Ver
[evidencia](../../PRUEBAS_BUZON_PRUEBAS.md) y
[revisión](../../REVISION_BUZON_PRUEBAS.md).

No afirmar resuelto el503: se confirmó `activation_delivery_unavailable`, pero
no su causa interna completa. AllowlistBrevo fue corregida y el503 persistió.
Geoapify y el mensaje de error oculto son problemas distintos; no diagnosticar
ni llamar a Geoapify dentro de este trabajo.

## Contrato funcional

- Mailpit real captura activación y recuperación; no es correo entregado en Internet.
- Se aceptan destinatarios ficticios válidos sintácticamente. Recomendar
  `example.invalid`, nunca inventar direcciones de terceros en dominios reales.
- Cuenta personal, enlace temporal de un uso y contraseña elegida por su titular
  siguen siendo obligatorios; no autoactivar ni asignar contraseñas compartidas.
- Buzón privado para el operador técnico, con credencial independiente de Django.
  Quien accede puede usar los enlaces de todas las cuentas sintéticas: esa
  capacidad debe advertirse explícitamente. No concede grupos clínicos a system_admin.
- Funciones necesarias: listar, abrir, consultar destinatario/contenido, abrir
  enlace de activación/recuperación y borrar mensajes. No se promete habilitar
  todas las herramientas auxiliares de Mailpit.
- Mensajes temporales, máximo100 y edad máxima24h. Reinicio/suspensión/redeploy
  puede vaciarlos; PostgreSQL conserva cuentas y tokens con sus plazos actuales.
- Debe poder reenviarse explícitamente la activación de la primera cuenta
  institucional pendiente, aun cuando todavía no haya administrador institucional
  activado. Reenvío rota el token anterior; no duplica cuenta/institución.
- No reenvíos automáticos, fallback a Brevo, relay, forwarding, webhook, comprobación
  automática de enlaces ni consultas externas desde contenido del correo.
- Rotular éxito como «capturado en buzón de pruebas», no «correo entregado».
- Si Mailpit no acepta el mensaje, mantener rollback de alta y error visible.

## Arquitectura propuesta

Un solo WebServiceFree existente, sin segundo servicio/disco/dominio/plan:

1. Caddy escucha el único puerto público Render y conserva el origenHTTPS.
2. `/buzon-pruebas/` dirige a Mailpit real con webroot bajo ese prefijo, después de
   autenticaciónBasic propia sobreHTTPS; todo el resto dirige al Daphne existente.
3. MailpitUI8025, SMTP1025 y Daphne8000 escuchan solo127.0.0.1 dentro del contenedor.
4. SMTPDjango se fija a ese loopback en modo explícito `mailpit`; no se admite host
   configurable ni se heredan variablesSMTP/MP_* ambientales.
5. SupervisorPythonPID1 prepara DB con las guardias existentes, inicia los tres
   hijos sinroot/shell, comprueba disponibilidad y los cierra al recibirSIGTERM.
   Si muere un hijo, termina la unidad; no bucle de reinicios que oculte fallos.
6. La configuración actualBrevo sigue siendo el valor predeterminado del perfil.
   `AMBUSYNC_MAIL_MODE=mailpit` selecciona el nuevo modo solo en despliegue sintético
   explícito; un valor desconocido o configuración insegura impide arrancar.

La credencial del buzón usa usuario fijo`operador` y hashbcrypt en variable privada
`AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH`. Contraseña mínima20caracteres, elegida
privadamente y no guardada enGit/argv/logs. Generación/verificación local del hash
no autoriza cargarlo enRender todavía. CaddyHTTP interno no confía en cabeceras de
identidad aportadas por el cliente; normalizar esquema haciaDjango desde la
configuración del origen/proxy confiable, preservar Host y CSRF exactos.

## Seguridad y límites

- BasicAuth cubre UI, API, estáticos y upgradeWebSocket del buzón, sin rutas
  alternativas por normalización, encodedslash, dobleprefijo o path traversal.
- ProxyDjango nunca entrega rutas internasMailpit mediante fallbackSPA.
- Inbox sin caché, sin indexación, Referrer-Policyno-referrer; noServiceWorker/
  localStorage para mensajes o credenciales. No compartir cookiesDjango conMailpit.
- Lista cerrada de rutas/métodos Mailpit necesarios para lectura, marcas de lectura,
  borrado y WS. Denegar sendAPI/release/relay/linkcheck/HTMLcheck/screenshots/
  settings/metrics. Derivar rutas exactas de laAPI de la versión fijada y registrarlas
  en manifiesto antes de implementar proxy; no proxy arbitrario abierto.
- Mutaciones yWS exigen OriginHTTPS exacto además deBasicAuth. CredencialesDjango
  no sustituyenBasicAuth. No cachear Authorization ni mensajes en logs.
- Mailpit yCaddy reciben entornos mínimos; no secretosDB/Geoapify/Brevo. Configs
  temporales con permisos restrictivos, DBMailpittemporal y límites de almacenamiento.
- Fijar versiones/digestsLinuxamd64 deMailpit/Caddy desde fuentes oficiales con
  evidencia de licencia/compatibilidad; no `latest` ni instaladores remotos.
- Mantener límitesRender512MB/0.1CPU/horasFree. Medir consumo en ensayoDocker;
  si no cabe, detenerse y consultar, no contratar ni prometer estabilidad.
- Sin modificar `.env`, reiniciar desarrollo, copiar datos locales ni cambiar
  cuentas existentes. Cero correos reales. Sin cambiosGeoapify ni cierreL por inferencia.

## Recuperar activación tras perder mensajes

Propuesta limitada alprimeradministradorcreado junto a institución:
POST autenticado/CSRF `/api/v1/system/institutions/{id}/resend-first-activation/`.
`system_admin` exclusivo, institución habilitada, identidad del primeradmin
resuelta por evento `system.institution.first_admin_created`, membresía exacta
actual, cuenta pendiente/inactiva sin contraseñautilizable, registro de activación
no consumido (puede haber caducado). No permite elegir correo/usuario/rol ni recuperar cuentas yaactivadas.
Bloqueo y revalidación transaccionales; token anterior invalidado solo si captura
nueva confirma éxito. Reenvío con auditoría administrativa sin token ni email.
Dos solicitudes concurrentes se serializan; un límite de60s persistente sobre
fecha de emisión (`expires_at - 24h`, renovada al reenviar) evita doble captura
inmediata. `created_at` permanece inmutable. Si no cumple precondiciones,
denegar sin efectos ni filtración de datos clínicos.

Botón explícito/confirmado en gestión de instituciones, con capacidadbooleana
delbackend; sin reintento automático ante respuesta perdida. Refrescar estado antes
de decidir otro intento. Este detalle operativo requiere confirmar el plan.

## Criterios de aceptación

Captura real dentro de imagen, listado privado, enlacefragmento del origen público,
activación y login con contraseña personal, recuperación sin autologin, pérdida
del buzón al recrearcontenedor sin pérdidaPG, reenvío seguro de primera activación,
protección anónima/cross-origin/API/WS, cero tráfico de correo externo y parada
controlada. Pruebas sintéticas aisladas primero; Render/manual requieren puertas
de autorización y no se acreditan con mocks.

## Referencias consultadas17/11

- https://render.com/docs/free:750h compartidas,512MB, filesystemefímero,
  sin privateingressFree ni discos/shell, un únicoHTTPpuerto público.
- https://mailpit.axllent.org/docs/configuration/runtime-options/:SMTP/UIloopback,
  webroot, máximos/edad, desactivarversioncheck; relay/forwarding son opcionales y
  deben quedar deshabilitados. Confirmar flags contra versión fijada, no documentación
  `latest` por sí sola.
