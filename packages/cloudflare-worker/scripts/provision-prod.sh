#!/bin/bash
set -e

echo "🚀 Starting Production Resource Provisioning..."

# Ensure we are in the correct directory (packages/cloudflare-worker)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

# 1. D1 Database Validation & Migration
echo "🗄️ Checking D1 Database: cr-sessions..."
if ! npx wrangler d1 info cr-sessions > /dev/null 2>&1; then
  echo "⚠️ Database cr-sessions not found! Attempting creation..."
  npx wrangler d1 create cr-sessions
  # Note: You must update the database_id in wrangler.toml after first creation.
  # The script assumes it exists in CI or was manually bootstrapped once.
else
  echo "✅ Database cr-sessions exists."
fi

echo "📦 Applying D1 Schema (schema.sql)..."
# Execute schema directly since CREATE TABLE IF NOT EXISTS makes it safely idempotent
npx wrangler d1 execute cr-sessions --file schema.sql --remote

# 2. Vectorize Index
echo "🔍 Checking Vectorize Index: cr-sessions-index..."
if ! npx wrangler vectorize get cr-sessions-index > /dev/null 2>&1; then
  echo "⚠️ Vectorize Index cr-sessions-index not found! Creating..."
  npx wrangler vectorize create cr-sessions-index --dimensions=1536 --metric=cosine
else
  echo "✅ Vectorize index cr-sessions-index exists."
fi

# 3. R2 Bucket
echo "🪣 Checking R2 Bucket: cr-git-repos..."
if ! npx wrangler r2 bucket info cr-git-repos > /dev/null 2>&1; then
  echo "⚠️ R2 Bucket cr-git-repos not found! Creating..."
  if ! npx wrangler r2 bucket create cr-git-repos; then
    echo "⚠️ WARNING: Failed to create R2 bucket automatically."
    echo "This is common with scoped API tokens. Please create 'cr-git-repos' manually in the Cloudflare Dashboard."
  fi
else
  echo "✅ R2 Bucket cr-git-repos exists."
fi

# 4. Queues
# We can't strictly check for queues intuitively via CLI without parsing heavy JSON, 
# but attempting to create an existing queue fails safely if we ignore the error OR
# we can assume the queue was manually created prior. We'll attempt creation.
# Or better: check if it exists in list
echo "📬 Checking Queue: tg-ai-queue..."
if ! npx wrangler queues list | grep -q "tg-ai-queue"; then
  echo "⚠️ Queue tg-ai-queue not found! Creating..."
  npx wrangler queues create tg-ai-queue
else
  echo "✅ Queue tg-ai-queue exists."
fi

echo "🎉 Provisioning checks completed successfully!"
