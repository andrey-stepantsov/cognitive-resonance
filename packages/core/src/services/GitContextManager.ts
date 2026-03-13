import fs from '@isomorphic-git/lightning-fs';
import git from 'isomorphic-git';

// Initialize a virtual file system bound specifically to our artifact workspace
// We use LightningFS to maintain IndexedDB persistence between reloads in the browser.
export const vfs = new fs('cr-artifacts-vfs');

export class GitContextManager {
  public readonly fs: any;
  public readonly dir: string;

  constructor(sessionId: string) {
    // Each chat session gets its own isolated virtual repository folder
    this.fs = vfs; // Initialize the fs property with the global vfs instance
    this.dir = `/${sessionId}`;
  }

  /**
   * Initializes the repository if it doesn't already exist.
   */
  async initRepo(): Promise<void> {
    try {
      // Ensure the directory exists
      try {
        await vfs.promises.stat(this.dir);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          await vfs.promises.mkdir(this.dir);
        } else {
          throw err;
        }
      }

      // Initialize the git repo
      await git.init({ fs: vfs, dir: this.dir, defaultBranch: 'main' });
      console.log(`[GitContextManager] Initialized repository at ${this.dir}`);
    } catch (err) {
      console.error('[GitContextManager] Failed to init repository:', err);
      throw err;
    }
  }

  /**
   * Writes a file to the virtual file system and stages it in Git.
   */
  async stageFile(filepath: string, content: string): Promise<void> {
    try {
      const fullPath = `${this.dir}/${filepath}`;
      
      // We might need to handle automatic nested directory creation here if artifact paths are complex,
      // but for MVP we assume flat artifacts.
      
      await vfs.promises.writeFile(fullPath, content, 'utf8');
      
      await git.add({
        fs: vfs,
        dir: this.dir,
        filepath
      });
      console.log(`[GitContextManager] Staged file: ${filepath}`);
    } catch(err) {
      console.error(`[GitContextManager] Failed to stage file ${filepath}:`, err);
      throw err;
    }
  }

  /**
   * Commits currently staged changes.
   */
  async commitChange(message: string, authorName: string = 'Cognitive Resonance', authorEmail: string = 'system@cr.local'): Promise<string> {
    try {
      const sha = await git.commit({
        fs: vfs,
        dir: this.dir,
        author: {
          name: authorName,
          email: authorEmail,
        },
        message
      });
      console.log(`[GitContextManager] Committed changes: ${sha}`);
      return sha;
    } catch(err) {
      console.error('[GitContextManager] Failed to commit:', err);
      throw err;
    }
  }

  /**
   * Returns a simplified diff of the working tree or specific commits if needed.
   * Note: isomorphic-git does not have a native `git.diff()` equivalent to the CLI that outputs patch strings.
   * We will have to compute the diff manually using `git.statusMatrix()` or a library like `diff` for the raw text if needed,
   * or we just return the status matrix to the AI.
   */
  async getStatusMatrix(): Promise<any[]> {
    try {
      const matrix = await git.statusMatrix({
        fs: vfs,
        dir: this.dir
      });
      return matrix;
    } catch (err) {
      console.error('[GitContextManager] Failed to get status matrix:', err);
      return [];
    }
  }

  /**
   * Checks if there are any commits in the repository.
   */
  async hasCommits(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: vfs, dir: this.dir, ref: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the current checked-out branch (usually 'main').
   */
  async getCurrentBranch(): Promise<string | undefined> {
    try {
      return await git.currentBranch({ fs: vfs, dir: this.dir, fullname: false }) || 'main';
    } catch (err) {
      return 'main';
    }
  }
}
