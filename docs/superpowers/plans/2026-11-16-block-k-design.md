# Bloque K — PWA instalable, móvil y actualización segura

**Estado:** comportamiento confirmado por el responsable el16/11/2026; implementación K todavía no iniciada.
**Autoridad:** inicio K solicitado por el responsable tras aprobar J y publicar9595223.
**Fuentes:** ETAPA_0, ETAPA_1 y plan maestro2026-11-12-pilot-completion.

## Objetivo

Instalar AmbuSync como aplicación web con conexión, conservando autenticación,
permisos y autoridad HTTP/PostgreSQL. No habilitar persistencia clínica offline.

## Propuesta

1. Manifest con nombre AmbuSync, iconos locales adecuados, modo standalone y
   entrada al acceso autenticado existente. Instalar no concede acceso ni inicia sesión.
   Instrucciones de instalación según capacidades del navegador; no prometer un
   diálogo programático en plataformas que no lo ofrecen.
2. Service worker limitado al comportamiento público necesario. Nunca almacenar
   respuestas API, cuentas, episodios, GPS, informes, auditoría, recuperación ni
   solicitudes de escritura. Sin colas offline ni background sync de mutaciones.
   Cualquier caché estática será de recursos públicos explícitos, versionada y acotada;
   no aplicar reglas generales de cache-first a rutas de aplicación.
3. Sin conexión: mensaje explícito, sin presentar una escritura como confirmada,
   sin reenvío automático ni información clínica persistida. La instalación no
   promete que la aplicación sea utilizable offline.
4. Actualización disponible: aviso no intrusivo y acción explícita. No forzar
   recarga, skipWaiting o cambio de controlador que descarte formularios,
   intentos inciertos o seguimiento activo. Resolver operaciones pendientes antes
   de actualizar; advertir sobre borradores solo en memoria. Coordinar pestañas
   o conservar la versión anterior hasta un momento seguro.
5. Adaptación móvil enfocada en los flujos reales /local y /sistema:
   zoom permitido, formularios legibles, controles utilizables, foco y errores
   accesibles, sin desbordes en móvil/tablet. No rediseñar ni ampliar funciones.
6. GPS sigue opt-in y de primer plano: instalar la PWA no garantiza rastreo con
   pantalla bloqueada ni reanudación automática.

## Evidencia y aceptación

- Tests de manifest/iconos, ámbito y exclusión de caché protegida.
- Navegador sobre build servido localmente: instalación cuando sea verificable,
  actualización entre versiones, pestañas, borradores/intentos inciertos, logout,
  pérdida de conexión y ausencia de datos protegidos en Cache Storage/IndexedDB.
- Regresión de integridad/sesiones y flujos móviles existentes; tipos y build.
- Verificar comportamiento del service worker en build, no inferirlo desde Vite dev.
- Aceptación manual de instalación en dispositivo y origen HTTPS pendiente;
  localhost solo prueba el entorno local, no acredita el celular.

## Límites

Sin despliegue, túneles, contratación, push/merge nuevos ni inicio L/M.
Sin dependencias nuevas por defecto; justificar cualquier necesidad antes de añadirlas.
Incidencia PostgreSQL del16/11 separada y todavía sin nueva suite backend verde
acreditada. No repetir suites simultáneas sobre la misma base de pruebas.

**Decisión confirmada:** actualización explícita y diferida hasta resolver
operaciones pendientes, nunca actualización/recarga automática durante el trabajo.
