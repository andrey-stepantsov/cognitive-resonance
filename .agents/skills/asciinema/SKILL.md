---
name: asciinema
description: Using asciinema and agg to record and convert interactive terminal sessions into readable casts and animated gifs.
---

# Asciinema & Agg

## Overview
Asciinema is a tool used to record terminal sessions into `.cast` files. `agg` (Asciinema Gif Generator) can convert these `.cast` recordings into `.gif` files.
This is highly useful for creating UI demonstrations of CLI tools or recording interactive reproduction steps for bug reports.

## Prerequisites
- **asciinema**: CLI installed via `brew install asciinema` (macOS) or `apt install asciinema` / `pacman -S asciinema`.
- **agg**: Rust tool for GIF conversion. (Installation notes pending)

## Commands
* `asciinema rec <filename.cast>`: Starts recording a new session. Can be terminated with `exit` or `ctrl+d`.
* `asciinema rec -c <command> <filename.cast>`: Records a specific command's execution and exits immediately after. Example: `asciinema rec -c "htop" demo.cast`.
* `asciinema play <filename.cast>`: Replays a recorded session in the terminal.

## Headless Execution & AI Usage
Because AI operates headlessly and asynchronously, running `asciinema rec` directly and trying to type into it is extremely difficult to synchronize.
Instead, use standard tools like `node-pty` or `child_process.spawn` to script the exact sequence of outputs you want to record, and wrap the execution in `asciinema`. Alternatively, if you are just executing an automated script (like an E2E test or a predefined interaction script):

```bash
# Record an automated script directly
asciinema rec -c "node scripts/automated_demo.js" demo.cast
```

## GIF Generation
Use `agg` (Asciinema Gif Generator) to convert the `.cast` file into a visual format suitable for Pull Requests or Markdown documents.

```bash
agg demo.cast demo.gif
```

*Note: You can pass `--theme`, `--font-family`, `--speed`, etc., to AGG.*
