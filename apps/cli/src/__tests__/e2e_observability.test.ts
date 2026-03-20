import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { createServerApp } from '../commands/serve';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('E2E: Observability and Health Checks', () => {
  let db: DatabaseEngine;
  let dbPath: string;
  let tempDir: string;
  let cliPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-observability-'));
    dbPath = path.join(tempDir, 'central.sqlite');
    db = new DatabaseEngine(dbPath);
    cliPath = path.resolve(__dirname, '../../bin/cr.js');
  });

  afterEach(() => {
    try { if (db.getDb().open) db.close(); } catch (e) {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves valid daemon health metrics', async () => {
    const clients = new Set<any>();
    const app = createServerApp(db, clients);
    
    // Seed some DB data
    db.createSession('E2E_USER', 'test-session-123');
    db.appendEvent({ session_id: 'test-session-123', timestamp: Date.now(), actor: 'SYSTEM', type: 'INIT', payload: '{}', previous_event_id: null });

    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.dbMetrics.totalSessions).toBe(1);
    expect(response.body.dbMetrics.totalEvents).toBe(1);
    expect(response.body.activeTerminals).toBe(0);
    expect(response.body.webSockets).toBe(0);
    expect(response.body.memoryUsage).toBeDefined();
  });

  it('audits session graph contiguity and JSON validity via CLI', () => {
    const sessionId = db.createSession('E2E_USER', 'test-session-456');
    
    // Contiguous event
    const rootId = db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'INIT', payload: '{"valid":"json"}', previous_event_id: null });
    
    // Invalid JSON event
    const nextId = db.appendEvent({ session_id: sessionId, timestamp: Date.now()+100, actor: 'USER', type: 'PROMPT', payload: 'invalid json!!', previous_event_id: rootId });

    // Orphaned event (temporal paradox)
    db.appendEvent({ session_id: sessionId, timestamp: Date.now()+200, actor: 'SYSTEM', type: 'ORPHAN', payload: '{}', previous_event_id: 'non-existent-id' });

    db.close(); // Flush to disk for the external CLI process
    
    // Run the audit command
    try {
      execSync(`node ${cliPath} audit ${sessionId} -d ${dbPath}`, { cwd: tempDir, encoding: 'utf8' });
    } catch (err: any) {}
    
    const output = execSync(`node ${cliPath} audit ${sessionId} -d ${dbPath}`, { cwd: tempDir, encoding: 'utf8' });
    
    expect(output).toContain('Auditing Session: test-session-456');
    expect(output).toContain('Audit Failed: Found 1 temporal paradoxes and 1 invalid payloads.');
    expect(output).toContain('No (Orphaned)');
    expect(output).toContain('No'); // Invalid JSON
  });

  it('performs non-destructive status diffing against physical layer', () => {
    const sessionId = db.createSession('E2E_USER', 'test-session-789');
    
    // Create physical dummy file
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'physical version');
    
    // Create virtual creation/modification events
    // Assuming virtual layer modifies the file
    db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PROJECT_CONFIG', payload: JSON.stringify({ projectId: 'test', basePath: '.' }), previous_event_id: null });
    
    // Keyframe with new virtual file and modified physical file
    db.appendEvent({
      session_id: sessionId,
      timestamp: Date.now() + 100,
      actor: 'AI',
      type: 'ARTEFACT_KEYFRAME',
      payload: JSON.stringify({
        files: {
          'test.txt': 'virtual version',
          'new.txt': 'virtual new file'
        }
      }),
      previous_event_id: null
    });

    db.close(); // Flush to disk for the external CLI process

    const output = execSync(`node ${cliPath} status -d ${dbPath}`, { cwd: tempDir, encoding: 'utf8' });
    
    expect(output).toContain('Computing virtual state for session test-session-789...');
    expect(output).toContain('test.txt');
    expect(output).toContain('new.txt');
    expect(output).toContain('Modified (Drift)');
    expect(output).toContain('Pending Create (Virtual Only)');
  });

  it('streams isolated execution logs via cr logs command', async () => {
    const sessionId = db.createSession('E2E_USER', 'test-session-logs');
    
    db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PROJECT_CONFIG', payload: '{}', previous_event_id: null });
    db.appendEvent({ session_id: sessionId, timestamp: Date.now()+100, actor: 'AI', type: 'AI_RESPONSE', payload: '{"text":"some ai message","dissonance":0.1}', previous_event_id: null });
    db.appendEvent({ session_id: sessionId, timestamp: Date.now()+200, actor: 'MacOS-Worker', type: 'RUNTIME_OUTPUT', payload: '{"text":"test passed"}', previous_event_id: null });
    db.appendEvent({ session_id: sessionId, timestamp: Date.now()+300, actor: 'Linux-Worker', type: 'TERMINAL_OUTPUT', payload: '{"text":"npm install done"}', previous_event_id: null });
    
    db.close();

    const { spawn } = require('child_process');
    const child = spawn('node', [cliPath, 'logs', sessionId, '-d', dbPath], { cwd: tempDir, encoding: 'utf8' });
    
    let output = '';
    await new Promise<void>((resolve) => {
       child.stdout.on('data', (data: any) => {
          output += data.toString();
          if (output.includes('test passed') && output.includes('npm install done')) {
             resolve();
          }
       });
       // Fallback timeout in case output isn't flushed in 2 seconds
       setTimeout(() => resolve(), 2000);
    });
    
    child.kill('SIGKILL');
    
    expect(output).toContain('Watching execution logs for session test-session-logs');
    expect(output).toContain('[MacOS-Worker - RUNTIME_OUTPUT]');
    expect(output).toContain('test passed');
    expect(output).toContain('[Linux-Worker - TERMINAL_OUTPUT]');
    expect(output).toContain('npm install done');
    expect(output).not.toContain('PROJECT_CONFIG');
    expect(output).not.toContain('some ai message');
  });
});
