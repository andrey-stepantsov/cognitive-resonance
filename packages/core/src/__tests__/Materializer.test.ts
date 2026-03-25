import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
// import { execSync } from 'child_process';
import { Materializer } from '../services/Materializer';
import type { IEvent } from 'cr-core-contracts';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    promises: {
      stat: vi.fn(),
      mkdir: vi.fn(),
      cp: vi.fn(),
      lstat: vi.fn(),
      symlink: vi.fn(),
      rm: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

describe('Materializer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeVirtualState', () => {
    it('should handle PROJECT_CONFIG and build project map', () => {
      const mat = new Materializer();
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'PROJECT_CONFIG', payload: JSON.stringify({ projectId: 'p1', basePath: 'apps/p1', dependencies: [] }), previous_event_id: null }
      ];
      mat.computeVirtualState(events);
      expect(mat.projects.has('p1')).toBe(true);
      expect(mat.projects.get('p1')?.basePath).toBe('apps/p1');
    });

    it('should handle ARTEFACT_KEYFRAME and set VFS', () => {
      const mat = new Materializer();
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_KEYFRAME', payload: { files: { 'a.txt': 'hello' } }, previous_event_id: null }
      ];
      const vfs = mat.computeVirtualState(events);
      expect(vfs.get('a.txt')).toBe('hello');
    });

    it('should ignore invalid events safely', () => {
      const mat = new Materializer();
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'UNKNOWN_TYPE' as any, payload: {}, previous_event_id: null }
      ];
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const vfs = mat.computeVirtualState(events);
      expect(vfs.size).toBe(0);
      warnSpy.mockRestore();
    });

    it('should apply ARTEFACT_PROPOSAL fullReplacement', () => {
      const mat = new Materializer();
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_PROPOSAL', payload: { path: 'a.txt', patch: 'hello full', isFullReplacement: true }, previous_event_id: null }
      ];
      const vfs = mat.computeVirtualState(events);
      expect(vfs.get('a.txt')).toBe('hello full');
    });

    it('should apply ARTEFACT_PROPOSAL diff patch on existing content', () => {
      const mat = new Materializer();
      // create unified diff patch to add a line
      const patch = `--- a.txt
+++ a.txt
@@ -1 +1,2 @@
 hello
+world`;
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_KEYFRAME', payload: { files: { 'a.txt': 'hello\n' } }, previous_event_id: null },
        { id: '2', session_id: 's', timestamp: 2, actor: 'x', type: 'ARTEFACT_PROPOSAL', payload: { path: 'a.txt', patch, isFullReplacement: false }, previous_event_id: null }
      ];
      const vfs = mat.computeVirtualState(events);
      expect(vfs.get('a.txt')).toBe('hello\nworld\n');
    });

    it('should handle failed diff patch application', () => {
      const mat = new Materializer();
      const patch = `--- a.txt\n+++ a.txt\n@@ -1 +1 @@\n-wrong\n+world`;
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_KEYFRAME', payload: { files: { 'a.txt': 'hello\n' } }, previous_event_id: null },
        { id: '2', session_id: 's', timestamp: 2, actor: 'x', type: 'ARTEFACT_PROPOSAL', payload: { path: 'a.txt', patch, isFullReplacement: false }, previous_event_id: null }
      ];
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const vfs = mat.computeVirtualState(events);
      // Fails because 'wrong' doesn't match 'hello\n'
      expect(vfs.get('a.txt')).toBe('hello\n');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to apply patch'));
      warnSpy.mockRestore();
    });

    it('should process FILE_DELETED', () => {
      const mat = new Materializer();
      const events: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_KEYFRAME', payload: { files: { 'a.txt': 'hello\n' } }, previous_event_id: null },
        { id: '2', session_id: 's', timestamp: 2, actor: 'x', type: 'FILE_DELETED', payload: { path: 'a.txt' }, previous_event_id: null }
      ];
      const vfs = mat.computeVirtualState(events);
      expect(vfs.has('a.txt')).toBe(false);
    });
  });

  describe('materializeToDisk', () => {
    it('should create missing target dir', async () => {
      const mat = new Materializer();
      const vfs = new Map();
      vi.mocked(fs.promises.stat).mockRejectedValueOnce(new Error('noexist'));
      
      await mat.materializeToDisk(vfs, 'out');
      expect(fs.promises.mkdir).toHaveBeenCalledWith('out', { recursive: true });
    });

    it('should overlay physical directories and symlink node_modules', async () => {
      const mat = new Materializer();
      mat.projects.set('p1', { projectId: 'p1', basePath: 'apps/p1', dependencies: [] });
      
      vi.mocked(fs.promises.stat).mockResolvedValue({} as any);
      vi.mocked(fs.promises.lstat).mockResolvedValue({ isDirectory: () => true } as any);
      
      await mat.materializeToDisk(new Map(), 'out');
      
      expect(fs.promises.cp).toHaveBeenCalled();
      expect(fs.promises.symlink).toHaveBeenCalled();
    });

    it('should apply vfs atop physical', async () => {
      const mat = new Materializer();
      const vfs = new Map([['file.txt', '123']]);
      
      vi.mocked(fs.promises.stat).mockResolvedValue({} as any);
      
      await mat.materializeToDisk(vfs, 'out');
      
      expect(fs.promises.writeFile).toHaveBeenCalledWith(expect.stringContaining('file.txt'), '123', 'utf8');
    });

    it('should synthesize cross-project dependencies', async () => {
      const mat = new Materializer();
      mat.projects.set('p1', { projectId: 'p1', basePath: 'apps/p1', dependencies: ['p2'] });
      mat.projects.set('p2', { projectId: 'p2', basePath: 'packages/p2', dependencies: [] });
      
      vi.mocked(fs.promises.stat).mockResolvedValue({} as any);
      
      await mat.materializeToDisk(new Map(), 'out');
      
      expect(fs.promises.symlink).toHaveBeenCalled();
    });
  });

  describe('getVirtualFileContent', () => {
    it('should resolve fallback if missing', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));
      const c = await mat.getVirtualFileContent('a.txt', []);
      expect(c).toBe('');
    });

    it('should apply events atop baseline physical representation', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockResolvedValue('base');
      
      const patch = `--- a.txt\n+++ a.txt\n@@ -1 +1 @@\n-base\n+base1`;
      
      const evt: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_PROPOSAL', payload: { path: 'a.txt', patch, isFullReplacement: false }, previous_event_id: null }
      ];
      
      const c = await mat.getVirtualFileContent('a.txt', evt);
      expect(c).toBe('base1');
    });

    it('should handle invalid events and keyframes cleanly', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockResolvedValue('');
      const c = await mat.getVirtualFileContent('a.txt', [
        { type: 'UNKNOWN_TYPE' } as any,
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_KEYFRAME', payload: {files: {'b.txt': 'wrong', 'a.txt': 'keyed'}}, previous_event_id: null }
      ]);
      expect(c).toBe('keyed');
    });

    it('should apply full replacements dynamically', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockResolvedValue('');
      const c = await mat.getVirtualFileContent('a.txt', [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'ARTEFACT_PROPOSAL', payload: { path: 'a.txt', patch: 'fulltext', isFullReplacement: true }, previous_event_id: null }
      ]);
      expect(c).toBe('fulltext');
    });

    it('should handle PWA_DELETE alias', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockResolvedValue('base');
      const c = await mat.getVirtualFileContent('a.txt', [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'PWA_DELETE', payload: { target: 'a.txt' }, previous_event_id: null }
      ]);
      expect(c).toBe('');
    });

    it('should clear content on deletion', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.readFile).mockResolvedValue('base');
      
      const evt: IEvent[] = [
        { id: '1', session_id: 's', timestamp: 1, actor: 'x', type: 'FILE_DELETED', payload: { path: 'a.txt' }, previous_event_id: null }
      ];
      
      const c = await mat.getVirtualFileContent('a.txt', evt);
      expect(c).toBe('');
    });
  });
  
  describe('computeAndMaterialize', () => {
    it('combines compute and disk write', async () => {
      const mat = new Materializer();
      vi.mocked(fs.promises.stat).mockResolvedValue({} as any);
      await mat.computeAndMaterialize([], 'foo');
      // No errors should happen
    });
  });
});
