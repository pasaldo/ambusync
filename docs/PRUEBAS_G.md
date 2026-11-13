# Bloque G — pacientes sintéticos, contexto por episodio y catálogo

**Revisión posterior solicitada por el responsable:** selector con búsqueda por alias/ID y acción explícita de corrección de identificación por episodio antes de llegada. El maestro sigue sin propagar cambios. Arranque con migración0010 y aceptación específica en [PRUEBAS_CORRECCIONES_G.md](PRUEBAS_CORRECCIONES_G.md); la evidencia217 original de esta guía corresponde a G previo, no a esta revisión.

**Implementación local verificada; aceptación manual pendiente.** El responsable aprobó funcionamientoG y búsqueda/reutilización **solo de la unidad asignada**, no directorio de toda la operadora. F aprobado con observación visual corregida en `f7cd573`; revalidación manual del rótuloF sigue pendiente. Solo datos sintéticos; no atención clínica ni identificadores reales. Sin publicación/despliegue ni inicio de H/J.

## 1. Arranque y migraciones de esta copia

Rama `feature/pilot-completion`, carpeta `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`. PostgreSQL aislado `127.0.0.1:55432` y Valkey loopback6379; Mailpit local si necesitas altas. Arranque de servicios/dependencias: [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main). No tocar PostgreSQL ajeno5432 ni reiniciar procesos de terceros.

G añade `institutions/0004` (catálogo), `0005` (base común) y `emergencies/0008` (maestro/vínculo/recibos), `0009` (vinculación de legados). Durante implementación solo se aplican a la base efímera del runner, **no a desarrollo**. Para preparar tu base local, con el backend de esta copia detenido por su responsable:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

No duplicar Daphne; reiniciar solo el proceso de esta copia que administras después de migrar. En otra terminal, Node24.20.0/npm11.19.0, si Vite no está activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local**, no las rutas demo. No ejecutar cierre formal del piloto, purga ni restauración para probarG.

### Qué hacen las migraciones de datos

- Un maestro independiente por raíz de cadenaF; descendientes comparten ese vínculo. No agrupa pacientes por alias, edad o sexo ni trata todas las identidades desconocidas como una persona. No reescribe snapshots ni atribuye al maestro un creador clínico legado inventado; fecha de incorporación no se presenta como fecha de atención.
- Base común de ocho síntomas para instituciones existentes; nuevas instituciones la inicializan al crearse. GET no escribe catálogo. No hay autoalta por texto del episodio.
- `ProcessedOperation` conserva namespace único actor/UUID para emergencias, pacientes y síntomas, con exactamente un destino protegido. Corrección de maestro no aumenta versión del episodio ni modifica sus hitos.

## 2. Preparación y permisos explícitos

1. Dos cuentas sintéticas habilitadas de unidad A; una cuenta de unidad B de la misma operadora y una Urgencias del destino, en perfiles/navegadores separados. No confiar en pestañas privadas que compartan cookies.
2. Crear pacientes/episodios nuevos identificables como pruebas; conservar al menos uno terminal para desactivación y uno activo para comprobar su bloqueo.
3. Los roles administrativos no conceden automáticamente gestión de síntomas ni desactivación de pacientes. El primer aprovisionamiento es **local y controlado**, no una nueva opción de delegación web.
4. Si decides conceder los permisos para esta aceptación, sustituir los nombres siguientes por cuentas **sintéticas activas** ya existentes, desde backend y antes de iniciar Daphne o en otra terminal del mismo entorno:

```powershell
# Cuenta institucional que gestionará su catálogo; no le concede Urgencias ni administración.
uv run python manage.py grant_pilot_permissions '<usuario_sintetico_catalogo>' --manage-symptoms
# Cuenta que YA tenga Urgencias del destino; no concede ese rol ni amplía su ámbito.
uv run python manage.py grant_pilot_permissions '<usuario_sintetico_urgencias>' --deactivate-patients
```

