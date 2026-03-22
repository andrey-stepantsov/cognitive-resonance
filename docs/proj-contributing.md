# Contributing to Cognitive Resonance

Welcome! We are thrilled you want to contribute to the Cognitive Resonance ecosystem. Because this project spans a powerful CLI, VS Code Extensions, and a scalable Cloudflare database, setting up a local development environment requires a few strict but simple steps.

## 1. Local Monorepo Setup

First, fork the repository and clone it to your machine:
```bash
git clone https://github.com/<your-username>/cognitive-resonance.git
cd cognitive-resonance
npm install
```

Since Cognitive Resonance consists of multiple distributed apps, you must build the TypeScript packages across the entire workspace:
```bash
npm run build --workspace=apps/cli
```

## 2. Using the CLI Locally (`cr-dev` alias)

**Do not use `npm link` if you are using a strictly managed environment like Nix!** Instead, the fastest way to orchestrate the CLI locally is to define a shell alias.

Run this in your terminal to instantly bind the compiled executable:
```bash
alias cr-dev="node $(pwd)/apps/cli/dist/index.js start"
```
*(Add this to your `~/.zshrc` or `~/.bashrc` to keep it persistent while hacking!)*

You can now use `cr-dev start` exclusively to run your modified local codebase, leaving your global `cr` NPM install safely untouched.

## 3. Connecting to the Backend (`CR_ENV`)

By default, the daemon silently attempts to route WebSocket traffic to `http://localhost:8787`. 

If you want to test your CLI changes against the live global databases without spinning up a local Wrangler emulator, you can pass explicit environment overrides:
* **Staging Edge:** `CR_ENV=staging cr-dev start` (Connects to `api-staging.andrey-stepantsov.workers.dev`)
* **Production Edge:** `CR_ENV=prod cr-dev start` (Connects to `api.andrey-stepantsov.workers.dev`)

> **[CAUTION]**
> Testing highly destructive new Multi-Agent CLI behaviors should always be done under `CR_ENV=staging` or local emulation to prevent contaminating the immutable production D1 databases.

## 4. Structuring a Pull Request (Changesets)

We use [Changesets](https://github.com/changesets/changesets) to automatically manage semantic versioning. 

If your PR introduces a new feature or fixes a bug in `@cr/cli` or `@cr/core`, you **MUST** attach a changeset intent before committing:
```bash
npx changeset
```
1. Select the packages you modified using the Spacebar.
2. Select whether the update is a `patch`, `minor`, or `major` version bump.
3. Write a brief summary of your modification.

Commit the generated `.changeset/*.md` file along with your code changes. When your PR is approved and merged into `main`, our GitHub Actions CI matrix will automatically invoke Vitest, visually regress the CLI outputs, and seamlessly promote your work to the NPM `@next` release channel!
