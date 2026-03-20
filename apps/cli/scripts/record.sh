#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

# Record the demo session
echo "Recording multi-head terminal session..."
asciinema rec --overwrite -c "npx tsx demos/multiplayer.demo.ts" output.cast

# Convert to GIF
echo "Generating GIF..."
agg output.cast demo.gif --speed 1.5 --font-dir /Library/Fonts

echo "Success! Output saved to demo.gif."
