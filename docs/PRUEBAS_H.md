# Bloque H — histórico, informes y auditoría administrativa

> **Corrección posterior vigente:** [PRUEBAS_CORRECCION_H.md](PRUEBAS_CORRECCION_H.md). El Archivo de Urgencias vuelve a estar disponible para Urgencias normal y administración+Urgencias, sin `view_reports`; este permiso sigue reservado para informes/resúmenes. Auditoría mantiene `institution_admin`. Las restricciones de archivo básico descritas abajo son evidencia histórica de H y quedan sustituidas por esta aclaración.

**Implementación local verificada; aceptación manual pendiente.** Funcionamiento aprobado por el responsable, incluida la elección **Restringir histórico**. Solo datos sintéticos, sin atención clínica. BaseG aceptada `f510d0a`; H no autoriza iniciarI/J, publicar/desplegar ni crear servicios externos.

## 1. Arranque de esta copia

Carpeta `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`, rama `feature/pilot-completion`. PostgreSQL de AmbuSync55432, Valkey6379, Daphne8000, Vite5174 y Mailpit1025/8025 en loopback; no tocar PostgreSQL ajeno5432. Arranque completo: [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main).

**H no agrega modelos, migraciones ni dependencias.** La base debe tener G y correcciones hasta `emergencies/0010`. En la retoma se comprobó0010 aplicada, sin ejecutar migrate. Si aparece «Resultado sin confirmar» en una corrección de identificación por faltar0010, seguir [PRUEBAS_CORRECCIONES_G.md](PRUEBAS_CORRECCIONES_G.md); no inventar otra operación.

Con servicios locales de datos/correo iniciados y sin duplicar procesos, desde backend:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py check
uv run python manage.py migrate --check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Si Daphne de esta copia ya estaba activo antes de actualizar el código, reiniciar **solo ese proceso** para cargarH. No reiniciar servicios ajenos. En otra terminal con Node24.20.0/npm11.19.0:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local**. No usar las rutas demo para acreditarH. Mailpit local http://127.0.0.1:8025 solo si necesitas invitaciones; sinrelay externo. No ejecutar cierre formal, purga ni restore para ensayar.

## 2. Permisos explícitos y datos de prueba

- Preparar dos destinos sintéticos independientes, cuentasUrgencias de ambos, una cuenta de ambulancia y una cuenta administrativa institucional. Usar perfiles/navegadores con cookies independientes; dos pestañas no son dos identidades.
- Crear episodios sintéticos de estados variados, varios C1–C5/Sin clasificar y, para paginación, más25 dentro del destino autorizado. Deben ser episodios distintos, no pacientes únicos.
- El nuevo permiso adicional **`view_reports` requiere Urgencias previa**. Administrar cuentas/instituciones, pertenecer a una operadora o conocer el ID de un episodio no lo concede.
- Si decides aprovisionarlo para esta aceptación local, desde backend y sustituyendo por una cuenta sintéticaUrgencias existente:

```powershell
uv run python manage.py grant_pilot_permissions '<usuario_sintetico_urgencias>' --view-reports
```

Se audita la concesión técnica; no añade Urgencias, no activa la cuenta ni cambia su destino. El comando rechaza system_admin, cuentas inactivas/sin institución habilitada y perfiles sin Urgencias. **No se ejecutó sobre cuentas de desarrollo durante implementación.** Reautenticar tras modificar permisos; el cambio de ámbito descarta memoria previa y no resuelve intentos inciertos por sí solo.

Para desactivar un paciente desde el detalle histórico se requieren **ambos** `view_reports` y `deactivate_patients`, además de Urgencias del destino. Es la acciónG sobre el maestro lógico, no una edición del episodio. La API sigue rechazándola si quedan episodios no terminales; no se añaden permisos implícitos.

## 3. Casos manuales y resultados esperados

### H1 — Bandeja operativa sin acceso histórico implícito

1. Entrar como Urgencias **sin** `view_reports`.
2. Esperado: no aparece **Histórico e informes** ni el antiguo Archivo de Urgencias. Siguen visibles notificada/en_traslado/llegado del destino; los llegados pendientes no se ocultan por superar20tarjetas y pueden cerrarse según reglasE.
3. Crear/cancelar un caso de la unidad, o cerrar uno llegado desde Urgencias. Esperado: la operación confirma segúnA; después de actualizar la bandeja, el terminal ya no forma parte de la consulta operativa.
4. Probar GETdirecto del episodio terminal sin informes:404 dentro de la política de no disponibilidad, aunque se conozca el ID. Reportes403 sin permiso adicional. Ambulancia de esa unidad no obtiene acceso histórico por la asignación.
5. Un resultado terminal de escritura confirmada/replay puede usarse para resolver **ese intento**. No crea un nuevo directorio histórico ni se exige `view_reports` para completar retrycancel/close/F.

