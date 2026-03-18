#!/bin/bash
set -e

DIR="$(pwd)"
SESSION_ID="auto-test-$(date +%s)"
CURRENT_PATH="$PATH"

echo "============================================="
echo "  Automated E2E: Live Multiplayer Sync Test"
echo "============================================="

# 1. Provide local test auth token for miniflare emulator
mkdir -p "$DIR/.cr"
echo "cr_mock_testuser" > "$DIR/.cr/token"
chmod 600 "$DIR/.cr/token"

# 2. Start Miniflare (Edge Node)
echo "[1/4] Booting and provisioning Miniflare Edge emulator..."
(cd packages/cloudflare-worker && npx wrangler d1 execute DB --local --file=schema.sql > /dev/null 2>&1)
npm run dev -w packages/cloudflare-worker > "$DIR/.cr/miniflare.log" 2>&1 &
MINIFLARE_PID=$!

# Wait for emulator to bind
sleep 5

# Ensure it didn't crash
if ! kill -0 $MINIFLARE_PID > /dev/null 2>&1; then
    echo "Fail: Miniflare crashed. See .cr/miniflare.log"
    cat "$DIR/.cr/miniflare.log"
    exit 1
fi
echo "[OK] Miniflare running on PID $MINIFLARE_PID"

# Use 127.0.0.1 instead of localhost to prevent ipv6 ECONNREFUSED issues in Node 18+
export CR_CLOUD_URL='http://127.0.0.1:8787'

# 3. User A: Headless mode send message
echo "[2/4] User A sending message..."
# Use an explicit sub-shell to keep the pipe open for 6 seconds, giving the sync daemon time to push the event
(echo "Hello from User A in an automated test!"; sleep 6) | node apps/cli/bin/cr.js chat --session $SESSION_ID --db .cr/user_a.sqlite

# 4. User B: Headless mode send message
echo "[3/4] User B sending message..."
(echo "Hello from User B responding!"; sleep 6) | node apps/cli/bin/cr.js chat --session $SESSION_ID --db .cr/user_b.sqlite

# 5. User A: Read history (Wait 6 seconds for Sync daemon to pull, then exit)
echo "[4/4] User A fetching synced history..."
USER_A_HISTORY=$( (sleep 6) | node apps/cli/bin/cr.js chat --session $SESSION_ID --db .cr/user_a.sqlite )

# 6. Verify Results
echo "---------------------------------------------"
echo "Verifying Synchronization..."
if echo "$USER_A_HISTORY" | grep -q "Hello from User B responding!"; then
    echo "✅ SUCCESS: User B's message successfully synced to User A!"
    
    # Cleanup
    kill $MINIFLARE_PID
    rm -f .cr/user_a.sqlite .cr/user_b.sqlite .cr/token .cr/miniflare.log
    exit 0
else
    echo "❌ FAILURE: User B's message did NOT sync to User A!"
    echo "--- User A Final History ---"
    echo "$USER_A_HISTORY"
    echo "--- Miniflare Logs ---"
    cat "$DIR/.cr/miniflare.log"
    kill $MINIFLARE_PID
    exit 1
fi
