#!/bin/bash
set -e

# Ensure we're in the project root
cd "$(dirname "$0")/../../.."

echo "Building CLI..."
npm run build --workspace=apps/cli

echo "Cleaning up any previous demo state..."
rm -rf /tmp/cr-manual-test
rm -f /tmp/git-import-export-demo.cast docs/assets/git-import-export-demo.gif

echo "Starting asciinema recording headless capture..."
export FORCE_COLOR=1
asciinema rec -c "npx tsx apps/cli/scripts/record_git_import_export.ts" --overwrite /tmp/git-import-export-demo.cast

echo "Recording finished. Generating GIF..."
mkdir -p docs/assets
agg --font-size 28 /tmp/git-import-export-demo.cast docs/assets/git-import-export-demo.gif

echo "Done! The GIF is located at docs/assets/git-import-export-demo.gif"
