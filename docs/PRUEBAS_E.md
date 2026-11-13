# Bloque E — lectura explícita y preparación de Urgencias

**Aceptación manual del responsable pendiente.** Solo episodios sintéticos, sin uso clínico. B/C/D y las cuatro correcciones anteriores fueron aprobados por el responsable al autorizar E; C conserva alcance local sin nueva evidencia de restore real/RPO/RTO. F no iniciado.

## 1. Arranque de esta copia

Rama `feature/pilot-completion`, carpeta `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`. No usar la otra copia de main ni las rutas demo para aceptar backend. PostgreSQL aislado `55432`, Valkey en loopback `6379`, Mailpit local si necesitas altas. Si faltan servicios, consultar [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main). No reiniciar servicios ajenos ni tocar PostgreSQL `5432`.

E añade **migración emergencies/0006** con `read_at/read_by` y `prepared_at/prepared_by`, pares autor/fecha y preparación que requiere lectura. Los episodios previos quedan sin hitos: no se inventa historia. Durante implementación solo se migró la base efímera de pruebas. Para preparar tu base local, con backend detenido por su responsable si estaba activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

No iniciar un segundo Daphne si ya existe uno; tras migrar, reiniciar únicamente el proceso de esta copia que tú administras. En otra terminal, Node24.20.0/npm11.19.0, si Vite no está activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local**. No ejecutar cierre formal del piloto, purga ni restauración para aceptar E. Sin publicación ni servicios externos.

## 2. Preparación

1. Cuenta sintética de ambulancia habilitada/asignada y dos cuentas Urgencias habilitadas del destino. Para ámbitos ajenos, otra unidad/destino y administración global sin permiso clínico.
2. Usar perfiles o navegadores separados; pestañas privadas de un mismo navegador pueden compartir cookies.
3. Crear al menos tres episodios sintéticos identificables, destinados a la Urgencias de prueba, dejados notificados/en traslado y sin llegada. Reservar uno sin lectura para E4.
4. En DevTools → Network puedes observar `read/`, `prepare/` y respuestas GET. Las fechas de hitos se muestran en `America/Santiago`; la API conserva instantes con zona explícita. «Autor» muestra el ID de cuenta, no un nombre inferido.

## 3. Casos manuales y resultados esperados

### E1. Abrir no es leer

- Urgencias: abrir y cerrar varias veces el detalle de un episodio nuevo; actualizar la lista y esperar un aviso/sondeo.
- **Esperado:** «Lectura no confirmada» y «Preparación no registrada» en detalle y ambulancia. Ningún POST `read/` ni `prepare/`. El episodio guardado/recibido por HTTP o WS no acredita lectura humana.
- «Confirmar lectura» disponible, «Registrar preparación» deshabilitado. Intentar preparación sin lectura mediante API autenticada devuelve409; no crea hitos ni reserva una operación fallida.

### E2. Lectura explícita y preparación

- Pulsar **Confirmar lectura** desde Urgencias A.
- **Esperado:** «Primera lectura confirmada», autor A y hora servidor; versión aumenta una vez. Preparación se habilita. Estado notificada/en traslado no cambia. Ambulancia → **Episodios de la unidad** muestra el mismo hito tras conciliar HTTP; nunca ofrece botones para registrarlo por ese rol.
- En Urgencias B abrir el mismo episodio y pulsar **Registrar preparación**.
- **Esperado:** primer preparador B con su hora propia; primer lector A/hora intactos, versión aumenta una vez. Preparación no afirma box disponible ni inicio de atención. Horas coherentes en ambos perfiles.
- Desde ambulancia modificar solo notas/mediciones según D: los primeros autores/fechas de lectura y preparación permanecen. La UI advierte que primera lectura no certifica revisiones posteriores.

### E3. Concurrencia, repetición y primer autor

- Dos receptores abren otro episodio sin lectura. Intentar confirmar ambos casi simultáneamente.
- **Esperado:** un primer lector; si ambos enviaron la misma versión, uno200 y el otro409. Tras conciliar, ambos ven el mismo autor/hora. No sobrescribir ni autoenviar con versión nueva. Si el segundo ya recibió la actualización, puede desaparecer su botón sin enviar POST.
- Repetir la carrera con preparación después de lectura: un primer preparador, sin doble incremento/auditoría/aviso.
- Contrato API: un UUID nuevo con versión **vigente** sobre hito existente devuelve200 y `Milestone-Already-Recorded: true`, reservando UUID sin cambiar versión/autor/fecha ni repetir auditoría/aviso. UUID nuevo con versión **obsoleta** devuelve409, aunque el hito exista. La UI normalmente oculta la acción ya registrada; este caso se cubre automáticamente en backend.
- Reintento exacto de UUID confirmado devuelve200 y `Idempotent-Replay: true`; cambiar su cuerpo/acción/episodio devuelve409. No reutilizar UUID manualmente para una acción distinta.

