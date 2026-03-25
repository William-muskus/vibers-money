# Kill processes using dev ports only (orchestrator, frontend, swarm-bus, computer-use, llama-server).
# We do NOT kill 6379 (Redis/Memurai) so existing Redis stays running.
$ports = 3000, 3001, 3100, 3200, 8080
foreach ($port in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if ($conn) {
    $conn | ForEach-Object {
      if ($_.OwningProcess -gt 0) {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
Write-Host "Ports $($ports -join ', ') freed"
