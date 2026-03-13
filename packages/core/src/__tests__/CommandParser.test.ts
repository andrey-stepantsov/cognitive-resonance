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
    expect(parseCommand('/session delete 123')).toEqual({ action: CommandAction.UNKNOWN, args: ['delete', '123'], raw: '/session delete 123' });
    expect(parseCommand('/model ls')).toEqual({ action: CommandAction.UNKNOWN, args: ['ls'], raw: '/model ls' });
    expect(parseCommand('/gem create')).toEqual({ action: CommandAction.UNKNOWN, args: ['create'], raw: '/gem create' });
    expect(parseCommand('/context add')).toEqual({ action: CommandAction.UNKNOWN, args: ['add'], raw: '/context add' });
    expect(parseCommand('/graph unknown')).toEqual({ action: CommandAction.UNKNOWN, args: ['unknown'], raw: '/graph unknown' });
  });
});
