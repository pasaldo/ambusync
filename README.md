# AmbuSync â€” Piloto SintÃ©tico Desplegado

**Punto 0 â€” Estado del piloto L (aprobado):**
El punto **L se encuentra aprobado**. El piloto estÃ¡ desplegado en Render bajo `https://ambusync-pilot.onrender.com/` (Web Service Docker Free, Oregon, `autodeploy` Off), con datos sintÃ©ticos exclusivamente y costo estricto **$0**. El buzÃ³n de pruebas Mailpit estÃ¡ activo bajo `/buzon-pruebas/` con credencial tÃ©cnica independiente (`operador`). No estÃ¡ autorizado para atenciÃ³n clÃ­nica real.

---

## 1. Resumen del piloto

AmbuSync es un prototipo sintÃ©tico de traslado clÃ­nico entre una unidad de ambulancia y un servicio de urgencias, operando entre dispositivos mediante HTTPS. El punto **L (primer despliegue sintÃ©tico)** estÃ¡ aprobado y desplegado en Render:

- **URL del piloto:** `https://ambusync-pilot.onrender.com/`
- **Plataforma:** Render Web Service Docker Free, regiÃ³n Oregon, 0.1 CPU / 512 MiB, autodeploy desactivado.
- **Costo:** $0 mensual (plan Hobby sin tarjeta, sin add-ons, sin segundo servicio).
- **Datos:** exclusivamente sintÃ©ticos; ficticios son aceptables con el buzÃ³n de pruebas.
- **AutenticaciÃ³n:** sesiÃ³n de Django; las rutas `/ambulancia` y `/urgencias` son un simulador demo separado del backend; `/local` y `/sistema` integran el flujo de emergencias y administraciÃ³n institucional.
- **BuzÃ³n de pruebas:** Mailpit real + proxy Caddy dentro del mismo contenedor Web Free, acceso independiente bajo `/buzon-pruebas/` con usuario `operador` y contraseÃ±a privada (bcrypt costo 12). Los mensajes se capturan localmente; no hay entrega de Internet, relay, forwarding ni webhook.
- **GeocodificaciÃ³n:** Geoapify desde el backend Ãºnicamente para direcciones institucionales, timeout total de 10 segundos, cuota 100 intentos/dÃ­a UTC, sin reintentos automÃ¡ticos.
- **Estado:** Live. Salud `live/` y `ready/` devuelven 200 JSON. SPA, manifest, service worker y recursos estÃ¡ticos devuelven 200. CSRF con cookie Secure SameSite=Lax. BuzÃ³n y API de mensajes rechazan solicitudes sin credenciales Basic (401).

**No estÃ¡ autorizado:** uso clÃ­nico real, correo externo real, backups reales, restauraciÃ³n, alta disponibilidad, o dispositivos mÃ³viles fÃ­sicos sin aceptaciÃ³n separada.

---

## Muestras del funcionamiento

Capturas de las vistas locales de ambulancia, Urgencias y administraciÃ³n global. Todas usan un mock con datos sintÃ©ticos; no representan sesiones ni datos leÃ­dos de un backend real.

### 1. Ingreso a la aplicaciÃ³n

<p align="center">
  <img src="docs/screenshots/01-inicio-sesion.png" alt="Inicio de sesiÃ³n AmbuSync" width="420" />
</p>

### 2. Portal local de ambulancia

La vista actual permite ingresar una emergencia desde el portal local, muestra la unidad asignada y previsualiza los signos vitales que verÃ¡ Urgencias al confirmar.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/02-ambulancia-inicio.png" alt="Inicio de la ambulancia" width="230" /><br/><sub>Inicio de la unidad</sub></td>
    <td align="center"><img src="docs/screenshots/03-ingreso-episodio.png" alt="Ingreso de episodio local" width="230" /><br/><sub>Ingreso de episodio</sub></td>
    <td align="center"><img src="docs/screenshots/04-vista-previa-vitales.png" alt="Vista previa de signos vitales" width="230" /><br/><sub>Vista previa de vitales</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/05-episodios-unidad.png" alt="Episodios de la unidad" width="230" /><br/><sub>Episodios de la unidad</sub></td>
    <td align="center"><img src="docs/screenshots/06-urgencias-entrantes.png" alt="Episodios entrantes de Urgencias" width="340" /><br/><sub>Urgencias entrantes</sub></td>
    <td align="center"><img src="docs/screenshots/07-archivo-urgencias.png" alt="Archivo de Urgencias" width="340" /><br/><sub>Archivo filtrable</sub></td>
  </tr>
