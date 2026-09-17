<#
.SYNOPSIS
    Makes the LAN deployment run on its own: starts SLIS when the PC boots,
    runs the scheduled jobs, and opens the firewall for the school network.

.DESCRIPTION
    Registers these Task Scheduler tasks under the "SLIS" folder, all running
    as SYSTEM so nobody needs to be logged in:

      SLIS\Start          at startup (after a 1-minute delay so PostgreSQL is up):
                          serve-lan.ps1 -Frontend -Background
      SLIS\Overdue        daily:  billing  manage.py flag_overdue_installments
      SLIS\Backup         daily:  backup.ps1
      SLIS\Cleanup        weekly: identity manage.py clearsessions
                                  identity manage.py axes_reset_logs --age 90

    And one inbound firewall rule, "SLIS (LAN)", allowing TCP 8000-8003 and
    4173 on the Private network profile only. If Windows classifies the school
    network as Public, phones still cannot connect -- the script says so.

    Must be run from an elevated PowerShell (Run as administrator).
    Run it again after moving the repository; it replaces its own tasks.

.PARAMETER DailyAt
    Time of day for the overdue flagging (the backup runs an hour later).

.PARAMETER NoFrontend
    Start only the backend services at boot.

.PARAMETER Uninstall
    Remove the tasks and the firewall rule.

.EXAMPLE
    .\scripts\install-startup-task.ps1
    .\scripts\install-startup-task.ps1 -DailyAt 1:00
    .\scripts\install-startup-task.ps1 -Uninstall
#>
param(
    [string]$DailyAt = '1:00',
    [switch]$NoFrontend,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this from an elevated PowerShell (right-click > Run as administrator)."
}

$taskPath = '\SLIS\'
$ruleName = 'SLIS (LAN)'

# -- Uninstall ---------------------------------------------------------------
Get-ScheduledTask -TaskPath $taskPath -ErrorAction SilentlyContinue |
    Unregister-ScheduledTask -Confirm:$false
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule
if ($Uninstall) {
    Write-Host "Removed the SLIS scheduled tasks and firewall rule." -ForegroundColor Green
    Write-Host "Services already running keep running until the PC restarts or their processes are ended."
    exit 0
}

# -- Tasks -------------------------------------------------------------------
$python = Get-SlisPython
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$system = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

function Script-Action([string]$Script, [string]$Arguments = '') {
    New-ScheduledTaskAction -Execute $ps -WorkingDirectory $RepoRoot `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot $Script)`" $Arguments"
}

function Manage-Action([string]$Service, [string]$Arguments) {
    $dir = Join-Path $RepoRoot ($SlisServices | Where-Object { $_.Name -eq $Service }).Dir
    New-ScheduledTaskAction -Execute $python -Argument "manage.py $Arguments" -WorkingDirectory $dir
}

function Register([string]$Name, $Action, $Trigger, [string]$Description, $TaskSettings = $settings) {
    Register-ScheduledTask -TaskPath $taskPath -TaskName $Name -Action $Action -Trigger $Trigger `
        -Principal $system -Settings $TaskSettings -Description $Description | Out-Null
    Write-Host "  registered $taskPath$Name" -ForegroundColor Green
}

Write-Host "Registering scheduled tasks"

$startup = New-ScheduledTaskTrigger -AtStartup
$startup.Delay = 'PT1M'
# The services outlive this task's own process, so no time limit applies.
$startSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
$serveArgs = if ($NoFrontend) { '-Background' } else { '-Frontend -Background' }
Register 'Start' (Script-Action 'serve-lan.ps1' $serveArgs) $startup `
    'Starts the SLIS services (and frontend) for the LAN deployment.' $startSettings

$dailyTime = [datetime]::Parse($DailyAt)
Register 'Overdue' (Manage-Action 'billing' 'flag_overdue_installments') `
    (New-ScheduledTaskTrigger -Daily -At $dailyTime) `
    'Marks unpaid installments past their due date as overdue.'

Register 'Backup' (Script-Action 'backup.ps1') `
    (New-ScheduledTaskTrigger -Daily -At $dailyTime.AddHours(1)) `
    'Backs up the SLIS database and uploaded documents to backups\.'

Register 'Cleanup' @(
    (Manage-Action 'identity' 'clearsessions'),
    (Manage-Action 'identity' 'axes_reset_logs --age 90')
) (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $dailyTime.AddHours(2)) `
    'Deletes expired sessions and login-attempt logs older than 90 days.'

# -- Firewall ----------------------------------------------------------------
Write-Host "Opening the firewall for the school network"
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort @('8000-8003', "$FrontendPort") -Profile Private `
    -Description 'SLIS backend services and frontend, LAN deployment.' | Out-Null
Write-Host "  allowed TCP 8000-8003 and $FrontendPort on Private networks" -ForegroundColor Green

$public = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
foreach ($p in $public) {
    Write-Host "  ! '$($p.Name)' ($($p.InterfaceAlias)) is a Public network, so the rule does not apply to it." -ForegroundColor Yellow
    Write-Host "    If this is the school network, make it Private:" -ForegroundColor Yellow
    Write-Host "    Set-NetConnectionProfile -InterfaceAlias '$($p.InterfaceAlias)' -NetworkCategory Private" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Start now without rebooting:  Start-ScheduledTask -TaskPath '$taskPath' -TaskName 'Start'"
Write-Host "Check afterwards:                   .\scripts\health-check.ps1"
