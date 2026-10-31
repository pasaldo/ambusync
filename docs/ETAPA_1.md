# Etapa 1 — backend local mínimo

Fecha de inicio: 29/10/2026. Estado: **primer backend local implementado; completar endurecimiento y ampliar pruebas**.

## Propósito y límites

Construir el primer flujo vertical de backend para el piloto usando hospitales de ejemplo como **Hospital Operador Demo** y **Hospital Central Demo**, unidad **DEMO-01** y campos de prueba. Esto inicia desarrollo local; no cierra la etapa 0 ni autoriza despliegue, uso clínico, cuentas reales, servicios pagados, correo externo o copias externas. Chile + costo recurrente $0 sigue siendo requisito de cualquier servicio externo.

## Cuatro condiciones de entrada

| Punto | Acuerdo/estado | Criterio de salida |
|---|---|---|
| 1. Runtime | Evaluación local autorizada; lock fija Python 3.14.10, Django 5.2.18, DRF 3.18.3 y psycopg 3.3.6. El grupo dev fija Channels 4.3.2/`channels_redis` 4.3.0 solo para smoke test. | `pip-audit` sin vulnerabilidades conocidas y licencias revisadas. La prueba real `group_add/send/receive/discard` pasó en Python 3.14.10 contra Valkey 9.0.3 local; su matriz publicada no declara Python 3.14. Channels/Valkey no se habilitan en la app. PostgreSQL 18.6 ya corre en el clúster aislado del piloto. |
| 2. Contratos | Primer contrato HTTP implementado en `backend/openapi.json`, validación y permisos en DRF; D-005 a D-014 siguen siendo autoridad. | CI remoto del commit `9e8bc59` (run 41152402319): 23 pruebas backend pasaron; también pasaron OpenAPI, Ruff, auditoría de dependencias, frontend y escaneo de secretos. La suite incluye concurrencia de reintentos idénticos, colisión concurrente con contenido distinto e idempotencia por operador. Otros flujos siguen fuera del primer slice. |
| 3. Alcance | Implementados localmente sesión, permisos esenciales, auditoría y gestión inicial de cuentas institucionales; ciclo inicial de emergencias y vistas separadas de ambulancia/urgencias, con bandeja priorizada y archivo filtrable. | Migraciones y pruebas usan PostgreSQL aislado; no es deploy ni release. Sin WebSocket, GPS ni cambios de destino. La gestión de unidades, reasignación de cuentas y recuperación siguen pendientes. |
| 4. Entorno | Python 3.14.10 instalado. PostgreSQL 18.6 responde en clúster separado `127.0.0.1:55432`; base/rol `ambusync_dev`, secretos aleatorios en `backend/.env` ignorado por Git. Docker no está instalado. | Versión actualizada y migraciones/pruebas comprobadas. Reproducir arranque con las rutas documentadas; no usar el servicio preexistente en `5432`. |

El primer slice sí está implementado y probado localmente; la etapa 1 continúa abierta. No se instaló ni desplegó servicio externo. La base local contiene cuentas demo, hospitales de ejemplo y campos de prueba; no borrar sus datos automáticamente.

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
- Síntomas y mediciones vitales aprobadas en D-007 se conservan en la API: por ejemplo, «Disnea», frecuencia cardíaca (lpm) y SpO₂ (%). Las mediciones son independientes y opcionales, con unidad, instante de medición y autor. La SPA no inventa valores ausentes. El catálogo UI aún es una lista de ejemplo, no un catálogo institucional dinámico.

### Criterios verificables

