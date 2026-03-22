import 'dotenv/config';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const cArchitect = '\x1b[38;2;250;150;50m'; // Orange
const cEngineer = '\x1b[38;2;100;200;255m'; // Blue
const cObserver = '\x1b[38;2;150;250;150m'; // Green
const cDim = '\x1b[38;2;100;100;100m'; // Dark gray
const reset = '\x1b[0m';
const bold = '\x1b[1m';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function typeLine(text: string, color: string = reset) {
  console.log(`${color}${text}${reset}`);
}

async function runDemo() {
  console.clear();
  typeLine(`\n${bold}=== Cognitive Resonance: Multi-Agent Genesis Demo ===${reset}\n`);

  await sleep(1000);
  typeLine(`${cDim}$ cr session new genesis-demo${reset}`);
  typeLine(`[Session genesis-demo] Initialized empty Virtual Event Graph.\n`);
  
  await sleep(1500);
  typeLine(`${cDim}Spawning TTY 1: ⛑️ @Architect${reset}`);
  typeLine(`${cDim}Spawning TTY 2: ⚙️ @Engineer${reset}\n`);

  await sleep(2000);
  typeLine(`${cObserver}👁️ Observer:${reset} Please build a highly available cloudflare worker that serves a static HTML landing page.`);
  await sleep(2000);

  typeLine(`\n${cArchitect}⛑️ Architect:${reset} Acknowledged. We will need a standard routing matrix mapping to an HTML string. `);
  typeLine(`${cArchitect}⛑️ Architect:${reset} @Engineer, generate the 'src/index.ts' entrypoint handling the fetch event logic. I'll outline the file structure.\n`);
  
  await sleep(2500);
  typeLine(`${cDim}   [Event Log] Synchronizing 2 active peers...${reset}\n`);
  await sleep(1000);

  typeLine(`${cEngineer}⚙️ Engineer:${reset} Drafting 'src/index.ts'...`);
  typeLine(`${cDim}   + export default {`);
  typeLine(`${cDim}   +   async fetch(request, env, ctx) {`);
  typeLine(`${cDim}   +     return new Response("<h1>Welcome to Cognitive Resonance</h1>", { headers: { "Content-Type": "text/html" } });`);
  typeLine(`${cDim}   +   }`);
  typeLine(`${cDim}   + };${reset}\n`);
  await sleep(2000);

  typeLine(`${cArchitect}⛑️ Architect:${reset} Looks solid. Integrating draft commit.`);
  typeLine(`${cDim}   [Event Log] ARTEFACT_PROMOTED: src/index.ts -> HEAD${reset}\n`);

  await sleep(1500);
  typeLine(`${cObserver}👁️ Observer:${reset} Excellent. Exporting the workspace directly to physical disk.`);
  await sleep(1000);

  typeLine(`\n${cDim}$ cr export ./genesis-output --session genesis-demo${reset}`);
  typeLine(`[Materializer] Committing virtual files to local FS...`);
  typeLine(`[Materializer] ✔️ ./genesis-output/src/index.ts\n`);

  await sleep(1500);
  typeLine(`${bold}=== Demo Complete ===${reset}\n`);
}

runDemo().catch(console.error);
