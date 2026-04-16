$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.local\server-pids.json'
$logDir = Join-Path $repoRoot '.local\logs'
$clientLog = Join-Path $logDir 'client-dev.log'
$serverLog = Join-Path $logDir 'static-server.log'
$clientUrl = 'http://127.0.0.1:5180'
$serverUrl = 'http://localhost:3000'

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Stop-TrackedProcess([int]$processId) {
  if ($processId -le 0) {
    return
  }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    Stop-Process -Id $processId -Force
    Start-Sleep -Milliseconds 500
  }
}

function Read-PidFile {
  if (-not (Test-Path $pidFile)) {
    return $null
  }
  return Get-Content $pidFile -Raw | ConvertFrom-Json
}

function Write-PidFile($clientPid, $serverPid) {
  $payload = [pscustomobject]@{
    clientPid = $clientPid
    serverPid = $serverPid
    writtenAt = (Get-Date).ToString('o')
  }
  $payload | ConvertTo-Json | Set-Content $pidFile
}

function Test-Url([string]$url) {
  try {
    $status = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode
    return $status -eq 200
  } catch {
    return $false
  }
}

function Wait-ForUrl([string]$url, [string]$name, [string]$logPath) {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $url) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  $tail = ''
  if (Test-Path $logPath) {
    $tail = Get-Content $logPath -Tail 40 | Out-String
  }

  throw "$name failed to respond on $url`nLog tail:`n$tail"
}

function Assert-PortFree([int]$port) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if ($null -ne $listener) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($null -ne $process) { $process.ProcessName } else { "PID $($listener.OwningProcess)" }
    throw "Port $port is already in use by $name. Stop it or run npm run dev:down first."
  }
}

Ensure-Dir (Join-Path $repoRoot '.local')
Ensure-Dir $logDir

$existing = Read-PidFile
if ($null -ne $existing) {
  Stop-TrackedProcess ([int]$existing.clientPid)
  Stop-TrackedProcess ([int]$existing.serverPid)
}

Assert-PortFree 5180
Assert-PortFree 3000

Set-Location $repoRoot
Write-Host 'Building static bundle for localhost:3000...'
npm run build
if ($LASTEXITCODE -ne 0) {
  throw 'npm run build failed'
}

Clear-Content $clientLog -ErrorAction SilentlyContinue
Clear-Content $serverLog -ErrorAction SilentlyContinue

$clientCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Wuxia Client'
Set-Location '$repoRoot'
npm run dev:client *>&1 | Tee-Object -FilePath '$clientLog'
"@

$serverCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Wuxia Static Server'
Set-Location '$repoRoot'
npm run dev:server *>&1 | Tee-Object -FilePath '$serverLog'
"@

$clientProc = Start-Process powershell -PassThru -ArgumentList '-NoExit', '-Command', $clientCommand
$serverProc = Start-Process powershell -PassThru -ArgumentList '-NoExit', '-Command', $serverCommand

Write-PidFile $clientProc.Id $serverProc.Id

Wait-ForUrl $clientUrl 'Vite dev server' $clientLog
Wait-ForUrl $serverUrl 'Static server' $serverLog

Write-Host "Client: $clientUrl"
Write-Host "Server: $serverUrl"
