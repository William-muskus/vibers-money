# Open 4 PowerShell windows: orchestrator, swarm-bus-mcp, computer-use-mcp, frontend
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cmd = "Set-Location '$root'; npm run"

$titles = @(
  "Orchestrator",
  "Swarm Bus MCP",
  "Computer Use MCP",
  "Frontend"
)
$scripts = @(
  "dev:orchestrator",
  "dev:swarm-bus",
  "dev:computer-use",
  "dev:frontend"
)

for ($i = 0; $i -lt 4; $i++) {
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root'; `$host.UI.RawUI.WindowTitle = '$($titles[$i])'; npm run $($scripts[$i])"
  )
}
