#!/bin/bash

# ==========================================
# Cognitive Resonance: Dev Server Launcher
# ==========================================

echo "🔄 Cleaning up any existing servers..."
pkill -f "wrangler dev" || true
pkill -f "vite" || true

PORT=8787

echo "🚀 Starting Cloudflare Worker on port $PORT..."
cd packages/cloudflare-worker

# Ensure a local secret exists for development
if [ ! -f ".dev.vars" ]; then
  echo "🔒 Generating local secure JWT_SECRET..."
  RANDOM_SECRET=$(openssl rand -hex 32)
  echo "JWT_SECRET=\"$RANDOM_SECRET\"" > .dev.vars
  echo "✅ Created .dev.vars with local secret."
fi
# Force wrangler to bind to a specific port so the PWA always knows where to find it
npm run dev -- --port $PORT &
WORKER_PID=$!

cd ../../apps/pwa
echo "🌐 Starting PWA Frontend..."
VITE_CLOUDFLARE_WORKER_URL="http://localhost:$PORT" npm run dev &
PWA_PID=$!

echo "=========================================="
echo "✅ Development servers are running!"
echo "   Worker URL: http://localhost:$PORT"
echo "   PWA URL:    http://localhost:5173"
echo "=========================================="
echo "Press Ctrl+C to stop both servers."

# Wait for Ctrl+C, then cleanup
trap "echo '🛑 Stopping servers...'; kill $WORKER_PID $PWA_PID; exit" SIGINT SIGTERM
wait