</table>

### 3. Portal local de Urgencias

La bandeja actual ordena los episodios, muestra triage y signos vitales directamente, permite registrar la llegada desde la tarjeta y conserva un archivo filtrable.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/08-detalle-episodio.png" alt="Detalle de episodio local" width="340" /><br/><sub>Detalle + signos vitales</sub></td>
    <td align="center"><img src="docs/screenshots/09-llegada-registrada.png" alt="Llegada registrada desde la tarjeta" width="340" /><br/><sub>Llegada desde la bandeja</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/10-administracion-cuentas.png" alt="AdministraciÃ³n de cuentas" width="340" /><br/><sub>AdministraciÃ³n: crear cuentas</sub></td>
    <td align="center"><img src="docs/screenshots/11-administracion-historial.png" alt="Historial de cuentas administradas" width="340" /><br/><sub>Historial y asignaciÃ³n de unidades</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/12-administracion-unidades.png" alt="GestiÃ³n de unidades de ambulancia" width="340" /><br/><sub>Unidades de ambulancia</sub></td>
  </tr>
</table>

### 4. AdministraciÃ³n global de instituciones

El rol global exclusivo de administraciÃ³n lista instituciones activas e inactivas, permite editar sus datos y conservarlas mediante baja lÃ³gica. El alta crea una instituciÃ³n Operadora y Receptora que administra sus propias unidades, junto con una primera cuenta de Urgencias con administraciÃ³n institucional, pendiente de activar por correo local.

<p align="center">
  <img src="docs/screenshots/13-administracion-global-instituciones.png" alt="Panel global de administraciÃ³n de instituciones sintÃ©ticas" width="720" />
</p>

> Las capturas se regeneran con `npm run shots` y muestran vistas de `/local` y `/sistema` con el mock sintÃ©tico (requiere Vite activo en `:5173`); no representan datos de producciÃ³n ni el simulador demo.

---

## 2. Stack

### Frontend
- **React + Vite + TypeScript** (Node 24.20.0, npm 11.19.0)
- **TailwindCSS** (design tokens), **lucide-react** (iconos), **framer-motion** (animaciones)
- **Zustand** (estado global), **React Router** (`/ambulancia`, `/urgencias`, `/local`, `/sistema`)
- Fuentes: **Hanken Grotesk** (UI) + **JetBrains Mono** tabular (vitales/ETA)

### Backend
- **Django / Django REST Framework**
- **PostgreSQL 17** (Render Free, base `ambusync_pilot`, SSL `require`)
- **Valkey** (protocolo Redis, Render Free, loopback vÃ­a Daphne)
- **Daphne** (ASGI, loopback puerto 8000)
- **Caddy** (proxy inverso y servidor del buzÃ³n de pruebas, mismo contenedor Web)

### Correo y ubicaciÃ³n (captura/pruebas)
- **Mailpit real** (SMTP 1025 / UI 8025) dentro del contenedor Web, solo loopback, expuesta vÃ­a Caddy en `/buzon-pruebas/` con BasicAuth independiente.
- **Brevo** como modo predeterminado (`AMBUSYNC_MAIL_MODE=brevo` o ausente); modo captura (`mailpit`) activo para el buzÃ³n de pruebas. No hay fallback automÃ¡tico a Brevo desde captura.
- **Geoapify** (backend Ãºnicamente, direcciones institucionales, timeout 10s, cuota persistente 100/dÃ­a UTC, sin reintentos automÃ¡ticos).

### Despliegue
- **Render Free** (Web Service + PostgreSQL + Key Value), regiÃ³n Oregon, sin dominio comprado, sin CA LAN, listener HTTP accesible solo vÃ­a proxy TLS confiable.
- **Autodeploy Off.** Despliegues manuales por SHA completo (`Manual Deploy â†’ Deploy a specific commit`).
- **SHA de despliegue actual:** `456b5c85fc49b9408a4426fd1cce290ef3b7d621` (rama `main`).

---

## 3. Arquitectura

El piloto despliega una **SPA React** que consume una **API Django/DRF** autorizada. La arquitectura operativa es la siguiente:

