# H — legibilidad de auditoría administrativa

Base5597eb9. User solicita revisar todos los eventos administrativos para identificar qué ocurrió, cuenta/unidad afectada y responsable.

## Contrato
- Traducir los12tipos permitidos y filtros a español con títulos inequívocos; distinguir activación de cuenta de habilitar administración o conceder permisos.
- Primer nivel: acción, fechaSantiago, cuenta/unidad afectada, realizado por y resultado legible. IDs/códigoacción/correlación solo en Detalles técnicos desplegables; fallback visible conIDsi la referencia no puede resolverse.
- API enriquece proyección allowlist con `display` actor/cuenta/unidad y basis=current_records. Solo username/código, nunca email/RUT/nombresclínicos/executor. Resolver en lote por página y por institución exacta DEL EVENTO, no unión amplia de instituciones.
- No existen snapshots de nombres históricos: NO inventarlos ni reescribir eventos; aviso explícito de referencias actuales. Cuentas inactivas propias pueden resolverse; si hay membresía activa en otra institución no mostrar usernameactual. Actor externo permanece genérico conID, procesotécnico sin textoexecutor.
- Asignación identifica cuenta+unidad por registro de asignación acotado a institución/unidad del evento; si falta o no coincide, fallback honesto, no usar asignaciónactual.
- Mismos permisos/scope/retenciónC/paginación/snapshot/no-store; sin nuevos eventos ni migraciones/grants/dependencias/datosdesarrollo, publicación/I/J.

## TDD inline/revisión única
1. REDbackend etiquetas propias/cuenta/unidad/asignación/inactiva/procesotécnico/ajena/cambiosreferencia, límitesconsultas y proyección; REDbrowser todoslos12títulos/filtros y detallesreplegados.
2. Implementar enriquecimiento acotado y UIclara; GREEN backend/frontend y regresionesA–H.
3. Verificación completa,390px/detectoruna vez, revisiónindependiente y fixesimportantesRED→GREEN, guía manual y commitlocal.

ReviewFocus: actor ajeno o cuenta trasladada no filtrausername; asignaciónhistórica no confundida con actual; falta de referencia no atribuye acción a cuenta equivocada; nombres actuales no fingensnapshot;12acciones/frontendfiltros/coexistencia y permisos permanecen correctos.

## Cierre técnico
- [x] REDbackend3referenciasausentes y browsertítuloausente observados antes del código.
- [x] Resolveracotado/display y doceacciones/UI/filtros, sin snapshotsinventados ni cambios de permisos.
- [x] Backend254/254 sin keepdb, frontend38unit+18H+15G+12F+6E+30integridad+3correcciones y todasregresionesPASS.
- [x] Checks/Ruff92/OpenAPI/tipos/build/Mermaid3/PSdoblesPASS, captura390/detectoruna vez[].
- [x] Revisiónindependiente única sin hallazgos accionables, docs/estadoactualizados, prepararcommitlocal.
- [ ] Aceptación manual del responsable.
