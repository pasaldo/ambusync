# Diagnóstico seguro de geocodificación

## Autoridad y alcance

Responsable autoriza preparar diagnóstico local17/11/2026. No autoriza publicar,
desplegar, cambiar configuración, repetir consultas reales ni ampliar plazo/cuota.
Base866898671c6bc034f968bb0a92e1fc51dd5da000; preservar cambios documentales y scratch.
Acuerdos: ETAPA_0/ETAPA_1 y límites de geocodificación institucionalJ.

## Evidencia y objetivo

Una consulta autorizada desde navegadoroperador respondió200/2449ms/5candidatos.
Solicitudes anteriores desdeRender devolvieronunavailable en5273–5515ms.
Compatible con deadline5s, no prueba causa DNS/TLS/conexión/CPU.
El diagnóstico no es una reparación ni garantiza ubicación.

## Contrato propuesto

- Mantener HTTPS fijo, TLS verificado, sin redirecciones, límite128KiB,
  proceso aislado, deadline total5s, cuotas/cache y reintento manual actuales.
- Worker devuelve éxito con JSONdelproveedor como ahora, o un sobre de error
  controlado por aplicación. Nunca incluir texto de excepción, URL, dirección,
  clave, cuerpo/headers del proveedor ni datos de usuario en el sobre.
- Clasificación cerrada: `deadline_exceeded`, `dns_error`, `tls_error`,
  `connection_error`, `upstream_timeout`, `http_rejected`, `invalid_response`,
  `worker_failure`, `cached_unavailable`. HTTP incluye solo estado entero100–599.
- Padre valida el sobre y crea excepción tipada con código seguro; el agotamiento
  del deadline conserva compatibilidad con TimeoutError y mata/espera al hijo.
- RespuestaPOST `/api/v1/system/geocoding/` añade `diagnostic` opcional únicamente
  si statusunavailable. Mismos permisos exclusivossystem_admin y no-store.
  No cambio de UI, mensajes públicos, rol institucional o endpoints.
- Diagnóstico nuevo solo en memoria de la solicitud que realmente falló. Sin
  migración, persistencia ni cambios en candidates; consultas cacheadas reportan
  `cached_unavailable`, sin inventar causa ni volver a consumir cuota.
- Un deadline total no permite distinguir arranque/CPU de red: el código lo dice,
  no atribuye toda demora aGeoapify. No habilitar logs deDaphne/supervisor.

## Aceptación

Dobles de red y procesos sintéticos: DNS/TLS/timeout/rechazoHTTP/JSONinválido/
respuesta demasiado grande/muertehijo/sobre manipulado. Sembrar excepción con
canarios de clave y dirección y comprobar ausencia enstdout/stderr/respuesta.
Proceso lento real verifica terminación; caché no crea otra salida ni reserva.
API deniega anónimo y rolesajenos. Éxito conserva candidatos/confirmación.
Suitebackend completa enDBTESTcontenedorizada, Ruff/check/OpenAPI y regressionesJ.
No usar .env/PGdesarrollo/APIkeyreal ni redGeoapify en pruebas.

## Puertas posteriores

Plan y ejecucióninline aprobados; preparación local verificada. Publicación/deploy
requieren autorización separada. Después de desplegar, cualquier consulta real
diagnóstica requiere permiso explícito; revisar categoría antes de proponerfix.