```
Navegador (HTTPS)
    â”‚
    â–¼
Render Web Service (Docker Free, Oregon)
    â”‚
    â”œâ”€â”€ Caddy (puerto 10000, proxy inverso)
    â”‚     â”œâ”€â”€ /buzon-pruebas/ â”€â”€â–º Mailpit (SMTP 1025 / UI 8025, loopback)
    â”‚     â””â”€â”€ /                 â”€â”€â–º Daphne (ASGI, 127.0.0.1:8000, loopback)
    â”‚                                       â”‚
    â”‚                               Django / DRF
    â”‚                                       â”‚
    â”‚                               PostgreSQL 17 (Render Free, interna)
    â”‚                                       â”‚
    â”‚                               Valkey (loopback, avisos de sesiÃ³n)
    â”‚
    â””â”€â”€ Backend â”€â”€â–º Geoapify (solo direcciones institucionales, timeout 10s)
```

**Principios de diseÃ±o:**
- **Correo:** modo captura (Mailpit) para pruebas de activaciÃ³n/recuperaciÃ³n; los mensajes son efÃ­meros (100 mensajes / 24h configurados). Las cuentas persisten en PostgreSQL aunque el buzÃ³n se vacÃ­e al reiniciar.
- **Seguridad:** Daphne y Valkey expuestos solo en loopback; solo Caddy escucha el puerto pÃºblico. Cookies de sesiÃ³n `Secure` y `SameSite=Lax`; CSRF token vÃ¡lido. Acceso al buzÃ³n tÃ©cnico (`operador`) independiente de la sesiÃ³n de Django.
- **WebSocket:** usado como aviso para refrescar desde la API; PostgreSQL/HTTP siguen siendo la autoridad. No hay shell duradero.
- **Sin datos clÃ­nicos reales:** solo sintÃ©ticos; no se introduce informaciÃ³n personal ni de pacientes reales.

---

## 4. Modelo de datos (resumen)

El modelo de backend incluye (no es el schema completo):

| Entidad | PropÃ³sito |
|---------|-----------|
| `Institution` | Operadora, receptora o ambas (`combined`). |
| `Ambulance` / `AmbulanceAssignment` | Unidades de ambulancia y asignaciones a cuentas de ambulancia. |
| `Emergency` | Episodio de traslado con hitos (notificada, en_traslado, llegado, cerrada/cancelada). |
| `Patient` / `VitalMeasurement` | Paciente sintÃ©tico y mediciones seriadas (originales inmutables, rectificaciÃ³n encadenada). |
| `AccountActivation` | InvitaciÃ³n de activaciÃ³n, 24 horas, un uso. |
| `IdentityRecoveryCase` / `PasswordRecovery` / `RecoveryContact` | Flujo de recuperaciÃ³n de cuenta. |
| `AuditEvent` / `SessionRevocationEvent` | AuditorÃ­a (plazo 12 meses) y revocaciÃ³n de sesiones. |
| `GeocodingLookup` / `GeocodingQuota` | CachÃ© y cuota de geocodificaciÃ³n institucional. |

**Reglas clave:**
- Una cuenta de ambulancia opera solo sobre su unidad asignada activa.
- Un episodio pertenece a una instituciÃ³n receptora; el receptor consulta solo sus episodios dirigidos.
- Cambio de destino antes de recepciÃ³n: cancelaciÃ³n atÃ³mica del episodio original y creaciÃ³n de reemplazo vinculado, sin heredar hitos ni acceso del receptor.
- RetenciÃ³n: aplicaciÃ³n hasta 90 dÃ­as tras cierre formal; auditorÃ­a 12 meses tras cierre; logs tÃ©cnicos 30 dÃ­as.

---

## 5. Estructura del repositorio

```
ambusync/
â”œâ”€â”€ backend/                 # Django/DRF: accounts, institutions, emergencies, audit, reports, config
â”œâ”€â”€ frontend/                # React + Vite + TypeScript (SPA, PWA, scripts de prueba)
â”œâ”€â”€ ops/
â”‚   â”œâ”€â”€ deploy/              # Scripts y tests de despliegue contenedor (Mailpit, Caddy, smoke)
â”‚   â””â”€â”€ backups/             # Pruebas de guarda de respaldo (dobles, sin red ni restauraciÃ³n real)
â”œâ”€â”€ docs/                    # Etapas, planes, pruebas, evidencias, decisiones (ETAPA_0, ETAPA_1, DESPLIEGUE_L, etc.)
â”œâ”€â”€ Dockerfile               # Imagen no-root, UID 10001, sin herramientas de compilaciÃ³n en runtime
â”œâ”€â”€ .dockerignore
â”œâ”€â”€ backend/pyproject.toml / uv.lock
â””â”€â”€ frontend/package.json / package-lock.json
```

