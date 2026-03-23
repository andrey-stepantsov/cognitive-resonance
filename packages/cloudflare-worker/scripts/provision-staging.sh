#!/bin/bash
set -e

echo "🚀 Starting Staging Resource Provisioning..."

# Ensure we are in the correct directory (packages/cloudflare-worker)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

# 1. D1 Database Validation & Migration
echo "🗄️ Checking D1 Database: cr-sessions-staging..."
if ! npx wrangler d1 info cr-sessions-staging > /dev/null 2>&1; then
  echo "⚠️ Database cr-sessions-staging not found! Attempting creation..."
  npx wrangler d1 create cr-sessions-staging
else
  echo "✅ Database cr-sessions-staging exists."
fi

echo "📦 Applying D1 Schema (schema.sql)..."
npx wrangler d1 execute cr-sessions-staging --file schema.sql --remote

# 2. Vectorize Index
echo "🔍 Checking Vectorize Index: cr-sessions-index-staging..."
if ! npx wrangler vectorize get cr-sessions-index-staging > /dev/null 2>&1; then
  echo "⚠️ Vectorize Index cr-sessions-index-staging not found! Creating..."
  npx wrangler vectorize create cr-sessions-index-staging --dimensions=1536 --metric=cosine
else
  echo "✅ Vectorize index cr-sessions-index-staging exists."
fi

# 3. R2 Bucket
echo "🪣 Checking R2 Bucket: cr-git-repos-staging..."
if ! npx wrangler r2 bucket info cr-git-repos-staging > /dev/null 2>&1; then
  echo "⚠️ R2 Bucket cr-git-repos-staging not found! Creating..."
  if ! npx wrangler r2 bucket create cr-git-repos-staging; then
    echo "⚠️ WARNING: Failed to create R2 bucket automatically."
    echo "Please create 'cr-git-repos-staging' manually in the Cloudflare Dashboard."
  fi
else
  echo "✅ R2 Bucket cr-git-repos-staging exists."
fi

# 4. Queues
echo "📬 Checking Queue: tg-ai-queue-staging..."
if ! npx wrangler queues list | grep -q "tg-ai-queue-staging"; then
  echo "⚠️ Queue tg-ai-queue-staging not found! Creating..."
  npx wrangler queues create tg-ai-queue-staging
else
  echo "✅ Queue tg-ai-queue-staging exists."
fi

echo "🎉 Provisioning checks completed successfully!"