El comando no concede permisos a `system_admin`, no activa cuentas y exige institución habilitada/perfil previo. Registra concesión como operación técnica local auditada; no se ejecutó sobre cuentas de desarrollo durante implementación. Tras cambiar grupos, revalidar sesión o iniciar sesión otra vez; el cambio de permisos descarta memoria del ámbito anterior. Resolver intentos pendientes antes de cambiar permisos deliberadamente.

## 3. Casos manuales con resultado esperado

### G1. Paciente nuevo e identidad opcional

- Ambulancia → creación → **Paciente de la unidad: Paciente nuevo**. Crear caso sintético con alias, edad8/unidadmeses, sexo no informado y motivo; vitales/triaje/síntomas opcionales.
- Esperado: nuevo maestro y episodio en una transacción, ID paciente propio y snapshot de identificación. El registro aparece al consultar **Pacientes y catálogo** de esa unidad, sin abrir historiales. No requiere RUT/documento.
- Repetir identidad desconocida sin alias: «Paciente no identificado», no etiqueta almacenada como nombre. Dos desconocidos nuevos tienen IDs distintos, no se fusionan.
- Identidad conocida con alias omitido permanece conocida; «Alias no informado», no se deduce identidad desconocida. Sexo no informado=null, distinto de X. Edad0días es informada; no se convierte a fecha de nacimiento ficticia.
- Probar alias Unicode/tildes/apóstrofe, meses12, edad negativa, edad sin unidad y caracteres de control: Unicode válido admitido; combinaciones/rangos inválidos rechazados con datos corregibles conservados.

### G2. Reutilización solo de la unidad

- Elegir paciente activo previo en **Paciente de la unidad**. Se indica que se copia identificación, no antecedentes/historial. Crear otro episodio con nuevo motivo/destino.
- Esperado: mismo ID de paciente, nuevo episodio con snapshot propio. No se arrastran notas, mediciones, síntomas o triaje del episodio anterior por seleccionar paciente.
- Segunda cuenta habilitada de A puede reutilizarlo; cuenta B no lo encuentra ni puede enviar su ID por API (404), aunque ambas sean de la misma operadora.
- Urgencias no solicita/lista maestro ni ve el panel de pacientes por ese rol; solo snapshot de sus episodios. Administración global tampoco obtiene acceso clínico.
- Si el maestro cambia después de seleccionarlo, se advierte versión distinta y **Actualizar selección del paciente** exige revisión explícita; no se rebasa automáticamente. Si ya no está disponible, el selector lo indica y permite elegir conscientemente **Paciente nuevo** sin perder motivo/notas.

### G3. Corrección de maestro y conservación de contexto

- Ambulancia A → **Pacientes y catálogo** → **Editar registro de …**. Cambiar alias y edad, pulsar **Guardar registro del paciente**.
- Esperado: versión maestra+1 y auditoría; episodios anteriores conservan alias/edad/sexo de su snapshot, sin reatribuir triaje, mediciones, lectura/preparación ni creador.
- Crear otro episodio reutilizando la versión nueva: toma la identificación corregida, no cambia los antiguos. Los campos opcionales omitidos/limpiados del formulario del maestro se vacían de forma explícita, sin usar «0» para ausente.
- Dos operadores editan: al refrescar con borrador se conserva texto y se advierte que cambió el registro. **Cargar registro actual** reemplaza el formulario por la versión vigente tras decidir revisarla. Si el conflicto gana justo al enviar,409; no sobrescribe ni autoenvía.
- Cambiar destino de un episodio antiguo conF tras corregir maestro: reemplazo conserva **el snapshot de ese episodio**, no toma silenciosamente el maestro nuevo. Misma vinculación de paciente; lectura/preparación vacías y aislamientoF intacto.

### G4. Catálogo institucional y permiso adicional