**Nota:** `backend/.env` y los secretos de Render **no** se versionan ni comparten por chat.

---

## 6. Calidad

| Ãrea | Estado |
|------|--------|
| Backend | 388 tests (387 PASS / 1 skip Windows por symlink), `ruff check`, `makemigrations --check`, `openapi-spec-validator`, `pip-audit` |
| Frontend | 18 scripts de prueba, `tsc --noEmit` (lint), diagramas Mermaid vÃ¡lidos (3/3) |
| Imagen contenedora | No-root (UID 10001), sin file capabilities innecesarias, sin herramientas de compilaciÃ³n, sin `.env` ni `.git` en el artefacto |
| Recursos | LÃ­mite Docker 512 MiB / 0.1 CPU; muestras 179.3 / 220.6 / 163.9 MiB; CPU instantÃ¡nea 0.10 / 0.13 / 0.10 % |
| Seguridad | CSP restrictiva, herramientas de diagnÃ³stico de Mailpit bloqueadas, acceso al buzÃ³n solo con BasicAuth |

---

## 7. Estado del piloto desplegado (punto L aprobado)

| Componente | Estado |
|------------|--------|
| Despliegue en Render | âœ… Live, SHA `456b5c85fc49b9408a4426fd1cce290ef3b7d621` |
| Salud `live/` / `ready/` | âœ… 200 JSON `{"status": "ok"}` |
| SPA / recursos estÃ¡ticos | âœ… 200 |
| API desconocida | âœ… 404 sin shell HTML |
| CSRF | âœ… Cookie Secure / SameSite=Lax |
| BuzÃ³n de pruebas | âœ… 401 sin credenciales Basic, independiente de sesiÃ³n Django |
| ActivaciÃ³n / recuperaciÃ³n | âœ… Capturadas en Mailpit (un uso, 24h / 30 min, sin autologin) |
| GeocodificaciÃ³n | âœ… Timeout 10s, consulta real verificada con direcciÃ³n institucional |
| Correo externo real | âŒ No autorizado / pendiente |
| AceptaciÃ³n L completa | âœ… Aprobada (punto L aprobado, despliegue Live verificado) |
| Backups / restauraciÃ³n real | âŒ Pendiente (dobles locales solo) |
| GPS / cambio de destino | âŒ Pendiente (diseÃ±o aprobado, no implementado) |

---

## 8. Desarrollo local

Esta secciÃ³n explica cÃ³mo levantar el proyecto completo en tu mÃ¡quina para desarrollo y pruebas locales. Usa datos sintÃ©ticos y no se conecta al despliegue de Render.

