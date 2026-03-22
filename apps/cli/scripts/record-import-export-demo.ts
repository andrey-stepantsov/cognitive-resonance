import 'dotenv/config';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const cUser = '\x1b[38;2;100;200;255m';
const cSys = '\x1b[38;2;255;100;100m';
const cDim = '\x1b[38;2;120;120;120m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runCmd(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: 'inherit',
      shell: true
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${command} exited with ${code}`));
    });
  });
}

async function runDemo() {
  console.clear();
  console.log(`\n${bold}=== Cognitive Resonance: Git Import/Export Demo ===${reset}\n`);

  const tmpBase = os.tmpdir();
  const repoPath = path.join(tmpBase, `http-server-demo-${Date.now()}`);
  const exportPath = path.join(tmpBase, `http-server-exported-${Date.now()}`);
  const dbPath = path.join(tmpBase, `demo-git-${Date.now()}.sqlite`);

  console.log(`\n${cUser}👤 Step 1: ${reset}Cloning a real-world repository (http-party/http-server)...\n`);
  await runCmd('git', ['clone', '--depth', '1', 'https://github.com/http-party/http-server.git', repoPath], process.cwd());
  await sleep(1000);

  console.log(`\n${cUser}👤 Step 2: ${reset}Importing the physical repository into the Virtual Event Graph...\n`);
  console.log(`${cDim}$ cr import ${repoPath} --session git-demo --db ${dbPath}${reset}\n`);
  await runCmd('npx', ['tsx', 'src/index.ts', 'import', repoPath, '--session', 'git-demo', '--db', dbPath], process.cwd());
  await sleep(1500);

  console.log(`\n${cUser}👤 Step 3: ${reset}Exporting the virtual session back out to a pristine physical directory...\n`);
  console.log(`${cDim}$ cr export ${exportPath} -s git-demo --db ${dbPath}${reset}\n`);
  await runCmd('npx', ['tsx', 'src/index.ts', 'export', exportPath, '-s', 'git-demo', '--db', dbPath], process.cwd());
  await sleep(1500);

  console.log(`\n${cSys}🔍 Verification: ${reset}Checking the exported output matches expectations:\n`);
  await runCmd('ls', ['-la', exportPath], process.cwd());
  
  console.log(`\n${bold}=== Demo Complete ===${reset}\n`);

  // Cleanup
  fs.rmSync(repoPath, { recursive: true, force: true });
  fs.rmSync(exportPath, { recursive: true, force: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

runDemo().catch(console.error);
