# Bloque D — antecedentes, triaje y mediciones trazables

> Base `00d7774`, feature/pilot-completion. Ejecutar inline TDD + revisión independiente final. Sin merge/push/despliegue. B manual pendiente (33909a7); C sin aceptación manual/restore real acreditados.

**Goal:** actualizar antecedentes/triaje y agregar/rectificar mediciones antes de recepción, sin perder originales ni idempotencia.
**Spec:** ETAPA_0 D-005/D-006/D-007/D-009 y sección5; ARQUITECTURA_PILOTO sección8; ETAPA_1; plan maestro.
**Architecture:** acciones POST versionadas sobre EmergencyTransitionView, filas serializadas PostgreSQL, HTTP autoridad y avisos WS postcommit. Borradores/intentos UI solo memoria del mismo ámbito; API devuelve historial completo y distingue rectificación.

## Global Constraints y contratos
- Solo sintéticos. No cambios a datos/migraciones de desarrollo, ni cierre/purga/restauración de C.
- D modifica motivo, síntomas existentes, notas y triaje. Identidad/contexto de paciente y catálogo institucional se completan en G; orden D-007 de bandeja sigue pendiente, no se sustituye por una regla nueva aquí.
- Solo ambulancia habilitada asignada a la unidad del episodio; puede actualizar cualquier integrante autorizado, no solo creador. Urgencias consulta, no edita por ese permiso; administración global sin acceso clínico.
- Mutaciones nuevas solo notificada/en_traslado. Llegado/cerrada/cancelada rechazan. Reintento de operación ya confirmada permite replay aun después de llegada si conserva ámbito; nunca duplica.
- POST `/emergencies/{uuid}/update/`: `{operation_id,expected_version,reason?,symptoms?,notes?,triage?}`. Al menos un campo modificable; omisión conserva; triage null o cadena vacía retira clasificación, no asigna categoría automática. Autor/fecha servidor al registrar/modificar triaje, auditados también al alta. Rechazar campos desconocidos/control no pertinente.
- POST `/emergencies/{uuid}/measurements/`: `{operation_id,expected_version,vitals:{hr?,bp_sys?,bp_dia?,spo2?,rr?,temp_c?,glasgow?,taken_at}}`; al menos una medición no nula. D-007 mismo valor/unidad, captured vs recorded diferenciados; no convertir ausencia a cero ni autoajustar reloj.
- POST `/emergencies/{uuid}/measurements/rectify/`: `{operation_id,expected_version,measurement_id,value,unit,measured_at,reason}`. Corregir hoja vigente del historial de ese episodio; mismo tipo/unidad canónica, motivo obligatorio. Nueva fila apunta a original mediante one-to-one PROTECT; ninguna fila original se altera. A→B→C permitido, corregir A otra vez rechazado409. Datos de otra emergencia no se aceptan.
- Las tres rutas responden200 con episodio completo, 400 validación, 403 perfil, 404 ámbito/medición ajena, 409 versión/estado/rectificación concurrente. Idempotencia almacena hash canónico, cuerpo exacto y misma operación en retry. Versión del episodio aumenta una sola vez por operación (batch cuenta una).
- Modelos: metadatos nullable de triaje en Emergency; measurement.operation_id nullable para no inventar legado; rectifies/reason en medición. IDs/autor/fechas/vínculos/estado vigente en representación. Sin inventar autor/fecha para filas anteriores.
- Historial completo visible a ambos perfiles. Resumen vital usa solo filas no rectificadas y la última por hora medida/registro/id; distinguir «vigente en cadena» de «última muestra».
- C debe purgar primero referencias entre mediciones de un mismo episodio (solo durante purga autorizada), después mediciones y episodio: PROTECT no puede bloquear retención. Fuera de purga nunca desligar/borrar originales.
- UI reutiliza memoria e intentos A por episodio. Formulario conserva versión observada al empezar a editar; un refresh no rebasa silenciosamente el borrador. 409 obliga revisar/cargar versión vigente; incertidumbre congela y ofrece retry exacto. Logout/ámbito distinto descarta borradores; misma reautenticación los conserva; no persistencia browser ni autoenvío.

## Review Focus
- Dos correcciones simultáneas / llegada frente a modificación: un ganador, sin originales sobrescritos ni duplicados.
- Retry confirmado tras llegada/versiones posteriores; operación UUID reusada con otro cuerpo/episodio/acción rechazada.
- Corrección de fila ajena o ya rectificada, encadenamiento y retención C con PROTECT.
- Resumen nunca presenta original rectificado como vigente aunque tenga fecha medida mayor que su reemplazo.
- Sesión/ámbito cambia durante CSRF o respuesta; versión vieja no sobrescribe; drafts mismos quedan en memoria, no en localStorage.

### Task 1: API y modelo
- [x] Tests RED update/append/rectify, permiso/estado/version/UUID/validación/auditoría.
- [x] Migración, serializers y acciones; WS y representación; correcciones encadenadas y purgaC.
- [x] Pruebas PostgreSQL concurrentes y GREEN; contratos OpenAPI.

### Task 2: SPA
- [x] Tests RED del flujo de edición, seriales, rectificación/historial y retry perdido/version vieja.
- [x] Formularios inline e historial, intentos/borradores en memoria por ámbito; resumen excluye rectificadas.
- [x] Reautenticación/scope y errores; GREEN y regresión A/B.

### Task 3: cierre
- [x] Suite backend completa sin keepdb, checks/migraciones/Ruff/OpenAPI y PS restore; frontend completo/tipos/build/Mermaid.
- [x] Revisión independiente y correcciones RED→GREEN de hallazgos importantes.
- [x] PRUEBAS_D.md arranque/aceptación y estado pendiente manual; commit local acotado.
