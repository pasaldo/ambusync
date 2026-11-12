# Bloque C — retención desde cierre formal y restauración aislada

> Ejecución inline, TDD y revisión independiente final. Base `33909a7`, feature/pilot-completion. B queda con aceptación manual pendiente en PRUEBAS_B.md.

**Goal:** alinear retención con D-010/D-011 y evitar reaplicar retención sobre una base distinta de la restaurada.
**Spec:** ETAPA_0 sección 7, tabla de retención y D-010/D-011; ETAPA_1; plan maestro 2026-11-12-pilot-completion.md.
**Architecture:** cierre formal único registrado por comando local auditado; servicio transaccional reutilizable para planificación/purga. PostgreSQL autoridad. Restauraciones siempre aisladas y sin servicios expuestos.

## Global Constraints
- Solo datos sintéticos; no ejecutar purgas/restauraciones/cierre del piloto sobre la base de desarrollo. Tests destructivos únicamente en base de pruebas desechable creada por Django. No R2/Restic externo ni cambios a tareas programadas.
- Aplicación: conservar durante piloto y hasta 90 días tras cierre formal GLOBAL, no por episodio. Auditoría funcional: 12 meses CALENDARIO tras cierre global, independiente de que exista el episodio. Idempotencia: mientras exista registro relacionado; al purgar aplicación se elimina junto con ella. Logs técnicos: 30 días móviles (también logs de retención); registro mínimo de ejecuciones aparte.
- Cierre ausente: no purgar aplicación/auditoría. Límites estrictos: en el instante exacto de 90 días/12 meses no purgar; después sí. Aniversario de 29/02 se fija 28/02 cuando corresponda.
- Comando local `record_pilot_closure --closed-at <ISO con zona> --executor <identificador>` registra fecha responsable y hora de registro; idempotente para misma fecha, rechaza reemplazar una distinta y fecha futura. No ejecutarlo realmente aquí.
- Simulación sigue siendo predeterminada y puede escribir metadatos mínimos, nunca borra. Aplicación transaccional y reejecutable; identifica versión/fecha de cierre y conteos reales. Fallo revierte datos y registra error mínimo sin relatos ni secretos.
- Modelos de aplicación actuales: Emergency, VitalMeasurement y ProcessedOperation. Pacientes/posiciones de bloques posteriores deberán integrarse a este servicio; no inventar tablas ni borrar identidades/instituciones.
- Restauración JSON existente no es un backup completo. Validar antes de escribir, requerir --apply y destino habilitado explícitamente para ensayo local (`test_*` o `ambusync_restore*`), reaplicar retención dentro de transacción antes de anunciar resultado, sin sobrescribir registros existentes.
- Wrapper PostgreSQL: validar destino local reservado, confirmación explícita de aislamiento, ejecutar retención con DATABASE_URL del destino restaurado y restaurar variables de entorno al terminar; migrar esquema restaurado antes de retención. Sin -SkipRetention que anuncie restauración apta. Sin exposición de servicios ni pruebas externas.

## Review Focus
- Episodios muy antiguos antes de cierre formal; auditoría cuyo episodio ya fue purgado; operaciones recientes de episodio a purgar; límites exactos/calendario bisiesto.
- Planificación y borrado en la misma transacción; rollback y registros mínimos ante fallo; no afirmar conteos que no se borraron.
- Validación completa de JSON en dry-run, registros duplicados/existentes, rollback de paquete inválido y retención de lo reintroducido antes de devolver éxito.
- RestoreDatabaseUrl no puede ignorarse al ejecutar Django; rechazo de base activa/remota antes de restic/pg_restore, no imprimir secretos; cleanup solo del directorio temporal creado por la ejecución.

### Task 1: cierre y retención
- [x] Regresiones RED sobre ausencia de cierre, global vs episodio, auditoría independiente, idempotencia, 90 días/12 meses y logs.
- [x] Registrar cierre formal con migración y comando, servicio/command de retención v2, conteos/rollback.
- [x] GREEN pruebas de retención y cierres; actualizar pruebas antiguas cuyo contrato por episodio era incorrecto.

### Task 2: restauración aislada
- [x] RED JSON: validación, default dry-run, guardia de aislamiento, no overwrite, reaplicación atómica.
- [x] RED wrapper con ejecutables simulados (sin Restic/red/restauraciones reales): destino correcto, rechazo antes de efectos y restauración de entorno.
- [x] Implementar y verificar GREEN. Mantener copia/restic externa sin usarla.

### Task 3: cierre del bloque
- [x] Backend completo sin keepdb, Ruff/formato/check/migraciones/OpenAPI; regresión frontend A/B sin modificaciones funcionales.
- [x] Revisión independiente y correcciones importantes RED→GREEN.
- [x] Guía PRUEBAS_C.md de arranque y aceptación, B manual pendiente, evidencia exacta en ETAPA_1/guía; commit local sin publicar.