### E4. Llegada no requiere ni fabrica hitos

- En el episodio reservado sin lectura, confirmar llegada (con motivo si corresponde a llegada excepcional sin inicio de traslado).
- **Esperado:** llegada válida, lectura/preparación siguen ausentes; desaparecen sus botones. Nuevos POST `read/` y `prepare/` tras llegado/cancelado/cerrado devuelven409. No hay lectura retrospectiva inventada.
- En un episodio con hitos, marcar llegada y cerrar: conserva autores/fechas originales. Un replay exacto de operación E ya confirmada antes de llegada sigue permitido si mantiene el ámbito autorizado; no habilita una acción nueva posterior.

### E5. Respuesta incierta y reautenticación

- La suite de navegador reproduce pérdida de respuesta **después** de guardar: aparece intento sin confirmar, no se habilitan nuevas escrituras de ese episodio y no hay reenvío automático. En detalle se puede pulsar **Reintentar operación del episodio** sin cerrar el modal. El retry global **Reintentar operación** también conserva UUID/cuerpo/versión.
- Si otro receptor confirma llegada mientras el intento queda incierto, el botón de retry sigue permitiendo resolverlo desde detalle, sin fabricar preparación ni repetir el registro.
- Respuesta de otro episodio o sin autor/fecha del hito no confirma la operación, aunque sea200. No-op E válido admite igual versión; acciones anteriores siguen exigiendo incremento.
- Si expira sesión durante un intento, reautenticar la misma cuenta/ámbito: intento conservado solo en memoria, envío únicamente al pulsar retry. Logout explícito o cuenta/grupos/unidad/institución distintos lo descartan. Recargar/cerrar puede perderlo; no hay cola offline ni almacenamiento clínico persistente.
- Cortar la red antes de enviar no prueba guardado previo; usar la suite para ese caso determinista. No presentar simulación HTTP como prueba real entre dispositivos/backend.

### E6. Permisos y consulta

- Ambulancia solo consulta hitos; un POST por ese rol devuelve403. Administración institucional sin Urgencias y administración global tampoco los registran.
- Urgencias de otro destino no consulta/confirma ese episodio (404 dentro del ámbito); retirar la membresía válida impide también replay previamente confirmado.
- Comprobar en móvil que detalle, autores/fechas y botones se leen sin desborde horizontal. No se afirma aceptación Android/iPhone por la captura Chromium sintética.

## 4. Verificación automatizada

Backend, con PostgreSQL/Valkey activos:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv run python manage.py test emergencies.tests_milestones --noinput
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Frontend con Vite de esta rama activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:milestones
npm run test:unit
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

## 5. Registro de aceptación

Regresiones finales aprobadas: integridad30/30, correcciones3/3, actualizacionesD, unidades, cuentas, administración global, WebSocket, sincronización, tipos y Mermaid3/3. El selector global de retry de integridad se hizo exacto para distinguirlo del nuevo retry del modal; se observó fallo de ambigüedad y luego30/30 GREEN. Sin cambios funcionales por ese ajuste del test.

Evidencia local del 13/11: backend completo **180/180** sin `--keepdb` (incluye18 de hitos y4 carreras PostgreSQL), Django/migraciones/Ruff/formato/OpenAPI aprobados; frontend **28/28** unitarias y **6/6** nuevos escenarios E; build aprobado. Wrapper PowerShell PASS con dobles locales, sin restore real. Vista Chromium390px revisada sin desborde; no sustituye aceptación real. El aviso de publicación fallida de la suite backend corresponde a su prueba deliberada de transporte fallido, no autoriza ignorar avisos operativos.

Revisión independiente sin defectos funcionales/de seguridad demostrables. Menores de cobertura diferidos: browser específico de no-op/preparación corrupta/versión inferior; combinación backend no-op de segundo receptor→llegada→replay→retiro de membresía. Las validaciones están implementadas y los componentes se prueban por separado; no son defectos funcionales observados. El menor previo del harness de temporizadores cancelados sigue documentado en la revisión BCD.

- [ ] Migración0006/arranque de esta copia verificados.
- [ ] E1 sin autolectura; preparación exige lectura.
- [ ] E2 hitos explícitos, autores/fechas y consulta de ambulancia.
- [ ] E3 carreras/repetición sin sobreescribir primeros autores.
- [ ] E4 llegada sin hitos y bloqueo de nuevas acciones posteriores.
- [ ] E5 resultado incierto/reintento y límites de memoria comprendidos.
- [ ] E6 ámbito/permisos y vista móvil.
- [ ] Responsable registra fecha, commit, navegadores/dispositivos y observaciones. Esta lista no se marca por ejecutar suites sintéticas.
