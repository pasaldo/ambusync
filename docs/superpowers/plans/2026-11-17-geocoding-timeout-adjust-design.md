# Ajuste de timeout del worker de geocodificación — diseño

## Autoridad y alcance

Responsable autoriza preparar el ajuste local17/11/2026. No autoriza publicar, desplegar, cambiar configuración de Render, ni hacer consultas adicionales a Geoapify sin permiso separado.

Base270d421694b8080ceaf69704579da638b034718d (Render Live). Preservar cambios documentales y scratch existentes.

## Evidencia y problema

Una consulta autorizada desdeRender con dirección pública respondió `deadline_exceeded` en 5.26s, superando el deadline de 5s del worker. Otro caso con dirección pública diferente respondió `ready` en 3.32s. La clave de Geoapify funciona; el fallo se atribuye al agotamiento del plazo, no a credenciales inválidas.

## Contrato propuesto

- Aumentar el `timeout` del worker de geocodificación de 5s a **10s** (valor propuesto, pendiente de confirmación antes de desplegar).
- Mantener el límite de cuerpo 128KiB, HTTPS fijo, TLS verificado, sin redirecciones, proceso aislado, cuota y cooldown actuales.
- No añadir reintentos automáticos. El reintento sigue siendo manual (`retry=true`) y exclusivo de `system_admin`.
- El diagnóstico existente (`deadline_exceeded`, `upstream_timeout`, etc.) se conserva. Un deadline más largo no explica por sí solo la causa; solo da más tiempo a la consulta.
- Sin cambios de UI, permisos, modelos, migraciones ni logs nuevos.

## Límites preservados

- Costo$0: solo cambio de código en el mismo servicio Free.
- No nuevo servicio, add-on, upgrade ni tarjeta.
- Geoapify fuera del alcance de esta corrección; se prepara observabilidad, no se afirma causa raíz ni solución definitiva.

## Próximo paso, no ejecutado

Publicación y despliegue requieren autorización separada. Tras aprobar el valor del timeout y desplegar, cualquier consulta real de verificación requiere permiso explícito.