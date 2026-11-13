# Correcciones de revisión G — selector y contexto de identificación

Base439294c, feature/pilot-completion. Ejecución inline TDD y una revisión independiente final.
Autoridad: ETAPA_0 D005/D007/D009, diseñoG aprobado y aclaración explícita del responsable: **Sí, corregir ese episodio**, antes de llegada, motivo/autor/fecha, original conservado, sin cambiar maestro ni otros episodios. Esto amplía conscientemente G; no es sincronización automática del maestro ni edición de históricos cerrados.

## Contratos y límites
- Selector reutilizable nativo con búsqueda local por alias/ID (caso/diacríticos/espacios), solo pacientes ya autorizados de unidad. Aplicar al panel de registros y selección en creación. Enter en búsqueda no envía formularios; filtrar nunca selecciona ni modifica datos. Seleccionado fuera de filtro permanece explícito; no disponible se identifica. Filtro/selección se reinician al cambiar ámbito, borradores/intentos siguenA.
- POST `/emergencies/{id}/patient-context/`, JSON exacto `{operation_id,expected_version,patient_identity_unknown,patient_alias?,age_value?,age_unit?,recorded_sex?,reason}`. Identificación completa (opcionales omitidos se limpian), validaciónD007 y motivo3–2000. Ambulancia habilitada de la unidad, solo notificada/en_traslado, versión de episodio. No maestro ni vínculo paciente modificado; no otros episodios.200episodio completo; 400/403/404/409 habituales.
- Modelo append-only PatientContextCorrection: episodio FKPROTECT, previous_patient/corrected_patient snapshots, motivo, autor, hora servidor, UUID y episode_version posterior. Orden por versión/id. Cambio de contexto + registro + versión+1 + auditoría correlacionada atómicos; replay exacto permitido tras llegada dentro del ámbito, sin duplicados. No inventar historial legado; nuevas filas solo en acción explícita.
- Aviso mínimo WS `emergency.patient_context_corrected` postcommit a unidad/destino; GET/refresh API reflejan nueva identificación en ambos. Receptor solo consulta contexto/historial de ese episodio, no puede corregir ni abrir maestro.
- Representación incluye historial local de correcciones del episodio. F copia contexto actual al reemplazo, nunca historial del receptor anterior. ReplayF permite identificación del reemplazo corregida legítimamente: valida línea local de correcciones desde snapshot heredado hasta actual, autor/fecha/motivo/versión/UUID, más IDs/vínculos/unidad/destino. No basta aceptar cualquier paciente distinto con mismoID.
- Frontend acción **Corregir identificación de este episodio**, formulario separado del maestro y deD, borrador por episodio/ámbito/versión solo memoria. No rebase automático, congelado por operación incierta; retryA conserva cuerpo. Prueba respuesta exige corrección con UUID y versión esperados, snapshot corregido solicitado e historial coherente con actual. Respuesta ajena/corrupta sigue incierta.
- C elimina nuevas correcciones con aplicación dentro de purga transaccional, auditoría independiente. Migración0010 solo base de pruebas durante implementación; sin desarrollo/servicios externos ni grants/cierre/purga/restore reales. H no iniciado, sin push/merge/despliegue/uso clínico.

## Review Focus
- Maestro editado vs episodio corregido: UX inequívoca, sin propagación a otra persona/episodio/histórico.
- F tras corrección y replayF después de corregir reemplazo: snapshot correcto sin heredar historia privada ni aceptar respuestas alienígenas.
- Identidad desconocida/alias omitido,0días, meses/años y datos borrados; no inferencias ni ambigüedad de unidad.
- Llegada/corrección simultáneas, dos correcciones/versiones, retiro/permisos y replay: un resultado autorizado, sin pérdida del original.
- Filtro fuera de selección, sin coincidencias, Enter, cambio de ámbito, respuesta perdida/CSRF/login: no escritura accidental, borradores conservados sin datos del ámbito anterior.

## Task1 selector
- [x] Browser RED búsqueda ausente→GREEN; alias/ID, sin coincidencias, fuera de filtro, Enter y ámbito. Componente reutilizable y pruebaG del editor actualizada.

## Task2 backend y F
- [x] RED endpoint ausente y retenciónFK→GREEN,11 pruebascontexto incl2carreras; modelo0010/endpoint/historia/WS/C. Backend228/228 sin keepdb.
- [x] RED proofF ante corrección válida→GREEN con rechazos de corrupción; sender comprueba UUID/versión/snapshot/historia. OpenAPI validado.

## Task3 formulario y cierre
- [x] Browser RED acción ausente y edad oculta→GREEN, formulario separado/historia, memoria por versión/ámbito, retry exacto respuestas perdida/corrupta. Frontend38unit y15G.
- [x] Backend/frontend/regresiones, checks/tipos/build/Mermaid/PSdobles PASS; dos capturas390px inspeccionadas, detectorUI1vez→sin hallazgos.
- [x] Revisión independiente final sin hallazgos accionables, guía PRUEBAS_CORRECCIONES_G y estado actualizados, aceptaciónmanual pendiente. Preparado commit local acotado sinH/publicación.
