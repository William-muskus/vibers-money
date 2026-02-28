# Windows dev: start Swarm Bus + Orchestrator + Frontend (no Chrome/Xvfb)
# Run from repo root: .\launch\start-dev.ps1
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$env:ORCHESTRATOR_URL = "http://localhost:3000"
$env:SWARM_BUS_URL = "http://localhost:3100"

Write-Host "Starting Swarm Bus MCP (3100)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $root; npm run dev:swarm-bus" -WindowStyle Minimized
Start-Sleep -Seconds 2
Write-Host "Starting Orchestrator (3000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $root; npm run dev:orchestrator" -WindowStyle Minimized
Start-Sleep -Seconds 2
Write-Host "Starting Frontend (3001)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $root; npm run dev:frontend" -WindowStyle Minimized
Write-Host "Done. Orchestrator: http://localhost:3000  Swarm Bus: http://localhost:3100  Frontend: http://localhost:3001"
