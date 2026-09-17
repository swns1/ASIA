<#
.SYNOPSIS
    Starts SLIS for a LAN deployment: the four backend services and,
    optionally, the built frontend.

.DESCRIPTION
    gunicorn is pinned in every requirements.txt but does not run on Windows,
    and `manage.py runserver` is a development server that Django itself tells
    you not to deploy. This uses waitress, which is production-grade and native
    to Windows.

    Each service binds 0.0.0.0 rather than 127.0.0.1 -- that is the difference
    between "works on this machine" and "reachable from a phone or a panelist's
    laptop on the same network".

    By default each service opens in its own window so its log is readable and
    it can be stopped independently; close the windows to stop the stack.
    -Background runs everything hidden with output in logs\, for the startup
    task (install-startup-task.ps1). A service whose port is already in use is
    reported and skipped, so running this twice does not start duplicates.

.PARAMETER Check
    Run the preflight checks and print the URLs without starting anything.

.PARAMETER Frontend
    Also serve the built frontend (frontend\admin-portal\dist) on port 4173
    with `vite preview`. Build it first with the VITE_* URLs set to this
    machine's LAN address (README, Deployment).

.PARAMETER Background
    Start hidden, writing each process's output to logs\<name>.out.log and
    logs\<name>.err.log in the repository.

.EXAMPLE
    .\scripts\serve-lan.ps1 -Check
    .\scripts\serve-lan.ps1 -Frontend
    .\scripts\serve-lan.ps1 -Frontend -Background
