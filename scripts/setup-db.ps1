<#
.SYNOPSIS
    Creates the SLIS database from scratch: schema, migration bookkeeping,
    reference data, and (optionally) the demo data.

.DESCRIPTION
    Steps, in order:
      1. CREATE DATABASE (refuses if it already exists).
      2. Load schema.sql -- the source of truth for every table.
      3. `manage.py migrate --fake` in all four services. schema.sql is a
         schema-only dump, so it already contains the tables Django's
         migrations would create but leaves django_migrations empty; a plain
         `migrate` would then fail with "relation already exists". --fake
         records every migration as applied without running it.
      4. Load scripts/reference_data.sql (requirement types, grading
         templates, observed-value categories, a default settings row).
      5. With -Demo only: load seed_data.sql (demo learners and the six demo
         accounts whose password is published in the README).

    scripts/2026-09-*.sql are NOT run: schema.sql already contains them. They
    exist only to upgrade a database created before September 2026.

    Connection settings come from backend/identity-service/.env, or from
    -DatabaseUrl for a hosted database (Railway), which already exists and
    must be empty -- step 1 then only checks that.

    The two lines pg_dump 17 adds that older servers and clients reject
    (\restrict/\unrestrict and SET transaction_timeout) are dropped from a
    temporary copy of schema.sql before it is loaded.

.PARAMETER DbName
    Database to create. Defaults to DB_NAME in identity-service's .env. Pass a
    throwaway name to rehearse the install without touching the real one.

.PARAMETER DatabaseUrl
    postgresql://user:password@host:port/dbname of an EXISTING, EMPTY
    database -- on Railway, the Postgres service's DATABASE_PUBLIC_URL. Used
    instead of identity-service's .env; nothing in any .env is changed.

.PARAMETER Demo
    Also load the demo data. Leave off for a real install, then create the
    first account with:
      .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts create-admin --email ... --name ...

.EXAMPLE
    .\scripts\setup-db.ps1
    .\scripts\setup-db.ps1 -Demo
    .\scripts\setup-db.ps1 -DbName slis_rehearsal
    .\scripts\setup-db.ps1 -DatabaseUrl "postgresql://postgres:...@....proxy.rlwy.net:12345/railway"
#>
param(
    [string]$DbName,
    [string]$DatabaseUrl,
    [switch]$Demo
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$existing = [bool]$DatabaseUrl
if ($existing) {
    $uri = [System.Uri]$DatabaseUrl
    if ($uri.Scheme -notin 'postgres', 'postgresql') { throw "-DatabaseUrl must start with postgresql://" }
    $user, $password = $uri.UserInfo.Split(':', 2)
    $db = [pscustomobject]@{
        Name = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
        User = [System.Uri]::UnescapeDataString($user)
        Host = $uri.Host
        Port = if ($uri.Port -gt 0) { "$($uri.Port)" } else { '5432' }
    }
    $env:PGPASSWORD = [System.Uri]::UnescapeDataString($password)
    if ($DbName -and $DbName -ne $db.Name) { throw "-DbName and -DatabaseUrl name different databases." }
    $DbName = $db.Name
}
else {
    $db = Use-SlisDatabase
    if (-not $DbName) { $DbName = $db.Name }
}
$psql = Find-PgTool 'psql'
$python = Get-SlisPython
$env:PGCLIENTENCODING = 'UTF8'

$connArgs = @('-h', $db.Host, '-p', $db.Port, '-U', $db.User, '-v', 'ON_ERROR_STOP=1', '-X', '-q')

function Invoke-Psql {
    param([string]$Database, [string[]]$Extra, [string]$Stdin)
    $argsList = $connArgs + @('-d', $Database) + $Extra
    if ($Stdin) { $out = Invoke-Native { $Stdin | & $psql @argsList } }
    else { $out = Invoke-Native { & $psql @argsList } }
    if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE) on: $($Extra -join ' ')" }
    return $out
}

function Step([string]$Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }

# -- 1. Create (or check) ----------------------------------------------------
if ($existing) {
    Step "Checking database '$DbName' on $($db.Host):$($db.Port) is empty"
    $tables = Invoke-Psql -Database $DbName -Extra @('-tA') `
        -Stdin "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
    if ("$tables".Trim() -ne '0') {
        throw "Database '$DbName' already has $("$tables".Trim()) table(s). This script only fills an empty database."
    }
}
else {
    Step "Creating database '$DbName' on $($db.Host):$($db.Port)"
    # Passed as a psql variable over stdin: Windows PowerShell mangles double
    # quotes inside native-command arguments, and the default name has spaces.
    $exists = Invoke-Psql -Database 'postgres' -Extra @('-tA', '-v', "dbname=$DbName") `
        -Stdin "SELECT 1 FROM pg_database WHERE datname = :'dbname';"
    if ("$exists".Trim() -eq '1') {
        throw "Database '$DbName' already exists. This script only builds a new one -- drop it first, or pass -DbName with another name."
    }
    Invoke-Psql -Database 'postgres' -Extra @('-v', "dbname=$DbName") -Stdin 'CREATE DATABASE :"dbname";' | Out-Null
}

