# Correcciones G — selector buscable e identificación por episodio

El responsable solicitó sustituir los botones de pacientes por un menú con búsqueda por alias/ID y aprobó **corregir la identificación de un episodio antes de llegada**, con motivo, autor, fecha e identificación anterior conservada. La edición del maestro sigue separada: no propaga cambios al historial. Solo datos sintéticos, sin atención clínica. H/J no iniciados. Aceptación manual pendiente.

## Arranque de esta copia

Rama `feature/pilot-completion`, carpeta `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`. Mantener PostgreSQL55432/Valkey6379 en loopback según [PRUEBAS_G.md](PRUEBAS_G.md); no reiniciar servicios ajenos ni usar rutas demo. Esta corrección agrega **emergencies/0010_patientcontextcorrection.py**. Durante implementación se aplica solo a la DB de pruebas, no a desarrollo.

Para preparar tu base sintética local tras revisar la migración, detener solo Daphne de esta copia y ejecutar desde backend:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

En otra terminal, si no está activo Vite de esta copia:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local** con cuentas sintéticas de ambulancia y Urgencias en navegadores/perfiles de cookies independientes. No se requieren permisos nuevos para corregir identificación: solo ambulancia habilitada de esa unidad. No ejecutar grants, cierre formal, purga ni restore para ensayar.

## Casos manuales y resultados esperados

### CG1 — Menú con búsqueda, sin escritura accidental

1. Ambulancia → **Pacientes y catálogo**. Los registros ahora aparecen en **Registro del paciente**, no como una lista de botones.
2. Escribir parte del alias en **Buscar registro por alias o ID**; probar mayúsculas y sin tildes. Probar el ID completo y un fragmento.
3. Esperado: filtra localmente solo los registros autorizados de la unidad. No consulta otras unidades ni añade alias a URL/API.
4. Seleccionar un registro y escribir un filtro que lo excluya. Esperado: selección marcada **fuera del filtro**; editor y borrador permanecen. **Sin coincidencias** no selecciona otro paciente.
5. Crear un borrador de emergencia y probar también **Buscar paciente de la unidad por alias o ID**. Enter en búsqueda no guarda emergencia ni maestro. Borrar filtro restaura opciones sin cambiar paciente.
6. Cambiar sesión/unidad/permisos: filtros y selección del panel anterior no reaparecen. Los intentos pendientes se rigen por A; no recargar/cambiar ámbito deliberadamente para resolver incertidumbre.

### CG2 — Maestro y episodio son acciones diferentes

1. Crear dos episodios sintéticos reutilizando el mismo paciente.
2. **Pacientes y catálogo → Registro del paciente → Guardar registro del paciente** cambia maestro para futuras reutilizaciones. Esperado: ambos episodios previos conservan su identificación; ese mensaje no significa corrección del episodio.
3. Ir a **Episodios de la unidad**, identificar uno aún notificado/en traslado y abrir **Corregir identificación de este episodio**.
4. Cambiar alias y edad, indicando unidad (por ejemplo31años), y motivo sintético. Pulsar **Guardar identificación de este episodio**.
5. Esperado: alias y edad actualizados en esa tarjeta; versión del episodio+1. Maestro y segundo episodio intactos. No cambian triaje, notas, mediciones, hitos ni autores previos.

### CG3 — Destino e identificación anterior

1. Mantener Urgencias destino abierta en otro perfil antes de guardar CG2.
2. Esperado: aviso WebSocket mínimo solicita refresco API; tarjeta/detalle muestran identificación corregida. Si WS no está disponible, conciliación HTTP o **Actualizar** recupera lo mismo; no se presume falloWS por editar el maestro.
3. Abrir **Historial de identificación de este episodio** en unidad y detalle de Urgencias.
4. Esperado: identificación anterior y corregida, motivo, autor, fecha de servidor y versión. Es historial de este episodio, no historial completo del paciente ni acceso al maestro. Urgencias no obtiene botón de corrección.

### CG4 — Límites, edad y concurrencia

1. Probar identidad desconocida, alias omitido con identidad conocida,0días y edad opcional vacía. Esperado: desconocido/alias no informado/ausencia de edad diferenciados; no convertir ausencia a0 ni inferir fecha de nacimiento.
2. Motivo vacío, meses12, días31, edad negativa o edad sin unidad: no se confirma corrección inválida; formulario corregible conservado.
3. Dos cuentas de la unidad abren formulario; una guarda. Al actualizar la otra, conserva borrador/versión y exige **Cargar identificación actual** antes de reenviar. Un conflicto409 nunca sobrescribe al ganador ni autoenvía.
4. Registrar llegada desde Urgencias. Esperado: no nueva corrección en llegado/cerrado/cancelado, sin edición de históricos. Si llegada y corrección compiten, se serializan por versión, no se pierde la identificación anterior.

