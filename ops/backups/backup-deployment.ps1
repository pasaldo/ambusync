<#
.SYNOPSIS
Encrypted local-only backup of an explicitly confirmed synthetic deployment.
.DESCRIPTION
No initialization, scheduling, remote repository, restore, or R2 upload.
Connection and encryption credentials are supplied only through private process
environment. All real executions require separate operational authorization.
#>
[CmdletBinding()]
param(
    [switch]$ConfirmSyntheticSource,
    [string]$ExpectedSourceHost,
    [string]$ExpectedSourceDatabase,
    [string]$TempRoot = "$env:LOCALAPPDATA\AmbuSync\deployment-backup-work"
)
$ErrorActionPreference = 'Stop'
$workDir = $null
$saved = @{}
$verified = $false

function Local-Path([string]$value) {
    if ($value -notmatch '^[A-Za-z]:[\\/]' -or $value -match '[\r\n]' -or $value.Contains('..')) {
        throw 'Ambiguous local path.'
    }
    $full = [IO.Path]::GetFullPath($value).TrimEnd('\','/')
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
    if ($drive.DriveType -notin @([IO.DriveType]::Fixed, [IO.DriveType]::Removable)) { throw 'Not a local drive.' }
    $part = $full
    while ($part) {
        if (Test-Path -LiteralPath $part) {
            if ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse path refused.' }
        }
        $parent = [IO.Path]::GetDirectoryName($part)
        if ($parent -eq $part) { break }
        $part = $parent
    }
    return $full
}
function Within([string]$child, [string]$parent) {
    return $child.Equals($parent, [StringComparison]::OrdinalIgnoreCase) -or $child.StartsWith($parent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Pgpass-Escape([string]$value) { return $value.Replace('\','\\').Replace(':','\:') }

try {
    if (-not $ConfirmSyntheticSource -or $env:OS -ne 'Windows_NT') { throw 'Confirmation/Windows required.' }
    if ($ExpectedSourceHost -cnotmatch '^dpg-[a-z0-9-]+\.[a-z0-9-]+\.render\.com$' -or $ExpectedSourceDatabase -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid expected source.' }
    $url = [Uri]$env:AMBUSYNC_DEPLOYMENT_DATABASE_URL
    if (-not $url.IsAbsoluteUri -or $url.Scheme -notin @('postgresql','postgres') -or
        $url.Host -cne $ExpectedSourceHost -or $url.Fragment -or
        $url.Query -cne '?sslmode=verify-full' -or $url.Port -notin @(-1,5432) -or
        [Uri]::UnescapeDataString($url.AbsolutePath.TrimStart('/')) -cne $ExpectedSourceDatabase) { throw 'Invalid connection.' }
    $credentials = $url.UserInfo -split ':', 2
    if ($credentials.Count -ne 2) { throw 'Missing credentials.' }
    $userName = [Uri]::UnescapeDataString($credentials[0])
    $password = [Uri]::UnescapeDataString($credentials[1])
    if ($userName -notmatch '^[A-Za-z0-9_-]+$' -or [string]::IsNullOrWhiteSpace($password) -or
        $password -match '[\x00-\x1f\x7f]' -or [string]::IsNullOrWhiteSpace($env:RESTIC_PASSWORD)) { throw 'Invalid credentials.' }
    $repo = Local-Path $env:RESTIC_REPOSITORY
    $temp = Local-Path $TempRoot
    $gitRoot = Local-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')))
    $osTemp = Local-Path ([IO.Path]::GetTempPath())
    if ((Within $repo $gitRoot) -or (Within $repo $osTemp) -or
        (Within $repo $temp) -or (Within $temp $repo) -or (Within $temp $gitRoot)) { throw 'Unsafe repository or temporary location.' }
    if (-not (Test-Path -LiteralPath $repo -PathType Container) -or
        -not (Test-Path -LiteralPath (Join-Path $repo 'config') -PathType Leaf)) { throw 'Repository must already be initialized.' }
    if (@(Get-ChildItem -LiteralPath $repo -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Repository links refused.' }
    $rootCert = Local-Path $env:AMBUSYNC_DEPLOYMENT_SSLROOTCERT
    if (-not (Test-Path -LiteralPath $rootCert -PathType Leaf)) { throw 'Explicit public CA file required.' }
    $psql = Get-Command psql -ErrorAction Stop
    $pgDump = Get-Command pg_dump -ErrorAction Stop
    $restic = Get-Command restic -ErrorAction Stop
    # Save/clear libpq defaults so a caller's service, password, host, SSL or
    # connection-options override cannot silently redirect this job.
    foreach ($name in @('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGSSLMODE','PGSSLROOTCERT','PGOPTIONS','PGSSLCERT','PGSSLKEY','PGREQUIRESSL','PGCONNECT_TIMEOUT','RESTIC_REPOSITORY_FILE','RESTIC_PASSWORD_COMMAND')) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    $workDir = Join-Path $temp ([guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $workDir | Out-Null
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $workDir -AclObject $acl
    $serviceFile = Join-Path $workDir 'pg_service.conf'
    $passFile = Join-Path $workDir 'pgpass.conf'
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($serviceFile, "[ambusync_l_backup]`nhost=$ExpectedSourceHost`nport=5432`ndbname=$ExpectedSourceDatabase`nuser=$userName`nsslmode=verify-full`nsslrootcert=$rootCert`nconnect_timeout=5`n", $utf8)
    [IO.File]::WriteAllText($passFile, "$(Pgpass-Escape $ExpectedSourceHost):5432:$(Pgpass-Escape $ExpectedSourceDatabase):$(Pgpass-Escape $userName):$(Pgpass-Escape $password)`n", $utf8)
    $env:PGSERVICEFILE = $serviceFile
    $env:PGPASSFILE = $passFile
    $sql = "SELECT json_build_object('database',current_database(),'tls',ssl,'protocol',version)::text FROM pg_stat_ssl WHERE pid=pg_backend_pid()"
    $response = & $psql.Source '--no-psqlrc' '--no-password' '-A' '-t' '--dbname=service=ambusync_l_backup' '-c' $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Connection verification failed.' }
    $actual = ($response -join "`n") | ConvertFrom-Json
    if ($actual.database -cne $ExpectedSourceDatabase -or $actual.tls -isnot [bool] -or
        -not $actual.tls -or $actual.protocol -notin @('TLSv1.2','TLSv1.3')) { throw 'Unverified effective source/TLS.' }
    $payloadDir = Join-Path $workDir 'payload'
    New-Item -ItemType Directory -Path $payloadDir | Out-Null
    $dumpPath = Join-Path $payloadDir 'ambusync-postgres.dump'
    & $pgDump.Source '--dbname=service=ambusync_l_backup' '--no-password' '--format=custom' "--file=$dumpPath" '--no-owner' '--no-privileges' 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) { throw 'Dump failed.' }
    $stream = [IO.File]::OpenRead($dumpPath)
    try { $magic = New-Object byte[] 5; if ($stream.Read($magic,0,5) -ne 5 -or [Text.Encoding]::ASCII.GetString($magic) -ne 'PGDMP') { throw 'Invalid dump.' } }
    finally { $stream.Dispose() }
    [ordered]@{ created_at=(Get-Date).ToUniversalTime().ToString('o'); source='synthetic-deployment'; dump_format='custom'; dump_size_bytes=(Get-Item $dumpPath).Length } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $payloadDir 'metadata.json') -Encoding UTF8
    Push-Location $payloadDir
    try {
        # Payload directory contains only dump + non-sensitive metadata. Service
        # and passfile are siblings outside it, never sent to the repository.
        & $restic.Source 'backup' '.' '--repo' $repo '--tag' 'ambusync-postgres-synthetic' '--tag' 'synthetic-only' 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Encrypted backup failed.' }
        & $restic.Source 'check' '--repo' $repo '--read-data' 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Repository verification failed.' }
    } finally { Pop-Location }
    $verified = $true
} catch {
    throw 'Copia local no verificada. Revisa origen, TLS, repositorio y herramientas sin publicar credenciales.'
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    if ($workDir -and (Test-Path -LiteralPath $workDir)) { Remove-Item -LiteralPath $workDir -Recurse -Force }
}
if ($verified) { Write-Output 'Copia local cifrada verificada. Sin subida R2 ni evidencia de restore/RPO/RTO.' }
