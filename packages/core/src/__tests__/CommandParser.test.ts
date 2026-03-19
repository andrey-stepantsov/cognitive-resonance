import { describe, it, expect } from 'vitest';
import { parseCommand, CommandAction } from '../services/CommandParser';

describe('CommandParser', () => {
  it('returns null for non-command strings', () => {
    expect(parseCommand('hello world')).toBeNull();
    expect(parseCommand('   just talking')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });

  it('handles empty commands', () => {
    expect(parseCommand('/')).toEqual({ action: CommandAction.UNKNOWN, args: [], raw: '/' });
    expect(parseCommand('!  ')).toEqual({ action: CommandAction.UNKNOWN, args: [], raw: '!  ' });
  });

  it('parses single namespace commands', () => {
    expect(parseCommand('/clear')).toEqual({ action: CommandAction.SESSION_CLEAR, args: [], raw: '/clear' });
    expect(parseCommand('/attach ./file.json')).toEqual({ action: CommandAction.ATTACH, args: ['./file.json'], raw: '/attach ./file.json' });
    expect(parseCommand('!attach doc.txt')).toEqual({ action: CommandAction.ATTACH, args: ['doc.txt'], raw: '!attach doc.txt' });
    expect(parseCommand('/search on')).toEqual({ action: CommandAction.SEARCH, args: ['on'], raw: '/search on' });
    expect(parseCommand('/system off')).toEqual({ action: CommandAction.SYSTEM, args: ['off'], raw: '/system off' });
  });

  it('parses session commands', () => {
    expect(parseCommand('/session new')).toEqual({ action: CommandAction.SESSION_NEW, args: [], raw: '/session new' });
    expect(parseCommand('/session load 123')).toEqual({ action: CommandAction.SESSION_LOAD, args: ['123'], raw: '/session load 123' });
    expect(parseCommand('/session ls')).toEqual({ action: CommandAction.SESSION_LS, args: [], raw: '/session ls' });
    expect(parseCommand('/session archive 123')).toEqual({ action: CommandAction.SESSION_ARCHIVE, args: ['123'], raw: '/session archive 123' });
    expect(parseCommand('/session recover 123')).toEqual({ action: CommandAction.SESSION_RECOVER, args: ['123'], raw: '/session recover 123' });
    expect(parseCommand('/session delete 123')).toEqual({ action: CommandAction.SESSION_DELETE, args: ['123'], raw: '/session delete 123' });
  });

  it('parses model and gem commands', () => {
    expect(parseCommand('/model use pro')).toEqual({ action: CommandAction.MODEL_USE, args: ['pro'], raw: '/model use pro' });
    expect(parseCommand('/gem use my-gem')).toEqual({ action: CommandAction.GEM_USE, args: ['my-gem'], raw: '/gem use my-gem' });
    expect(parseCommand('/gem ls')).toEqual({ action: CommandAction.GEM_LS, args: [], raw: '/gem ls' });
  });

  it('parses context commands', () => {
    expect(parseCommand('/context drop foo.ts')).toEqual({ action: CommandAction.CONTEXT_DROP, args: ['foo.ts'], raw: '/context drop foo.ts' });
  });

  it('parses key commands', () => {
    expect(parseCommand('/key set my-key')).toEqual({ action: CommandAction.KEY_SET, args: ['my-key'], raw: '/key set my-key' });
    expect(parseCommand('/key clear')).toEqual({ action: CommandAction.KEY_CLEAR, args: [], raw: '/key clear' });
  });

  it('parses git commands', () => {
    expect(parseCommand('/git sync')).toEqual({ action: CommandAction.GIT_SYNC, args: [], raw: '/git sync' });
    expect(parseCommand('/git push origin')).toEqual({ action: CommandAction.GIT_PUSH, args: ['origin'], raw: '/git push origin' });
    expect(parseCommand('/git pull origin main')).toEqual({ action: CommandAction.GIT_PULL, args: ['origin', 'main'], raw: '/git pull origin main' });
    expect(parseCommand('/pull')).toEqual({ action: CommandAction.GIT_PULL, args: [], raw: '/pull' });
  });

  it('parses graph commands', () => {
    expect(parseCommand('/graph ls')).toEqual({ action: CommandAction.GRAPH_LS, args: [], raw: '/graph ls' });
    expect(parseCommand('/graph search auth')).toEqual({ action: CommandAction.GRAPH_SEARCH, args: ['auth'], raw: '/graph search auth' });
    expect(parseCommand('/graph describe node-1')).toEqual({ action: CommandAction.GRAPH_DESCRIBE, args: ['node-1'], raw: '/graph describe node-1' });
    expect(parseCommand('/graph neighbors node-2')).toEqual({ action: CommandAction.GRAPH_NEIGHBORS, args: ['node-2'], raw: '/graph neighbors node-2' });
    expect(parseCommand('/graph path a b')).toEqual({ action: CommandAction.GRAPH_PATH, args: ['a', 'b'], raw: '/graph path a b' });
    expect(parseCommand('/graph dependants x')).toEqual({ action: CommandAction.GRAPH_DEPENDANTS, args: ['x'], raw: '/graph dependants x' });
    expect(parseCommand('/graph stats')).toEqual({ action: CommandAction.GRAPH_STATS, args: [], raw: '/graph stats' });
    expect(parseCommand('/graph cluster y')).toEqual({ action: CommandAction.GRAPH_CLUSTER, args: ['y'], raw: '/graph cluster y' });
  });

  it('returns UNKNOWN for unmapped commands', () => {
    expect(parseCommand('/unknown command')).toEqual({ action: CommandAction.UNKNOWN, args: ['command'], raw: '/unknown command' });
    expect(parseCommand('/fake_undefined_command')).toEqual({ action: CommandAction.UNKNOWN, args: [], raw: '/fake_undefined_command' });
    expect(parseCommand('/gem create')).toEqual({ action: CommandAction.UNKNOWN, args: ['create'], raw: '/gem create' });
    expect(parseCommand('/context add')).toEqual({ action: CommandAction.UNKNOWN, args: ['add'], raw: '/context add' });
    expect(parseCommand('/graph unknown')).toEqual({ action: CommandAction.UNKNOWN, args: ['unknown'], raw: '/graph unknown' });
  });
});

import { tokenizeLisp, parseLisp, parseDslRouting } from '../services/CommandParser';

describe('DSL Lisp Parsing', () => {
  it('tokenizes simple lisp structures correctly', () => {
    expect(tokenizeLisp('(exec "npm test")')).toEqual(['(', 'exec', '"npm test"', ')']);
    expect(tokenizeLisp('(  exec   "npm test --coverage"  )')).toEqual(['(', 'exec', '"npm test --coverage"', ')']);
    expect(tokenizeLisp('(get-context :from 5 :to 10)')).toEqual(['(', 'get-context', ':from', '5', ':to', '10', ')']);
  });

  it('builds valid AST arrays from tokens', () => {
    expect(parseLisp('(exec "npm test")')).toEqual(['exec', 'npm test']);
    expect(parseLisp('(get-context :from 5)')).toEqual(['get-context', ':from', '5']);
    expect(parseLisp('(do (exec "a") (exec "b"))')).toEqual(['do', ['exec', 'a'], ['exec', 'b']]);
  });
});

describe('DSL Routing Extractor', () => {
  it('parses full explicit routing', () => {
    const result = parseDslRouting('@steve:coder@MacBook#42(exec "npm test")');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      actor: 'steve',
      agent: 'coder',
      host: 'MacBook',
      turn: 42,
      ast: ['exec', 'npm test'],
      rawCommand: '@steve:coder@MacBook#42(exec "npm test")'
    });
  });

  it('parses host shorthand', () => {
    const result = parseDslRouting('Here is my request @@LinuxCI(exec "make test")');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      actor: null,
      agent: null,
      host: 'LinuxCI',
      turn: null,
      ast: ['exec', 'make test'],
      rawCommand: '@@LinuxCI(exec "make test")'
    });
  });

  it('parses agent shorthand', () => {
    const result = parseDslRouting('Can you @coder(get-context) check this?');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      actor: null,
      agent: 'coder',
      host: null,
      turn: null,
      ast: ['get-context'],
      rawCommand: '@coder(get-context)'
    });
  });

  it('handles strings with multiple references', () => {
    const text = '@steve:coder(foo) and @@Node1(bar)';
    const result = parseDslRouting(text);
    expect(result).toHaveLength(2);
    expect(result[0].agent).toBe('coder');
    expect(result[0].host).toBeNull();
    expect(result[0].ast).toEqual(['foo']);

    expect(result[1].agent).toBeNull();
    expect(result[1].host).toBe('Node1');
    expect(result[1].ast).toEqual(['bar']);
  });

  it('safely handles malformed Lisp ASTs', () => {
    const result = parseDslRouting('@@Server(exec "missing quote)');
    expect(result).toHaveLength(1);
    expect(result[0].host).toBe('Server');
    expect(result[0].ast).toBeNull(); // Parser should catch error and return null ast
  });
});

