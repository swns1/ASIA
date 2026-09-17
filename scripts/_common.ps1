<#
    Shared helpers for the scripts in this folder. Dot-source it:

        . (Join-Path $PSScriptRoot '_common.ps1')

    Not meant to be run on its own.
#>

$script:RepoRoot = Split-Path -Parent $PSScriptRoot

$script:SlisServices = @(
    @{ Name = 'identity';   Dir = 'backend\identity-service';   Module = 'identity_service';   Port = 8001 }
    @{ Name = 'student';    Dir = 'backend\student-service';    Module = 'student_service';    Port = 8000 }
    @{ Name = 'billing';    Dir = 'backend\billing-service';    Module = 'billing_service';    Port = 8002 }
    @{ Name = 'enrollment'; Dir = 'backend\enrollment-service'; Module = 'enrollment_service'; Port = 8003 }
)

$script:FrontendPort = 4173

# Runs a native program and returns its stdout lines; the exit code is left in
# $LASTEXITCODE. Windows PowerShell turns every stderr line into an error
# record whenever output is redirected (Task Scheduler, a log file, 2>&1), and
# under $ErrorActionPreference = 'Stop' that aborts the script on harmless
# log lines. stderr is collected instead and printed only if the program fails.
function Invoke-Native([scriptblock]$Command) {
    $stdout = New-Object System.Collections.Generic.List[string]
    $stderr = New-Object System.Collections.Generic.List[string]
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { $stderr.Add("$_") }
            else { $stdout.Add("$_") }
        }
    }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) {
        $stdout + $stderr | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
    return $stdout.ToArray()
}

function Get-SlisPython {
    $python = Join-Path $script:RepoRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path $python)) {
        throw "No virtualenv at $python. Create it and install all four requirements files (see README, Backend)."
    }
    return $python
}

# The address other devices on the network use to reach this machine.
# Prefers the adapter that holds the default route: the first non-loopback
# IPv4 is often a Hyper-V, WSL or VPN adapter that no phone can reach.
function Get-LanIp {
    $withGateway = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1
    if ($withGateway -and $withGateway.IPv4Address) {
        return @($withGateway.IPv4Address)[0].IPAddress
    }
    $any = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1
    if ($any) { return $any.IPAddress }
    return 'localhost'
}

# KEY=VALUE pairs from a .env file, as a hashtable. Comments and blank lines
# are skipped; surrounding quotes are stripped, matching the services' loaders.
function Read-DotEnv([string]$Path) {
    $values = @{}
    if (-not (Test-Path $Path)) { return $values }
    foreach ($raw in Get-Content $Path) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { continue }
        $key, $value = $line.Split('=', 2)
        $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $values
}

# The folders uploaded documents live in, one entry per distinct folder.
# Mirrors the services' own rule: MEDIA_ROOT from .env, relative to the
# service folder, defaulting to its media/ folder.
function Get-MediaRoots {
    $roots = [ordered]@{}
    foreach ($name in 'student', 'enrollment') {
        $svc = $script:SlisServices | Where-Object { $_.Name -eq $name }
        $svcDir = Join-Path $script:RepoRoot $svc.Dir
        $configured = (Read-DotEnv (Join-Path $svcDir '.env'))['MEDIA_ROOT']
        if (-not $configured) { $configured = 'media' }
        $path = if ([System.IO.Path]::IsPathRooted($configured)) { $configured } else { Join-Path $svcDir $configured }
        $full = [System.IO.Path]::GetFullPath($path)
        if (-not $roots.Contains($full)) { $roots[$full] = $name }
    }
    foreach ($entry in $roots.GetEnumerator()) {
        [pscustomobject]@{ Label = "$($entry.Value)-media"; Path = $entry.Key }
    }
}

# psql / pg_dump / pg_restore. The PostgreSQL installer does not add its bin
# folder to PATH, so fall back to the newest version under Program Files.
function Find-PgTool([string]$Name) {
    $onPath = Get-Command $Name -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $installed = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+(\.\d+)?$' } |
        Sort-Object { [double]$_.Name } -Descending
    foreach ($dir in $installed) {
        $exe = Join-Path $dir.FullName "bin\$Name.exe"
        if (Test-Path $exe) { return $exe }
    }
    throw "$Name not found. Install PostgreSQL or add its bin folder to PATH."
}

# Connection settings every service shares, read from identity-service's .env
# (all four .env files point at the same database). PGPASSWORD is set for the
# current process only, so psql and pg_dump never prompt.
function Use-SlisDatabase {
    $envPath = Join-Path $script:RepoRoot 'backend\identity-service\.env'
    $cfg = Read-DotEnv $envPath
    if (-not $cfg['DB_PASSWORD']) {
        throw "DB_PASSWORD is not set in $envPath. Copy .env.example to .env and fill it in first."
    }
    $env:PGPASSWORD = $cfg['DB_PASSWORD']
    return [pscustomobject]@{
        Name = if ($cfg['DB_NAME']) { $cfg['DB_NAME'] } else { 'SLIS THESIS FINAL' }
        User = if ($cfg['DB_USER']) { $cfg['DB_USER'] } else { 'postgres' }
        Host = if ($cfg['DB_HOST']) { $cfg['DB_HOST'] } else { 'localhost' }
        Port = if ($cfg['DB_PORT']) { $cfg['DB_PORT'] } else { '5432' }
    }
}
