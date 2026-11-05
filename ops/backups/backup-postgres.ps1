<#
.SYNOPSIS
Creates an encrypted synthetic PostgreSQL backup in the configured Restic repository.

.DESCRIPTION
This script only creates a dump and uploads it through Restic. It does not deploy
AmbuSync, alter application data, or print credentials. Load the Restic/R2
environment variables in the current PowerShell session before running it.
#>
[CmdletBinding()]
param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$BackupTag = "ambusync-postgres-synthetic",
    [string]$TempRoot = "$env:LOCALAPPDATA\AmbuSync\backup-work",
    [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"

function Require-EnvironmentVariable {
    param([Parameter(Mandatory = $true)][string]$Name)
    $value = (Get-Item "Env:$Name" -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Falta la variable de entorno requerida: $Name"
    }
    return $value
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw "Indica DATABASE_URL o usa -DatabaseUrl."
}

Require-EnvironmentVariable "RESTIC_REPOSITORY" | Out-Null
Require-EnvironmentVariable "RESTIC_PASSWORD" | Out-Null
Require-EnvironmentVariable "AWS_ACCESS_KEY_ID" | Out-Null
Require-EnvironmentVariable "AWS_SECRET_ACCESS_KEY" | Out-Null

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    throw "No se encontró pg_dump en PATH. Instala PostgreSQL o agrega su carpeta bin al PATH."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$workDir = Join-Path $TempRoot $timestamp
$dumpPath = Join-Path $workDir "ambusync-postgres.dump"
$metadataPath = Join-Path $workDir "metadata.json"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

try {
    & pg_dump $DatabaseUrl --format=custom --file=$dumpPath --no-owner --no-privileges
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump terminó con código $LASTEXITCODE."
    }

    $metadata = [ordered]@{
        created_at = (Get-Date).ToUniversalTime().ToString("o")
        tag = $BackupTag
        database = "synthetic-local-postgresql"
        dump_format = "custom"
        dump_size_bytes = (Get-Item $dumpPath).Length
    }
    $metadata | ConvertTo-Json | Set-Content -Path $metadataPath -Encoding UTF8

    restic backup $workDir --tag $BackupTag --tag "synthetic-only"
    if ($LASTEXITCODE -ne 0) {
        throw "Restic backup terminó con código $LASTEXITCODE."
    }

    if (-not $SkipCheck) {
        restic check
        if ($LASTEXITCODE -ne 0) {
            throw "Restic check terminó con código $LASTEXITCODE."
        }
    }

    Write-Output "Backup sintético creado y verificado en Restic/R2."
}
finally {
    if (Test-Path -LiteralPath $workDir) {
        Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
