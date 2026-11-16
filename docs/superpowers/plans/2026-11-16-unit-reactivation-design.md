# Reactivación de unidades — contrato aprobado

El responsable confirmó el 16/11/2026:

- Mostrar unidades desactivadas en administración institucional, en web y PWA.
- Permitir «Reactivar unidad» con los mismos límites institucionales que la baja.
- Conservar identidad e historial; registrar la reactivación en auditoría.
- Volver a ofrecer la unidad en asignaciones sin restaurar operadores anteriores.

## Contrato técnico

Reutilizar `Ambulance.enabled`; sin modelos, migraciones ni dependencias nuevas.
Agregar POST `management/ambulances/<uuid>/reactivate/` con cuerpo `{}`, sesión
y CSRF vigentes. Responder204 al quedar habilitada, incluso si ya lo estaba.
Auditar `ambulance.reactivated` solo cuando cambia de desactivada a habilitada.
No reactivar instituciones deshabilitadas ni recuperar sesiones o asignaciones.

Revalidar los mismos permisos y ámbito que la baja bajo transacción; conservar
el orden de bloqueo usuario → unidad. La repetición no duplica auditoría ni
asignaciones. No convertir la baja existente en un toggle.

La administración solicitará `include_disabled=true`. Mantener el valor por
defecto de la API en false y filtrar `enabled` en todos los selectores operativos.
La capacidad de reactivar debe ser explícita en la respuesta y validada en backend;
no basta ocultar el botón. Se admite administrar operadoras vinculadas según las
reglas actuales, no un directorio global.

Confirmación antes de reactivar, controles bloqueados durante operación y refresco,
y errores/expiración/respuestas tardías tratados como en la gestión actual.
Tras fallo de transporte, exigir refresco antes de decidir otra acción; nunca
anunciar éxito por una respuesta perdida ni reintentar automáticamente.

## Límites

Solo piloto sintético. No activar unidades reales de desarrollo como prueba, no
cambiar cuentas/asignaciones/datos existentes, no migrar, no reiniciar servicios
sin autorización específica. Sin push, merge, despliegue público ni inicio L–M.
Preservar las correcciones móviles previas no confirmadas mediante commit.
