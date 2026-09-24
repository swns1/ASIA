<#
    Fill the database with a demonstrable school.

        .\scripts\seed-demo.ps1              # ~180 learners, 3 school years
        .\scripts\seed-demo.ps1 -Wipe        # replace a previous seeding
        .\scripts\seed-demo.ps1 -Students 300 -Seed 7

    Why this exists
    ---------------
    The database this was written against held 58 learners, of whom 22 had any
    grade and 15 had any attendance -- a maximum of 10 attendance days for any
    one of them. Nothing failed at that density; it degraded quietly. The
    clustering view grouped ~14 learners, the at-risk model scored ~12, and
    every dashboard reported on a school that barely existed.

    What it produces
    ----------------
    Three school years ending in the one currently in progress, seeded only up
    to today, so the demo shows a live school rather than a closed year:
    full attendance calendars, DO 8-transmuted grades for the quarters that
    have happened, observed-values reports, and invoices with a realistic
    spread of settled, partial and delinquent accounts.

    Order matters
    -------------
    Each command writes only the tables its own service owns, so they run
    students -> academics -> billing. The teardown runs the other way, because
    invoices and attendance do not cascade from an enrollment (those FKs are
    RESTRICT and NO ACTION, correctly -- nobody should lose a financial record
    by deleting a roster row). `-Wipe` handles that ordering for you.

    Safety
    ------
    Every generated learner carries an LRN in the reserved 9900 block, and the
    teardown is scoped to it. Records a registrar typed in are never touched.
#>
[CmdletBinding()]
param(
    [int]$Students = 180,
    [int]$Years = 3,
    [int]$Seed = 20260923,
    [string]$AsOf,
    [switch]$Wipe
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$python = Get-SlisPython
$wipeArg = if ($Wipe) { @('--wipe') } else { @() }

function Invoke-Seeder([string]$ServiceDir, [string]$Command, [string[]]$Arguments) {
    $dir = Join-Path $script:RepoRoot $ServiceDir
    Write-Host "`n>> $Command  ($ServiceDir)" -ForegroundColor Cyan
    Push-Location $dir
    try {
        & $python 'manage.py' $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command failed with exit code $LASTEXITCODE"
        }
    }
    finally { Pop-Location }
}

# ── 0. Sequences ────────────────────────────────────────────────────────────
# seed_data.sql inserts rows with explicit primary keys, which does not advance
# the owning sequence. The next insert that lets the sequence assign a key then
# collides with a row that already exists -- which is how the application ends
# up unable to create a student at all. Idempotent, so it is safe every run.
Write-Host "`n>> resyncing id sequences" -ForegroundColor Cyan
$psql = Find-PgTool 'psql'
$env:PGPASSWORD = (Read-DotEnv (Join-Path $script:RepoRoot 'backend\enrollment-service\.env')).DB_PASSWORD
$dbName = (Read-DotEnv (Join-Path $script:RepoRoot 'backend\enrollment-service\.env')).DB_NAME
& $psql -U postgres -d $dbName -q -f (Join-Path $PSScriptRoot 'resync-sequences.sql')

# ── 1-3. Seed, in dependency order ──────────────────────────────────────────
$studentArgs = @('--students', $Students, '--seed', $Seed) + $wipeArg
Invoke-Seeder 'backend\student-service' 'seed_demo_students' $studentArgs

$academicArgs = @('--years', $Years, '--seed', $Seed) + $wipeArg
if ($AsOf) { $academicArgs += @('--as-of', $AsOf) }
Invoke-Seeder 'backend\enrollment-service' 'seed_demo' $academicArgs

$billingArgs = @('--seed', $Seed) + $wipeArg
Invoke-Seeder 'backend\billing-service' 'seed_demo_billing' $billingArgs

# ── 4. Overdue flags ────────────────────────────────────────────────────────
# Installments do not become overdue on their own -- nothing recomputes that on
# read (deliberately: it used to run as a side effect of every GET). Without
# this the seeded accounts all read as merely "pending" past their due date.
Invoke-Seeder 'backend\billing-service' 'flag_overdue_installments' @()

Write-Host "`nDone. The database now holds a school year in progress." -ForegroundColor Green
Write-Host "Check it with: .\scripts\health-check.ps1" -ForegroundColor DarkGray
