<#
.SYNOPSIS
    Stops the SLIS services and frontend started by serve-lan.ps1.

.DESCRIPTION
    Ends the processes listening on the SLIS ports (8000-8003 and 4173) --
    the only way to stop a -Background start, which has no windows to close.
    Only python, waitress-serve and node processes are stopped; anything else
    holding one of those ports is reported and left alone.

    The startup task starts everything again at the next boot. To stop that
    too, run install-startup-task.ps1 -Uninstall.

.EXAMPLE
    .\scripts\stop-lan.ps1
#>
. (Join-Path $PSScriptRoot '_common.ps1')

$ports = @($SlisServices | ForEach-Object { $_.Port }) + $FrontendPort
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort }

if (-not $listeners) {
    Write-Host "Nothing is listening on the SLIS ports."
    exit 0
}

foreach ($owner in $listeners | Group-Object OwningProcess) {
    $proc = Get-Process -Id $owner.Name -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    $portList = ($owner.Group | ForEach-Object { $_.LocalPort } | Sort-Object -Unique) -join ', '
    if ($proc.ProcessName -in 'python', 'pythonw', 'waitress-serve', 'node') {
        Stop-Process -Id $proc.Id -Force
        Write-Host "stopped $($proc.ProcessName) ($($proc.Id)) on port $portList" -ForegroundColor Green
    }
    else {
        Write-Host "left $($proc.ProcessName) ($($proc.Id)) on port $portList alone -- not a SLIS process" -ForegroundColor Yellow
    }
}
