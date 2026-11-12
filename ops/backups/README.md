# Copias sintéticas de PostgreSQL

`backup-postgres.ps1` genera un `pg_dump` temporal de la base local, lo entrega a Restic
para cifrado/deduplicación y lo sube al repositorio configurado en Cloudflare R2.

## Requisitos

- PostgreSQL local activo y `pg_dump` disponible en `PATH`.
- `DATABASE_URL` apuntando exclusivamente a la base sintética.
- Variables Restic/R2 cargadas en la sesión actual:
  `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`.
- Bucket R2 privado y API key limitada al bucket de copias.

El script nunca recibe secretos desde argumentos ni los imprime. No agregues tokens, dumps,
repositorios Restic ni archivos `.env` al repositorio Git.

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
