#!/bin/bash
set -e

echo "=== 1. Provisioning ==="
rm -rf /tmp/cr-manual-test3
mkdir -p /tmp/cr-manual-test3/source-repo
mkdir -p /tmp/cr-manual-test3/export-repo

echo "=== 2. Cloning Target ==="
cd /tmp/cr-manual-test3/source-repo
git clone --depth 1 https://github.com/http-party/http-server.git . > /dev/null 2>&1

echo "=== 3. CR Import ==="
cd /Users/stepants/dev/cognitive-resonance
node apps/cli/bin/cr.js import /tmp/cr-manual-test3/source-repo -s manual-test-session3

echo "=== 4. Simulating AI Session Mutation (Virtual Only) ==="
# We write a tiny TS script to safely push the ARTEFACT_PROPOSAL into the DB 
# exactly as the MCPServer / Gemini Model would during a chat session.
cat << 'EOF' > /tmp/cr-manual-test3/inject_ai.ts
import { DatabaseEngine } from '/Users/stepants/dev/cognitive-resonance/apps/cli/src/db/DatabaseEngine';
import * as fs from 'fs';

const dbPath = './.cr/cr.sqlite';
const db = new DatabaseEngine(dbPath);

const content = fs.readFileSync('/tmp/cr-manual-test3/source-repo/public/index.html', 'utf8');
const newContent = content.replace(/<h1>.*<\/h1>/, '<h1>Serving up files from Cognitive Resonance!</h1>');

db.appendEvent({
    session_id: 'manual-test-session3',
    timestamp: Date.now(),
    actor: 'Agent',
    type: 'ARTEFACT_PROPOSAL',
    payload: JSON.stringify({ path: 'public/index.html', patch: newContent, isFullReplacement: true }),
    previous_event_id: null
});
console.log('Virtual ARTEFACT_PROPOSAL emitted successfully!');
EOF

npx tsx /tmp/cr-manual-test3/inject_ai.ts

echo "=== 5. CR Export ==="
node apps/cli/bin/cr.js export /tmp/cr-manual-test3/export-repo -s manual-test-session3

echo "=== 6. Runtime Verification ==="
cd /tmp/cr-manual-test3/export-repo
npm install --production > /dev/null 2>&1

echo "Starting node server on port 18083..."
node bin/http-server -p 18083 &
SERVER_PID=$!

sleep 2

echo "Fetching http://localhost:18083..."
curl -s http://localhost:18083 | grep -i "<h1>"

kill -9 $SERVER_PID
echo "Test scenario completed successfully!"
