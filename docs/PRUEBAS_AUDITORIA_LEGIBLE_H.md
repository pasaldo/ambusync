# H — auditoría administrativa comprensible

Solicitud posterior a5597eb9. Corrige legibilidad, no amplía permisos ni alcance del histórico.

## Qué debe mostrar

Antes: códigos como `account.created`, Actor12, Objetoaccount12 y UUID.

Ahora, cuando se puede resolver dentro de la institución:

> **Cuenta creada — Confirmado**
>
> Fecha del evento
>
> Cuenta afectada: `urgencias_sintetica`
>
> Realizado por: `admin_sintetico`
>
> Detalles técnicos (desplegable)

Se utilizan nombres de usuario (no correos ni nombres clínicos) y códigos de unidad. **Son referencias actuales**, no nombres guardados en la fecha del evento: los registros previos no conservaron esas instantáneas. No se reescriben ni se inventan datos históricos. Si falta una referencia o su cuenta tiene membresía activa en otra institución, aparece un aviso genérico conID cuando corresponde. Los procesos técnicos se identifican como tales, sin revelar el executor del servidor.

| Evento visible | Qué ocurrió |
|---|---|
| Cuenta creada | Se creó la cuenta indicada. No significa que se activó. |
| Cuenta activada | Se activó la cuenta indicada. |
| Invitación de activación reenviada | Se volvió a enviar su invitación; no implica activación. |
| Cuenta desactivada | Se desactivó la cuenta, sin borrar historial. |
| Unidad creada | Se registró la unidad indicada. |
| Unidad desactivada | Se desactivó la unidad, sin borrar historial. |
| Unidad asignada a una cuenta | Se inició la asignación entre esa cuenta y esa unidad. |
| Asignación de unidad retirada | Terminó esa asignación; no implica desactivar cuenta o unidad. |
| Administración institucional habilitada | Se concedió el rol administrativo; no es activación de cuenta. |
| Permiso para gestionar síntomas concedido | Se concedió ese permiso adicional. |
| Permiso para desactivar pacientes concedido | Se concedió ese permiso adicional. |
| Permiso de informes concedido | Se concedió acceso adicional a informes. |

Cada evento distingue la cuenta/unidad afectada del responsable. Las asignaciones usan el registro de asignación del evento, **no la unidad asignada actualmente** a la cuenta. Los nombres/códigos de esos registros sí son actuales y se advierte en pantalla.

## Prueba manual sencilla — pendiente

En http://127.0.0.1:5174/local, solo datos ficticios:

1. Entrar como administración institucional de Urgencias y abrir Auditoría administrativa.
2. Buscar una creación y una activación existentes: verificar que se reconoce **qué cuenta** corresponde a cada una y **quién realizó** la acción. Comparar con losIDs al abrir Detalles técnicos si hace falta.
3. Revisar asignaciones/unidades/permisos existentes usando la tabla anterior. No conceder permisos ni crear datos solo para generar todos los eventos. Si no hay ejemplos de alguno, marcar no probado.
4. Abrir/cerrar Detalles técnicos: códigos, IDs, resultado técnico y correlación deben conservarse, pero ocultos inicialmente.
5. Usar el filtro Acción administrativa: sus opciones deben estar en español. Fecha/tipo/paginación conservan comportamiento y ámbito; solo acciones administrativas propias, sin datos clínicos.
6. Si aparece Proceso técnico o referencia no disponible, no se atribuye automáticamente a una persona. No debe mostrarse el nombre de usuario de otra institución ni texto técnico del servidor.
7. Revisar móvil/ventanaestrecha: títulos, cuenta, responsable y detalles largos legibles sin desborde horizontal.
8. Urgencias sin rol administrativo no obtiene auditoría por esta mejora. Archivo e informes conservan permisos separados.

Responder: «Auditoría legible aprobada» y navegador/dispositivo realmente usados, o indicar evento y observación. Esto no aprueba automáticamente todoH.

## Evidencia y límites

**Verificación local completa, aceptación manual pendiente.** Pruebas RED antes de código: metadatos legibles ausentes en backend y título español ausente en browser. Cobertura de doce acciones/filtros, datos técnicos replegados, referencias locales/inactivas/trasladadas/procesotécnico, asignaciones históricas y consultas en lote. Frontend38unit+18H+15G+12F+6E+30integridad+3correcciones, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. Menores previosH sin cambios: apertura inicial de auditoría para administrador no clínico y aviso de bundleprincipal>500kB.

- Backend **254/254** sin keepdb, incluidas8pruebas de auditoría y batch4consultas verificadas. Checks/Ruff/formato92archivos/makemigrations/OpenAPI PASS.
- Revisión independiente estática única: sin hallazgos accionables; no acredita ejecución/runtime/dispositivos ni rendimiento.
- Captura390px de12acciones con detallesreplegados/desplegados inspeccionada, sin desborde; detectoruna vez sin hallazgos.
- PSrestore PASS solo dobleslocales, no restauraciónreal. Daphnepropio reiniciado para cargar proyección; auth/audit401esperadossinsesión y SPA200, no aceptación autenticadareal.

Sin nuevas migraciones, modelos, dependencias, grants/datosdesarrollo, push/merge/despliegue ni inicioI/J. No acredita uso clínico ni dispositivos reales. Menores previosH (apertura inicial de auditoría y warningbundle) fuera de esta corrección.
