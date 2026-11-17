$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
    if (Test-Path (Join-Path $dockerBin 'docker.exe')) {
        $env:PATH = "$dockerBin;$env:PATH"
    } else { throw 'Docker is required; this script never installs it.' }
}
node (Join-Path $PSScriptRoot 'tests/container-contract-test.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
