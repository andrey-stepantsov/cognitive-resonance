import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitContextManager, vfs } from '../GitContextManager';
import git from 'isomorphic-git';

// Mock isomorphic-git
vi.mock('isomorphic-git', () => {
  return {
    default: {
      init: vi.fn(),
      add: vi.fn(),
      commit: vi.fn().mockResolvedValue('mock-sha'),
      statusMatrix: vi.fn().mockResolvedValue([]),
      resolveRef: vi.fn().mockResolvedValue('mock-sha'),
      currentBranch: vi.fn().mockResolvedValue('main')
    }
  };
});

describe('GitContextManager', () => {
  let gitManager: GitContextManager;

  beforeEach(() => {
    vi.clearAllMocks();
    gitManager = new GitContextManager('test-session-123');
    
    // Mock the raw vfs promised methods we use
    vfs.promises.stat = vi.fn().mockResolvedValue({});
    vfs.promises.mkdir = vi.fn().mockResolvedValue(true);
    vfs.promises.writeFile = vi.fn().mockResolvedValue(true);
    vfs.promises.readFile = vi.fn().mockResolvedValue('mock file content');
  });

  it('instantiates correctly with correct directories', () => {
    expect(gitManager.dir).toBe('/test-session-123');
    expect(gitManager.globalDir).toBe('/global-workspace');
    expect(gitManager.fs).toBe(vfs);
  });

  describe('Session Repository Operations', () => {
    it('initializes the session repository', async () => {
      await gitManager.initRepo();
      expect(vfs.promises.stat).toHaveBeenCalledWith('/test-session-123');
      expect(git.init).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/test-session-123'
      }));
    });

    it('stages a file in the session repository', async () => {
      await gitManager.initRepo();
      await gitManager.stageFile('test.md', '# Hello World');
      
      expect(vfs.promises.writeFile).toHaveBeenCalledWith('/test-session-123/test.md', '# Hello World', 'utf8');
      expect(git.add).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/test-session-123',
        filepath: 'test.md'
      }));
    });

    it('commits changes in the session repository', async () => {
      const sha = await gitManager.commitChange('Add test file');
      expect(sha).toBe('mock-sha');
      expect(git.commit).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/test-session-123',
        message: 'Add test file'
      }));
    });
  });

  describe('Global Workspace Repository Operations', () => {
    it('initializes the global repository', async () => {
      await gitManager.initGlobalRepo();
      expect(vfs.promises.stat).toHaveBeenCalledWith('/global-workspace');
      expect(git.init).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/global-workspace'
      }));
    });

    it('stages a file in the global repository', async () => {
      await gitManager.initGlobalRepo();
      await gitManager.stageGlobalFile('global.md', '# Global Standard');
      
      expect(vfs.promises.writeFile).toHaveBeenCalledWith('/global-workspace/global.md', '# Global Standard', 'utf8');
      expect(git.add).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/global-workspace',
        filepath: 'global.md'
      }));
    });

    it('commits changes in the global repository', async () => {
      const sha = await gitManager.commitGlobalChange('Update global standard');
      expect(sha).toBe('mock-sha');
      expect(git.commit).toHaveBeenCalledWith(expect.objectContaining({
        dir: '/global-workspace',
        message: 'Update global standard'
      }));
    });
  });

  describe('Utility Methods', () => {
    it('gets status matrix for session', async () => {
      await gitManager.getStatusMatrix();
      expect(git.statusMatrix).toHaveBeenCalledWith(expect.objectContaining({ dir: '/test-session-123' }));
    });

    it('gets status matrix for global workspace', async () => {
      await gitManager.getGlobalStatusMatrix();
      expect(git.statusMatrix).toHaveBeenCalledWith(expect.objectContaining({ dir: '/global-workspace' }));
    });

    it('checks for commits in session', async () => {
      const result = await gitManager.hasCommits();
      expect(git.resolveRef).toHaveBeenCalledWith(expect.objectContaining({ dir: '/test-session-123', ref: 'HEAD' }));
      expect(result).toBe(true);
    });

    it('checks for commits in global workspace', async () => {
      const result = await gitManager.hasGlobalCommits();
      expect(git.resolveRef).toHaveBeenCalledWith(expect.objectContaining({ dir: '/global-workspace', ref: 'HEAD' }));
      expect(result).toBe(true);
    });

    it('gets current branch for session', async () => {
      const branch = await gitManager.getCurrentBranch();
      expect(git.currentBranch).toHaveBeenCalledWith(expect.objectContaining({ dir: '/test-session-123' }));
      expect(branch).toBe('main');
    });

    it('gets current branch for global workspace', async () => {
      const branch = await gitManager.getGlobalBranch();
      expect(git.currentBranch).toHaveBeenCalledWith(expect.objectContaining({ dir: '/global-workspace' }));
      expect(branch).toBe('main');
    });
  });

  describe('Error Handling', () => {
    it('handles stat non-ENOENT error during initRepo', async () => {
      vfs.promises.stat = vi.fn().mockRejectedValue(new Error('Generic Error'));
      await expect(gitManager.initRepo()).rejects.toThrow('Generic Error');
    });

    it('handles mkdir ENOENT during initRepo', async () => {
      vfs.promises.stat = vi.fn().mockRejectedValue({ code: 'ENOENT' });
      vfs.promises.mkdir = vi.fn().mockResolvedValue(true);
      await gitManager.initRepo();
      expect(vfs.promises.mkdir).toHaveBeenCalledWith('/test-session-123');
    });

    it('handles stageFile error', async () => {
      vfs.promises.writeFile = vi.fn().mockRejectedValue(new Error('Write Error'));
      await expect(gitManager.stageFile('test.md', 'content')).rejects.toThrow('Write Error');
    });

    it('handles commitChange error', async () => {
      (git.commit as any).mockRejectedValueOnce(new Error('Commit Error'));
      await expect(gitManager.commitChange('msg')).rejects.toThrow('Commit Error');
    });

    it('handles getStatusMatrix error', async () => {
      (git.statusMatrix as any).mockRejectedValueOnce(new Error('Status Error'));
      const matrix = await gitManager.getStatusMatrix();
      expect(matrix).toEqual([]);
    });

    it('handles hasCommits false', async () => {
      (git.resolveRef as any).mockRejectedValueOnce(new Error('No HEAD'));
      const result = await gitManager.hasCommits();
      expect(result).toBe(false);
    });

    it('handles getCurrentBranch error', async () => {
      (git.currentBranch as any).mockRejectedValueOnce(new Error('Branch Error'));
      const branch = await gitManager.getCurrentBranch();
      expect(branch).toBe('main');
    });
  });
});
