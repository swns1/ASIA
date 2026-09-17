<#
.SYNOPSIS
    Restores a backup made by backup.ps1.

.DESCRIPTION
    By default restores into a NEW database, leaving the current one alone,
    so a backup can be checked before anything is replaced. Point DB_NAME in
    each backend .env at it afterwards to switch over.

    -Replace instead drops and recreates the configured database and unpacks
    the documents over the media folders. Stop the services first
    (close their windows, or stop the SLIS scheduled task).

.PARAMETER BackupFolder
    A folder created by backup.ps1, e.g. backups\2026-09-17_020000.

.PARAMETER DbName
    Name for the restored database (without -Replace). Defaults to
    "<configured name>_restored_<backup folder name>".

.PARAMETER Replace
    Overwrite the configured database and media folders.

.EXAMPLE
    .\scripts\restore.ps1 -BackupFolder backups\2026-09-17_020000
    .\scripts\restore.ps1 -BackupFolder backups\2026-09-17_020000 -Replace
#>
param(
    [Parameter(Mandatory = $true)][string]$BackupFolder,
    [string]$DbName,
    [switch]$Replace
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$BackupFolder = (Resolve-Path $BackupFolder).Path
$dumpFile = Join-Path $BackupFolder 'database.dump'
if (-not (Test-Path $dumpFile)) { throw "No database.dump in $BackupFolder." }

$db = Use-SlisDatabase
$psql = Find-PgTool 'psql'
$pgRestore = Find-PgTool 'pg_restore'
$conn = @('-h', $db.Host, '-p', $db.Port, '-U', $db.User)

if ($Replace) {
    $DbName = $db.Name
}
elseif (-not $DbName) {
    $DbName = "$($db.Name)_restored_$(Split-Path -Leaf $BackupFolder)"
}

function Invoke-Sql([string]$Sql) {
    # Name passed as a psql variable over stdin (spaces, quoting).
    Invoke-Native { $Sql | & $psql @conn -d postgres -X -q -tA -v ON_ERROR_STOP=1 -v "dbname=$DbName" }
}

$exists = "$(Invoke-Sql "SELECT 1 FROM pg_database WHERE datname = :'dbname';")".Trim() -eq '1'
if ($exists -and -not $Replace) {
    throw "Database '$DbName' already exists. Pass another -DbName, or -Replace to overwrite the configured database."
}

if ($Replace) {
    Write-Host "Replacing database '$DbName' -- every service must be stopped." -ForegroundColor Yellow
    # Refuses while connections are open, which is the point: a running
    # service would otherwise keep writing to a database being replaced.
    Invoke-Sql 'DROP DATABASE IF EXISTS :"dbname";' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not drop '$DbName'. Stop the services and try again." }
}

Invoke-Sql 'CREATE DATABASE :"dbname";' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not create '$DbName'." }

Write-Host "Restoring database into '$DbName'..."
Invoke-Native { & $pgRestore @conn --no-owner --exit-on-error -d $DbName $dumpFile } | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed (exit $LASTEXITCODE)" }

$zips = Get-ChildItem -Path $BackupFolder -Filter '*-media.zip'
if ($Replace) {
    foreach ($media in Get-MediaRoots) {
        $zip = $zips | Where-Object { $_.BaseName -eq $media.Label } | Select-Object -First 1
        if (-not $zip) { continue }
        New-Item -ItemType Directory -Force -Path $media.Path | Out-Null
        Expand-Archive -Path $zip.FullName -DestinationPath $media.Path -Force
        Write-Host "  documents restored to $($media.Path)"
    }
    Write-Host "Restore complete. Start the services again." -ForegroundColor Green
}
else {
    Write-Host "Database restored as '$DbName'." -ForegroundColor Green
    if ($zips) {
        Write-Host "Documents were not unpacked (the live media folders are untouched). To use them, unpack:"
        $zips | ForEach-Object { Write-Host "  $($_.FullName)" }
    }
    Write-Host "To switch over, set DB_NAME=$DbName in each backend .env and restart the services."
}
