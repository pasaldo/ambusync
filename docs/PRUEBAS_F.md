# Bloque F — cambio de destino atómico

**F aprobado manualmente con observación según reporte del responsable, posterior a `c701c58`.** Todas las pruebas reportadas aprobadas; observaciónF1: distinguir visualmente cambio de destino de cancelación ordinaria. Se corrigió el rótulo de ambulancia, tarjeta/archivo y detalle de Urgencias a **Cancelado por cambio de destino** cuando existe reemplazo confirmado. Conserva estado técnico cancelada; no revela destino ajeno ni deduce cambio por texto del motivo. **Corrección verificada automáticamente; revalidación manual del rótulo pendiente.** Sin nuevos detalles de commit ejecutado/plataformas/dispositivos. G autorizado, en diseño de alcance; todavía sin implementaciónG. Solo sintéticos, sin uso clínico/publicación/despliegue; GPSJ pendiente.

## 1. Arranque de esta copia

Rama `feature/pilot-completion`, carpeta `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`. PostgreSQL aislado `127.0.0.1:55432`, Valkey loopback6379; Mailpit local si necesitas crear cuentas. Servicios/dependencias: [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main). No tocar PostgreSQL ajeno5432 ni reiniciar servicios de terceros.

F agrega **emergencies/0007**: vínculo `replaces` one-to-one protegido y `VitalMeasurement.inherited_at`. Durante implementación solo se migra la base efímera de pruebas, no desarrollo. Preparar tu base local con el backend de esta copia detenido por su responsable:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

No duplicar un Daphne ya iniciado; reiniciar solo el proceso de esta copia que administras tras migrar. Otra terminal, Node24.20.0/npm11.19.0, si Vite no está activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local**. No ejecutar `record_pilot_closure`, purgas ni restauraciones para probar F. La prueba de retención de la suite crea cierre solo en su base de pruebas.

## 2. Preparación

- Una ambulancia con cuenta activada y asignada a unidad habilitada; segunda cuenta habilitada de la misma unidad para concurrencia.
- Dos destinos sintéticos receptores habilitados A/B, una cuenta de Urgencias en cada uno, en perfiles/navegadores separados (pestañas privadas pueden compartir cookies).
- Crear episodio sintético hacia A, con antecedentes, C2 y mediciones; dejarlo notificado/en traslado. Tener otro episodio para la llegada antes del cambio.
- Para herencia: agregar70, rectificar70→75 con motivo, luego agregar90 con hora posterior. No usar datos reales.

## 3. Qué probar y resultado esperado

### F1. Formulario explícito y operación conjunta

1. Ambulancia → **Episodios de la unidad** → **Cambiar destino** en el episodio de A.
2. Seleccionar B e introducir **Motivo del cambio de destino**. A no debe ofrecerse como nuevo destino. Abrir/capturar no envía nada.
3. Leer la advertencia: copia datos **guardados en servidor**, no borradores pendientes de antecedentes. Guardar o descartar conscientemente esos borradores antes del cambio si se necesitan en el reemplazo.
4. Pulsar **Confirmar cambio de destino**.
5. Esperado: original **cancelado**, nuevo episodio de B con **ID distinto**, enlaces informativos recíprocos y mensaje «Destino cambiado». Misma unidad/operadora/paciente, motivo/notas/síntomas/triaje copiados. El motivo del cambio es la cancelación del original, no reemplaza el motivo clínico del nuevo episodio.
6. Notificado sigue notificado; en traslado sigue en traslado. La declaración original de traslado conserva autor/fecha; crear reemplazo no inventa otra salida. Nuevo episodio tiene creador/fecha/version1 propios.

### F2. Hospital anterior, nuevo hospital e hitos

1. Antes de F1, confirmar lectura/preparación en A. Tras el cambio, A consulta su episodio cancelado en **Archivo de Urgencias**, conservando sus autores/fechas anteriores.
2. B recibe solo el nuevo episodio, con **Lectura no confirmada** y **Preparación no registrada**. Abrir detalle no registra hitos; B confirma explícitamente según E.
3. El vínculo muestra únicamente ID y aviso de que no concede acceso. No debe expandir datos del otro hospital. Intentar GET del ID nuevo desde A y del original desde B:404 (salvo que la cuenta tenga por separado otro ámbito legítimo; usar cuentas exclusivamente Urgencias para aislar esta prueba).
4. Ambulancia autorizada consulta ambos; urgencias de otro destino, otra unidad y administración global no ganan acceso por el vínculo.
5. Avisos WS son mínimos y posteriores al commit: A recibe cambio del original, B creación del nuevo y la unidad ambos. Un aviso no acredita lectura humana; consultar API recupera avisos perdidos.

### F3. Mediciones heredadas y procedencia

