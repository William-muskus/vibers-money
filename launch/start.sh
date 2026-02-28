#!/bin/bash
# Start Xvfb -> Chrome -> Swarm Bus -> Computer Use MCP -> Orchestrator -> Frontend
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DISPLAY=:99
Xvfb :99 -screen 0 1280x720x24 &
sleep 2
# Start Chrome with remote debugging
google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox &
sleep 2
export ORCHESTRATOR_URL=http://localhost:3000
export SWARM_BUS_URL=http://localhost:3100
npm run dev:swarm-bus &
npm run dev:computer-use &
npm run dev:orchestrator &
npm run dev:frontend &
echo "Services starting. Orchestrator: 3000, Swarm Bus: 3100, Computer Use: 3200, Frontend: 3001"
wait
