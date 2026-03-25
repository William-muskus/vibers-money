# Start Redis/Memurai only if port 6379 is free. If already in use, exit 0 so Dev: all continues.
$port = 6379
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($conn) {
  Write-Host "Port: 6379"
  exit 0
}
# Start Memurai (Windows Redis-compatible). Fallback: redis-server if on PATH.
$memurai = Get-Command memurai -ErrorAction SilentlyContinue
if ($memurai) {
  & memurai
} else {
  $redis = Get-Command redis-server -ErrorAction SilentlyContinue
  if ($redis) { & redis-server } else { Write-Error "Neither memurai nor redis-server found on PATH. Install Memurai or Redis and ensure it is on PATH, or start Redis manually on port 6379."; exit 1 }
}