1. En B y ambulancia abrir historial del reemplazo. Esperado:75 y90 heredadas, sin copiar70 rectificada. El original de A conserva70→75 y90 con su historial intacto.
2. Cada heredada tiene ID local nuevo, rótulo **Antecedente heredado; no es una nueva captura**, incorporación al reemplazo y **autor/fecha medida/fecha registrada originales**. No atribuir al operador que cambió destino una medición ajena. No hay FK/enlace clicable hacia mediciones privadas de A.
3. «Vigente en su cadena» no equivale a última muestra: resumen sigue seleccionando por hora medida, normalmente90 en este ejemplo, sin inventar frescura. Copiar no modifica hora de medición.
4. Agregar nueva muestra y rectificar una heredada antes de llegada usando D: original heredada permanece, nuevo valor tiene autor/fecha de la nueva operación, sin alterar el episodio cancelado de A. B puede consultar pero no modificar por su rol Urgencias.
5. Cambiar otra vez B→A (o C habilitado): nuevo ID y vínculo al **predecesor inmediato**, sin aplanar cadena ni perder fechas originales de las mediciones. Primer lector/preparador siempre comienza vacío en cada reemplazo.

### F4. Límites y conflictos

1. Confirmar llegada del episodio reservado y luego intentar cambio: UI no ofrece acción; POST nuevo devuelve409. También se bloquea tras cancelación/cierre.
2. Dos operadores intentan cambiar el mismo episodio: un solo reemplazo; versión obsoleta409, sin cancelar/crear parcialmente ni reenviar automáticamente.
3. Llegada vs cambio simultáneos: si llega primero, no se crea reemplazo; si cambia primero, llegada del cancelado409. Nunca ambos compatibles.
4. Abrir formulario, editar motivo sin enviar, modificar el episodio desde otro operador y pulsar **Actualizar**: aviso de versión distinta, datos capturados conservados y envío bloqueado. **Cargar versión actual para destino** reemplaza destino/motivo del formulario; elegirlos nuevamente tras revisar. Nunca rebasa versión por polling.
5. Destino inhabilitado/no receptor, mismo destino, motivo vacío/corto o campos de actor/estado manipulados: rechazo sin cambiar original. Backend vuelve a validar; no basta el listado del navegador.
6. Retirar/reasignar cuenta invalida su ámbito anterior y limpia borradores/intentos según A/B. La continuidad del último operador sigue vigente. La suite prueba además retiro de un autor de medición heredada concurrente al cambio de otro operador.

### F5. Pérdida de respuesta y reintento seguro

- Suite sintética: servidor guarda par y se pierde respuesta, o devuelve par incompleto/ajeno/vínculo/destino incorrectos. Esperado: **Resultado sin confirmar**; no informa rechazo definitivo ni éxito parcial, conserva UUID/cuerpo/versión y solo reenvía con **Reintentar operación**.
- Actualizar la lista puede mostrar cancelado/reemplazo, pero no confirma por sí solo el intento pendiente. Retry exacto devuelve el **par inmediato actual**, incluso si el reemplazo ya llegó, cerró o fue reemplazado nuevamente. No crea otro episodio, auditoría ni avisos duplicados.
- Cambiar destino/cuerpo/acción usando UUID ya confirmado409. UUID nuevo sobre original cancelado409. Un destino deshabilitado después del cambio no invalida la prueba de replay ya confirmado si la cuenta conserva su ámbito de unidad.
- Expiración conserva intento/borrador solo en memoria para misma cuenta/ámbito; login no reenvía. Logout explícito, otra identidad/grupos/institución/unidad lo descarta. Recargar/cerrar puede perderlo. Sin almacenamiento clínico web ni cola offline.
- Cortar red antes de enviar no prueba guardado previo; escenario determinista en `test:destination-change`. No equivale a nueva aceptación real PC/celular/Django.

## 4. Comandos de verificación

Backend, con PostgreSQL/Valkey disponibles:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv run python manage.py test emergencies.tests_destination_change --noinput
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Frontend con Vite de esta copia:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:destination-change
npm run test:unit
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

`test:local-websocket` es silencioso si aprueba: verificar `$LASTEXITCODE` (0), no esperar un resumen. Usa transporte sintético. Wrapper restauración con dobles: desde raíz `./ops/backups/tests/restore-postgres.tests.ps1`, sin red ni restauración real.

## 5. Registro de aceptación y verificación

Regresión final de correcciónF1: unitarias32/32, browserF12/12, E6/6, integridad30/30, correcciones3/3, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3 PASS. La primera regresión detectó cambio no deseado del distintivo ordinario «Cancelada»; se restauró ese texto y se repitieron todas las suites anteriores con éxito. Backend no se modificó ni se repitió:199/199 corresponde al cierreF previo, no a nueva ejecución en esta corrección.

