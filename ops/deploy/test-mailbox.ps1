$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
    if (-not (Test-Path (Join-Path $dockerBin 'docker.exe'))) { throw 'Docker required.' }
    $env:PATH = "$dockerBin;$env:PATH"
}
node (Join-Path $PSScriptRoot 'tests/mailbox-container-test.mjs')
exit $LASTEXITCODE
