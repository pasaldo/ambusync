# Etapa 1 — backend local mínimo

Fecha de inicio: 29/10/2026. Estado actualizado: 10/11/2026. **Backend local del primer slice y administración global sintética de instituciones implementados; etapa abierta**.

## Propósito y límites

Construir el flujo vertical local del piloto usando **Hospital Operador Demo**, **Hospital Central Demo**, la unidad sintética **Demo-01** y datos de prueba. Esto no cierra la etapa 0 ni autoriza uso clínico. La aplicación no está desplegada. Se ensayó aparte el respaldo cifrado de datos sintéticos hacia Cloudflare R2; esto no convierte R2 en hosting ni autoriza datos reales.

## Cuatro condiciones de entrada

| Punto | Acuerdo/estado | Criterio de salida |
|---|---|---|
| 1. Runtime | Evaluación local autorizada; lock fija Python 3.14.10, Django 5.2.18, DRF 3.18.3 y psycopg 3.3.6. El grupo dev fija Channels 4.3.2/`channels_redis` 4.3.0 solo para smoke test. | `pip-audit` sin vulnerabilidades conocidas y licencias revisadas. La prueba real `group_add/send/receive/discard` pasó en Python 3.14.10 contra Valkey 9.0.3 local; su matriz publicada no declara Python 3.14. Channels/Valkey no se habilitan en la app. PostgreSQL 18.6 ya corre en el clúster aislado del piloto. |
| 2. Contratos | Contrato HTTP del primer slice en `backend/openapi.json`, validación y permisos en DRF; D-005 a D-014 siguen siendo la autoridad funcional. | La PR #5 está integrada en `main`. La suite llegó a 59 pruebas backend (1 omitida) en la última ejecución local registrada; incluye autenticación, emergencias, aislamiento, auditoría e idempotencia/concurrencia. Los contratos de operaciones futuras continúan pendientes. |
| 3. Alcance | Implementados localmente sesión, permisos, auditoría, emergencias, vistas de ambulancia y Urgencias, y administración de cuentas/unidades. La administración de Urgencias tiene subpaneles para crear cuentas, consultar historial y crear unidades; permite asignar o cambiar unidad a cuentas de ambulancia. | Migraciones y pruebas usan PostgreSQL aislado. No es despliegue ni release. WebSocket, GPS, cambio de destino, recuperación de cuenta, informes y otros flujos aprobados siguen pendientes. |
| 4. Entorno | Python 3.14.10 instalado. PostgreSQL 18.6 responde en clúster separado `127.0.0.1:55432`; base/rol `ambusync_dev`, secretos aleatorios en `backend/.env` ignorado por Git. Docker no está instalado. | Versión actualizada y migraciones/pruebas comprobadas. Reproducir arranque con las rutas documentadas; no usar el servicio preexistente en `5432`. |
| 5. Administración global | D-015: rol `system_admin` exclusivo, sin membresía institucional ni permisos clínicos; comando local para aprovisionarlo. El panel crea Receptoras y la primera cuenta Urgencias con administración institucional. | Lista instituciones, edita datos, conserva bajas lógicas y permite reactivar. Desactivación bloquea login y revoca sesiones; se impide si la institución está vinculada como origen/destino a episodios no terminales. Pruebas sintéticas en curso. |

El primer slice y las ampliaciones administrativas descritas sí están implementados localmente; la etapa 1 continúa abierta. Las pruebas frontend y backend se ejecutan localmente y también están configuradas en CI; un resultado local no sustituye la verificación de cada ejecución remota. No se desplegó servicio de aplicación. La base local contiene cuentas y datos sintéticos; no borrar sus datos automáticamente.

La administración global está separada de `/local`: el inicio de sesión lleva `system_admin` exclusivamente a `/sistema`. El alta institucional fija tipo Receptora, valida RUT empresa chileno (76.000.000–79.999.999, dígito módulo 11), nombre, dirección, teléfono opcional y correo único. En la misma transacción crea la cuenta pendiente de Urgencias, grupos `urgencias` + `institution_admin`, membresía y activación de 24 horas por correo local. Un fallo de entrega revierte toda la creación. `system_admin` se crea con `create_system_admin <usuario> <correo>`; no se utiliza Django `is_staff`/`is_superuser` ni hay registro web.

