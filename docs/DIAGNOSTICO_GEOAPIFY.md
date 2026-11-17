# Diagnóstico seguro de Geoapify — preparación local17/11/2026

## Estado y alcance

Implementación local autorizada, no publicada ni desplegada. No corrige todavía
la causa del fallo observado enRender. Sin consultas reales durante implementación,
claves reales, migraciones, dependencias nuevas ni cambios de configuración.

Diseño y plan:
[contrato](superpowers/plans/2026-11-17-geocoding-safe-diagnostic-design.md) ·
[ejecución](superpowers/plans/2026-11-17-geocoding-safe-diagnostic-implementation.md).

## Qué se añade

Cuando una consulta realmente ejecutada falla, POST
`/api/v1/system/geocoding/` puede devolver:

```json
{
  "status": "unavailable",
  "diagnostic": {"code": "http_rejected", "http_status": 403}
}
```

Ejemplo parcial; se conservan lookup_id/candidates/attribution del contrato.
Solo system_admin exclusivo, autenticado, mismas guardias y no-store.
No expone claves, direcciones, URLdelproveedor, headers/cuerpos de error,
texto/tipo de excepciones, ni habilita logsDaphne o delsupervisor.
Las direcciones/candidatos legítimos del flujo original siguen su contrato:
esta mejora evita añadirlos al diagnóstico, no los elimina del flujo de ubicación.

| Código | Evidencia que representa |
|---|---|
| `deadline_exceeded` | Proceso superó deadline total5s; terminado y esperado. No distingue CPU/arranque de red. |
| `dns_error` | Worker recibió error de resolución DNS tipado. |
| `tls_error` | Worker recibió error SSL/TLS tipado. No se desactiva validación. |
| `connection_error` | Error de E/S/conexión tipado; no se inventa causa más precisa. |
| `upstream_timeout` | Timeout tipado del transporte dentro del worker. |
| `http_rejected` | HTTPerror, incluyendo redirección rechazada; solo estado entero100–599. |
| `invalid_response` | JSON/estructura inválida o cuerpo demasiado grande. |
| `worker_failure` | Fallo de proceso/protocolo o excepción no clasificable; sin detalle libre. |
| `cached_unavailable` | Fallo previamente guardado sin diagnóstico persistido; no consulta nueva. |

El diagnóstico es efímero en la respuesta de la solicitud que falla. No se
guarda en candidates, no requiere modelo/migración, no inventa causas de fallos
anteriores. Una lectura posterior puede mostrar cached_unavailable.
No cambia UI: mensaje genéricoactual se conserva y la categoría se inspecciona
en respuestaNetwork cuando se autorice una prueba remota.

## Límites preservados

Deadline5s, HTTPSfijo/TLS/sinredirecciones, máximo128KiB, cuota y cooldown,
confirmaciónmanual, cache y ausencia de reintentos automáticos intactos.
Si el resultado es deadline_exceeded, sigue siendo necesaria investigación:
no basta ese código para aumentar el plazo ni para culpar al proveedor.
No abrirlogs generales ni copiar respuesta completa en un ticket.

## Evidencia local

- Base previa: deadline existente1/1PASS, sinDB.
- REDtransporte:16fallos de aserción por diagnósticoausente; GREEN5/5 con
  deadlineexistente. Procesos reales desechables/dobles de transporte, sinred.
- REDAPI:3fallos por campo diagnósticoausente; GREEN20/20geocodingincluyendo
  carreras/deadline y nuevas pruebas. PGTESTcontenedorizado, no PG55432.
- REDadicional: respuestaexit0 simulando sobredeerror no debe atribuirse alworker;
  corrección discrimina exitcode y payloadcerrado. Sobres con códigolista,
  campos extra, estado booleano o textoarbitrario rechazados sin filtración.
- Suitebackend:398tests,397PASS/1skipWindows de symlink,113.829s en la
  repetición final; primera pasada112.119s también aprobada.
