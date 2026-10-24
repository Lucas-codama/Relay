$ErrorActionPreference = 'Stop'
$relayEntry = Join-Path $PSScriptRoot 'scripts/launch-relay.mjs'
if (-not (Test-Path -LiteralPath $relayEntry -PathType Leaf)) {
    Write-Error 'Execute npm run build na pasta do Relay antes de iniciar.'
    exit 3
}
$relayNode = Join-Path $env:ProgramFiles 'nodejs/node.exe'
if (-not (Test-Path -LiteralPath $relayNode -PathType Leaf)) { $relayNode = 'node' }
& $relayNode $relayEntry @args
exit $LASTEXITCODE