**Actualización posterior del responsable:** F aprobado con observaciónF1; reemplaza el estado pendiente histórico de esta sección. CorrecciónF1: prueba browser observada RED por rótulo ausente y luego GREEN; unitarias32/32 y suiteF12/12, incluidos archivo/detalle receptor anterior y cancelación ordinaria sin falso rótulo. No cambió backend/modelo/migración/datos. Para revalidar manualmente: cambiar destino, comprobar **Cancelado por cambio de destino** en original de ambulancia y tarjeta/archivo/detalle de Urgencias anterior; cancelar otro episodio normalmente y comprobar el texto previo (**Cancelada** en distintivo, **Cancelado:** en detalle), sin atribuirle cambio. El receptor anterior no debe ver nombre ni datos del nuevo hospital.

Frontend final: **31/31 unitarias,10/10 escenarios F,6/6 E,30/30 integridad,3/3 correcciones**, actualizacionesD/unidades/cuentas/administración global/WS/sincronización/tipos/build/Mermaid3/3 PASS sobre Vite5174. Vista390px sintética revisada sin desborde horizontal, sin regenerar capturas versionadas de README. No CI remoto ni nueva aceptación real entre dispositivos. Revisión independiente: dos importantes corregidos con regresiones RED→GREEN; sin nuevos menoresF pendientes. Menores previos de coberturaE/harness de temporizadores continúan documentados, sin afirmar fallo funcional.

Verificación backend local del13/11: **199/199** PostgreSQL sin `--keepdb`, incluidas18 pruebasF (7 de concurrencia), WS con audiencias separadas y retención de cadenas. Django/migraciones/Ruff/formato/OpenAPI PASS. Se reforzó y repitió1/1 rollback después de guardar original y programar callback, antes de registrar operación: par/auditoría/callbacks revertidos. El aviso `Emergency notification publication failed.` corresponde al test deliberado de transporte fallido; no ignorar avisos operativos fuera de esa prueba. Wrapper PowerShell PASS con dobles locales, sin red ni restore real. No se migró desarrollo ni se ejecutaron cierres/purgas/restauraciones sobre sus datos.

### Decisiones técnicas y límites de revisión

- Herencia en filas locales nuevas, sin referencias a mediciones de otro episodio; se conservan autor/horas originales y se rotula incorporación para evitar confundirla con recaptura. Se heredan hojas no rectificadas, incluidas muestras independientes, no solo la última de cada tipo.
- Bloqueos de cuentas usan `FOR NO KEY UPDATE` en transiciones/administración de asignaciones: excluyen cambios concurrentes de cuenta pero permiten referencias FK de autoría. Estas rutas no cambian la clave primaria de usuarios; si se introdujeran cambios de clave, habría que revisar esta decisión.
- Transiciones de episodios existentes bloquean únicamente la unidad objetivo (`OF self`), evitando bloquear incidentalmente su institución por ordenación SQL antes del nuevo destino. La creación conserva su bloqueo anterior; destinoF usa NO KEY UPDATE y revalida habilitación. Carreras y ámbito se verifican sin eliminar continuidad B.
- Revisión independiente detectó dos importantes: deadlock con instituciones combinadas cruzadas y aceptación de paciente distinto en respuesta F. Se reprodujeron antes de corregir y se agregaron regresiones. No certifica aceptación real entre dispositivos, uso clínico, GPS, despliegue ni restore/RPO/RTO. La guía/contrato se contrastan en el cierre local; manualF queda pendiente.
- G deberá revisar la validación de identidad de paciente si habilita correcciones de ese contexto antes de replay; F actual no permite cambiarlo. Antecedentes editables del reemplazo no se comparan con original al resolver replay, porque D puede haberlos actualizado legítimamente.

- [ ] Revalidación del rótulo posterior a aprobaciónF: cambio de destino explícito en ambulancia, tarjeta/archivo/detalle de Urgencias anterior; cancelación ordinaria sigue distinta.

Checklist histórico de la aceptaciónF, aprobada según reporte del responsable; se conserva como plantilla para registrar detalles de ejecución:

- [ ] Migración0007 y arranque local.
- [ ] F1 cambio explícito conjunto y conservación de datos/estado.
- [ ] F2 aislamiento A/B e hitos nuevos.
- [ ] F3 herencia de muestras, autores/horas y cadena de cambios.
- [ ] F4 estados/versión/concurrencia/permisos.
- [ ] F5 incertidumbre/replay y límites de memoria.
- [ ] Vista móvil sin desborde, botones y fechas legibles.
- [ ] Registrar responsable, fecha, commit ejecutado, navegadores/dispositivos y observaciones. Suites sintéticas no marcan esta aceptación.
