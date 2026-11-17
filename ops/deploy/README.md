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
# Buzón de pruebas privado — perfil opcional preparado localmente

Ver [evidencia y manual](../../docs/PRUEBAS_BUZON_PRUEBAS.md). Solo despliegue
sintético: Mailpitreal+proxyCaddy dentro delmismoWebFree, capturas efímeras,
sincorreoInternet. **Todavía no aplicado aRender.**

Tras autorización explícita de publicación/configuración/deploy:

- Publicar elSHAfinal revisado,autodeployOff y destinoDBexistente verificado.
- `AMBUSYNC_MAIL_MODE=mailpit`.
- `AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH`:hashbcryptprivado elegido por operador,
  costo12–16;usar12paraFree verificado. No comillas/espacios/saltos.
- `AMBUSYNC_BUILD_SHA` y `AMBUSYNC_MIGRATION_APPROVAL_SHA`:SHAcompletoexacto
  publicado/revisado;no copiar elSHAdeejemplos ni mantener aprobación vieja.
- Conservar demásvariables;no configurarMP_*/SMTP_*/EMAIL_* externos al modo
  capturafijo. No borrar clavesBrevo/Geoapify porinferencia.
- RenderFree/sinaddons/sintarjeta/sinsegundoservicio;health`/health/ready/`.

Crearhash **en una terminal privada humana**, no en chat/logs delagente:
usarDockerlocalyimagenCaddyfijadaen`ops/deploy/mailbox/versions.json`,
`docker run --rm -it --network none --entrypoint caddy <imagen-fijada> hash-password --algorithm bcrypt --bcrypt-cost 12`.
Eloperador eligecontraseñaaleatoria de20–72bytesUTF8 (mínimo20caracteres);
entradaoculta interactiva, nunca`--plaintext` ni passwordenargv/archivo.
Copiar solo elhash al campo privadoRender, nunca aGit/chat.Esta contraseña
independiente controla elacceso aTODOS los enlaces delbuzón sintético.

URLprevista`/buzon-pruebas/`,usuariofijo`operador`.SinBasicAuthválida,UI/API/
estáticos/WSrechazados aunqueexista sesiónDjango.Tokenfragmentonunca enquery/logs.
SoloCaddy escucha públicamente;MailpitSMTP1025/UI8025 yDaphne8000enloopback.
Se bloqueanAPIssend/release/diagnósticosenlaces ymutacionesorigenajeno.

Para volver aBrevo:requiereautorización de cambio de modo yredeploy;
`AMBUSYNC_MAIL_MODE=brevo` (oausente) conserva rutaBrevoexistente,sin reenviar
capturas antiguas. ConfiguraciónválidaBrevo no es prueba deentrega.
Si fallaMailpit se rechazaarranque/captura;no activarfallback.
