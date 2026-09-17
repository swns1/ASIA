<#
.SYNOPSIS
    Polls /health/ on all four SLIS services (and the frontend, if serving).

.DESCRIPTION
    Each service exposes GET /health/ (backend/shared/health.py): no auth, and
    it runs SELECT 1 so a 503 means the shared database is unreachable rather
    than the service being down. Checking all four at once is the fastest way
    to tell "the stack is up" from "one service failed to start".

    Exits 1 if anything is unhealthy, so it can be used from Task Scheduler.

.PARAMETER HostName
    Address to poll. Defaults to this machine's LAN address -- the same one
    other devices use, and the one ALLOWED_HOSTS lists. (localhost is rejected
    with a 400 once ALLOWED_HOSTS names only the LAN IP.)

.EXAMPLE
    .\scripts\health-check.ps1
    .\scripts\health-check.ps1 -HostName localhost
#>
param([string]$HostName)

. (Join-Path $PSScriptRoot '_common.ps1')
if (-not $HostName) { $HostName = Get-LanIp }

Write-Host "Checking $HostName"
$failed = 0
foreach ($s in $SlisServices | Sort-Object { $_.Port }) {
    $url = "http://${HostName}:$($s.Port)/health/"
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing
        Write-Host ("{0,-11} {1}  {2}" -f $s.Name, $r.StatusCode, $r.Content) -ForegroundColor Green
    }
    catch {
        $failed++
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 400) {
            Write-Host ("{0,-11} 400  rejected -- is $HostName in this service's ALLOWED_HOSTS?" -f $s.Name) -ForegroundColor Yellow
        }
        elseif ($code) {
            # 503 is the service answering honestly that it cannot reach the DB.
            Write-Host ("{0,-11} {1}  {2}" -f $s.Name, $code, $_.Exception.Message) -ForegroundColor Yellow
        }
        else {
            Write-Host ("{0,-11} DOWN  {1}" -f $s.Name, $_.Exception.Message) -ForegroundColor Red
        }
    }
}

# The frontend is optional (serve-lan.ps1 -Frontend); only report it if
# something is listening on its port.
if (Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue) {
    try {
        $r = Invoke-WebRequest -Uri "http://${HostName}:$FrontendPort/" -TimeoutSec 5 -UseBasicParsing
        Write-Host ("{0,-11} {1}  serving the app" -f 'frontend', $r.StatusCode) -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host ("{0,-11} DOWN  {1}" -f 'frontend', $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
if ($failed) { Write-Host "$failed check(s) failed." -ForegroundColor Red; exit 1 }
Write-Host "All checks passed." -ForegroundColor Green
