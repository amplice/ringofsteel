$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.local\server-pids.json'
$clientUrl = 'http://127.0.0.1:5180'
$serverUrl = 'http://localhost:3000'
$clientLog = Join-Path $repoRoot '.local\logs\client-dev.log'
$serverLog = Join-Path $repoRoot '.local\logs\static-server.log'

function Get-Status([string]$url) {
  try {
    return (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode
  } catch {
    return $null
  }
}

if (Test-Path $pidFile) {
  Write-Host 'Tracked processes:'
  Get-Content $pidFile
} else {
  Write-Host 'No PID file found.'
}

$clientStatus = Get-Status $clientUrl
$serverStatus = Get-Status $serverUrl

Write-Host "Client $clientUrl => $clientStatus"
Write-Host "Server $serverUrl => $serverStatus"

if (Test-Path $clientLog) {
  Write-Host "`nClient log tail:"
  Get-Content $clientLog -Tail 20
}

if (Test-Path $serverLog) {
  Write-Host "`nServer log tail:"
  Get-Content $serverLog -Tail 20
}
