<#
.SYNOPSIS
    Polls /health/ on all four SLIS services.

.DESCRIPTION
    Each service exposes GET /health/ (backend/shared/health.py): no auth, and
    it runs SELECT 1 so a 503 means the shared database is unreachable rather
    than the service being down. Checking all four at once is the fastest way
    to tell "the stack is up" from "one service failed to start".

.PARAMETER HostName
    Address to poll. Defaults to localhost; pass the LAN IP to verify the
    deployment the way another device on the network will see it.

.EXAMPLE
    .\scripts\health-check.ps1
    .\scripts\health-check.ps1 -HostName 192.168.1.42
#>
param([string]$HostName = 'localhost')

$services = @(
    @{ Name = 'student';    Port = 8000 }
    @{ Name = 'identity';   Port = 8001 }
    @{ Name = 'billing';    Port = 8002 }
    @{ Name = 'enrollment'; Port = 8003 }
)

$failed = 0
foreach ($s in $services) {
    $url = "http://${HostName}:$($s.Port)/health/"
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing
        Write-Host ("{0,-11} {1}  {2}" -f $s.Name, $r.StatusCode, $r.Content) -ForegroundColor Green
    }
    catch {
        $failed++
        $code = $_.Exception.Response.StatusCode.value__
        if ($code) {
            # 503 is the service answering honestly that it cannot reach the DB.
            Write-Host ("{0,-11} {1}  {2}" -f $s.Name, $code, $_.Exception.Message) -ForegroundColor Yellow
        }
        else {
            Write-Host ("{0,-11} DOWN  {1}" -f $s.Name, $_.Exception.Message) -ForegroundColor Red
        }
    }
}

Write-Host ""
if ($failed) { Write-Host "$failed of $($services.Count) not healthy." -ForegroundColor Red; exit 1 }
Write-Host "All $($services.Count) services healthy." -ForegroundColor Green