### CG5 — Respuesta incierta y reintento

1. La suite sintética reproduce respuesta perdida y respuesta200 sin historial acreditante después del guardado.
2. Esperado: aviso **Reintentar operación**, formulario congelado, sin éxito por200 incompleto y sin reenvío automático. Retry manual conserva UUID/cuerpo/versión y confirma una sola corrección.
3. Login del mismo ámbito conserva intento en memoria; otra cuenta/unidad/grupos/institución lo descarta. Recargar/cerrar puede perderlo; no existe cola clínica persistente en navegador.
4. Replay de operación ya confirmada después de llegada se admite dentro del ámbito y no duplica historia/auditoría; una corrección nueva se bloquea.

### CG6 — Cambio de destino F

1. Corregir identificación del episodio, luego cambiar destino antes de llegada.
2. Esperado: reemplazo toma identificación actual y el vínculo de paciente; **no copia el historial de correcciones** del episodio anterior. Destino antiguo conserva solo su original autorizado.
3. Si el reemplazo se corrige después, replay exactoF continúa validando vínculos/unidad/destino y cadena local coherente desde la identificación heredada. Una respuesta ajena o historial incoherente sigue incierta.

## Verificación reproducible

Desde backend:

```powershell
uv run python manage.py test emergencies.tests_patient_context --noinput
uv run python manage.py test --noinput
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py check
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Desde frontend con Vite activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:patients-catalog
npm run test:unit
npm run test:destination-change
npm run test:milestones
npm run test:local-integrity
npm run test:episode-updates
npm run lint
npm run build
npm run check:diagrams
```

Las regresiones completas y PSrestore usan únicamente datos/transporte sintéticos y dobles locales. No acreditan aceptación real entre dispositivos, atención clínica, despliegue ni restore/RPO/RTO. No se aplicó0010 a desarrollo durante implementación.

## Aceptación pendiente

### Evidencia local del13/11/2026

- Backend228/228 sin `--keepdb`, incluidas11 pruebas de contexto y2 carreras (llegada/corrección y dos correcciones). Maestro/otro episodio intactos, historial encadenado, validación/permisos/versión/replay, rollback, retención y aislamientoF cubiertos.
- Frontend38unitarias+15G+12F+6E+30integridad+3correcciones y regresionesD/unidades/cuentas/administración/WS/sync, tipos/build/Mermaid aprobados. CasosG incluyen búsqueda local por alias/ID, Enter sin envío, fuera de filtro, cambio de ámbito, alias/edad visibles en ambos lados y retry exacto ante respuesta perdida/200 incompleto.
- Revisión independiente estática final sin hallazgos accionables. No ejecutó pruebas ni certifica dispositivos/aceptación manual; la evidencia de suites proviene de la ejecución local del implementador. DetectorUI1vez en los4componentes afectados: sin hallazgos.
- Las capturas del fixturePlaywright local no sustituyen aceptación operativa. No se instaló `agent-browser` ni se realizó inspecciónCDP adicional: CLI ausente. No se modificaron capturas versionadas deREADME.
- Respuesta de corrección privada/no-store; ninguna nueva persistencia clínica de navegador. PSrestore solo dobles localesPASS, sin restore real/RPO/RTO. Migración0010 únicamente runner durante implementación; no grants/cierre/purga/despliegue reales. Gmanual y sus correcciones siguen pendientes.

- [ ] CG1 búsqueda alias/ID, fuera de filtro, Enter y ámbito.
- [ ] CG2 corrección explícita solo del episodio, maestro/otro episodio intactos.
- [ ] CG3 actualización en ambos lados e historial de identificación.
- [ ] CG4 validaciones, conflicto y bloqueo tras llegada.
- [ ] CG5 incertidumbre/replay seguro y memoria por ámbito.
- [ ] CG6 aislamientoF sin heredar historia anterior.
- [ ] Móvil390px sin desborde y formularios legibles.
- [ ] Responsable registra fecha, commit, navegador/dispositivos y observaciones; estas casillas no se completan mediante pruebas automáticas.
