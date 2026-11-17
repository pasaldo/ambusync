# Imagen local y arranque del piloto L

Preparación local; **no hay despliegue Render autorizado por estos scripts**.
Solo datos sintéticos. Mantener costo $0, una instancia y autodeploy apagado.
No existe un `render.yaml` autoaplicable.

## Construcción manual

Desde la raíz, con Docker para contenedores Linux:

```powershell
$sha = (git rev-parse HEAD).Trim()
# Para una entrega, verificar primero árbol limpio y commit aprobado.
docker build --platform linux/amd64 --build-arg "AMBUSYNC_BUILD_SHA=$sha" -t ambusync-l:local .
```

Node 24.20.0, npm 11.19.0, Python 3.14.10 y uv 0.11.26 están fijados.
Los digests de Node/Python/uv se consultaron en los registros oficiales
el 17/11/2026. No sustituirlos automáticamente por tags `latest`.
Solo se compila frontend y se instalan dependencias bloqueadas durante build:
no hay acceso a PostgreSQL, correo, secretos ni migraciones.
La imagen final usa UID/GID 10001, sin Node/npm/uv/pip/compiladores.
`.dockerignore` excluye `.env`, entornos locales, claves, dumps y scratch.
Nunca pasar secretos mediante `ARG`, `COPY`, capas o contexto remoto.

## Configuración y migraciones

`python -m config.deployment_start` requiere el perfil explícito
`config.deployment_settings`. No carga `.env` local.
El perfil exige origen HTTPS exacto `onrender.com`, destino PostgreSQL esperado,
nombre de DB, Key Value esperado y dist real. Desarrollo conserva su perfil.

- `PORT`: 1024–65535, predeterminado 10000.
- `AMBUSYNC_EXPECTED_DATABASE_HOST` y `AMBUSYNC_EXPECTED_DATABASE_NAME`:
  deben coincidir con el host efectivo del driver y `current_database()`.
- PostgreSQL interno: host privado exacto y `sslmode=require` explícito
  (cifrado, **no** autenticación de identidad del servidor).
- PostgreSQL externo: host público exacto y `sslmode=verify-full`, sin degradación.
- `AMBUSYNC_MIGRATION_APPROVAL_SHA`: solo tras autorización específica para esa
  imagen y destino. Debe coincidir con `/app/build-sha`, archivo inmutable para
  el usuario no-root. No se confía en un SHA de runtime que pueda sobrescribirlo.

El arranque valida destino y toma un lock asesor PostgreSQL no bloqueante.
Ejecuta `migrate --check`; si hay pendientes sin aprobación coincidente, aborta
antes de escuchar. Con aprobación, migra y vuelve a comprobar. Los errores se
registran de forma genérica. No se crean/resetéan cuentas. Daphne recibe señales
directamente mediante `exec`; access log deshabilitado y diagnósticos filtrados.
Nunca exponer directamente el listener HTTP fuera del proxy TLS de confianza:
`X-Forwarded-Proto` se confía únicamente porque ese proxy controla el ingreso.

La aprobación de implementar L **no** autoriza aplicar migraciones a desarrollo
ni a Render. La aprobación para instalar Docker tampoco autoriza esas operaciones.

## Smoke reproducible, sin proveedores

```powershell
powershell -NoProfile -File ops/deploy/test-container.ps1
```

Requiere Docker Linux activo, Node 24, el entorno Python `backend/.venv` y
dependencias/Chromium de `frontend/`.
El runner crea un contexto temporal solo con fuentes del proyecto y señuelos
falsos; jamás monta `.env` o datos de desarrollo. Construye una imagen real,
usa una red Docker con nombres únicos y PostgreSQL/Valkey sintéticos propios,
sin publicar sus puertos. App y proxy TLS temporal solo enlazan loopback con
puertos asignados por el SO. No instala confianza en Windows ni en Android.

Exporta y examina todas las capas (incluidas capas comprimidas, sin extraerlas
al disco) buscando secretos señuelo. Comprueba guardias de migración, usuario no-root, artefactos, ausencia de
herramientas/señuelos, symlinks Linux, HTTPS, cookies/CSRF/sesión, WSS, reinicio y
lecturas sin Key Value. Solo elimina contenedores con la etiqueta única de esta
ejecución, sus volúmenes anónimos y su carpeta temporal. La imagen y caché de
build quedan locales; no usa `prune`, no limpia recursos ajenos ni hace push.

Esto no acredita correo Brevo, certificados Render, límites reales de Free,
Android físico, respaldo/restore real, RPO/RTO ni aceptación de L.
