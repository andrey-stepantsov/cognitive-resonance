import { beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

let mockServer: http.Server;

// This runs before all E2E tests across all files.
beforeAll(async () => {
  // Setup logic: ensures sandboxes and e2e test databases are clean.
  const CR_DIR = path.join(process.cwd(), '.cr');
  const e2eDbPath = path.join(CR_DIR, 'e2e-test.sqlite');
  
  if (!fs.existsSync(CR_DIR)) fs.mkdirSync(CR_DIR, { recursive: true });
  if (fs.existsSync(e2eDbPath)) {
    // Start from a clean DB state if one happens to exist from a crashed test
    fs.unlinkSync(e2eDbPath);
  }
  
  // Set explicit env variables to ensure test isolation
  process.env.CR_ENV = 'test';
  process.env.DB_PATH = e2eDbPath;

  const adminVaultPath = path.join(CR_DIR, 'admin-vault');
  if (!fs.existsSync(adminVaultPath)) fs.mkdirSync(adminVaultPath, { recursive: true });
  fs.writeFileSync(path.join(adminVaultPath, 'session.jwt'), 'mock-jwt-token', { mode: 0o600 });
  
  // Inject mock ed25519.pem for `cr admin keys mint` tests
  const crypto = require('crypto');
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(adminVaultPath, 'ed25519.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  
  process.env.CR_ADMIN_VAULT = adminVaultPath;

  // Spin up a mock Edge Server to intercept API callbacks from the CLI and prevent testing against dev D1
  mockServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/admin/bot/register' || 
        req.url === '/api/admin/users/telegram-link' || 
        req.url === '/api/admin/users/revoke') {
       res.writeHead(200);
       res.end(JSON.stringify({ ok: true }));
       return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found mocked' }));
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as any;
      process.env.CR_EDGE_URL = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  if (mockServer) {
    mockServer.close();
  }
  
  // Teardown: Remove DB and cleanup stray sandboxes
  const CR_DIR = path.join(process.cwd(), '.cr');
  const e2eDbPath = path.join(CR_DIR, 'e2e-test.sqlite');
  
  if (fs.existsSync(e2eDbPath)) {
    fs.unlinkSync(e2eDbPath);
  }
});
