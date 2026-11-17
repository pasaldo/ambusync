$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\backup-deployment.ps1'
$root = Join-Path "$env:LOCALAPPDATA\Temp\opencode" ('ambusync-deployment-backup-test-' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path "$env:LOCALAPPDATA\AmbuSync" ('synthetic-restic-test-' + [guid]::NewGuid().ToString('N'))
$saved = @{}
foreach ($name in @('AMBUSYNC_DEPLOYMENT_DATABASE_URL','AMBUSYNC_DEPLOYMENT_SSLROOTCERT','RESTIC_REPOSITORY','RESTIC_PASSWORD','PGPASSWORD','PGSERVICEFILE','PGPASSFILE')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$global:backupEffects = [System.Collections.Generic.List[string]]::new()
$global:backupArguments = [System.Collections.Generic.List[string]]::new()
$global:backupFailure = ''
$global:backupTls = $true
$global:backupDatabase = 'synthetic_l'
$global:privateServiceFiles = [System.Collections.Generic.List[string]]::new()
function Assert-True($condition, $message) { if (-not $condition) { throw "ASSERT: $message" } }
# These external-command doubles never launch a process or touch the network.
function global:Get-Command {
    param([string]$Name, [string]$ErrorAction)
    if ($Name -eq 'psql') { return [pscustomobject]@{ Source = 'Fake-DeploymentPsql' } }
    if ($Name -eq 'pg_dump') { return [pscustomobject]@{ Source = 'Fake-DeploymentDump' } }
    if ($Name -eq 'restic') { return [pscustomobject]@{ Source = 'Fake-DeploymentRestic' } }
    Microsoft.PowerShell.Core\Get-Command -Name $Name
}
function global:Fake-DeploymentPsql {
    $global:backupEffects.Add('psql')
    $global:backupArguments.Add(($args -join ' '))
    Assert-True (Test-Path -LiteralPath $env:PGSERVICEFILE) 'private service file exists'
    Assert-True (Test-Path -LiteralPath $env:PGPASSFILE) 'private passfile exists'
    $access = Get-Acl -LiteralPath (Split-Path $env:PGPASSFILE -Parent)
    Assert-True $access.AreAccessRulesProtected 'secret directory permissions must not inherit broad access'
    $global:privateServiceFiles.Add($env:PGSERVICEFILE)
    $global:privateServiceFiles.Add($env:PGPASSFILE)
    Assert-True ((Get-Content -Raw $env:PGSERVICEFILE) -match 'sslmode=verify-full') 'libpq must verify server identity'
    $global:LASTEXITCODE = 0
    if ($global:backupFailure -eq 'psql') { $global:LASTEXITCODE = 1; return 'PRIVATE-PASSWORD' }
    if ($global:backupFailure -eq 'payload') { return 'not-json PRIVATE-PASSWORD' }
    return (@{database=$global:backupDatabase; tls=$global:backupTls; protocol='TLSv1.3'} | ConvertTo-Json -Compress)
}
function global:Fake-DeploymentDump {
    $global:backupEffects.Add('pg_dump')
    $global:backupArguments.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($global:backupFailure -eq 'dump') { $global:LASTEXITCODE = 1; return 'PRIVATE-PASSWORD' }
    $file = ($args | Where-Object { $_ -like '--file=*' }).Substring(7)
    [IO.File]::WriteAllBytes($file, [Text.Encoding]::ASCII.GetBytes('PGDMPsynthetic-only-test'))
}
function global:Fake-DeploymentRestic {
    $global:backupEffects.Add('restic:' + $args[0])
    $global:backupArguments.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -eq $global:backupFailure) { $global:LASTEXITCODE = 1; return 'PRIVATE-PASSWORD' }
    if ($args[0] -eq 'backup') {
        $files = @(Get-ChildItem -File)
        Assert-True ($files.Count -eq 2) 'only dump and metadata enter encrypted snapshot'
        Assert-True (@($files | Where-Object { $_.Name -in @('ambusync-postgres.dump','metadata.json') }).Count -eq 2) 'no service/passfile in snapshot'
    }
}
function Invoke-BackupTest($confirm = $true, $hostName = 'dpg-synthetic-a.oregon-postgres.render.com') {
    $params = @{ ExpectedSourceHost=$hostName; ExpectedSourceDatabase='synthetic_l'; TempRoot=(Join-Path $root 'work') }
    if ($confirm) { $params.ConfirmSyntheticSource = $true }
    & $scriptPath @params
}
function Assert-Refused($message, $confirm = $true, $hostName = 'dpg-synthetic-a.oregon-postgres.render.com', $beforeNetwork = $true) {
    $global:backupEffects.Clear()
    $rejected = $false
    $output = ''
    try { $output = Invoke-BackupTest $confirm $hostName | Out-String } catch { $output += $_.ToString(); $rejected = $true }
    Assert-True $rejected $message
    Assert-True ($output -notmatch 'PRIVATE-PASSWORD|postgresql://') 'failure output must not reveal secrets'
    Assert-True ($output -notmatch 'Copia local cifrada verificada') 'failure cannot announce success'
    if ($beforeNetwork) { Assert-True ($global:backupEffects.Count -eq 0) 'reject before external commands/network' }
}
try {
    New-Item -ItemType Directory -Path $root, $repo | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $root 'work') | Out-Null
    Set-Content -LiteralPath (Join-Path $root 'work\unrelated.txt') -Value 'preserve'
    Set-Content -LiteralPath (Join-Path $repo 'config') -Value 'synthetic initialized-repository marker, not a real repo'
    $ca = Join-Path $root 'synthetic-root.crt'; Set-Content $ca 'synthetic public CA'
    $env:AMBUSYNC_DEPLOYMENT_SSLROOTCERT = $ca
    $env:AMBUSYNC_DEPLOYMENT_DATABASE_URL = 'postgresql://synthetic:PRIVATE-PASSWORD@dpg-synthetic-a.oregon-postgres.render.com/synthetic_l?sslmode=verify-full'
    $env:RESTIC_REPOSITORY = $repo; $env:RESTIC_PASSWORD = 'PRIVATE-PASSWORD'
    $env:PGPASSWORD = 'prior-private-value'
    Assert-Refused 'confirmation required' $false
    Assert-Refused 'foreign expected host rejected' $true 'dpg-other-a.oregon-postgres.render.com'
    foreach ($url in @('invalid', $env:AMBUSYNC_DEPLOYMENT_DATABASE_URL.Replace('verify-full','require'), ($env:AMBUSYNC_DEPLOYMENT_DATABASE_URL + '&host=foreign'))) {
        $original = $env:AMBUSYNC_DEPLOYMENT_DATABASE_URL; $env:AMBUSYNC_DEPLOYMENT_DATABASE_URL = $url
        Assert-Refused 'malformed URL or TLS downgrade or parameter override rejected'
        $env:AMBUSYNC_DEPLOYMENT_DATABASE_URL = $original
    }
    foreach ($badRepo in @('s3:https://example.test/bucket','https://example.test/repo','relative-path','\\server\share', $root, (Resolve-Path "$PSScriptRoot\..\..\..").Path)) {
        $env:RESTIC_REPOSITORY = $badRepo; Assert-Refused 'remote/ambiguous/temp/Git repo rejected'
    }
    $env:RESTIC_REPOSITORY = $repo
    $global:backupTls = $false; Assert-Refused 'effective no TLS rejected' $true 'dpg-synthetic-a.oregon-postgres.render.com' $false
    Assert-True (-not ($global:backupEffects -contains 'pg_dump')) 'no dump on unverified TLS'
    $global:backupTls = $true; $global:backupDatabase = 'foreign'
    Assert-Refused 'effective database mismatch rejected' $true 'dpg-synthetic-a.oregon-postgres.render.com' $false
    $global:backupDatabase = 'synthetic_l'
    foreach ($failure in @('psql','payload','dump','backup','check')) {
        $global:backupFailure = $failure
        Assert-Refused "external failure $failure must fail" $true 'dpg-synthetic-a.oregon-postgres.render.com' $false
        $expected = switch ($failure) {
            'psql' { 'psql' }
            'payload' { 'psql' }
            'dump' { 'psql,pg_dump' }
            'backup' { 'psql,pg_dump,restic:backup' }
            'check' { 'psql,pg_dump,restic:backup,restic:check' }
        }
        Assert-True (($global:backupEffects -join ',') -eq $expected) "failure $failure must actually reach its boundary and stop"
    }
    $global:backupFailure = ''
    $global:backupEffects.Clear()
    $success = Invoke-BackupTest | Out-String
    Assert-True ($success -match 'Copia local cifrada verificada') 'only full success is announced'
    Assert-True (($global:backupEffects -join ',') -eq 'psql,pg_dump,restic:backup,restic:check') 'verify then dump then encrypted backup then mandatory check'
    Assert-True (($global:backupArguments -join ' ') -notmatch 'PRIVATE-PASSWORD|postgresql://') 'no secret or URL in argv'
    Assert-True ($env:PGPASSWORD -eq 'prior-private-value') 'caller environment preserved'
    foreach ($file in $global:privateServiceFiles) { Assert-True (-not (Test-Path $file)) 'own secret files always removed' }
    Assert-True (Test-Path (Join-Path $repo 'config')) 'existing repository preserved'
    Assert-True (Test-Path $ca) 'unrelated file preserved'
    Assert-True (Test-Path (Join-Path $root 'work\unrelated.txt')) 'unrelated file inside TempRoot preserved'
    Write-Output 'PASS: local encrypted backup guards/errors/cleanup/argv (doubles only; no network/dump/Restic)'
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    if (Test-Path $repo) { Remove-Item -LiteralPath $repo -Recurse -Force }
}