# -- 2. Schema ---------------------------------------------------------------
Step 'Loading schema.sql'
# pg_dump 17 writes \restrict/\unrestrict (unknown to psql before 17.6) and
# SET transaction_timeout (unknown to servers before 17). Neither matters for
# loading a schema, so a copy without them loads on any recent version.
$schemaCopy = Join-Path ([System.IO.Path]::GetTempPath()) "slis-schema-$PID.sql"
$schemaLines = Get-Content (Join-Path $RepoRoot 'schema.sql') -Encoding UTF8 |
    Where-Object { $_ -notmatch '^\\(un)?restrict\b' -and $_ -notmatch '^SET transaction_timeout\b' }
# No byte-order mark: psql would read one as part of the first statement.
[System.IO.File]::WriteAllLines($schemaCopy, [string[]]$schemaLines, (New-Object System.Text.UTF8Encoding $false))
try {
    Invoke-Psql -Database $DbName -Extra @('--single-transaction', '-f', $schemaCopy) | Out-Null
}
finally { Remove-Item -LiteralPath $schemaCopy -Force -ErrorAction SilentlyContinue }

# -- 3. Migration bookkeeping ------------------------------------------------
Step 'Recording Django migrations as applied (migrate --fake)'
# The services read DB_* from their .env only when it is not already set in
# the environment, so this points all four at the target for this run.
$dbEnv = @{
    DB_NAME = $DbName; DB_HOST = $db.Host; DB_PORT = $db.Port
    DB_USER = $db.User; DB_PASSWORD = $env:PGPASSWORD
}
$previousEnv = @{}
foreach ($k in $dbEnv.Keys) {
    $previousEnv[$k] = [Environment]::GetEnvironmentVariable($k)
    [Environment]::SetEnvironmentVariable($k, $dbEnv[$k])
}
try {
    # All four services have a local app labelled `accounts`, and they share
    # one django_migrations table (see README, "Known in-progress work").
    # Identity's chain starts at 0001_create_audit_log, the others' at
    # 0001_initial, and every chain has a 0002_add_current_session_id. Whichever
    # 0002 is recorded first must find BOTH first migrations already recorded,
    # or the next service aborts with InconsistentMigrationHistory. Recording
    # the two roots first reproduces the order the existing database has.
    $roots = @(
        @{ Dir = 'backend\identity-service'; Migration = '0001_create_audit_log' }
        @{ Dir = 'backend\student-service';  Migration = '0001_initial' }
    )
    foreach ($r in $roots) {
        Push-Location (Join-Path $RepoRoot $r.Dir)
        try {
            Invoke-Native { & $python manage.py migrate accounts $r.Migration --fake --noinput } | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "could not record accounts.$($r.Migration)" }
        }
        finally { Pop-Location }
    }

    foreach ($s in $SlisServices) {
        Push-Location (Join-Path $RepoRoot $s.Dir)
        try {
            Invoke-Native { & $python manage.py migrate --fake --noinput } | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "migrate --fake failed in $($s.Name)" }
            Invoke-Native { & $python manage.py migrate --check } | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "$($s.Name) still has unapplied migrations" }
            Write-Host "  $($s.Name): ok"
        }
        finally { Pop-Location }
    }
}
finally {
    foreach ($k in $previousEnv.Keys) { [Environment]::SetEnvironmentVariable($k, $previousEnv[$k]) }
}

# -- 4. Reference data -------------------------------------------------------
Step 'Loading scripts/reference_data.sql'
Invoke-Psql -Database $DbName -Extra @('--single-transaction', '-f', (Join-Path $PSScriptRoot 'reference_data.sql')) | Out-Null

# -- 5. Demo data ------------------------------------------------------------
if ($Demo) {
    Step 'Loading seed_data.sql (demo)'
    # seed_data.sql has its own BEGIN/COMMIT and includes reference_data.sql.
    Invoke-Psql -Database $DbName -Extra @('-f', (Join-Path $RepoRoot 'seed_data.sql')) | Out-Null
}

Write-Host "`nDatabase '$DbName' is ready." -ForegroundColor Green
if (-not $existing -and $DbName -ne $db.Name) {
    Write-Host "Note: the services still point at '$($db.Name)'. Set DB_NAME in each backend .env to use this one." -ForegroundColor Yellow
}
if ($Demo) {
    Write-Host "Demo accounts use the password in README.md. Before real use, lock them:"
    Write-Host "  .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts lock-demo"
}
else {
    Write-Host "Next, create the first account:"
    if ($existing) {
        Write-Host "  cd backend\identity-service"
        Write-Host "  `$env:DB_HOST='$($db.Host)'; `$env:DB_PORT='$($db.Port)'; `$env:DB_USER='$($db.User)'; `$env:DB_NAME='$DbName'; `$env:DB_PASSWORD='<password from the URL>'"
        Write-Host "  ..\..\.venv\Scripts\python.exe manage.py manage_accounts create-admin --email you@school.edu.ph --name `"Your Name`""
    }
    else {
        Write-Host "  .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts create-admin --email you@school.edu.ph --name `"Your Name`""
    }
    Write-Host "Then set the school address and school-year dates on the Billing Settings page, and add subjects on the Subjects page."
}
