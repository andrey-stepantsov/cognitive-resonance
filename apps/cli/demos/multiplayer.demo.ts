import { TerminalManager } from '@cr/terminal-director';

async function run() {
  const tm = new TerminalManager();
  console.log('Booting multiplayer demo...\n');

  // 1. Boot daemon
  const daemon = tm.spawn('Daemon', 'npx', ['tsx', 'src/index.ts', 'serve'], {
    env: { ...process.env, CR_DAEMON_PORT: '9099', FORCE_COLOR: '1' }
  });

  // Give daemon time to boot
  await new Promise(r => setTimeout(r, 2500));

  // 2. Boot client
  const client = tm.spawn('Client', 'npx', ['tsx', 'src/index.ts', 'chat'], {
    env: { ...process.env, CR_DAEMON_URL: 'http://localhost:9099', FORCE_COLOR: '1' }
  });

  // Give client time to boot
  await new Promise(r => setTimeout(r, 2500));

  // 3. Type a remote execution command
  await client.typeHuman('@@local(exec "echo \\"Hello from remote runtime\\"")\n', 40);

  // Wait for the result
  await new Promise(r => setTimeout(r, 4000));

  // 4. Type exit
  await client.typeHuman('/exit\n', 40);
  
  await new Promise(r => setTimeout(r, 1000));

  tm.killAll();
  console.log('\nDemo finished.');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
