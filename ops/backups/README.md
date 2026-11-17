# Copias sintéticas de PostgreSQL

`backup-postgres.ps1` genera un `pg_dump` temporal de la base local, lo entrega a Restic
para cifrado/deduplicación y lo sube al repositorio configurado en Cloudflare R2.

## Estado L y nueva copia local adicional

**No ejecutar copias reales por la aprobación de implementación.** R2 se conserva,
pero no se habilitan nuevas subidas automáticas hasta comprobar consumo y control
de costo estrictamente $0. Si ese control no se acredita, el requisito externo de
L continúa pendiente; una copia local adicional no lo sustituye.

`backup-deployment.ps1` prepara una copia cifrada a un repositorio Restic **local**
previamente inicializado con autorización separada, fuera de Git y de carpetas
temporales. No inicializa repositorios, no programa tareas y no ejecuta `forget`
ni `prune`. Rechaza repositorios `s3:`, URL, UNC, relativos y rutas con enlaces.

Requiere `psql`, `pg_dump` y Restic en PATH; Windows y un volumen local disponible.
Configurar privadamente en el entorno del proceso, fuera de Git y sin chat/logs:

- `AMBUSYNC_DEPLOYMENT_DATABASE_URL`: URL externa del origen sintético aprobado,
  con `sslmode=verify-full`. **No** reutiliza ni carga `backend/.env`.
- `AMBUSYNC_DEPLOYMENT_SSLROOTCERT`: archivo público de CA confiable para ese
  servidor. No aceptar a ciegas el certificado presentado por la conexión.
- `RESTIC_REPOSITORY`: ruta absoluta local ya inicializada.
- `RESTIC_PASSWORD`: clave de cifrado, bajo custodia separada del repositorio.

Tras autorización específica para respaldar ese origen:

```powershell
./ops/backups/backup-deployment.ps1 `
  -ConfirmSyntheticSource `
  -ExpectedSourceHost <host-publico-exacto-aprobado> `
  -ExpectedSourceDatabase <base-sintetica-aprobada>
```

Los valores esperados no son secretos; no pasar URL ni contraseñas como argumentos.
El wrapper crea servicio/passfile únicos con ACL restringida al usuario/SYSTEM.
libpq autentica el certificado y su hostname mediante `verify-full`; una consulta
de solo lectura comprueba la base efectiva y TLS1.2/1.3 de esa sesión antes de
`pg_dump`. No degrada TLS ni usa el host interno autofirmado.
Solo dump custom y metadata no sensible entran en Restic; archivos de conexión
quedan fuera del payload. Exige `restic check --read-data` antes del éxito, restaura
el entorno del proceso y elimina únicamente su carpeta temporal propia.
La copia local contiene datos clínicos sintéticos cifrados; el dump temporal está
en claro bajo ACL privada y debe residir en un equipo/volumen protegido.

La inicialización real (`restic init`), copia separada de la clave, política de
24 snapshots horarios/14 diarios, programación y borrado requieren autorización.
No se han ejecutado por preparar estos scripts. Restore conserva las guardias C:
loopback, base reservada distinta y reaplicación obligatoria de retención.

Pruebas sin procesos externos, red ni copias reales:

```powershell
powershell -NoProfile -File ops/backups/tests/backup-deployment.tests.ps1
powershell -NoProfile -File ops/backups/tests/restore-postgres.tests.ps1
```

Los dobles no acreditan entrega de backups, restore, RPO/RTO ni costos R2 reales.

## Wrapper local/R2 anterior — no automatizar nuevas subidas en L

### Requisitos

- PostgreSQL local activo y `pg_dump` disponible en `PATH`.
- `DATABASE_URL` apuntando exclusivamente a la base sintética.
- Variables Restic/R2 cargadas en la sesión actual:
  `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`.
- Bucket R2 privado y API key limitada al bucket de copias.

El wrapper anterior acepta `-DatabaseUrl` y pasa la URL a `pg_dump` como argumento;
no usarlo para el nuevo origen remoto. El wrapper L anterior en esta página usa
servicio/passfile para evitarlo. No agregues tokens, dumps, repositorios Restic
ni archivos `.env` al repositorio Git.

## Ejecución

Desde la raíz del proyecto:

```powershell
./ops/backups/backup-postgres.ps1
```

Para indicar explícitamente la conexión:

```powershell
./ops/backups/backup-postgres.ps1 -DatabaseUrl $env:DATABASE_URL
```

`pg_dump` y el directorio temporal se eliminan al terminar. El snapshot queda cifrado en
Restic/R2 con las etiquetas `ambusync-postgres-synthetic` y `synthetic-only`.

## Verificación y restauración

```powershell
restic snapshots
restic check
restic restore latest --target "$env:LOCALAPPDATA\AmbuSync\restore-r2" --ignore-ctime
```

La restauración debe hacerse en una base PostgreSQL aislada, nunca sobre la base activa sin
una autorización explícita. Después de restaurar, ejecutar `apply_retention` con la fecha de
referencia correspondiente y comprobar el flujo esencial antes de exponer cualquier servicio.

El procedimiento automatizado requiere una base de restauración separada:

```powershell
./ops/backups/restore-postgres.ps1 `
  -Snapshot <SNAPSHOT_ID> `
  -RestoreDatabaseUrl $env:AMB_SYNC_ISOLATED_RESTORE_URL `
  -ConfirmIsolated `
  -ConfirmPilotOpen
