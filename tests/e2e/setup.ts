import { beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// This runs before all E2E tests across all files.
beforeAll(() => {
  // Setup logic: ensures sandboxes and e2e test databases are clean.
  const CR_DIR = path.join(process.cwd(), '.cr');
  const e2eDbPath = path.join(CR_DIR, 'e2e-test.sqlite');
  
  if (fs.existsSync(e2eDbPath)) {
    // Start from a clean DB state if one happens to exist from a crashed test
    fs.unlinkSync(e2eDbPath);
  }
  
  // Set explicit env variables to ensure test isolation
  process.env.CR_ENV = 'test';
  process.env.DB_PATH = e2eDbPath;
});

afterAll(() => {
  // Teardown: Remove DB and cleanup stray sandboxes
  const CR_DIR = path.join(process.cwd(), '.cr');
  const e2eDbPath = path.join(CR_DIR, 'e2e-test.sqlite');
  
  if (fs.existsSync(e2eDbPath)) {
    fs.unlinkSync(e2eDbPath);
  }
});
