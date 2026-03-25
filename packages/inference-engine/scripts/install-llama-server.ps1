# Download and extract llama.cpp prebuilt (llama-server) for Windows.
# Run from repo root: npm run install:llama-server
# Or: powershell -ExecutionPolicy Bypass -File packages/inference-engine/scripts/install-llama-server.ps1
# Set LLAMA_CPU=1 to install CPU-only build (no NVIDIA GPU required).

$ErrorActionPreference = "Stop"
# Script lives in packages/inference-engine/scripts -> repo root is 3 levels up
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
$BinDir = Join-Path $RepoRoot "packages/inference-engine/bin"
$EnvFile = Join-Path $RepoRoot ".env"

# Pick build: CUDA 12.4 (GPU) or CPU
$UseCpu = [string]::Equals($env:LLAMA_CPU, "1", "OrdinalIgnoreCase")
$Tag = "b8413"
if ($UseCpu) {
    $ZipName = "llama-$Tag-bin-win-cpu-x64.zip"
} else {
    $ZipName = "llama-$Tag-bin-win-cuda-12.4-x64.zip"
}
$Url = "https://github.com/ggml-org/llama.cpp/releases/download/$Tag/$ZipName"
$ZipPath = Join-Path $env:TEMP $ZipName

Write-Host "Downloading $ZipName ..."
Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Get-ChildItem -Path $BinDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $ZipPath -DestinationPath $BinDir -Force

# Zip may have one top-level folder (e.g. llama-b8413-bin-win-cuda-12.4-x64) or exes at root
$CandidateDirs = @(Get-ChildItem -Path $BinDir -Directory | Select-Object -ExpandProperty FullName)
$CandidateDirs += $BinDir
$ServerExe = $null
foreach ($d in $CandidateDirs) {
    $f = Get-ChildItem -Path $d -Filter "llama-server.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { $ServerExe = $f.FullName; break }
}
if (-not $ServerExe) {
    Write-Error "llama-server.exe not found under $BinDir"
    exit 1
}

Write-Host "Installed: $ServerExe"

# Update .env: set LLAMA_CPP_PATH
if (Test-Path $EnvFile) {
    $content = Get-Content $EnvFile -Raw
    if ($content -match "(?m)^(LLAMA_CPP_PATH=).*") {
        $content = $content -replace "(?m)^(LLAMA_CPP_PATH=).*", "`$1$ServerExe"
    } else {
        $content = $content -replace "(\r?\n)(# --- Local LLM)", "`$1LLAMA_CPP_PATH=$ServerExe`$1`$2"
    }
    Set-Content -Path $EnvFile -Value $content.TrimEnd() -NoNewline
    Write-Host "Updated .env: LLAMA_CPP_PATH=$ServerExe"
} else {
    Write-Host "No .env found; set manually: LLAMA_CPP_PATH=$ServerExe"
}

Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
Write-Host "Done. Run: npm run dev:inference"
