$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.local\server-pids.json'

if (-not (Test-Path $pidFile)) {
  Write-Host 'No tracked local servers.'
  exit 0
}

$pids = Get-Content $pidFile -Raw | ConvertFrom-Json
foreach ($processId in @([int]$pids.clientPid, [int]$pids.serverPid)) {
  if ($processId -le 0) {
    continue
  }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    Stop-Process -Id $processId -Force
  }
}

Remove-Item $pidFile -Force
Write-Host 'Stopped tracked local servers.'
