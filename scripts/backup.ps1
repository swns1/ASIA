<#
.SYNOPSIS
    Backs up the SLIS database and uploaded documents.

.DESCRIPTION
    Writes one timestamped folder per run:

        backups\2026-09-17_020000\
            database.dump          pg_dump custom format (restore.ps1 reads it)
            student-media.zip      uploaded requirement documents
            enrollment-media.zip   (only when it is a different folder)

    Folders older than -KeepDays are deleted afterwards, so a daily scheduled
    run (see install-startup-task.ps1) keeps two weeks by default. Copy the
    backups folder to another drive or machine regularly: a backup on the same
    disk does not survive that disk failing.

    Exits non-zero on any failure, so Task Scheduler shows the run as failed.

.PARAMETER Destination
    Where backup folders go. Defaults to backups\ in the repository.

.PARAMETER KeepDays
    Delete backup folders older than this many days. 0 keeps everything.

.EXAMPLE
    .\scripts\backup.ps1
    .\scripts\backup.ps1 -Destination D:\SLIS-Backups -KeepDays 30
#>
param(
    [string]$Destination,
    [int]$KeepDays = 14
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Destination) { $Destination = Join-Path $RepoRoot 'backups' }
$db = Use-SlisDatabase
$pgDump = Find-PgTool 'pg_dump'

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$folder = Join-Path $Destination $stamp
New-Item -ItemType Directory -Force -Path $folder | Out-Null
Write-Host "Backing up to $folder"

# -- Database ----------------------------------------------------------------
$dumpFile = Join-Path $folder 'database.dump'
Invoke-Native {
    & $pgDump -h $db.Host -p $db.Port -U $db.User -Fc --no-owner -f $dumpFile -d $db.Name
} | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }
Write-Host ("  database.dump  {0:N1} MB" -f ((Get-Item $dumpFile).Length / 1MB))

# -- Uploaded documents ------------------------------------------------------
foreach ($media in Get-MediaRoots) {
    $zip = Join-Path $folder "$($media.Label).zip"
    $files = Get-ChildItem -Path $media.Path -Recurse -File -ErrorAction SilentlyContinue
    if (-not $files) {
        Write-Host "  $($media.Label): no files in $($media.Path), skipped"
        continue
    }
    Compress-Archive -Path (Join-Path $media.Path '*') -DestinationPath $zip -CompressionLevel Optimal
    Write-Host ("  {0}.zip  {1} files, {2:N1} MB" -f $media.Label, @($files).Count, ((Get-Item $zip).Length / 1MB))
}

# -- Retention ---------------------------------------------------------------
if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    # Only folders this script named, so nothing else in -Destination is touched.
    Get-ChildItem -Path $Destination -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' -and $_.CreationTime -lt $cutoff } |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force
            Write-Host "  removed old backup $($_.Name)"
        }
}

Write-Host "Backup complete." -ForegroundColor Green
