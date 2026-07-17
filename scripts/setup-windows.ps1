# Checks Windows dev prerequisites for Veyra (does not install software).
$ErrorActionPreference = "Continue"
$failed = $false
$minRust = [version]"1.77.2"

function Test-Command($Name, $Required = $true, $OptionalLabel = "") {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        if ($Required) {
            Write-Host "[FAIL] $Name not found on PATH." -ForegroundColor Red
            $script:failed = $true
        } else {
            Write-Host "[SKIP] $Name not found (optional$OptionalLabel)." -ForegroundColor DarkYellow
        }
        return $null
    }
    return $cmd
}

Write-Host ""
Write-Host "Veyra - Windows prerequisite check" -ForegroundColor Cyan
Write-Host ""

$node = Test-Command "node"
if ($node) {
    $nodeVersion = (node -v) -replace "^v", ""
    Write-Host "[OK] Node.js $nodeVersion"
    if ([version]$nodeVersion -lt [version]"20.0.0") {
        Write-Host "       Node 20+ recommended. Install from https://nodejs.org/" -ForegroundColor Yellow
        $failed = $true
    }
}

$npm = Test-Command "npm"
if ($npm) {
    Write-Host "[OK] npm $(npm -v)"
}

$rustc = Test-Command "rustc"
if ($rustc) {
    $rustOut = rustc --version
    Write-Host "[OK] $rustOut"
    if ($rustOut -match "rustc (\d+\.\d+\.\d+)") {
        $rustVer = [version]$Matches[1]
        if ($rustVer -lt $minRust) {
            Write-Host "       Rust $minRust+ required. Update: https://rustup.rs/" -ForegroundColor Red
            $failed = $true
        }
    }
}

$cargo = Test-Command "cargo"
if ($cargo) {
    Write-Host "[OK] cargo $(cargo -V)"
}

Test-Command "lms" -Required $false -OptionalLabel ", LM Studio CLI" | Out-Null
if (Get-Command "lms" -ErrorAction SilentlyContinue) {
    Write-Host "[OK] lms $(lms --version 2>&1 | Select-Object -First 1)"
}

Test-Command "docker" -Required $false -OptionalLabel ", Docker for SearXNG" | Out-Null
if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    Write-Host "[OK] docker $(docker --version)"
}

Test-Command "opencode" -Required $false -OptionalLabel ", Agents mode" | Out-Null
if (Get-Command "opencode" -ErrorAction SilentlyContinue) {
    Write-Host "[OK] opencode available"
}

Write-Host ""
if ($failed) {
    Write-Host "Some required tools are missing or outdated. See README.md and:" -ForegroundColor Red
    Write-Host "  https://v2.tauri.app/start/prerequisites/"
    exit 1
}

Write-Host 'Required tools look good. Run: npm install; npm run dev:full' -ForegroundColor Green
exit 0
