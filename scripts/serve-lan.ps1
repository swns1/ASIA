<#
.SYNOPSIS
    Starts the four SLIS backend services for a LAN testing deployment.

.DESCRIPTION
    gunicorn is pinned in every requirements.txt but does not run on Windows,
    and `manage.py runserver` is a development server that Django itself tells
    you not to deploy. This uses waitress, which is production-grade and native
    to Windows.

    Each service binds 0.0.0.0 rather than 127.0.0.1 -- that is the difference
    between "works on this machine" and "reachable from a phone or a panelist's
    laptop on the same network".

    Each service opens in its own window so its log is readable and it can be
    stopped independently. Close the windows to stop the stack.

.PARAMETER Check
    Run the preflight checks and print the URLs without starting anything.

.EXAMPLE
    .\scripts\serve-lan.ps1
    .\scripts\serve-lan.ps1 -Check
#>
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv\Scripts'
$waitress = Join-Path $venv 'waitress-serve.exe'

$services = @(
    @{ Name = 'identity';   Dir = 'backend\identity-service';   Module = 'identity_service';   Port = 8001 }
    @{ Name = 'student';    Dir = 'backend\student-service';    Module = 'student_service';    Port = 8000 }
    @{ Name = 'billing';    Dir = 'backend\billing-service';    Module = 'billing_service';    Port = 8002 }
    @{ Name = 'enrollment'; Dir = 'backend\enrollment-service'; Module = 'enrollment_service'; Port = 8003 }
)

# ── Preflight ────────────────────────────────────────────────────────────────
# Each of these is a failure that otherwise shows up as a confusing runtime
# error rather than as the missing setup step it actually is.
if (-not (Test-Path $waitress)) {
    throw "waitress-serve not found at $waitress. Run: .venv\Scripts\python.exe -m pip install -r backend\identity-service\requirements.txt"
}

$problems = @()
foreach ($s in $services) {
    $dir = Join-Path $root $s.Dir
    if (-not (Test-Path (Join-Path $dir '.env'))) {
        $problems += "$($s.Name): no .env (copy .env.example and fill it in)"
    }
    # Manifest static storage raises at request time with no manifest, which
    # would take out /admin/ and the DRF browsable API.
    if (-not (Test-Path (Join-Path $dir 'staticfiles\staticfiles.json'))) {
        $problems += "$($s.Name): collectstatic has not been run"
    }
}
if ($problems) {
    Write-Host "Preflight failed:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "Fix the above before serving. See the Deployment section of README.md."
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1).IPAddress
if (-not $lanIp) { $lanIp = 'localhost' }

Write-Host ""
Write-Host "SLIS services -- LAN testing deployment" -ForegroundColor Cyan
Write-Host "Host address: $lanIp" -ForegroundColor Cyan
foreach ($s in $services) {
    Write-Host ("  {0,-11} http://{1}:{2}/health/" -f $s.Name, $lanIp, $s.Port)
}
Write-Host ""
Write-Host "ALLOWED_HOSTS in each .env must include $lanIp, or every request is rejected." -ForegroundColor Yellow
Write-Host ""

if ($Check) { Write-Host "-Check given; nothing started."; exit 0 }

foreach ($s in $services) {
    $dir = Join-Path $root $s.Dir
    $cmd = "Set-Location '$dir'; & '$waitress' --listen=0.0.0.0:$($s.Port) $($s.Module).wsgi:application"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd -WindowStyle Normal
    Write-Host "started $($s.Name) on $($s.Port)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Verify with: .\scripts\health-check.ps1" -ForegroundColor Cyan
