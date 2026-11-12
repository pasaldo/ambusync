[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Snapshot,
    [Parameter(Mandatory = $true)][string]$RestoreDatabaseUrl,
    [string]$RestoreRoot = "$env:LOCALAPPDATA\AmbuSync\restore-work",
    [switch]$ConfirmIsolated,
    [switch]$ConfirmPilotOpen,
    [string]$PilotClosedAt,
    [string]$ClosureExecutor,
    [switch]$SkipRetention
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmIsolated) { throw 'Confirma un destino desechable aislado con -ConfirmIsolated. No usar la base activa.' }
if ([bool]$ConfirmPilotOpen -eq [bool]$PilotClosedAt) { throw 'Indica exactamente -ConfirmPilotOpen o -PilotClosedAt con fecha real independiente del snapshot.' }
if ($PilotClosedAt -and [string]::IsNullOrWhiteSpace($ClosureExecutor)) { throw 'Indica -ClosureExecutor responsable del registro de cierre real.' }
if ($SkipRetention) { throw '-SkipRetention no esta permitido: no se omite la purga posterior a restauracion.' }
if ($Snapshot -notmatch '^(latest|[a-fA-F0-9]{8,64})$') { throw 'Indica latest o un identificador hexadecimal de snapshot valido.' }
$target = $null
if (-not [uri]::TryCreate($RestoreDatabaseUrl, [UriKind]::Absolute, [ref]$target)) { throw 'URL de restauracion invalida.' }
$databaseName = [uri]::UnescapeDataString($target.AbsolutePath.TrimStart('/'))
if ($target.Scheme -notin @('postgres', 'postgresql') -or
    $target.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1') -or
    $databaseName -notmatch '^ambusync_restore(?:_[a-zA-Z0-9_]+)?$' -or
    $target.Query -or $target.Fragment) {
    throw 'Solo se permite PostgreSQL local con base reservada ambusync_restore[_*], sin parametros adicionales.'
}
if ($env:DATABASE_URL) {
    $source = $null
    if ([uri]::TryCreate($env:DATABASE_URL, [UriKind]::Absolute, [ref]$source)) {
        $sourcePort = if ($source.Port -eq -1) { 5432 } else { $source.Port }
        $targetPort = if ($target.Port -eq -1) { 5432 } else { $target.Port }
        $sourceName = [uri]::UnescapeDataString($source.AbsolutePath.TrimStart('/'))
        if ($source.Host -in @('localhost', '127.0.0.1', '[::1]', '::1') -and
            $sourcePort -eq $targetPort -and $sourceName -eq $databaseName) {
            throw 'El destino coincide con DATABASE_URL activa; usa una base aislada diferente.'
        }
    }
}
$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) { throw 'No se encontro pg_restore en PATH.' }
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\backend'))
$previousUrl = $env:DATABASE_URL
$previousEnabled = $env:SYNTHETIC_RESTORE_ENABLED
$previousTargetUrl = $env:AMBUSYNC_RESTORE_TARGET_URL
$restoreDir = $null
try {
    # This first subprocess sees the ORIGINAL effective Django config, including
    # backend/.env when DATABASE_URL is absent from this PowerShell process.
    $env:AMBUSYNC_RESTORE_TARGET_URL = $RestoreDatabaseUrl
    uv run --directory $backend python manage.py check_restore_target --compare-active
    if ($LASTEXITCODE -ne 0) { throw 'Destino no distinto de la base activa efectiva; no se restauro nada.' }
    # dotenv never wins over these process variables: all Django commands target
    # the same isolated database as pg_restore, not backend/.env's development DB.
    $env:DATABASE_URL = $RestoreDatabaseUrl
    $env:SYNTHETIC_RESTORE_ENABLED = 'true'
    uv run --directory $backend python manage.py check_restore_target
    if ($LASTEXITCODE -ne 0) { throw 'Django rechazo el destino; no se restauro nada.' }

    $restoreDir = Join-Path $RestoreRoot ('restore-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $restoreDir -Force | Out-Null
    restic restore $Snapshot --target $restoreDir --include 'ambusync-postgres.dump'
    if ($LASTEXITCODE -ne 0) { throw 'Restic restore fallo; no se importara un dump potencialmente incompleto.' }
    $dumps = @(Get-ChildItem -LiteralPath $restoreDir -Filter 'ambusync-postgres.dump' -Recurse -File)
    if ($dumps.Count -ne 1) { throw 'Debe existir exactamente un dump PostgreSQL restaurado.' }
    & $pgRestore.Source --dbname=$RestoreDatabaseUrl --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction $dumps[0].FullName
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore fallo; conservar destino sin exponer servicios.' }

    uv run --directory $backend python manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) { throw 'Migracion del esquema restaurado fallo; conservar destino aislado.' }
    if ($ConfirmPilotOpen) {
        uv run --directory $backend python manage.py check_restore_target --expect-pilot-open
    }
    else {
        uv run --directory $backend python manage.py record_pilot_closure --closed-at $PilotClosedAt --executor $ClosureExecutor
    }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo reconciliar cierre real del piloto; conservar destino aislado.' }
    $asOf = [DateTimeOffset]::UtcNow.ToString('o')
    uv run --directory $backend python manage.py apply_retention --as-of $asOf --apply
    if ($LASTEXITCODE -ne 0) { throw 'Reaplicacion de retencion fallo; conservar destino aislado.' }
    $verificationJson = uv run --directory $backend python manage.py apply_retention --as-of $asOf
    if ($LASTEXITCODE -ne 0) { throw 'Verificacion de retencion fallo; conservar destino aislado.' }
    $verification = ($verificationJson -join "`n") | ConvertFrom-Json
    foreach ($name in @('emergencies', 'operations', 'measurements', 'audit', 'session_revocations', 'technical_logs')) {
        $count = $verification.counts.$name
        if ($null -eq $count -or $count -ne 0) { throw 'Quedan purgas pendientes o la verificacion es incompleta; no exponer destino.' }
    }
    Write-Output 'Restauracion sintetica aislada completada; esquema migrado y retencion reaplicada/verificada. No se habilitaron servicios.'
}
finally {
    $env:DATABASE_URL = $previousUrl
    $env:SYNTHETIC_RESTORE_ENABLED = $previousEnabled
    $env:AMBUSYNC_RESTORE_TARGET_URL = $previousTargetUrl
    # Delete only this run's unique temporary directory, never a caller's root.
    if ($restoreDir -and (Test-Path -LiteralPath $restoreDir)) {
        Remove-Item -LiteralPath $restoreDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
