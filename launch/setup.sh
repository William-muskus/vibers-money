#!/bin/bash
# Setup script for Ubuntu/Linux: install Xvfb, Chrome, Node.js, Vibe; pre-trust workdirs.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb chromium-browser nodejs npm
npm install -g npm@latest
# Install Vibe (Python): pip/uv per project docs
# Pre-trust workspace: add path to Vibe trusted dirs
echo "Setup complete. Run launch/start.sh to start services."
