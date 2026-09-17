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

    Connection settings come from backend/identity-service/.env.

.PARAMETER DbName
    Database to create. Defaults to DB_NAME in identity-service's .env. Pass a
    throwaway name to rehearse the install without touching the real one.

.PARAMETER Demo
    Also load the demo data. Leave off for a real install, then create the
    first account with:
      .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts create-admin --email ... --name ...

.EXAMPLE
    .\scripts\setup-db.ps1
    .\scripts\setup-db.ps1 -Demo
    .\scripts\setup-db.ps1 -DbName slis_rehearsal
#>
param(
    [string]$DbName,
    [switch]$Demo
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$db = Use-SlisDatabase
if (-not $DbName) { $DbName = $db.Name }
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

# -- 1. Create ---------------------------------------------------------------
Step "Creating database '$DbName' on $($db.Host):$($db.Port)"
# Passed as a psql variable over stdin: Windows PowerShell mangles double
# quotes inside native-command arguments, and the default name has spaces.
$exists = Invoke-Psql -Database 'postgres' -Extra @('-tA', '-v', "dbname=$DbName") `
    -Stdin "SELECT 1 FROM pg_database WHERE datname = :'dbname';"
if ("$exists".Trim() -eq '1') {
    throw "Database '$DbName' already exists. This script only builds a new one -- drop it first, or pass -DbName with another name."
}
Invoke-Psql -Database 'postgres' -Extra @('-v', "dbname=$DbName") -Stdin 'CREATE DATABASE :"dbname";' | Out-Null

# -- 2. Schema ---------------------------------------------------------------
Step 'Loading schema.sql'
Invoke-Psql -Database $DbName -Extra @('--single-transaction', '-f', (Join-Path $RepoRoot 'schema.sql')) | Out-Null

# -- 3. Migration bookkeeping ------------------------------------------------
Step 'Recording Django migrations as applied (migrate --fake)'
# The services read DB_NAME from their .env only when it is not already set
# in the environment, so this points all four at $DbName for this run.
$previousDbName = $env:DB_NAME
$env:DB_NAME = $DbName
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
finally { $env:DB_NAME = $previousDbName }

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
if ($DbName -ne $db.Name) {
    Write-Host "Note: the services still point at '$($db.Name)'. Set DB_NAME in each backend .env to use this one." -ForegroundColor Yellow
}
if ($Demo) {
    Write-Host "Demo accounts use the password in README.md. Before real use, lock them:"
    Write-Host "  .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts lock-demo"
}
else {
    Write-Host "Next, create the first account:"
    Write-Host "  .venv\Scripts\python.exe backend\identity-service\manage.py manage_accounts create-admin --email you@school.edu.ph --name `"Your Name`""
    Write-Host "Then set the school address and school-year dates on the Billing Settings page, and add subjects on the Subjects page."
}
