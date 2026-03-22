import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerObserveCommands } from '../src/commands/observe';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { IoAdapter } from '../src/utils/IoAdapter';

vi.mock('../src/db/DatabaseEngine');

class MockIoAdapter implements IoAdapter {
  constructor(public printCallback: (msg: string) => void) {}
  print(msg: string): void { this.printCallback(msg); }
  on(event: string, listener: (...args: any[]) => void): this { return this; }
  close(): void {}
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout { return setTimeout(callback, 0); }
  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    // Fire it once synchronously to test polling loops without hanging
    callback();
    return 1 as any;
  }
}

describe('Observe CLI Commands', () => {
  let outputs: string[] = [];
  let io: IoAdapter;

  beforeEach(() => {
    outputs = [];
    io = new MockIoAdapter((msg) => outputs.push(msg));
    vi.clearAllMocks();
  });

  const setupMockDb = (mockData: any[]) => {
    vi.mocked(DatabaseEngine).mockImplementation(() => ({
      query: vi.fn().mockReturnValue(mockData),
      get: vi.fn((q: string) => q.includes('SELECT id') ? undefined : (mockData.length > 0 ? mockData[mockData.length - 1] : undefined)),
      close: vi.fn(),
    } as any));
  };

  it('turns: lists sessions when none provided', async () => {
    setupMockDb([{ session_id: 's1' }, { session_id: 's2' }]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'turns', '-d', 'test.db']);
    expect(outputs.some(o => o.includes('s1'))).toBe(true);
  });

  it('turns: prints turns properly with JSON payloads on missing session fallback', async () => {
    setupMockDb([]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'turns', 'nonexist', '-d', 'test.db']);
    expect(outputs.some(o => o.includes('No events found'))).toBe(true);
  });

  it('turns: parses USER_PROMPT and AI_RESPONSE', async () => {
    setupMockDb([
      { type: 'USER_PROMPT', actor: 'user1', payload: JSON.stringify({ text: 'Hello' }) },
      { type: 'AI_RESPONSE', actor: 'ai1', payload: JSON.stringify({ text: 'Hi', dissonance: 0 }) }
    ]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'turns', 's1']);
    expect(outputs.some(o => o.includes('Hello'))).toBe(true);
    expect(outputs.some(o => o.includes('Hi'))).toBe(true);
  });

  it('head: limits output and parses system bounds', async () => {
    setupMockDb([{ type: 'UNKNOWN', actor: 'sys', timestamp: 1 }]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'head', 's1', '-n', '1']);
    expect(outputs.some(o => o.includes('[System Event]'))).toBe(true);
  });

  it('tail: limits backwards output', async () => {
    setupMockDb([{ type: 'RUNTIME_OUTPUT', actor: 'node', payload: { text: 'running...' } }]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'tail', 's1']);
    expect(outputs.some(o => o.includes('running...'))).toBe(true);
  });

  it('follow: starts interval polling', async () => {
    setupMockDb([{ type: 'TERMINAL_OUTPUT', actor: 'tty', payload: { text: '$ bash' }, timestamp: 1 }]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'follow', 's1']);
    expect(outputs.some(o => o.includes('Watching session'))).toBe(true);
  });

  it('logs: tail loops executions', async () => {
    setupMockDb([
      { type: 'RUNTIME_OUTPUT', actor: 'worker', payload: 'bad JSON', timestamp: 1 } // unparseable
    ]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'logs']); // fallback target
    expect(outputs.some(o => o.includes('Unparseable'))).toBe(true);
  });

  it('audit: handles temporal paradoxes and bad JSON', async () => {
    setupMockDb([
      { id: '1', type: 'USER_PROMPT', actor: 'u', payload: 'bad_json', previous_event_id: '0', timestamp: 1 }
    ]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'audit', 's1']);
    
    // The table generation contains these words
    const flatStr = outputs.join(' ');
    expect(flatStr).toContain('Orphaned');
    expect(flatStr).toContain('No');
    expect(flatStr).toContain('Audit Failed');
  });

  it('status: handles valid diff vs existing', async () => {
    setupMockDb([
      { id: '1', type: 'ARTEFACT_KEYFRAME', actor: 'u', payload: { files: {'foo.txt':'A'} }, session_id: 's1', timestamp: 1, previous_event_id: null }
    ]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'status', 's1']);
    expect(outputs.some(o => o.includes('foo.txt'))).toBe(true);
  });

  it('ls: prints tree for virtual state', async () => {
    setupMockDb([
      { id: '1', type: 'ARTEFACT_KEYFRAME', actor: 'u', payload: { files: {'dir/foo.txt':'A'} }, session_id: 's1', timestamp: 1, previous_event_id: null }
    ]);
    const program = new Command();
    registerObserveCommands(program, io);
    await program.parseAsync(['node', 'cr.js', 'ls', 's1']);
    expect(outputs.join(' ')).toContain('dir');
    expect(outputs.join(' ')).toContain('foo.txt');
  });
});