- Sin `manage_symptoms`: selección de síntomas activos de la operadora, sin controles de alta/desactivación. Ser administrador no lo habilita automáticamente.
- Con permiso: **Pacientes y catálogo** → **Catálogo institucional de síntomas** → descripción sintética → **Agregar al catálogo**.
- Esperado: nuevo elemento solo institucional, visible para nuevas selecciones de esa operadora tras actualizar. Mayúsculas/espacios equivalentes no permiten duplicado; un duplicado desactivado tampoco se recrea para eludir la baja. Se admite Unicode dentro del máximo120; la clave de unicidad usa SHA256 de normalizaciónNFKC/casefold/espacios para evitar overflow sin recortar descripción.
- Crear episodio con ese síntoma; desactivarlo con permiso. Esperado: desaparece de nuevas opciones, pero el episodio conserva la descripción original. Editar otras notas y conservar selección histórica no borra ni renombra ese síntoma; añadirlo a otro episodio se rechaza.
- Si estaba seleccionado en un borrador aún no enviado, al refrescar aparece como no activo con **Quitar selección**. Retirarlo requiere acción explícita y conserva resto del borrador; nunca se elimina silenciosamente ni queda oculto sin poder corregir.
- Notas/texto libre no crean síntomas. Gestionar ID de catálogo ajeno404; ni ambulancia ni Urgencias cambian catálogos de otras instituciones con ese permiso.

### G5. Desactivación de paciente autorizada

- Urgencias del destino sin permiso adicional: no botón; API403. Con `deactivate_patients`, abrir detalle autorizado y pulsar **Desactivar paciente sintético**, confirmando el aviso.
- Mientras exista algún episodio del paciente en notificada/en_traslado/llegado:409 genérico, sin revelar detalles de unidades/destinos ajenos. Llegado aún es pendiente de cierre.
- Después de cerrar/cancelar todos: maestro desactivado/version+1 y auditoría. Historial/snapshots permanecen; se deja de ofrecer para nuevas reutilizaciones. No borra físicamente ni ofrece reactivación implícita. Respuesta al receptor solo ID/estado/versión, no identificación maestra corregida.
- UUID/expected_version son de esa operación y del **paciente**, no versión del episodio. La UI los conserva; no fabricarlos a partir de otra tarjeta.
- Si otra unidad intenta reutilizar mientras se desactiva, solo resultado serializado válido: o nuevo episodio autorizado y baja bloqueada, o baja confirmada y creación rechazada. Suite PostgreSQL cubre carrera sin sustituir aceptación real.

### G6. Respuesta perdida, replay y ámbito

- Las nuevas rutasG de maestro y recursos responden con `Cache-Control: private, no-store` (además de revalidación), también al finalizar errores DRF. No se agregan `localStorage`, IndexedDB ni caché clínica de service worker. Este control no acredita por sí solo endurecimiento global de rutas legadas o despliegueHTTPS.

- `test:patients-catalog` reproduce escritura maestra confirmada cuya respuesta se pierde o llega con ID ajeno. Esperado: **Resultado de registro sin confirmar**, formulario congelado y **Reintentar operación de registro**, con UUID/cuerpo/versión idénticos. No otra escritura ni éxito por recibir200 incompleto.
- Expirar sesión durante intento: login de misma cuenta/ámbito recupera memoria y retry manual, nunca autoenvío. Otra unidad/cuenta/grupos/institución o logout explícito descarta los borradores/intentos; datos de otra cuenta no reaparecen. Recargar/cerrar puede perderlos, no hay persistencia clínica en navegador.
- Si el intento incierto era una desactivación desde detalle de Urgencias, cerrar **Cerrar** del detalle para acceder al retry global **Reintentar operación de registro**. Ver estado actualizado no confirma por sí solo el intento; se conserva su identidad hasta resolverlo o descartar ámbito.
- Replay exacto de una corrección confirmada puede devolver maestro posteriormente corregido/desactivado, sin duplicar acción. Reutilizar UUID entre paciente/síntoma/emergencia con otra acción/cuerpo409; la unicidad es global por actor.
- Cortar conectividad antes del envío no prueba guardado previo; usar escenario sintético determinista para pérdida posterior. Fallo real de servidor/transporte se investiga, no se interpreta automáticamente como rechazo ni se ignoran avisos.

