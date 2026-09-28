<#
T074 — гейт волны A под Windows PowerShell 5.1: поднимает бэкенд с чистым сидом и собранный фронт
(rewrite /api/mock → BACKEND_URL), затем прогоняет scripts/e2e-{student,teacher,admin}.sh.

Сами сквозные скрипты — bash: через WSL с установленным дистрибутивом, иначе через Git Bash с системным
C:\Windows\System32\curl.exe впереди PATH (mingw-curl портит кириллицу в argv → ложные 400).
Запуск: powershell -File backend\scripts\run_frontend_e2e.ps1 [-SkipBuild] [-Only student]
#>
param(
  [switch]$SkipBuild,
  [ValidateSet("", "student", "teacher", "admin")][string]$Only = "",
  [int]$BackendPort = 8130,
  [int]$FrontPort = 3130,
  [string]$DatabasePath = "",
  [string]$LogDirPath = ""
)

$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $PSScriptRoot
$Root = Split-Path -Parent $BackendDir
$LogDir = if ($LogDirPath) { [IO.Path]::GetFullPath($LogDirPath) } else { Join-Path $BackendDir "var\e2e-logs" }
if (-not $LogDir.StartsWith(([IO.Path]::GetFullPath((Join-Path $BackendDir "var"))) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "LogDirPath должен находиться внутри backend/var"
}
New-Item -ItemType Directory -Force $LogDir | Out-Null
$E2eDb = if ($DatabasePath) { [IO.Path]::GetFullPath($DatabasePath) } else { Join-Path $BackendDir "var\e2e.db" }
if (-not $E2eDb.StartsWith(([IO.Path]::GetFullPath((Join-Path $BackendDir "var"))) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "DatabasePath должен находиться внутри backend/var"
}

function Wait-Url([string]$Url, [int]$Limit = 60) {
  for ($i = 0; $i -lt $Limit; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3 | Out-Null; return $true } catch { Start-Sleep -Seconds 1 }
  }
  Write-Host "не дождались $Url"
  return $false
}

function Get-ListenerPid([int]$Port) {
  foreach ($line in (& netstat.exe -ano -p TCP)) {
    $fields = $line.Trim() -split '\s+'
    if ($fields.Count -ge 5 -and $fields[0] -eq 'TCP' -and $fields[1].EndsWith(":$Port") -and $fields[3] -eq 'LISTENING') {
      return [int]$fields[4]
    }
  }
  return $null
}

function Assert-PortFree([int]$Port) {
  if (Get-ListenerPid $Port) {
    throw "Порт $Port уже занят; выберите другие -BackendPort и -FrontPort"
  }
}

Assert-PortFree $BackendPort
Assert-PortFree $FrontPort
$backend = $null
$front = $null
$backendServerPid = $null
$frontServerPid = $null
$envLocalBak = $null
try {
  Write-Host "▸ бэкенд: чистый сид → $E2eDb"
  if (Test-Path $E2eDb) { Remove-Item -Force $E2eDb }
  $env:DATABASE_URL = "sqlite+aiosqlite:///" + ($E2eDb -replace "\\", "/")
  & uv run --directory $BackendDir python -m app.seed.load --reset | Out-File -Encoding utf8 (Join-Path $LogDir "seed.log")
  if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $LogDir "seed.log"); exit 1 }
  $backend = Start-Process -FilePath "uv" -ArgumentList @("run", "--directory", $BackendDir, "uvicorn", "app.main:app", "--port", "$BackendPort") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "backend.log") -RedirectStandardError (Join-Path $LogDir "backend.err.log")
  if (-not (Wait-Url "http://127.0.0.1:$BackendPort/api/mock/auth/policy" 60)) { exit 1 }
  $backendServerPid = Get-ListenerPid $BackendPort

  # Next.js запекает rewrite в момент сборки: адрес бэкенда нужен до next build.
  $envLocal = Join-Path $Root ".env.local"
  if ((Test-Path $envLocal) -and (Select-String -Path $envLocal -Pattern "^BACKEND_URL=" -Quiet)) {
    $envLocalBak = "$envLocal.e2e-bak"
    Move-Item -Force $envLocal $envLocalBak
  }
  $env:BACKEND_URL = "http://127.0.0.1:$BackendPort"
  if (-not $SkipBuild) {
    Write-Host "▸ фронт: сборка (mocks:sync, mocks:validate, next build)"
    Push-Location $Root
    # Не через `npm run build`: его строка `NEXT_TELEMETRY_DISABLED=1 next build` — bash-синтаксис, под cmd не работает.
    $buildLog = Join-Path $LogDir "build.log"
    try {
      & npm run mocks:sync | Out-File -Encoding utf8 $buildLog
      if ($LASTEXITCODE -eq 0) { & npm run mocks:validate | Out-File -Encoding utf8 -Append $buildLog }
      if ($LASTEXITCODE -eq 0) { $env:NEXT_TELEMETRY_DISABLED = "1"; & npx next build | Out-File -Encoding utf8 -Append $buildLog }
    } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Get-Content $buildLog | Select-Object -Last 50; exit 1 }
  }
  Write-Host "▸ фронт: next start -p $FrontPort, BACKEND_URL=http://127.0.0.1:$BackendPort"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  $env:PYTHONUTF8 = "1"
  $env:PYTHONIOENCODING = "utf-8"
  $next = Join-Path $Root "node_modules\.bin\next.cmd"
  $front = Start-Process -FilePath $next -ArgumentList @("start", $Root, "-p", "$FrontPort") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "front.log") -RedirectStandardError (Join-Path $LogDir "front.err.log")
  if (-not (Wait-Url "http://127.0.0.1:$FrontPort/api/mock/auth/policy" 90)) { exit 1 }
  $frontServerPid = Get-ListenerPid $FrontPort

  $runner = $null
  $bashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
  if (-not $bashExe -and (Test-Path 'C:\Program Files\Git\bin\bash.exe')) { $bashExe = 'C:\Program Files\Git\bin\bash.exe' }
  $wslReady = $false
  if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    try { $null = & wsl.exe -l -q 2>$null; $wslReady = ($LASTEXITCODE -eq 0) } catch { $wslReady = $false }
  }
  if ($wslReady) {
    $runner = "wsl"
  } elseif ($bashExe) {
    $runner = "bash"
  } else {
    Write-Host "нет ни WSL, ни Git Bash — сквозные скрипты не запущены"; exit 1
  }

  $status = 0
  foreach ($name in @("student", "teacher", "admin")) {
    if ($Only -and $Only -ne $name) { continue }
    Write-Host "▸ scripts/e2e-$name.sh"
    $log = Join-Path $LogDir "e2e-$name.log"
    Push-Location $Root
    try {
      if ($runner -eq "wsl") {
        & wsl.exe --cd "$Root" -e bash -c "BASE_URL=http://127.0.0.1:$FrontPort bash scripts/e2e-$name.sh" 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 25
      } else {
        & $bashExe -c "export PATH=/c/Windows/System32:`$PATH; BASE_URL=http://127.0.0.1:$FrontPort bash scripts/e2e-$name.sh" 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 25
      }
    } finally { Pop-Location }
    if ($LASTEXITCODE -eq 0) { Write-Host "  PASS e2e-$name" } else { Write-Host "  FAIL e2e-$name (полный вывод: $log)"; $status = 1 }
  }
  exit $status
} finally {
  if ($envLocalBak -and (Test-Path $envLocalBak)) { Move-Item -Force $envLocalBak $envLocal }
  if ($frontServerPid) { Stop-Process -Id $frontServerPid -Force -ErrorAction SilentlyContinue }
  if ($backendServerPid) { Stop-Process -Id $backendServerPid -Force -ErrorAction SilentlyContinue }
  if ($front) { Stop-Process -Id $front.Id -Force -ErrorAction SilentlyContinue }
  if ($backend) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
}
