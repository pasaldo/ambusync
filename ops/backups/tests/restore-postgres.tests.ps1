$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\restore-postgres.ps1'
$root = Join-Path $env:TEMP ('ambusync-restore-test-' + [guid]::NewGuid().ToString('N'))
$savedUrl = $env:DATABASE_URL
$savedEnabled = $env:SYNTHETIC_RESTORE_ENABLED
$global:restoreEffects = [System.Collections.Generic.List[string]]::new()
$global:djangoUrls = [System.Collections.Generic.List[string]]::new()
$global:failRetention = $false

# Process-local doubles: no subprocess, network, PostgreSQL or Restic access.
function global:Get-Command {
    param([string]$Name, [string]$ErrorAction)
    if ($Name -eq 'pg_restore') { return [pscustomobject]@{ Source = 'Fake-PgRestore' } }
    Microsoft.PowerShell.Core\Get-Command -Name $Name
}
function global:Fake-PgRestore {
    $global:restoreEffects.Add('pg_restore')
    $global:LASTEXITCODE = 0
}
function global:restic {
    $global:restoreEffects.Add('restic')
    $targetIndex = [array]::IndexOf($args, '--target')
    $target = $args[$targetIndex + 1]
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Set-Content -LiteralPath (Join-Path $target 'ambusync-postgres.dump') -Value 'synthetic dummy, not a database'
    $global:LASTEXITCODE = 0
}
function global:uv {
    $global:restoreEffects.Add('django:' + ($args -join ' '))
    $global:djangoUrls.Add($env:DATABASE_URL)
    $global:LASTEXITCODE = 0
    if (($args -contains 'apply_retention') -and $global:failRetention) { $global:LASTEXITCODE = 1; return }
    if (($args -contains 'apply_retention') -and -not ($args -contains '--apply')) {
        return '{"counts":{"emergencies":0,"operations":0,"measurements":0,"audit":0,"session_revocations":0,"technical_logs":0}}'
    }
}
function Assert-True($condition, $message) { if (-not $condition) { throw "ASSERT: $message" } }

try {
    $env:DATABASE_URL = 'postgresql://synthetic:secret@127.0.0.1:55432/ambusync_dev'
    $env:SYNTHETIC_RESTORE_ENABLED = 'original-synthetic-value'
    $target = 'postgresql://synthetic:secret@127.0.0.1:55433/ambusync_restore_drill'
    # A refusal must occur before even calling the external tools.
    foreach ($url in @($env:DATABASE_URL, 'postgresql://synthetic:secret@remote.example.test/ambusync_restore', 'invalid')) {
        $global:restoreEffects.Clear()
        $rejected = $false
        try { & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $url -RestoreRoot $root -ConfirmIsolated -ConfirmPilotOpen | Out-Null }
        catch { $rejected = $true }
        Assert-True $rejected 'destino activo/remoto/invalido debe rechazarse'
        Assert-True ($global:restoreEffects.Count -eq 0) 'rechazo antes de restic/pg_restore/Django'
    }
    $env:DATABASE_URL = 'postgresql://synthetic:secret@localhost:55433/ambusync_restore_drill'
    $global:restoreEffects.Clear()
    $rejectedAlias = $false
    try { & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $target -RestoreRoot $root -ConfirmIsolated -ConfirmPilotOpen | Out-Null }
    catch { $rejectedAlias = $true }
    Assert-True $rejectedAlias 'localhost y 127.0.0.1 no son bases aisladas diferentes'
    Assert-True ($global:restoreEffects.Count -eq 0) 'rechazo de alias antes de efectos'
    $env:DATABASE_URL = 'postgresql://synthetic:secret@127.0.0.1:55432/ambusync_dev'
    $global:restoreEffects.Clear()
    & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $target -RestoreRoot $root -ConfirmIsolated -ConfirmPilotOpen | Out-Null
    Assert-True ($global:restoreEffects -contains 'pg_restore') 'debe restaurar en el destino aislado'
    Assert-True ($global:djangoUrls.Count -ge 3) 'validar destino, migrar, reaplicar y verificar'
    Assert-True ($global:djangoUrls[0] -like '*/ambusync_dev') 'comparar configuracion efectiva activa antes de cambiar entorno'
    foreach ($url in $global:djangoUrls.GetRange(1, $global:djangoUrls.Count - 1)) { Assert-True ($url -eq $target) 'Django de restauracion nunca usa la URL de desarrollo' }
    Assert-True ($env:DATABASE_URL -like '*/ambusync_dev') 'restaurar DATABASE_URL del proceso'
    Assert-True ($env:SYNTHETIC_RESTORE_ENABLED -eq 'original-synthetic-value') 'restaurar guardia del proceso'
    Assert-True (@($global:restoreEffects | Where-Object { $_ -like '*--expect-pilot-open*' }).Count -eq 1) 'confirmar piloto abierto contra snapshot'
    $global:restoreEffects.Clear()
    $missingStateRejected = $false
    try { & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $target -RestoreRoot $root -ConfirmIsolated | Out-Null }
    catch { $missingStateRejected = $true }
    Assert-True $missingStateRejected 'sin estado real independiente del snapshot no se restaura'
    Assert-True ($global:restoreEffects.Count -eq 0) 'rechazo sin estado antes de efectos'
    & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $target -RestoreRoot $root -ConfirmIsolated -PilotClosedAt '2026-01-01T00:00:00Z' -ClosureExecutor 'synthetic-responsible' | Out-Null
    $closureIndex = -1
    $retentionIndex = -1
    for ($i = 0; $i -lt $global:restoreEffects.Count; $i++) {
        if ($global:restoreEffects[$i] -like '*record_pilot_closure*') { $closureIndex = $i }
        if ($global:restoreEffects[$i] -like '*apply_retention*--apply*') { $retentionIndex = $i }
    }
    Assert-True ($closureIndex -ge 0 -and $retentionIndex -gt $closureIndex) 'snapshot anterior al cierre: registrar fecha real antes de purgar'
    $global:failRetention = $true
    $failed = $false
    try { & $scriptPath -Snapshot 'abcdef12' -RestoreDatabaseUrl $target -RestoreRoot $root -ConfirmIsolated -ConfirmPilotOpen | Out-Null }
    catch { $failed = $true }
    Assert-True $failed 'fallo retencion no puede anunciar exito'
    Assert-True ($env:DATABASE_URL -like '*/ambusync_dev') 'restaurar entorno incluso con fallo'
    Write-Output 'PASS: rechazo previo, destino Django, migracion/reaplicacion/verificacion y entorno preservado (dobles locales)'
}
finally {
    $env:DATABASE_URL = $savedUrl
    $env:SYNTHETIC_RESTORE_ENABLED = $savedEnabled
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
