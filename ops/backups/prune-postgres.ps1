[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:RESTIC_REPOSITORY)) { throw "Falta RESTIC_REPOSITORY" }
if ([string]::IsNullOrWhiteSpace($env:RESTIC_PASSWORD)) { throw "Falta RESTIC_PASSWORD" }

restic check
if ($LASTEXITCODE -ne 0) { throw "Restic check falló; no se ejecutará prune." }

if ($DryRun) {
    restic forget --keep-hourly 24 --keep-daily 14 --tag ambusync-postgres-synthetic --dry-run
} else {
    restic forget --keep-hourly 24 --keep-daily 14 --tag ambusync-postgres-synthetic --prune
}