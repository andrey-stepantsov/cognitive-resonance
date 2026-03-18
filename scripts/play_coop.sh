#!/bin/bash
set -e

DIR="$(pwd)"
SESSION_ID="coop-demo-$(date +%s)"
CURRENT_PATH="$PATH"

# Provide local test auth token for miniflare emulator
mkdir -p "$DIR/.cr"
echo "cr_mock_testuser" > "$DIR/.cr/token"
chmod 600 "$DIR/.cr/token"

echo "Starting Local Server Daemon (Central Edge Node) on port 8787 via Miniflare..."
osascript -e "tell application \"Terminal\" to do script \"export PATH='$CURRENT_PATH'; cd '$DIR' && npm run dev -w packages/cloudflare-worker\""

sleep 2
echo "Starting Multiplayer Co-Op Session: $SESSION_ID"

# Start User A
osascript -e "tell application \"Terminal\" to do script \"export PATH='$CURRENT_PATH'; export CR_CLOUD_URL='http://127.0.0.1:8787'; cd '$DIR' && node apps/cli/bin/cr.js chat --session $SESSION_ID --db .cr/db_A.sqlite\""

# Start User B
osascript -e "tell application \"Terminal\" to do script \"export PATH='$CURRENT_PATH'; export CR_CLOUD_URL='http://127.0.0.1:8787'; cd '$DIR' && node apps/cli/bin/cr.js chat --session $SESSION_ID --db .cr/db_B.sqlite\""

echo "Terminals launched successfully."
