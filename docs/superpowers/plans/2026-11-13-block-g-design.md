# Bloque G — diseño de alcance, no implementación

G autorizado por el responsable al aprobar F con observaciónF1. Esta propuesta NO afirma funcionalidad nueva ni permisos ya concedidos. Basec701c58 más corrección visualF1. Autoridad: ETAPA_0 D005/D007/D009 y ARQUITECTURA_PILOTO «Contexto histórico del paciente»; sin datos reales, RUT/documentos fuera de alcance.

## Alcance aprobado que debe implementar G

- Paciente sintético de institución operadora con ID propio, identidad conocida/desconocida, alias opcional, edad/unidad y sexo informado opcionales; varios episodios pueden referir al mismo paciente.
- Contexto/snapshot por episodio, no cambios silenciosos del histórico al corregir maestro. Receptor consulta snapshot del episodio autorizado, nunca registro maestro ni historial completo. F debe conservar vínculo paciente sin copiar hitos/permisos entre receptores.
- No inferir identidad ni agrupar pacientes legados por nombre/edad/sexo; identidades desconocidas no son todas una misma persona. No inventar procedencia histórica.
- Catálogo institucional de síntomas con base inicial común, alta/desactivación bajo permiso adicional explícito, sin autoalta por texto libre. No otorgar gestión automáticamente por ser administrador. Desactivados no se ofrecen para nuevas selecciones, pero permanecen en snapshots históricos.
- Paciente: desactivación lógica con permiso adicional Urgencias, ámbito autorizado y ausencia de episodios activos; no eliminación física ni exposición de destinos ajenos para justificar bloqueo.
- Mantener A: UUID/versión, reintentos manuales, resultado incierto, memoria por identidad/grupos/institución/unidad y no persistencia web. Cambiar permisos debe invalidar ámbito de memoria. Sin nuevos permisos clínicos para system_admin.

## Decisión de acceso confirmada para búsqueda/reutilización

**Decisión del responsable:** seleccionó **Solo su unidad** en la pregunta de alcance. Se implementará la propuesta recomendada siguiente, no el directorio institucional de la alternativa. Ningún permiso de gestión de catálogo amplía el acceso a pacientes/episodios.

La arquitectura asigna paciente a la operadora, pero la matriz limita a ambulancia los episodios de su unidad y no define expresamente un directorio institucional de pacientes para todas las unidades. No interpretar pertenencia institucional como permiso de lectura de todo ese directorio.

Propuesta recomendada: la unidad puede reutilizar registros sintéticos asociados previamente a sus propios episodios, mostrando solo identificación necesaria para seleccionarlos, sin abrir episodios de otras unidades. Registro nuevo se crea explícitamente; no deduplicar por parecido de alias.

Alternativa que requiere aprobación expresa: permitir búsqueda/reutilización de identificación maestra de pacientes de toda la institución operadora entre sus unidades, sin dar acceso al historial de episodios ajenos. Hay mayor exposición que en la opción anterior; especificar autorización/backend y aceptación antes de habilitarlo.

Tras decidir, concretar contratos/migraciones/provisión de permisos, compatibilidadF/idempotencia y retenciónC en plan TDD ejecutable; guía de aceptaciónG al cerrar. No iniciar H ni publicar/desplegar.

## Propuesta funcional para revisión del responsable

1. En creación de emergencia elegir **Paciente nuevo** o **Reutilizar paciente de la unidad**. El segundo modo ofrece únicamente registros activos ya asociados a esa unidad; no muestra episodios ni datos de otras unidades. Identificación desconocida sigue permitida. No RUT/documento, deduplicación por parecido ni inferencias de edad/sexo.
2. Registro maestro sintético con identidad/alias, edad y unidad, sexo informado y estado. Corrección explícita del maestro con versión/auditoría; afecta selección de episodios futuros, no cambia snapshots de episodios anteriores. G no habilita edición silenciosa de identidad histórica ni reapertura de episodios.
3. Cada nuevo episodio conserva un snapshot de identificación y su vínculo al paciente. Reutilizar no copia automáticamente notas, mediciones, triaje o historial de otro episodio. F conserva vínculo y snapshot entre original/reemplazo sin conceder acceso cruzado. Migración de legados no agrupa registros de personas por alias; se especifica tratamiento de raíces/cadenas antes de aplicarla.
4. Catálogo de síntomas de la institución operadora para selección de ambulancia, con base común. Gestión de la institución propia con permiso adicional explícito; datos receptores no amplían acceso al catálogo privado de la operadora. Altas/desactivaciones auditadas/versionadas, sin borrar descripciones ya guardadas. Texto libre de notas no crea síntomas.
5. Desactivación lógica de pacientes por Urgencias con permiso adicional y ámbito autorizado, bloqueada si hay algún episodio no terminal de ese paciente (sin revelar detalles ajenos). Registro e historial no se borran. Provisión inicial de permisos por procedimiento local controlado, no concesión automática a administradores ni autoescalamiento.
6. A se conserva: intento incierto y UUID/cuerpo inmutables, reintento manual, datos solo en memoria por cuenta/grupos/institución/unidad. C debe incluir maestros/operaciones en retención, sin cambiar plazos ni ejecutar purgas reales. F y sus reintentos deben seguir funcionando tras G.

Este diseño requiere revisión antes del plan TDD ejecutable; G aún no tiene código ni migraciones. Ejecución prevista inline y revisión independiente al cierre, mismo método que A–F. Arranque y pruebas detalladas se entregarán en PRUEBAS_G al implementar, sin declarar aceptación manual por pruebas sintéticas.