### H2 — Histórico del destino autorizado

1. Entrar con Urgencias+`view_reports` y abrir **Histórico e informes**.
2. Esperado: listado de episodios autorizados de ese destino, incluidos terminales, en páginas de25. La aplicación no descarga todas las páginas automáticamente.
3. Revisar total y cantidades **Por estado** y **Por triaje**, con Sin clasificar separado. Reflejan todos los resultados filtrados, no solo los25de la página.
4. Probar **Página siguiente/anterior** con más25episodios. Esperado: orden de creación descendente conIDde desempate, sin saltar al estado/filtro de una consulta anterior. Cada nueva petición consulta el estado actual; no se promete congelación entre páginas.

### H3 — Filtros y fechas

1. Editar Desde/Hasta, Estado, Unidad y Triaje. Antes de **Aplicar filtros**, se advierte que hay cambios sin aplicar; el resultado anterior no se rotula como la nueva búsqueda.
2. Aplicar filtros y paginar. Esperado: backend filtra y recalcula todas las cantidades con los mismos filtros aplicados. No se filtra únicamente la página visible.
3. Las fechas son **fecha de creación del episodio en America/Santiago**, inclusive ambos días. No representan llegada/cierre ni zona del navegador. El último día se consulta hasta antes del inicio local del día siguiente, incluidos cambiosDST.
4. Sin clasificar no es C5; campos ausentes no se inventan. Una unidad histórica puede figurar aunque esté desactivada si tiene episodios de ese destino; no es directorio de flota ajena.
5. Rango invertido/fecha imposible/estado o triaje inválido/parámetro desconocido o repetido:400 sin ampliar alcance. IDde unidad no disponible:404genérico, sin confirmar su existencia en otra institución.
6. No introducir alias/identificación enURL; no hay búsqueda por paciente enH.

### H4 — Detalle histórico y aislamiento

1. Abrir un episodio del informe. Esperado: consulta local de identificación/motivo/notas/síntomas, mediciones/historia de correcciones e hitos guardados.
2. No hay botones de confirmar lectura/preparación, llegada/cierre ni corrección de identificación/mediciones desde ese detalle. Abrirlo no fabrica hitos.
3. Cambiar a cuenta del otro destino y probar lista/detalle/IDdel primero: no obtiene datos ajenos. Si una cuenta combina Ambulancia/Urgencias/informes, el histórico no amplía el ámbito hacia terminales de la unidad enviados a otro destino.
4. Original canceladoF conserva **Cancelado por cambio de destino** y su motivo; no muestra nombre del destino nuevo. Vínculos no abren historia del otro receptor. Reemplazo e historial de identificación conservan aislamientoG/F.
5. OriginalF y reemplazo son **dos episodios**. Si ambos son autorizados al mismo destino, se cuentan por separado; no llamarlos dos pacientes únicos ni dos traslados únicos.
6. Con permiso adicionalG de desactivación, el detalle puede ofrecer **Desactivar paciente sintético** como gestión separada del maestro. Conserva historial y condicionesG; sin ese permiso el botón no aparece.

### H5 — Auditoría administrativa propia sin clínica

1. Entrar con `institution_admin`, incluso sin rolUrgencias ni permiso de informes, y abrir **Auditoría administrativa**.
2. Esperado: solo acciones administrativas propias de cuentas/unidades/asignaciones/provisión/permisos autorizadas, con actorID, fecha, acción, tipo/IDde objeto, resultado y correlación.
3. Probar fechas (fecha del evento en America/Santiago), acción, tipo de objeto y paginación. No hay edición ni borrado.
4. No aparecen motivos clínicos, identificaciones/mediciones de pacientes, eventos clínicos, motivos de revocación, executor técnico ni logs completos. Manipular filtro para `patient` o una acciónclínica se rechaza; IDsde otra institución no amplían el ámbito.
5. Administración global no obtiene este historial institucional ni clínica por ser system_admin. Urgencias/ambulancia sin `institution_admin` no obtienen auditoría administrativa.
6. **Menor conocido de presentación:** al iniciar como administrador sin roles clínicos puede aparecer el aviso de que no hay rol operativo. El botón **Auditoría administrativa** sí está disponible y abre la consulta; no concede ni requiere un rol clínico. Apertura automática pendiente de mejora.

### H6 — Respuestas tardías y permisos cambiados