#>
param(
    [switch]$Check,
    [switch]$Frontend,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$venv = Join-Path $RepoRoot '.venv\Scripts'
$waitress = Join-Path $venv 'waitress-serve.exe'
$frontendDir = Join-Path $RepoRoot 'frontend\admin-portal'
$logDir = Join-Path $RepoRoot 'logs'

# -- Preflight ---------------------------------------------------------------
# Problems stop the run: each would otherwise surface as a confusing runtime
# error rather than as the missing setup step it actually is. Warnings are
# printed and the run continues.
if (-not (Test-Path $waitress)) {
    throw ("waitress-serve not found at $waitress. Install all four services' requirements:`n" +
        "  foreach (`$s in 'identity','student','billing','enrollment') { .venv\Scripts\python.exe -m pip install -r backend\`$s-service\requirements.txt }")
}

$lanIp = Get-LanIp
$frontendOrigin = "http://${lanIp}:$FrontendPort"
$problems = @()
$warnings = @()

foreach ($s in $SlisServices) {
    $dir = Join-Path $RepoRoot $s.Dir
    $envFile = Join-Path $dir '.env'
    if (-not (Test-Path $envFile)) {
        $problems += "$($s.Name): no .env (copy .env.example and fill it in)"
        continue
    }
    # Manifest static storage raises at request time with no manifest, which
    # would take out /admin/ and the DRF browsable API.
    if (-not (Test-Path (Join-Path $dir 'staticfiles\staticfiles.json'))) {
        $problems += "$($s.Name): collectstatic has not been run"
    }

    $cfg = Read-DotEnv $envFile
    if ($cfg['DEBUG'] -match '^(1|true|yes|on)$') {
        $warnings += "$($s.Name): DEBUG is on -- set DEBUG=0 for a deployment"
    }
    $hosts = @(("$($cfg['ALLOWED_HOSTS'])" -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($hosts -contains '*') {
        $warnings += "$($s.Name): ALLOWED_HOSTS=* is for development -- list $lanIp instead"
    }
    elseif ($hosts -notcontains $lanIp) {
        $warnings += "$($s.Name): ALLOWED_HOSTS does not include $lanIp -- requests by IP will be rejected"
    }
    $origins = @(("$($cfg['CORS_ALLOWED_ORIGINS'])" -split ',') | ForEach-Object { $_.Trim().TrimEnd('/') })
    if ($Frontend -and $origins -notcontains $frontendOrigin) {
        $warnings += "$($s.Name): CORS_ALLOWED_ORIGINS does not include $frontendOrigin -- the app will fail to load data"
    }
    if ($s.Name -eq 'student' -and "$($cfg['FRONTEND_BASE_URL'])".TrimEnd('/') -ne $frontendOrigin) {
        $current = if ($cfg['FRONTEND_BASE_URL']) { "'$($cfg['FRONTEND_BASE_URL'])'" } else { 'not set (localhost)' }
        $warnings += "student: FRONTEND_BASE_URL is $current, not $frontendOrigin -- phones can't open applicant QR links"
    }
}

if ($Frontend) {
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (-not (Test-Path $distIndex)) {
        $problems += "frontend: not built (cd frontend\admin-portal; npm run build)"
    }
    else {
        $built = (Get-Item $distIndex).LastWriteTime
        $newest = Get-ChildItem (Join-Path $frontendDir 'src') -Recurse -File |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest -and $newest.LastWriteTime -gt $built) {
            $warnings += "frontend: dist\ is older than src\ ($($newest.Name) changed) -- rebuild before serving"
        }
        $localhostRefs = Select-String -Path (Join-Path $frontendDir 'dist\assets\*.js') `
            -Pattern 'http://(localhost|127\.0\.0\.1):800[0-3]' -List -ErrorAction SilentlyContinue
        if ($localhostRefs) {
            $warnings += "frontend: the build calls the APIs on localhost -- rebuild with VITE_*_API_URL=http://${lanIp}:800x"
        }
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $problems += "frontend: Node.js is not installed or not on PATH"
    }
}

if ($problems) {
    Write-Host "Preflight failed:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "Fix the above before serving. See the Deployment section of README.md."
}

Write-Host ""
Write-Host "SLIS -- LAN deployment" -ForegroundColor Cyan
Write-Host "Host address: $lanIp" -ForegroundColor Cyan
foreach ($s in $SlisServices) {
    Write-Host ("  {0,-11} http://{1}:{2}/health/" -f $s.Name, $lanIp, $s.Port)
}
if ($Frontend) { Write-Host ("  {0,-11} {1}/" -f 'frontend', $frontendOrigin) }
if ($warnings) {
    Write-Host ""
    $warnings | ForEach-Object { Write-Host "  ! $_" -ForegroundColor Yellow }
}
Write-Host ""

if ($Check) { Write-Host "-Check given; nothing started."; exit 0 }

function Test-PortInUse([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-SlisProcess([string]$Name, [string]$Exe, [string[]]$Arguments, [string]$WorkDir) {
    if ($Background) {
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        Start-Process -FilePath $Exe -ArgumentList $Arguments -WorkingDirectory $WorkDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logDir "$Name.out.log") `
            -RedirectStandardError (Join-Path $logDir "$Name.err.log") | Out-Null
    }
    else {
        $quoted = ($Arguments | ForEach-Object { "'$_'" }) -join ' '
        $cmd = "`$Host.UI.RawUI.WindowTitle = 'SLIS $Name'; Set-Location '$WorkDir'; & '$Exe' $quoted"
        Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd -WindowStyle Normal | Out-Null
    }
}

foreach ($s in $SlisServices) {
    if (Test-PortInUse $s.Port) {
        Write-Host "$($s.Name): port $($s.Port) already in use -- skipped (already running?)" -ForegroundColor Yellow
        continue
    }
    Start-SlisProcess -Name $s.Name -Exe $waitress `
        -Arguments @("--listen=0.0.0.0:$($s.Port)", "$($s.Module).wsgi:application") `
        -WorkDir (Join-Path $RepoRoot $s.Dir)
    Write-Host "started $($s.Name) on $($s.Port)" -ForegroundColor Green
}

if ($Frontend) {
    if (Test-PortInUse $FrontendPort) {
        Write-Host "frontend: port $FrontendPort already in use -- skipped (already running?)" -ForegroundColor Yellow
    }
    else {
        # node + vite's own entry point rather than npm.cmd, so the process
        # that owns the port is the one Task Scheduler started.
        $node = (Get-Command node).Source
        $vite = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
        Start-SlisProcess -Name 'frontend' -Exe $node -Arguments @($vite, 'preview') -WorkDir $frontendDir
        Write-Host "started frontend on $FrontendPort" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Verify with: .\scripts\health-check.ps1" -ForegroundColor Cyan
