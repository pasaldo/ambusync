# Bloque I — recuperación de cuenta y verificación de identidad

**Estado:** funcionamiento completo aprobado por el responsable el14/11/2026 («apruebo ese funcionamiento») tras elegir **Soporte técnico (Recomendado)** paraD-013. Implementación local con TDD en curso, migraciónaccounts0005 generada/aplicada solo por runner en testDB, no a desarrollo. Base958f7fe; no nueva publicación.

## Base aprobada

- Plan maestro `2026-11-12-pilot-completion.md`: I es recuperación30min, revocación y D-013; J es GPS y no se inicia.
- ETAPA_0: respuesta pública genérica, enlace de un uso/30min, invalidación de sesiones al restablecer contraseña, sin autologin. Administración puede iniciar recuperación, nunca consultar ni establecer contraseña compartida.
- D-013: pérdida de correo exige contacto institucional previamente registrado y registro de verificador/método/fecha/resultado. Sin preguntas secretas ni cambio a correo no verificado.
- Correo de pruebas: Mailpit local; ningún proveedor, remitente, dominio o envío externo autorizado. Datos sintéticos exclusivamente.

## Hallazgos de la base

- `User` tiene correo único no vacío por comparación sin mayúsculas y `session_version`; no tiene contacto alternativo de recuperación ni registro de verificación de identidad.
- `AccountActivation` conserva tokenhasheado/unuso24h; la activación no es recuperación y no debe reutilizarse para activar cuentas deshabilitadas.
- `revoke_user_sessions` incrementa versión y registra `SessionRevocationEvent`; HTTP y WebSocket comprueban versión. Los eventos WS revalidan antes de entregar; no hay todavía señal específica de recuperación para cierre inmediato de suscripción inactiva.
- D-013 no tiene modelo/procedimiento/pantalla implementados. Institución tiene email/teléfono de configuración, pero eso no acredita un contacto de recuperación previamente verificado para cada caso.
- Administración institucional gestiona cuentas dentro de sus ámbitos aprobados; no existe delegación web para cambiar correos de recuperación.

## Propuesta funcional común

1. Login ofrece «Olvidé mi contraseña». Solicita el correo registrado y responde siempre de forma genérica, exista o no una cuenta habilitada. Limitar solicitudes/confirmaciones sin enumerar cuentas.
2. Entregar por Mailpit un enlace de un solo uso y30min al correo registrado de la cuenta elegible. No guardar token en claro ni exponerlo en respuestas API/logs; no usar Host recibido para construir enlaces.
3. Pantalla para nueva contraseña y confirmación, con reglas existentes15–128caracteres. Validar enlace, caducidad, uso previo, estado de cuenta y ámbito también al consumirlo.
4. Cambio de contraseña y revocación de sesiones en una transacción; invalidar otros intentos de recuperación. No activar cuentas deshabilitadas, añadir roles ni cambiar unidad/institución. No autologin.
5. Completar cierre/denegación de sesiones HTTP/WS anteriores y revalidación de memoriaA después de recuperar, sin reenviar operaciones ni mostrar datos bajo otra cuenta.
6. Administración puede solicitar envío de recuperación de cuentas que ya puede gestionar; no recibe enlace/contraseña ni obtiene una nueva vía de gestión de cuentas ajenas.
7. Auditoría mínima legible para operaciones administrativas permitidas, nunca enlaces/tokens/contactos completos/contraseñas. RetenciónC, separación de clínica y scopesH se conservan.

## Decisión confirmada — D-013 solo por soporte técnico

**El responsable eligió soporte técnico controlado.** La verificación y eventual sustitución del correo no se delegan en el panel de Urgencias. Un procedimiento técnico local exige contacto institucional registrado previamente, constancia de verificador/método/fecha/resultado y confirmación del correo nuevo antes de completar recuperación. No se introducen contraseñas por el responsable.