## 4. Verificación automatizada

Backend con PostgreSQL/Valkey disponibles, desde backend:

```powershell
uv run python manage.py test emergencies.tests_patients_catalog --noinput
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Frontend con Vite de esta copia activo, desde frontend:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:patients-catalog
npm run test:unit
npm run test:destination-change
npm run test:milestones
npm run test:local-integrity
npm run test:episode-updates
npm run test:review-corrections
npm run test:units
npm run test:accounts
npm run test:system-admin
npm run test:local-websocket
npm run test:sync
npm run lint
npm run build
npm run check:diagrams
```

`test:local-websocket` es silencioso al aprobar; comprobar `$LASTEXITCODE`=0. Desde raíz, `./ops/backups/tests/restore-postgres.tests.ps1` solo prueba dobles locales sin restauración real/RPO/RTO. C conserva plazo global90d de aplicación/pacientes/recibos vinculados y12meses auditoría; catálogo es configuración institucional conservada junto a sus recibos, no historial clínico. No se ejecutaron grants/cierre/purga/restore sobre desarrollo para esta implementación.

## 5. Registro de aceptación pendiente

### Evidencia técnica local del13/11

- Backend **217/217** PostgreSQL sin `--keepdb`:18 pruebasG, incluidas5 carreras, vinculación de legados y cabeceras privadas/no-store de nuevos recursos. Django/migraciones/Ruff/formato/OpenAPI PASS. Auditoría agrega `patient.created` junto a creación de episodio; se actualizaron cinco expectativas anteriores y se conserva prueba de no duplicación en concurrencia/replay.
- Frontend **35/35 unitarias,10/10G,12/12F,6/6E,30/30 integridad,3/3 correcciones**, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3 PASS. Transporte sintético, no aceptación real entre dispositivos/Django.
- VistaChromium390px revisada sin desborde; capturas temporales, no se sobrescribieron imágenes versionadas deREADME. PSrestore PASS con dobles locales sin red/restore real; sin nuevo RPO/RTO.
- Revisión independiente: dos importantes reproducidos y corregidos RED→GREEN: creaciónunidadA frente a actualización de síntomasunidadB (orden de institución/recurso), y selección de síntoma desactivado oculta sin retirada. Adicionales propios RED→GREEN: normalizaciónUnicode expandida sin overflow, identidad conocida sin alias diferenciada de desconocida y revisión explícita de paciente seleccionado cambiado/no disponible. No nuevos menoresG reportados; menores previosE/harness documentados no se declaran resueltos por G.
- Catálogo se trata como configuración institucional conservada con sus recibos; pacientes/recibos clínicos siguen plazoC global. Si se cambia esa clasificación, se requiere procedimiento de purga explícito, no borrar configuración por inferencia. DigestSHA256 normalizado evita límites de expansiónUnicode; riesgo residual de colisión teórica no se presenta como igualdad de identidad de pacientes.
- Migraciones y permisos solo probados con DB efímera; no aplicación/grants/cierre/purga/restore sobre desarrollo. Revisión no certifica uso clínico, aceptación operativa, despliegue ni respaldo real. Guía y OpenAPI revisados localmente, no aprobación manual del responsable.

- [ ] Migraciones/arranque local y lectura de límites de legados.
- [ ] G1 paciente nuevo/identidad opcional y validaciones.
- [ ] G2 reutilización solo de unidad, sin directorio/historial ajeno.
- [ ] G3 maestro corregido sin modificar snapshots, compatibilidadF.
- [ ] G4 catálogo institucional/permisos/histórico/retirada explícita de selección inactiva.
- [ ] G5 baja autorizada sin episodios pendientes, historial conservado.
- [ ] G6 resultado incierto/replay/login y descarte por ámbito.
- [ ] Móvil sin desborde, formularios y avisos legibles.
- [ ] Responsable registra fecha, commit ejecutado, navegadores/dispositivos y observaciones. La suite sintética no marca esta aceptación.