1. Con red lenta, aplicar un filtro y luego otro antes de responder el primero. Esperado: la primera respuesta tardía no sustituye la consulta nueva ni su resumen.
2. Cambiar página/filtros, cerrar detalle y salir de sesión mientras hay una lectura pendiente. Esperado: resultado antiguo no reaparece tras logout ni bajo otra cuenta/unidad/institución/permisos.
3. Al revalidar la sesión y detectar retirada de `view_reports`, desaparece el panel y se descartan sus datos; la API deniega solicitudes nuevas. No hay persistencia clínica web.
4. Error400/403/500 o respuesta incompleta/ajena: aviso de consulta no confirmada/error, sin reutilizar resultados previos como si fueran los nuevos. Se puede **Reintentar consulta** manualmente; no es una escritura ni genera UUID.
5. Pendientes de escrituraA–G permanecen separados de los informes. Reautenticar la misma cuenta/ámbito no autoenvía ni reconstruye un cuerpo/versión nuevos; ámbitos distintos no heredan intentos.

## 4. Verificación automatizada

Backend (PostgreSQL y Valkey locales disponibles):

```powershell
uv run python manage.py test reports audit.tests_administrative_history --noinput
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Frontend con Vite de esta copia activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:reports
npm run test:unit
npm run test:patients-catalog
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

`test:local-websocket` es silencioso al aprobar; verificar exit0. PSrestore usa dobles locales, no un restore real/RPO/RTO. No iniciar cierre/purga/restore para probar informes. Los plazosC y el catálogo institucional conservado no cambian.

## 5. Aceptación pendiente

### Evidencia técnica local y límites

- Backend **244/244** sin `--keepdb`, incluidas16pruebasH de informes/auditoría. Incluye snapshot PostgreSQL REPEATABLE READ/read-only con creación concurrente entre resumen/paginación, límites de fecha/DST, roles combinados, GETterminales protegidos, aprovisionamiento solo en testDB y proyección mínima administrativa.
- Django/check/makemigrations/Ruff/formato/OpenAPI PASS; sin nuevos modelos/migraciones ni dependenciasH. Cabeceras privadas/no-store compartidas con recursosG, también en GETlegado que permite detalle terminal con informes.
- Repetición final completa frontend: **38unitarias +8H +15G +12F +6E +30integridad +3correcciones**, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. No confundir transporte sintético/captura local con aceptación real entre dispositivos/backend.
- Revisión independiente estática: un importante de trazabilidad histórica (llegada/motivo/cierre omitidos) reproducido RED→GREEN y corregido con campos de solo lectura, fechas y autores disponibles. No se restauran botones de transición. No se solicitó una segunda revisión.
- Menor diferido: pantalla inicial del administrador sin rol clínico requiere pulsar Auditoría administrativa. Aviso técnico no bloqueante del build: bundleprincipal supera500kB minificado; no se midió rendimiento ni se afirma impacto operativo. No se suprimió el aviso.
- Durante preparación, el PostgreSQLpreexistente dejó de estar activo y se reinició solo el clústerAmbuSync, sin borrar datos/locks ni tocar5432. La primera prueba no alcanzó casos; RED se repitió correctamente después. Un arranque de la suiteG tuvo timeout del selector10s y no se reprodujo al repetir ese caso; no se atribuye a una causa no comprobada.
- PSrestore PASS solo dobles locales; sin nuevo restore/RPO/RTO. Sin grants/datos de desarrollo, cambios clínicos reales, push/merge/despliegue ni inicioI/J. Daphne de esta copia se reinició para cargarH y los nuevos endpoints responden401 esperado sin sesión; no acredita una prueba autenticada realH.
- CapturaChromium390px del informe/detalle inspeccionada sin desborde; detectorUI1vez sin hallazgos. No se regeneraron capturas versionadas deREADME; scriptshots adaptado a la navegaciónH para una regeneración futura, no ejecutado para sobrescribir imágenes.

- [ ] H1 frontera operativa/histórica, todos los llegados pendientes y resoluciónA.
- [ ] H2 permiso/destino, paginación y cantidades completas.
- [ ] H3 filtros estrictos y fechas de creación America/Santiago.
- [ ] H4 solo consulta, aislamientoF/G y acciónG separada.
- [ ] H5 auditoría administrativa propia sin clínica.
- [ ] H6 respuestas tardías/logout/revocación/errores sin datos de otro ámbito.
- [ ] Móvil390px legible y sin desborde; registrar navegador/dispositivos reales.
- [ ] Responsable registra fecha, commit probado y observaciones. Suites sintéticas no marcan aceptación manual.
