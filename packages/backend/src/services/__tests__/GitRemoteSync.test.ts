import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gitRemoteSync } from '../GitRemoteSync';

vi.mock('isomorphic-git', () => {
  return {
    default: {
      push: vi.fn(),
      pull: vi.fn(),
    }
  };
});

describe('GitRemoteSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitRemoteSync.configure('http://localhost:8787/git');
  });

  it('pushes the repository to the remote with bearer token', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await gitRemoteSync.pushToRemote(mockFs, '/session-123', 'main');
    
    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/session-123',
        remote: 'origin',
        url: 'http://localhost:8787/git/session-123',
        headers: {
          'Authorization': 'Bearer cr-session-token'
        }
      })
    );
  });

  it('pushes the global workspace repository to the remote', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await gitRemoteSync.pushToRemote(mockFs, '/global-workspace', 'main');
    
    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/global-workspace',
        remote: 'origin',
        url: 'http://localhost:8787/git/global-workspace',
        headers: {
          'Authorization': 'Bearer cr-session-token'
        }
      })
    );
  });

  it('pulls the repository from the remote with bearer token', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await gitRemoteSync.pullFromRemote(mockFs, '/session-123', 'main');
    
    expect(gitMock.default.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/session-123',
        remote: 'origin',
        url: 'http://localhost:8787/git/session-123',
        headers: {
          'Authorization': 'Bearer cr-session-token'
        }
      })
    );
  });

  describe('Error Handling', () => {
    it('throws when push fails', async () => {
      const gitMock = await import('isomorphic-git');
      gitMock.default.push = vi.fn().mockRejectedValue(new Error('Push Error'));
      const mockFs = {};
      
      await expect(gitRemoteSync.pushToRemote(mockFs, '/session-123', 'main')).rejects.toThrow('Push Error');
    });

    it('throws when pull fails', async () => {
      const gitMock = await import('isomorphic-git');
      gitMock.default.pull = vi.fn().mockRejectedValue(new Error('Pull Error'));
      const mockFs = {};
      
      await expect(gitRemoteSync.pullFromRemote(mockFs, '/session-123', 'main')).rejects.toThrow('Pull Error');
    });
  });
});