### Requisitos previos
- Python 3.14.10 y `uv` 0.11.26
- Node.js 24.20.0 y npm 11.19.0
- PostgreSQL 18.6 (instalaciÃ³n local de AmbuSync en `C:\Users\pablo\AppData\Local\AmbuSync\postgresql-18.6-binaries\`)
- Valkey en WSL (Ubuntu)
- Docker Desktop (opcional, solo para pruebas de contenedor)

### Paso 1: Instalar dependencias

Desde la raÃ­z del repositorio (`ambusync/`):

Backend:
```powershell
uv sync --directory backend --locked --all-groups
```

Frontend:
```powershell
Set-Location frontend
npm ci
npx playwright install chromium
Set-Location ..
```

### Paso 2: Iniciar PostgreSQL aislado

Usa el clÃºster de desarrollo de AmbuSync en `127.0.0.1:55432`. No uses ni modifiques el servicio PostgreSQL preexistente en `5432`.

```powershell
$pgBin = "$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin"
$dataDir = "$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6"
& "$pgBin\pg_ctl.exe" -D $dataDir -o "-h 127.0.0.1 -p 55432" -l "$dataDir\server.log" start
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 55432
```

### Paso 3: Preparar la base y cuentas sintÃ©ticas

Ejecuta migraciones y crea las instituciones, unidad y cuentas de prueba. `seed_synthetic` solicita las contraseÃ±as de forma oculta y no imprime credenciales.

```powershell
uv run --directory backend python manage.py migrate
uv run --directory backend python manage.py seed_synthetic
```

### Paso 4: Iniciar Valkey local (WSL)

La lÃ­nea WebSocket requiere Valkey y `VALKEY_URL` en el `backend/.env` local. En este equipo Valkey escucha solo por loopback. MantÃ©n WSL activo durante la prueba.

```powershell
wsl -d Ubuntu -- bash -lc "sudo -n systemctl start valkey-server && exec sleep infinity"
```

En otra terminal, comprueba que Valkey devuelve `PONG`:
```powershell
wsl -d Ubuntu -- valkey-cli -h 127.0.0.1 -p 6379 ping
```

### Paso 5: Iniciar Daphne/ASGI

En otra terminal desde la raÃ­z, usa Daphne (no `manage.py runserver`) para servir HTTP y WebSocket:

```powershell
uv run --directory backend daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

### Paso 6: Iniciar el frontend

En otra terminal:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Abre <http://127.0.0.1:5173> e inicia sesiÃ³n con una cuenta sintÃ©tica. Para probar desde otro dispositivo, sigue los pasos LAN de ETAPA_1.md: Vite debe enlazarse a la IP LAN del PC, mientras Daphne y Valkey permanecen en loopback. El login abre `/local` y muestra el mÃ³dulo permitido por los grupos de la cuenta. Las rutas `/ambulancia` y `/urgencias` son el simulador demo separado y tambiÃ©n requieren sesiÃ³n.

### Paso 7: Mailpit para activaciones locales

Mailpit es obligatorio para probar la creaciÃ³n, activaciÃ³n o reenvÃ­o de cuentas desde AdministraciÃ³n. InÃ­cialo antes de realizar esas operaciones. El backend usa SMTP local en `127.0.0.1:1025` y su interfaz web estÃ¡ en <http://127.0.0.1:8025>, donde se consultan los mensajes sintÃ©ticos y sus enlaces de activaciÃ³n. La configuraciÃ³n actual no envÃ­a correos externos. Solo puede omitirse Mailpit si se ejecutan exclusivamente los flujos que no crean ni activan cuentas.

```powershell
# Reemplaza la ruta por la carpeta real donde estÃ¡ instalado mailpit.exe.
$env:Path += ";C:\ruta\a\mailpit"
mailpit.exe --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --webroot buzon-pruebas --database mailpit.sqlite3 --max 100 --max-age 24h --max-message-size 1 --smtp-max-recipients 1 --disable-version-check --smtp-disable-rdns --block-remote-css-and-fonts --quiet
```

### Paso 8: Detener servicios locales

Cuando termines el trabajo local:

```powershell
& "$pgBin\pg_ctl.exe" -D $dataDir -m fast stop
```

DetÃ©n Daphne y Vite con `Ctrl+C` en sus terminales. DetÃ©n la espera que mantiene WSL activo con `Ctrl+C`; no deshabilites ni expongas Valkey. Para acceso desde celular, no uses esta instrucciÃ³n de Vite en loopback: sigue el procedimiento seguro de ETAPA_1.md.

### Verificaciones

Desde `frontend/`:
```bash
npm run lint
npm run test:unit
npm run test:local-websocket
npm run check:diagrams
npm run test:sync       # requiere Vite activo
npm run test:accounts   # flujo local con mock sintÃ©tico
npm run build
npm run shots           # actualiza capturas de /local y /sistema; requiere Vite activo
```

Desde la raÃ­z:
```powershell
uv run --directory backend python manage.py test
uv run --directory backend python manage.py check
uv run --directory backend python manage.py makemigrations --check --dry-run
uv run --directory backend ruff check .
uv run --directory backend pip-audit
uv run --directory backend openapi-spec-validator openapi.json
```

---

## 9. Acceso al piloto desplegado

- **AplicaciÃ³n:** `https://ambusync-pilot.onrender.com/` (inicia sesiÃ³n con cuenta sintÃ©tica de instituciÃ³n).
- **BuzÃ³n de pruebas:** `https://ambusync-pilot.onrender.com/buzon-pruebas/` â†’ usuario `operador`, contraseÃ±a privada definida por el responsable (no compartida por chat ni por herramientas).
- **Correo:** los mensajes de activaciÃ³n y recuperaciÃ³n se capturan en el buzÃ³n; no hay entrega de Internet.

> **Importante:** el piloto usa Ãºnicamente datos sintÃ©ticos y no estÃ¡ autorizado para atenciÃ³n clÃ­nica real. No introduzcas datos personales o clÃ­nicos reales ni presentes funciones planificadas como existentes.