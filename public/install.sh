#!/usr/bin/env bash
#
# handhold — one-step bridge installer.
#
# Usage (paste from the "Pair a Mac" modal on your phone):
#   curl -fsSL https://handhold.vercel.app/install.sh | bash -s <PAIRING_CODE>
#
# What it does:
#   1. Downloads the tiny bridge package to ~/.handhold/bridge
#   2. Installs the one runtime dep (ws)
#   3. Pairs with the code from your phone
#   4. Installs the bridge as a launchd LaunchAgent so it survives terminal close

set -euo pipefail

CODE="${1:-}"
if [ -z "$CODE" ]; then
  echo "usage: install.sh <PAIRING_CODE>" >&2
  exit 1
fi

# URLs baked in at deploy time by scripts/build-bridge-tarball.sh via sed.
APP_URL="${HANDHOLD_APP_URL:-https://handhold-lac.vercel.app}"
RELAY_URL="${HANDHOLD_RELAY_URL:-https://handhold-relay.onrender.com}"
BRIDGE_TARBALL="$APP_URL/bridge.tar.gz"

if [[ "$APP_URL" == @@* ]] || [[ "$RELAY_URL" == @@* ]]; then
  echo "install.sh not built with production URLs baked in. Set HANDHOLD_APP_URL and HANDHOLD_RELAY_URL env vars, or fetch the built copy." >&2
  exit 1
fi

# --- prereqs ---
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 22+ (e.g. via nvm or 'brew install node') then rerun." >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node $NODE_MAJOR is too old. handhold needs Node 22+ for --experimental-strip-types." >&2
  exit 1
fi

DEST="$HOME/.handhold/bridge"
mkdir -p "$DEST"
echo "→ downloading bridge to $DEST"
curl -fsSL "$BRIDGE_TARBALL" | tar -xz -C "$DEST"

echo "→ installing runtime deps"
(cd "$DEST" && npm install --silent --no-fund --no-audit --no-package-lock ws@^8)

BRIDGE="node --experimental-strip-types --no-warnings $DEST/index.ts"

echo "→ pairing with code $CODE"
HANDHOLD_RELAY="$RELAY_URL" $BRIDGE pair "$CODE"

echo "→ installing background agent"
HANDHOLD_RELAY="$RELAY_URL" $BRIDGE install-agent

echo ""
echo "✓ done. your Mac is paired and the bridge is running under launchd."
echo "  logs:    $BRIDGE logs"
echo "  stop:    $BRIDGE uninstall-agent"
echo "  status:  $BRIDGE agent-status"
echo ""
echo "  open $APP_URL on your phone to see this Mac appear."
