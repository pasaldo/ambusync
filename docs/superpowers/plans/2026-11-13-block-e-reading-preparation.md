# Bloque E — lectura explícita y preparación de Urgencias

Base `80040c7`, feature/pilot-completion. B/C/D y correcciones aprobados según confirmación del responsable al autorizar E (13/11). C mantiene límite de alcance local, sin nuevo restore real/RPO/RTO. Ejecución inline TDD y una revisión independiente final. Sin merge/push/despliegue ni inicio de F.

## Contrato y límites
- Autoridad: ETAPA_0 D005/D006 sección4 «Lectura y preparación como hitos», ARQUITECTURA_PILOTO y ETAPA_1. Solo sintéticos, sin uso clínico.
- Lectura es acción explícita: abrir detalle, GET/listar, WS o polling no escriben hitos. Solo Urgencias habilitado del destino puede confirmar. Ambulancia consulta, no confirma por ese rol.
- POST `/emergencies/{id}/read/` y `/prepare/`, JSON exacto `{operation_id,expected_version}`;200 episodio completo,400 entrada,403 perfil,404 ámbito,409 estado/versión/prerrequisito. Preparación exige lectura.
- Nuevas acciones solo notificada/en_traslado; después de llegada/cancelación/cierre no inventar hitos. La llegada nunca requiere ni genera lectura/preparación. No cambian estado de traslado ni fechas existentes.
- Campos nullable Emergency read_at/read_by, prepared_at/prepared_by, fechas servidor y primer autor/fecha inmutables. Datos anteriores permanecen null; no inventar historia. Restricciones DB de pares autor/fecha y preparación implica lectura.
- Versión aumenta solo al registrar hito por primera vez. Misma operación confirmada replay exacto dentro de ámbito, aun después de llegada, sin duplicar versión/auditoría/avisos. Nuevo UUID con versión vigente sobre hito ya registrado es no-op: conserva primer autor/fecha y reserva UUID en ProcessedOperation, sin segunda auditoría/aviso. UUID reusado con otro cuerpo/acción/episodio409. Versión obsoleta de UUID nuevo409 (incluido segundo operador); refrescar y decidir manualmente.
- Reusar transacción/locks/idempotencia de EmergencyTransitionView. El retorno explícito False de apply_transition representa no-op confirmado; None conserva semántica de las acciones existentes. Responder cabecera Milestone-Already-Recorded para no-op e Idempotent-Replay para replay.
- Auditar emergency.read_confirmed / emergency.preparation_recorded con actor/destino/unidad/correlación y WS minimalista postcommit; API autoridad.
- SPA detalle receptor ofrece botones explícitos, preparación deshabilitada antes de lectura, acciones congeladas por intento incierto. No autoconfirmación. Reusa intentos A/validación de identidad y memoria de ámbito; E permite respuesta de igual versión únicamente con hito autor/fecha válido confirmado. Respuesta incorrecta sigue incierta.
- Ambulancia muestra hitos solo consulta. Textos distinguen primera lectura y preparación; preparación no acredita box disponible ni inicio de atención, ni se afirma lectura de cada revisión posterior. Fechas nuevas presentadas America/Santiago.
- No nueva cola duradera/autoenvío ni datos en localStorage. C retiene hitos con su episodio y auditoría por plazo global. F deberá crear reemplazos sin copiar hitos (no se implementa aquí).
- No cerrar piloto, purgar/restaurar, aplicar migraciones a desarrollo ni modificar servicios ajenos. Migración se prueba con DB efímera; guía dará instrucciones para aplicarla.

## Review Focus
- Dos lectores/preparadores simultáneos: primer autor/fecha preservados y un solo cambio por hito; versión/prerrequisitos serializados.
- Llegada vs lectura/preparación: no hitos retrospectivos y llegada sin hitos válida.
- No-op de otro UUID reserva operación sin afectar acciones existentes; replay luego de estado avanzado no rompe la validación frontend.
- GET/abrir detalle/WS no envían POST, operador no puede confirmar, ámbitos revisados antes de replay.
- Respuestas tardías/CSRF/scope/versión vieja no confirman otro episodio ni otro usuario. Textos no confunden envío, lectura y atención.

### Task1 — backend y contrato
- [x] RED permisos/estado/lectura explícita/prerrequisito/primeros autores/replay/no-op/versión/auditoría.
- [x] Modelo/migración, endpoints y soporte no-op base sin cambiar acciones previas; serializers/representación/avisos/OpenAPI.
- [x] PostgreSQL concurrente y GREEN, compatibilidad C/D y regresiones.

### Task2 — SPA
- [x] RED detalle sin autolectura, botones lectura/preparación, confirmación visible emisor, incertidumbre y versión sin incremento en no-op.
- [x] UI integrada con memoria/intentos A y avisos HTTP/WS; receptor autorizado, operador solo consulta.
- [x] GREEN unitarias/browser y regresiones anteriores.

### Task3 — cierre
- [x] Suite backend sin keepdb, checks/migraciones/Ruff/OpenAPI y PS restore; frontend completo/tipos/build/Mermaid.
- [x] Revisión independiente sin críticos/importantes; menores documentados en PRUEBAS_E.
- [x] Registrar aprobación BCD/correcciones, estado E manual pendiente y guía PRUEBAS_E.md de arranque/casos. Cambios preparados para commit local acotado, sin publicar.
