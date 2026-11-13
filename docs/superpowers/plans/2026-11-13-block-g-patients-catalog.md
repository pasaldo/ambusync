# Bloque G — pacientes sintéticos, snapshots y catálogo

> Ejecución inline, TDD, una revisión independiente al cierre. Base f7cd573.

**Goal:** crear/reutilizar pacientes solo de la unidad, corregir maestro sin alterar snapshots y gestionar catálogo con permisos explícitos.
**Spec:** diseñoG aprobado `2026-11-13-block-g-design.md`, ETAPA_0 D005/D007/D009, ARQUITECTURA_PILOTO y decisión «Solo su unidad». Stack actual, sin dependencias nuevas.

## Contratos y decisiones
- Maestro Patient pertenece a operadora; FK nullable en Emergency para legados/importaciones. Nuevas creaciones siempre asignan paciente. Nuevo maestro en transacción de creación o `patient_id`+`patient_version` observados de paciente activo asociado previamente a esa unidad. No mezclar con campos de identificación enviados por cliente. Copia snapshot de identificación únicamente, no antecedentes/mediciones del episodio anterior.
- GET `/api/v1/patients/` lista paginada solo maestros relacionados con episodios de unidad asignada, no URL con alias ni historial. POST `/{id}/update/` UUID/expected_version y campos de identificación con validación D007, solo unidad autorizada. Maestro corregido no altera snapshots ni F; F copia FK/snapshot, no lee maestro actualizado. No endpoint de lectura del maestro para Urgencias.
- POST `/api/v1/emergencies/{id}/patient-deactivate/`: Urgencias del destino + grupo adicional `deactivate_patients`, paciente vinculado y sin episodios no terminales en ninguna unidad; respuesta mínima ID/estado/version (no maestro), UUID/expected_version de paciente. No cambia episodio ni muestra detalles ajenos. No borrado ni reactivación implícita; no nuevas reutilizaciones de inactivos.
- Symptom por institución, descripción/normalización única (Unicode/casefold/espacios), enabled/version. Base común8 inicializada al crear institución y migración de existentes, no en GET. GET `/institutions/symptoms/` institución propia activa; crear/desactivar con `manage_symptoms` adicional sin conceder acceso clínico. POST `/symptoms/`, `/{id}/deactivate/` UUID/version; no edición del texto histórico ni autoalta por notas. Descripciones de síntomas del episodio son snapshot, solo permitidas nuevas selecciones activas de operadora. D permite conservar selecciones legadas/desactivadas ya presentes, no añadir nuevas desactivadas.
- Permisos adicionales solo aprovisionamiento local controlado `grant_pilot_permissions`, no delegación web/autoconcesión. No ejecutar sobre desarrollo; probar en DB efímera. Grupos aparecen en me y cambian vínculoA de memoria.
- ProcessedOperation compartido conserva namespace actor/UUID: exactamente uno de emergency/patient/symptom, FKPROTECT. Replay revalida ámbito antes; no depende de estado activo posterior si operación ya confirmada. C elimina pacientes/recibos con aplicación90d global; catálogo es configuración institucional, conserva recibos mientras exista, auditoría12meses independiente. No modificar plazos.
- Migración datos legados: por cada raíz de cadenaF, un maestro independiente con snapshot inicial, enlazar descendientes sin agrupar alias ni identidades desconocidas. No atribuir fecha clínica a fecha de migración. No tocar datos desarrollo durante implementación.
- UI paciente nuevo/reutilizar en creación, editor maestro separado y catálogo por permiso; Urgencias solo snapshot y desactivación explícita autorizada. Operaciones/borradores de recursos solo memoria, UUID/cuerpo/version inmutables, incertidumbre/retry manual/expiración y cambio de ámbito comoA. Crear episodio no depende de directorio ajeno ni abre historial completo.

## Review Focus
- Mismo paciente entre episodios de destinos distintos: lookup solo unidad, receptor no ve maestro; corrección no altera histórico/F ni autorías.
- Reutilización vs desactivación/corrección concurrente: bloqueo/version, sin snapshot incoherente ni episodio de paciente inactivo.
- UUID reutilizado entre recursos/emergencias, replay tras estado/ámbito avanzado: resultado correcto sin duplicación ni filtración.
- Síntoma desactivado durante envío, duplicado Unicode/espacios, ediciónD con selección legada: no autoalta ni mutación de descripción histórica.
- Respuestas perdidas/ajenas, CSRF pendiente, login misma/distinta cuenta y roles: nunca confirmar otro recurso ni autoenviar, limpiar datos del ámbito anterior.

## Task1 — backend y contratos
- [x] Tests RED por endpoints/campos ausentes, luego GREEN; proyección/aislamiento/recibos/catálogo/retención/legados y5 carreras.
- [x] Modelos/migraciones/servicios/rutas/comando, namespaceactorUUID y C. Backend217/217 sin keepdb, OpenAPI PASS; nuevas rutasG privadas/no-store.

## Task2 — frontend
- [x] Browser RED controles ausentes, componentes/memoria/validación, G10/10GREEN; incertidumbre/ámbito/snapshots/catálogo/baja/revisión explícita.
- [x] Unit35/35, tipos/build/scripts/CI y todas regresiones A–F PASS. Vista390px sin desborde.

## Task3 — cierre
- [x] Checks/migraciones/Ruff/OpenAPI/backend217/frontend completo/Mermaid3/PSrestore dobles PASS.
- [x] Revisión independiente, dos importantes RED→GREEN; adicionales propios validación/contexto/selección cubiertos, sin nuevos menoresG.
- [x] PRUEBAS_G con arranque/permisos/migración/casos/evidencia, G manual pendiente; cambios preparados para commit local. Sin publicar/desplegar/H ni datos reales.