- FrontendGPS/geocoding/Mailpit:23/23PASS con transporte sintético; sinGPSreal.
- Ruff/check/OpenAPI/diffcheckPASS después de corregir cuatro advertenciasRuff
  (imports, concatenación de fixture, captura demasiado amplia en test, with).
- Canarios sintéticos de clave/dirección ausentes de stdout/stderr de fallo y
  respuestaAPI. Caché no consume nueva cuota; permisos siguen denegando accesoajeno.

## Revisión y decisiones

Auto-revisión del autor, no revisión independiente: usuario eligió sin subagentes.
Cambios se dejan locales sin commit porque el plan no incluyó paso decommit;
trabajo documental y scratch anteriores se preservan. Riesgos: no segunda
perspectiva de seguridad y versión nueva todavía no fijada porcommit.
No se han probado estas categorías en la imagen real o enRender; pruebaunitaria
de procesos no acredita rendimiento en0.1CPU ni conectividad del proveedor.

## Próximo paso, no ejecutado

Publicación y despliegue de una versión exacta requieren autorización separada.
Tras ello, pedir autorización de una consulta manualcontrolada, sin reintentos.
Compartir solo `diagnostic.code`, `http_status` si existe y duraciónobservada.
Si aparece cached_unavailable, no forzarconsulta ni borrarcache/cuota sin permiso.
No renovar claves, cambiar timeout/planRender ni declarar Geoapify corregido
hasta obtener evidencia de la causa y verificar su corrección.

## Promoción autorizada posteriormente

Responsable autorizó crearcommits/publicar enramaactual/desplegar esta versión.
Código registrado en `2104950906c97038484a9470f7a719b0b6a06b79`;
suite completa repetida antes de publicación:398tests/397PASS/1Windows-skip,
118.429s. ServicioRenderFree/autodeployOff/healthready/repo-rama correctos
revalidados. Publicación/deploy en curso, sin consulta nueva autorizada ni
causaGeoapify identificada por el diagnóstico todavía.

Posteriormente publicado270d421694b8080ceaf69704579da638b034718d y desplegado
enRender: deploydep-dbuav8cipgvc73e2j1pg **Deploy succeeded|Live** verificado.
Healthlive/ready200 y API/buzónprotegidos confirmados; sin consulta nueva aGeoapify.
La categoría del fallo remoto todavía requiere una consulta controlada autorizada.

## Consulta remota autorizada posterior —17/11

Responsable autorizó una consulta controlada desdeRender. Dos intentos previos
recibieron401 por sesión ausente en navegadorintegrado: no alcanzaron lookup ni
proveedor. Responsable inició sesión en pestaña integrada; GETauthme200
confirmado antes de continuar. Una sola consulta geocoding autorizada con
dirección pública institucional respondióHTTP200/statusready/cinco candidatos
en3323ms. Sin seleccionar coordenadas, modificar ni guardar instituciones.
No se devolvieron claves/cookies/direcciones/coordenadas en salida diagnóstica.

Este resultado acredita éxito de esa consulta desde backendRender y no genera
código de fallo. No explica la causa histórica deunavailable ni acredita que
otra dirección funcione o que los fallos cacheados hayan cambiado. No repetir
automáticamente, borrarcache o aumentar timeout por esta evidencia. La clave,
el TLS y el límite5s existentes pudieron completar este caso.

## Ajuste de timeout preparado localmente —17/11, sin desplegar

Usuario autorizó preparar el aumento del worker timeout de geocodificación de
5s a 10s. Cambio solo en código local, sin reintentos automáticos, sin cambio
de cuota, sin nuevo servicio ni add-on. RED→GREEN: pruebas de timeout offline
pasan con el nuevo valor. Suite completa pendiente de Docker para verificar
antes de publicar. No se desplegó ni se hará sin autorización separada. El ajuste
no garantiza por sí solo que la dirección original falle menos; solo da más
tiempo al worker.