1. Migraciones y tests corren contra PostgreSQL 18.
2. Inicio de sesión, CSRF, consulta de usuario actual, cierre, inactividad, límite absoluto de 12 h y revocación de sesión se verifican; sesión expirada no conserva autorización.
3. Operador autorizado crea una emergencia con campos como `motivo`, `síntomas` y `SpO₂`; urgencias de la institución destino puede leerla.
4. Usuario de otra unidad/institución no crea ni consulta fuera de su ámbito; las pruebas incluyen solicitudes manipuladas.
5. Reintento idempotente no duplica; mismo UUID con contenido distinto y versión/estado obsoletos se rechazan.
6. Fixtures/pruebas no contienen personas, instituciones ni credenciales reales; logs no revelan secretos ni payloads clínicos.
7. Backend CI configurado con PostgreSQL 18.6 y Valkey 9.0.3. Ejecución remota de la PR #1 completada con éxito para el commit `9e8bc59`: backend, frontend y escaneo de secretos pasaron ([run 41152402319](https://github.com/pasaldo/ambusync/actions/runs/41152402319)). El CI valida pruebas contra PostgreSQL; Valkey se levanta como servicio, pero no se habilita en el runtime de la aplicación.

## Exclusiones de este primer alcance

WebSocket/Valkey en runtime, GPS, cambio de destino D-014, corrección de mediciones, informes, recuperación administrativa D-013, entrega de correo, datos persistidos offline, tarea de retención D-010/D-011, copias, HTTPS público, Docker/deploy y toda atención real. Sus reglas no se contradicen; cada función se incorpora con contratos y pruebas propios antes de habilitarla.

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

Solo el administrador de Urgencias puede crear cuentas, tanto de personal de Urgencias en su institución como de operadores de ambulancia. Para una cuenta operadora selecciona una institución operadora habilitada y una ambulancia ya existente; la cuenta queda vinculada a esa institución y unidad. Una cuenta administradora de ambulancia no puede crear usuarios (el backend rechaza la solicitud, aunque se intente invocar la API directamente). Las altas quedan inactivas hasta que la persona establece una contraseña mediante el enlace de un solo uso enviado por correo (vigencia 24 horas); la administración no define ni recibe esa contraseña. Los enlaces vencidos se pueden reenviar, rotando el token anterior. El admin de Urgencias puede gestionar las cuentas que creó en otras instituciones, además de las cuentas de su propio establecimiento. La desactivación revoca sesiones y asignaciones; el backend bloquea desactivar la propia cuenta, al último administrador o al último operador de una unidad con episodios abiertos. Toda mutación se audita.

El desarrollo usa SMTP local de Mailpit en `127.0.0.1:1025` (configurable con `EMAIL_HOST` y `EMAIL_PORT`; UI local habitual `127.0.0.1:8025`). La configuración predeterminada no envía a servicios externos; iniciar Mailpit antes de crear cuentas. Si no se puede entregar el correo, la creación/rotación falla y revierte sus cambios. Gestión/creación de ambulancias, reasignación posterior de unidad, cambio de permisos y recuperación de cuenta aún no están en esta primera rebanada.

`seed_synthetic` solicita contraseñas por entrada oculta (mínimo 15 caracteres); no las imprime ni sobrescribe si las cuentas demo ya existen. Para revocar todas las sesiones de una cuenta local, registrando motivo/ejecutor/hora: `uv run --directory backend python manage.py revoke_sessions demo_ambulancia --reason "motivo operativo"`. El clúster de desarrollo se detiene con `& "$pgBin\pg_ctl.exe" -D $dataDir -m fast stop`. Las pruebas crean una base desechable; el rol local tiene `CREATEDB` solo para ese propósito. El smoke test de Valkey es opcional y se ejecuta cuando `VALKEY_URL` apunta a un servicio local; CI levanta servicios efímeros para sus pruebas.

Se detectó además un servicio Windows preexistente `postgresql-x64-18` en puerto 5432 (binarios 18.4), con escucha en `0.0.0.0` y `::`; no se modificó ni se usa para AmbuSync. Revisar su firewall/configuración por separado. El clúster aislado AmbuSync ya está en 18.6 y escucha solo en `127.0.0.1:55432`; esto no es autorización para abrirlo a la red.
