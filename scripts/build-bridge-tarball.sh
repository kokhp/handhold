#!/usr/bin/env bash
#
# Package the bridge into public/bridge.tar.gz that install.sh downloads.
# Also stamps public/install.sh with the current prod URLs.
#
# Run before every Vercel deploy (or hook into vercel-build):
#   HANDHOLD_APP_URL=https://handhold.vercel.app HANDHOLD_RELAY_URL=https://handhold-relay.fly.dev ./scripts/build-bridge-tarball.sh

set -euo pipefail
cd "$(dirname "$0")/.."

APP_URL="${HANDHOLD_APP_URL:-}"
RELAY_URL="${HANDHOLD_RELAY_URL:-}"

if [ -z "$APP_URL" ] || [ -z "$RELAY_URL" ]; then
  echo "HANDHOLD_APP_URL and HANDHOLD_RELAY_URL env vars must be set" >&2
  exit 1
fi

mkdir -p public

# Stage a self-contained bridge directory (no path aliases, only relative imports)
STAGE=$(mktemp -d)
trap "rm -rf $STAGE" EXIT

mkdir -p "$STAGE/handlers"
cp bridge/index.ts       "$STAGE/index.ts"
cp bridge/agent.ts       "$STAGE/agent.ts"
cp bridge/daemon.ts      "$STAGE/daemon.ts"
cp bridge/handlers/*.ts  "$STAGE/handlers/"

cat > "$STAGE/package.json" <<'EOF'
{
  "name": "handhold-bridge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "ws": "^8.21.3"
  }
}
EOF

(cd "$STAGE" && tar -czf "$OLDPWD/public/bridge.tar.gz" .)
echo "→ wrote public/bridge.tar.gz ($(du -h public/bridge.tar.gz | awk '{print $1}'))"

# Stamp install.sh with prod URLs (idempotent — restore placeholders after each build if desired)
sed -e "s|@@APP_URL@@|$APP_URL|g" -e "s|@@RELAY_URL@@|$RELAY_URL|g" public/install.sh > public/install.sh.tmp
mv public/install.sh.tmp public/install.sh
chmod +x public/install.sh
echo "→ stamped public/install.sh with APP=$APP_URL RELAY=$RELAY_URL"