## Stack bajo evaluación local

- Python 3.14.10: Django 5.2, DRF y Channels declaran compatibilidad. `channels_redis` publica pruebas hasta Python 3.13. La prueba exploratoria en 3.14.10 sí pasó, pero no equivale a compatibilidad upstream; Channels/Valkey permanecen solo en dependencias dev y no están conectados al runtime de la aplicación.
- Django 5.2 LTS; DRF 3.18.3; Channels/Daphne y `channels_redis` quedan fuera hasta fijar versiones exactas compatibles y pasar resolución, auditoría y pruebas.
- PostgreSQL 18.6 en el clúster aislado del proyecto para desarrollo y aceptación local. No sustituir las pruebas de integración por SQLite.
- Se probó Valkey 9.0.3 (BSD-3-Clause; Ubuntu 26.04) localmente: `channels_redis` 4.3.0 completó `group_add`, `group_send`, `receive` y `group_discard` en Python 3.14.10. Esto prueba ese camino básico de comandos, no toda la carga ni compatibilidad oficial. Valkey sigue sin ser parte del runtime ni de `CHANNEL_LAYERS`; no usar Redis 8 en esta evaluación por su cambio de licencia.
- Versiones fijadas: Python 3.14.10 (`.python-version`), Django 5.2.18, DRF 3.18.3, psycopg 3.3.6, `dj-database-url` 2.3.0 y `python-dotenv` 1.2.4 en `uv.lock`. El grupo dev fija Channels 4.3.2/`channels_redis` 4.3.0 para compatibilidad; no activa el runtime. `pip-audit` reportó cero vulnerabilidades conocidas. Licencias directas y transitivas se listaron; LGPL-3.0 (psycopg) y MPL-2.0 (certifi) requieren conservar avisos y revisar distribución antes de publicar.
- Fuentes: [Python 3.14.10](https://www.python.org/downloads/release/python-31410/), [compatibilidad de Django 5.2](https://docs.djangoproject.com/en/5.2/releases/5.2/), [requisitos de DRF](https://www.django-rest-framework.org/), [cambios de Channels](https://github.com/django/channels/blob/main/CHANGELOG.txt), [matriz de `channels_redis`](https://pypi.org/project/channels-redis/), [migración/compatibilidad de Valkey](https://valkey.io/topics/migration/) y [versionado PostgreSQL](https://www.postgresql.org/support/versioning/).

## Contrato mínimo del primer flujo

### Sesión y autenticación

- Mismo origen; sesiones Django en cookie `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax`; mutaciones con CSRF. No guardar tokens de sesión en almacenamiento web.
- Endpoints: `GET /api/v1/auth/csrf/` emite cookie/token CSRF; `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/` y `GET /api/v1/auth/me/`. Respuesta genérica de login ante credenciales inválidas/cuenta no disponible; no enumerar cuentas.
- Cuentas y relaciones se crean solo mediante fixtures/comando local explícito; sin registro público, claves predeterminadas compartidas ni envío de correo.
- Django valida contraseñas con longitud mínima de 15 caracteres. Sesión: 30 minutos desde la última interacción explícita mediante `X-AmbuSync-User-Interaction: 1`, máximo absoluto de 12 horas y versión de revocación verificada en cada solicitud autenticada. Telemetría/polling debe omitir el encabezado y no renueva inactividad. Cambiar versión (comando `revoke_sessions <usuario>`) revoca todas las sesiones en su siguiente solicitud.
- El login central autentica y envía a `/local`, que muestra el módulo permitido por los grupos de la cuenta. Las rutas del simulador también requieren una sesión, pero sus casos de ejemplo no se conectan al backend. `/local` renueva inactividad ante interacción humana y omite ese encabezado en polling. Avisa en los dos minutos previos al vencimiento. Borradores permanecen solo en memoria, se conservan al reautenticar la misma cuenta, se descartan si cambia la cuenta y nunca se envían automáticamente.
- Login limita por cuenta y origen: cinco fallos en una ventana de 15 minutos activan espera progresiva de 30 s, 1, 2, 5 y 15 minutos; se reinicia tras 15 minutos sin fallos. Se almacena un HMAC de cuenta/origen, no el nombre ni IP en claro. Se usa `REMOTE_ADDR`; si se añade proxy debe configurarse confianza explícita antes de usarlo.

### Emergencias

- `POST /api/v1/emergencies/`: crea un episodio en estado `notificada` o `en_traslado` según acción explícita aprobada en D-006. La identidad del operador y su unidad activa se resuelven en servidor; no aceptar del cliente un actor, institución operadora o unidad arbitrarios.
- `POST /api/v1/emergencies/{id}/arrival/`: Urgencias del destino confirma llegada física y el servidor cambia el estado a `llegado`, registra fecha, usuario y auditoría. Si el episodio sigue `notificada`, exige motivo de excepción por no existir inicio de traslado registrado. Operadores y cuentas de otros destinos no pueden ejecutar la acción; una repetición no duplica auditoría ni altera la fecha.
- `POST /api/v1/emergencies/{id}/transfer-start/`: solo la ambulancia asignada inicia el traslado desde `notificada`.
- `POST /api/v1/emergencies/{id}/cancel/`: solo la ambulancia asignada cancela desde `notificada` o `en_traslado`, con motivo obligatorio.
- `POST /api/v1/emergencies/{id}/close/`: solo Urgencias del destino cierra desde `llegado`.
- Todas las transiciones requieren `operation_id` y `expected_version`; se validan bajo bloqueo transaccional, con autorización del ámbito, auditoría y reintentos idempotentes. Los estados `cancelada` y `cerrada` son terminales en este alcance.
- El cuerpo incluye UUID `operacion_id`, campos permitidos por D-007, destino habilitado y versión esperada cuando aplique. La validación clínica sigue pendiente antes de cualquier uso asistencial.
- Repetir UUID y contenido devuelve el resultado previamente autorizado sin crear otro episodio; reutilizarlo con contenido distinto produce conflicto. Revalidar permisos al recuperar el resultado.
- `GET /api/v1/emergencies/` y `GET /api/v1/emergencies/{uuid}/`: lista/detalle solo dentro del ámbito asignado al usuario. Ambulancia accede a sus episodios autorizados; urgencias al episodio dirigido a su institución. Un receptor no ve episodios de otra institución. Aplicar D-005/D-006.
- En la interfaz local, Urgencias ordena la bandeja por `en_traslado`, `llegado` y `notificada`. Las canceladas y cerradas van al archivo; cuando hay más de 20 en bandeja, las llegadas más antiguas se archivan hasta dejar 20. El archivo permite filtrar por día, mes, año y estado; la SPA recorre todas las páginas autorizadas de la API.
- La lista usa páginas de 25 por defecto, `page_size` configurable hasta 100, orden estable por creación descendente e ID.
- Errores JSON siguen el formato y categorías de `ARQUITECTURA_PILOTO.md`: validación, no autenticado, no autorizado/no disponible en ámbito, conflicto de estado/versión/idempotencia e indisponibilidad temporal; sin trazas ni contenido ajeno.
- La creación y su `AuditEvent` se confirman en una misma transacción. El evento contiene actor, institución/unidad, acción, objeto, resultado, fecha y correlación; no duplica relato ni payload clínico. No se expone un endpoint de auditoría.
- La creación se confirma en PostgreSQL antes de responder éxito. No afirmar entrega en tiempo real: Channels/WebSocket y el channel layer quedan fuera del primer flujo; más adelante se añadirá reconciliación sin cambiar la autoridad de la API.
- `GET /api/v1/institutions/destinations/` ofrece instituciones receptoras habilitadas a cuentas con rol de ambulancia. La ruta SPA `/local` usa sesión/CSRF para seleccionar destino y crear emergencias; no modifica el simulador ni persiste datos del backend en `localStorage`.
- `GET /api/v1/auth/me/` incluye la unidad ambulancia activa (`id`, `code`, `institution_name`) cuando la cuenta tiene una asignación vigente; la SPA la muestra junto a la sesión local y no permite elegir una unidad arbitraria.
- Síntomas y mediciones vitales aprobadas en D-007 se conservan en la API: por ejemplo, «Disnea», frecuencia cardíaca (lpm) y SpO₂ (%). Las mediciones son independientes y opcionales, con unidad, instante de medición y autor. La SPA no inventa valores ausentes. El catálogo UI aún es una lista de ejemplo, no un catálogo institucional dinámico.
- El formulario de ambulancia muestra una previsualización de la tira de signos vitales antes de guardar. En Urgencias, las tarjetas muestran triage, mediciones y colores de lectura rápida; la llegada puede confirmarse desde la tarjeta sin abrir el detalle. Los rangos y colores son una ayuda visual del piloto sintético, no una validación clínica.

### Criterios verificables

1. Migraciones y tests corren contra PostgreSQL 18.
2. Inicio de sesión, CSRF, consulta de usuario actual, cierre, inactividad, límite absoluto de 12 h y revocación de sesión se verifican; sesión expirada no conserva autorización.
3. Operador autorizado crea una emergencia con campos como `motivo`, `síntomas` y `SpO₂`; urgencias de la institución destino puede leerla.
4. Usuario de otra unidad/institución no crea ni consulta fuera de su ámbito; las pruebas incluyen solicitudes manipuladas.
5. Reintento idempotente no duplica; mismo UUID con contenido distinto y versión/estado obsoletos se rechazan.
6. Fixtures/pruebas no contienen personas, instituciones ni credenciales reales; logs no revelan secretos ni payloads clínicos.
7. CI frontend/backend configurado. Las pruebas backend usan PostgreSQL; CI frontend incluye sincronización Playwright y flujo de cuentas. Valkey/Channels pueden estar disponibles como servicio de prueba, pero no se habilitan en el runtime. Los últimos ajustes a `test:accounts` fueron probados localmente; confirmar en GitHub Actions el resultado remoto del commit vigente antes de declarar CI remoto verde.
8. `system_admin` está separado de los roles operativos; no tiene membresía institucional. Los datos de instituciones sintéticas heredadas se completan mediante `seed_synthetic`; las migraciones no inventan información. La documentación y capturas incluyen el nuevo panel.

## Exclusiones de este primer alcance

Siguen fuera de este slice: WebSocket/Valkey en runtime, GPS, cambio de destino D-014, corrección de mediciones, informes, recuperación administrativa D-013, correo externo, almacenamiento offline persistente, HTTPS público, Docker/despliegue y atención real. Retención D-010/D-011 cuenta con comando, logs y pruebas locales de límites/restauración sintética. El respaldo PostgreSQL → Restic → Cloudflare R2, `restic check` y restauración aislada fueron ensayados manualmente con datos sintéticos; la tarea de Windows se ejecutó manualmente y se consultó su configuración. Esto no equivale a un entorno de aplicación desplegado ni acredita por sí solo RPO/RTO, restauración semanal continua o gasto futuro de R2. La gestión de unidades y reasignaciones sí está implementada en el panel local, pero requiere pruebas de aceptación más amplias y no es gestión operativa de una flota real.

## Entorno local reproducible (PowerShell)

El clúster aislado actualizado vive fuera del repositorio en `$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6`; está ligado únicamente a `127.0.0.1:55432`. Los binarios portables EDB están en `$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin`. La actualización se hizo con `pg_upgrade` en modo copia, no `--link`; el antiguo clúster 18.4 permanece detenido y conservado en `$env:LOCALAPPDATA\AmbuSync\postgres-dev`. El servicio preexistente no se detuvo ni modificó.

`DATABASE_URL`, `DJANGO_SECRET_KEY` y `POSTGRES_ADMIN_PASSWORD` son secretos locales aleatorios en `backend/.env`, con ACL local; `.env` está ignorado por Git. No copiarlo ni compartir secretos.

```powershell
$pgBin = "$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin"
$dataDir = "$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6"
& "$pgBin\pg_ctl.exe" -D $dataDir -o "-h 127.0.0.1 -p 55432" -l "$dataDir\server.log" start
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 55432
uv sync --directory backend --locked --all-groups
uv run --directory backend python manage.py migrate
uv run --directory backend python manage.py seed_synthetic
uv run --directory backend python manage.py test
uv run --directory backend ruff check .
uv run --directory backend pip-audit
uv run --directory backend openapi-spec-validator openapi.json
uv run --directory backend python manage.py runserver 127.0.0.1:8000
```

En otra terminal, desde `frontend/`: `npm ci` y `npm run dev`. Abre `http://127.0.0.1:5173/` e inicia sesión con `demo_ambulancia` o `demo_urgencias`, creadas por `seed_synthetic` con contraseña elegida al provisionarlas. El login abre `/local` y muestra el módulo habilitado por la cuenta. Las rutas `/ambulancia` y `/urgencias` conservan el simulador separado y requieren sesión. Vite y Django se enlazan solo a loopback.

### Administración institucional local

La administración se provisiona solo por procedimiento técnico sobre una cuenta personal activa que ya pertenezca a un establecimiento receptor/de Urgencias; no existe registro público ni creación de administradores desde la interfaz. Las cuentas pertenecientes a una institución operadora (por ejemplo, `demo_ambulancia`) no se pueden provisionar como administradores de cuentas. Comando controlado:

```powershell
uv run --directory backend python manage.py provision_institution_admin <usuario-existente> "<nombre exacto del establecimiento>"
```

Para probar únicamente con las cuentas sintéticas existentes, se puede provisionar `demo_urgencias` en `Hospital Central Demo`; esto combina sus permisos de urgencias y administración en el entorno local. No usar datos ni correos de personas reales.

Solo la cuenta con administración institucional y perfil de Urgencias puede crear cuentas desde la SPA. Puede crear cuentas de Urgencias para su institución y cuentas de ambulancia para una institución operadora habilitada. **Al crear una cuenta de ambulancia es obligatorio asignarle una unidad habilitada de esa institución operadora.** Posteriormente, su administración creadora puede cambiar la unidad desde el historial de cuentas; no se admite crearla sin unidad para asignarla después. El panel local permite consultar cuentas de Urgencias del establecimiento y cuentas de ambulancia creadas por esa administración para instituciones operadoras habilitadas; además, la API permite administrar cuentas de la propia institución. Se añadió una prueba con dos instituciones receptoras: una administración no puede listar ni reasignar una cuenta de ambulancia creada por la otra, pero su creador sí puede reasignarla. La selección de instituciones/unidades operadoras habilitadas sigue siendo un directorio compartido para administraciones de Urgencias y no representa propiedad de dichas instituciones. Las cuentas de administración de ambulancias no pueden crear usuarios. Las altas quedan inactivas hasta completar activación por enlace de un solo uso de 24 horas, entregado por SMTP local; no hay correo externo. Reenviar activación rota el token. Desactivar una cuenta revoca sus sesiones y asignaciones con protecciones de continuidad; las acciones relevantes se auditan.

El desarrollo usa SMTP local de Mailpit en `127.0.0.1:1025` (configurable con `EMAIL_HOST` y `EMAIL_PORT`; UI local habitual `127.0.0.1:8025`). La configuración predeterminada no envía a servicios externos; iniciar Mailpit antes de crear cuentas. Si no se puede entregar el correo, la creación/rotación falla y revierte sus cambios. La gestión local de unidades y reasignaciones está implementada; recuperación de cuenta, cambio de permisos desde la interfaz y entrega externa continúan pendientes.

### Administración global de instituciones (D-015)

- La cuenta global se aprovisiona solo desde backend local; contraseña oculta, mínimo 15 caracteres. Puede haber varias cuentas. El grupo `system_admin` debe ser el único grupo del usuario y no puede tener membresías, `is_staff` ni `is_superuser`:

  ```powershell
  uv run --directory backend python manage.py create_system_admin <usuario> <correo>
  ```

- El login la dirige a `/sistema`. La API global vive bajo `/api/v1/system/institutions/`; sus endpoints exigen sesión, CSRF en mutaciones y rol global exclusivo. El listado incluye activas/inactivas y permite filtrar por estado/buscar por nombre o RUT.
- El alta crea solo una institución Receptora y su primera cuenta de Urgencias con `institution_admin`. El correo institucional de contacto y el de activación son campos independientes, pueden coincidir y el correo institucional debe ser único. La cuenta queda pendiente hasta que defina contraseña desde su enlace de activación local de 24 horas. Institución, cuenta, grupos, membresía, activación y auditoría se crean en transacción; si falla SMTP, se revierte todo.
- RUT acepta formato `NN.NNN.NNN-D`, base entre 76.000.000 y 79.999.999 y dígito verificador módulo 11; se normaliza y no se duplica. Nombre admite letras Unicode, números, espacios y guion (160); dirección 255; teléfono opcional 15 caracteres (`0-9`, `+`, espacios, paréntesis y guion); correo de formato válido, dominio libre y único.
- La edición modifica nombre, RUT, dirección, teléfono o correo por campo; tipo y estado no se cambian en edición. La desactivación conserva institución, membresías, cuentas, unidades e historial, revoca sesiones y bloquea el login de miembros mientras la institución esté deshabilitada. Se rechaza si hay episodios no terminales en que figure como institución operadora o destino. Reactivar vuelve a permitir el login de cuentas que sigan activas; las sesiones anteriores no reviven.
- Cada alta, edición, baja y reactivación registra evento de auditoría. El rol global no lista ni opera emergencias, no administra cuentas institucionales ya existentes fuera de la cuenta inicial y no adquiere permisos clínicos.
- La migración agrega metadata opcional para no fabricar datos. En el entorno sintético, `seed_synthetic` completa los registros institucionales heredados con RUT/dirección/teléfono/correo de prueba de manera idempotente; correos usan `example.test`. No aplicar datos sintéticos a instituciones reales.

### Retención y respaldo sintético

- D-010/D-011: el backend contiene el comando de retención con simulación, aplicación, límites y registros técnicos/auditoría; los límites y la reaplicación tras una restauración sintética se probaron localmente.
- `ops/backups/backup-postgres.ps1`, `restore-postgres.ps1` y `prune-postgres.ps1` automatizan dump PostgreSQL, Restic y política de 24 snapshots horarios/14 diarios. Los secretos se cargan desde Credential Manager con scripts externos a Git.
- Se verificó manualmente una copia sintética en Cloudflare R2, `restic check`, restauración aislada del dump y `pg_restore --list`. También se probó manualmente el wrapper de backup y `prune -DryRun`.
- Una prueba manual exitosa no acredita ejecución periódica sostenida, monitorización/alertas, RPO ≤1 h o RTO ≤4 h. Registrar duración y restauraciones repetidas para demostrar esas metas; revisar cuotas/costes de R2. R2 es solo respaldo, no servidor de aplicación. No incluir secretos, repositorios Restic ni dumps en Git.

`seed_synthetic` solicita contraseñas por entrada oculta (mínimo 15 caracteres); no las imprime ni sobrescribe si las cuentas demo ya existen. Para revocar todas las sesiones de una cuenta local, registrando motivo/ejecutor/hora: `uv run --directory backend python manage.py revoke_sessions demo_ambulancia --reason "motivo operativo"`. El clúster de desarrollo se detiene con `& "$pgBin\pg_ctl.exe" -D $dataDir -m fast stop`. Las pruebas crean una base desechable; el rol local tiene `CREATEDB` solo para ese propósito. El smoke test de Valkey es opcional y se ejecuta cuando `VALKEY_URL` apunta a un servicio local; CI levanta servicios efímeros para sus pruebas.

Se detectó además un servicio Windows preexistente `postgresql-x64-18` en puerto 5432 (binarios 18.4), con escucha en `0.0.0.0` y `::`; no se modificó ni se usa para AmbuSync. Revisar su firewall/configuración por separado. El clúster aislado AmbuSync ya está en 18.6 y escucha solo en `127.0.0.1:55432`; esto no es autorización para abrirlo a la red.