```

La variable local debe contener una URL PostgreSQL de loopback, base separada `ambusync_restore`
o `ambusync_restore_*`; no imprimirla ni guardarla en Git. `-ConfirmIsolated` confirma que es
desechable y sin servicios conectados. La ejecución real requiere autorización específica.
`-ConfirmPilotOpen` solo es válido si el responsable confirma que el piloto sigue abierto.
Si ya cerró, reemplazarlo por `-PilotClosedAt <fecha-real-ISO-con-zona> -ClosureExecutor <responsable>`;
la fecha debe proceder del registro real independiente de la copia. Sin una de esas decisiones
el wrapper rechaza antes de restaurar; un cierre de la copia contradictorio también se rechaza.

El script compara primero la configuración activa efectiva de Django (incluido `.env`, sin
imprimir credenciales), valida el destino antes de Restic y restaura con `pg_restore` transaccional,
migra el esquema y reaplica/verifica D-010/D-011 **con DATABASE_URL del destino restaurado**.
Después recupera las variables originales del proceso y elimina solo su directorio temporal
único. No permite `-SkipRetention` ni ignora errores de Restic aunque aparezca un archivo.
No usar la base activa de desarrollo ni un destino remoto. No habilita servicios.

La retención v2 se calcula desde el cierre formal global (`record_pilot_closure`), no desde
cada episodio: aplicación 90 días, auditoría 12 meses calendario, logs técnicos 30 días móviles.
Si el snapshot es anterior al cierre/C, el wrapper usa la fecha real suministrada por el
responsable para registrarla/contrastarla en el destino aislado antes de reaplicar retención.
Migrar no inventa esa fecha. Ver [PRUEBAS_C.md](../../docs/PRUEBAS_C.md).

Prueba del wrapper sin red ni restauración real:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/backups/tests/restore-postgres.tests.ps1
```

Usa dobles locales; un `PASS` no demuestra RPO/RTO ni restauración real desde R2.

## Custodia de claves

- `RESTIC_PASSWORD` cifra el repositorio y debe conservarse separado de R2.
- `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` deben pertenecer a una API key limitada al bucket.
- `RESTIC_REPOSITORY` puede documentarse; las demás variables son secretas.
- En Windows se recomienda Credential Manager o SecretManagement, cargando variables solo en la
  sesión necesaria mediante un script fuera del repositorio.
- No guardar claves en Git, `Tokens.txt`, `CloudfareR2.txt`, `.env` versionado, logs ni capturas.
- Mantener una copia de recuperación de la contraseña Restic bajo custodia separada; perderla
  vuelve irrecuperable el repositorio.

## Política y evidencia

La política aprobada conserva 24 snapshots horarios y 14 diarios. Antes de automatizar `forget`
o `prune`, medir el tamaño real y confirmar que el uso permanece dentro de la cuota gratuita de
R2. Registrar snapshot, tamaño, resultado de `restic check`, restauración y reaplicación de
retención. Cloudflare R2 almacena copias; no aloja el frontend, backend ni PostgreSQL activo.

## Alcance

Este script respalda datos sintéticos de PostgreSQL. No hospeda la aplicación, no configura
despliegues y no habilita uso clínico real. La política de snapshots (24 horarios y 14 diarios)
debe aplicarse mediante una tarea separada después de medir el consumo y confirmar que se
mantiene dentro del nivel gratuito de R2.
