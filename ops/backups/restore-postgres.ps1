[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Snapshot,
    [Parameter(Mandatory = $true)][string]$RestoreDatabaseUrl,
    [string]$RestoreRoot = "$env:LOCALAPPDATA\AmbuSync\restore-work",
    [switch]$SkipRetention
)

$ErrorActionPreference = "Stop"
$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) { throw "No se encontró pg_restore en PATH." }

$restoreDir = Join-Path $RestoreRoot $Snapshot
$dumpPath = Join-Path $restoreDir "ambusync-postgres.dump"
New-Item -ItemType Directory -Force -Path $restoreDir | Out-Null

try {
    restic restore $Snapshot --target $restoreDir
    $restoreExitCode = $LASTEXITCODE

   if ($restoreExitCode -ne 0) {
    	$restoredDump = Get-ChildItem `
        -LiteralPath $restoreDir `
        -Filter "ambusync-postgres.dump" `
        -Recurse `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $restoredDump) {
        throw "Restic restore falló y no se encontró el dump restaurado. Código: $restoreExitCode"
    }

    Write-Warning "Restic informó un error de metadatos de Windows, pero el dump fue restaurado."
}

    $dump = Get-ChildItem -LiteralPath $restoreDir -Filter "ambusync-postgres.dump" -Recurse | Select-Object -First 1
    if (-not $dump) { throw "No se encontró el dump PostgreSQL restaurado." }

    & $pgRestore.Source --dbname=$RestoreDatabaseUrl --clean --if-exists --no-owner --no-privileges $dump.FullName
    if ($LASTEXITCODE -ne 0) { throw "pg_restore terminó con código $LASTEXITCODE." }

    if (-not $SkipRetention) {
        uv run --directory backend python manage.py apply_retention --as-of (Get-Date).ToUniversalTime().ToString("o") --apply
        if ($LASTEXITCODE -ne 0) { throw "La reaplicación de retención terminó con código $LASTEXITCODE." }
    }

    Write-Output "Restauración sintética completada y retención reaplicada."
}
finally {
    if (Test-Path -LiteralPath $restoreDir) {
        Remove-Item -LiteralPath $restoreDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