**Alternativa no elegida:** delegación web institucional de sustitución de correo. No se implementará ni aprovisionará un permiso web de esa naturaleza.

En ambas alternativas, no disponer de contacto previo verificable NO se resuelve creando uno al momento, adivinando datos, aceptando un correo propuesto sin comprobarlo o reutilizando activación. El caso se bloquea y escala al responsable técnico.

### Procedimiento técnico propuesto

1. Contacto de recuperación registrado de antemano mediante aprovisionamiento técnico controlado, con procedencia institucional. Es configuración de seguridad, no membresía ni permiso clínico. No autocompletar desde el correo/teléfono genérico de la institución ni dar por verificados contactos legados.
2. Abrir un caso técnico ligado a la cuenta y al contacto previo vigente. No admitir el alta/cambio del contacto durante el mismo caso para eludir la verificación.
3. El responsable humano verifica por ese contacto; registrar verificador, método permitido, fecha servidor y resultado aprobado/rechazado. La aplicación registra esa comprobación declarada, no certifica que una llamada o comprobación externa realmente ocurrió. No almacenar relatos clínicos ni preguntas/respuestas secretas.
4. Si se aprueba y el estado/ámbito de la cuenta sigue siendo el autorizado para el caso, enviar confirmación al correo nuevo propuesto usando Mailpit. No modificar todavía el correo registrado ni establecer una contraseña por el soporte.
5. Solo la persona que recibe el enlace nuevo puede confirmar su correo y establecer contraseña propia, con el mismo límite30min/unuso. En una transacción se consume la autorización, se confirma el cambio, se cambia la contraseña y se revocan sesiones/intentos anteriores. Cualquier fallo deja sin aplicar el cambio; un caso rechazado, vencido, ya usado o con contacto/ámbito invalidado no concede recuperación.
6. Sin contacto previo o verificación válida, no hay recuperación D-013 habilitada. Escalar a un procedimiento de infraestructura separado, no ofrecer bypass desde web ni inventar una verificación para cumplir la demo. El flujo no atribuye administración clínica a system_admin ni a soporte.

### Controles de enlaces y revocación

- Enlaces desde origen frontend configurado, nunca desde Host aportado por la petición. No autoredirecciones externas.
- Tokens aleatorios almacenados solo como digest, ligados a cuenta/correo/versión y propósito; no reutilizar invitaciones24h. Enlaces nuevos invalidan los anteriores conforme al contrato de reemisión.
- El secreto del enlace viajará en fragmento de la URL hacia la SPA y se retirará de la barra al cargarlo en memoria, sin persistencia web ni parámetros de token en logs HTTP. Confirmaciones porPOST con CSRF y respuestas privadas/no-store; enlaces/contraseñas/contactos completos no se incluyen en auditoría administrativa.
- Recuperación no reactiva cuentas, amplía grupos o cambia asignaciones. Revalidar elegibilidad al solicitar y al consumir, no solo en frontend.
- Tras completar, salir al inicio de sesión sin autologin ni mostrar memoria clínica de otra identidad. Conservar las reglasA de reautenticación y resolución de intentos confirmados, nunca autoenviar.
- HTTP sigue validando versión en servidor y WS antes de entregar eventos. Añadir aviso de control de revocación sin información clínica para cerrar suscripciones antiguas, también sin eventos clínicos nuevos; ese aviso no reemplaza la autoridadDB ni promete entrega de red infalible.

## Límites y siguientes pasos

AutoridadD-013 y funcionamiento completo aprobados. Plan técnico `2026-11-14-block-i-recovery.md`, TDD backend/PostgreSQL y frontend, carreras/seguridad/replaysA–H, revisión independiente final, guía manual y evidencia local. Cualquier modelo/migración nuevo se prueba primero solo en testDB; no aplicar a desarrollo ni aprovisionar contactos/permisos/datos reales por inferencia. Sin nuevo push, merge, despliegue, servicios externos ni inicioJ–M.
