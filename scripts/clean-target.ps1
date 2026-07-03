# clean-target.ps1
# Cleans the Rust build cache (src-tauri/target) to reclaim disk space.
# Safe to run between dev sessions — next build regenerates what's needed.
#
# Usage:
#   .\scripts\clean-target.ps1              # clean all (cargo clean)
#   .\scripts\clean-target.ps1 -Incremental # clean only incremental artifacts (faster)

param(
    [switch]$Incremental
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetDir = Join-Path $projectRoot.Path "src-tauri\target"

if (-not (Test-Path -LiteralPath $targetDir)) {
    Write-Host "No target directory found - nothing to clean." -ForegroundColor Green
    exit 0
}

$before = (Get-ChildItem -Path $targetDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum

if ($Incremental) {
    $incrementalDir = Join-Path $targetDir "debug\incremental"
    if (Test-Path -LiteralPath $incrementalDir) {
        Remove-Item -Path $incrementalDir -Recurse -Force
        Write-Host "Removed incremental artifacts." -ForegroundColor Yellow
    } else {
        Write-Host "No incremental artifacts found." -ForegroundColor Green
    }
} else {
    $cargoToml = Join-Path $projectRoot.Path "src-tauri\Cargo.toml"
    cargo clean --manifest-path $cargoToml 2>&1 | Out-Null
    Write-Host "Ran cargo clean - target directory purged." -ForegroundColor Yellow
}

$after = (Get-ChildItem -Path $targetDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
if ($null -eq $after) { $after = 0 }
$freed = [math]::Round(($before - $after) / 1GB, 2)
Write-Host "Freed $freed GB. Project target is now $([math]::Round($after / 1MB, 2)) MB." -ForegroundColor Green
