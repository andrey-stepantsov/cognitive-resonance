import fs from '@isomorphic-git/lightning-fs';
import git from 'isomorphic-git';

// Initialize a virtual file system bound specifically to our artifact workspace
// We use LightningFS to maintain IndexedDB persistence between reloads in the browser.
export const vfs = typeof navigator !== 'undefined' || typeof indexedDB !== 'undefined' 
  ? new fs('cr-artifacts-vfs') 
  : null;

export class GitContextManager {
  public readonly fs: any;
  public readonly dir: string;
  public readonly globalDir: string;

  constructor(sessionId: string, customFs?: any, baseDir?: string) {
    // Each chat session gets its own isolated virtual repository folder by default
    // If a custom fs is provided, use it (for CLI).
    this.fs = customFs || vfs;
    this.dir = baseDir || `/${sessionId}`;
    // If we're using normal fs, globalDir doesn't make as much sense in the same way,
    // but we'll default to a sibling directory or fallback to vfs style.
    this.globalDir = baseDir ? `${baseDir}-global` : `/global-workspace`;
  }

  /**
   * Initializes a repository at the specified directory if it doesn't already exist.
   */
  private async _initRepoSafe(targetDir: string): Promise<void> {
    try {
      // Ensure the directory exists
      try {
        await this.fs.promises.stat(targetDir);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          await this.fs.promises.mkdir(targetDir, { recursive: true });
        } else {
          throw err;
        }
      }

      // Initialize the git repo
      await git.init({ fs: this.fs, dir: targetDir, defaultBranch: 'main' });
      console.log(`[GitContextManager] Initialized repository at ${targetDir}`);
    } catch (err) {
      console.error(`[GitContextManager] Failed to init repository at ${targetDir}:`, err);
      throw err;
    }
  }

  async initRepo(): Promise<void> {
    await this._initRepoSafe(this.dir);
  }

  async initGlobalRepo(): Promise<void> {
    await this._initRepoSafe(this.globalDir);
  }

  /**
   * Writes a file to the virtual file system and stages it in Git for a target directory.
   */
  private async _stageFileSafe(targetDir: string, filepath: string, content: string): Promise<void> {
    try {
      const fullPath = `${targetDir}/${filepath}`;
      await this.fs.promises.writeFile(fullPath, content, 'utf8');
      
      await git.add({
        fs: this.fs,
        dir: targetDir,
        filepath
      });
      console.log(`[GitContextManager] Staged file: ${filepath} in ${targetDir}`);
    } catch(err) {
      console.error(`[GitContextManager] Failed to stage file ${filepath} in ${targetDir}:`, err);
      throw err;
    }
  }

  async stageFile(filepath: string, content: string): Promise<void> {
    await this._stageFileSafe(this.dir, filepath, content);
  }

  async stageGlobalFile(filepath: string, content: string): Promise<void> {
    await this._stageFileSafe(this.globalDir, filepath, content);
  }

  /**
   * Commits currently staged changes for a target directory.
   */
  private async _commitChangeSafe(targetDir: string, message: string, authorName: string = 'Cognitive Resonance', authorEmail: string = 'system@cr.local'): Promise<string> {
    try {
      const sha = await git.commit({
        fs: this.fs,
        dir: targetDir,
        author: {
          name: authorName,
          email: authorEmail,
        },
        message
      });
      console.log(`[GitContextManager] Committed changes in ${targetDir}: ${sha}`);
      return sha;
    } catch(err) {
      console.error(`[GitContextManager] Failed to commit in ${targetDir}:`, err);
      throw err;
    }
  }

  async commitChange(message: string): Promise<string> {
    return await this._commitChangeSafe(this.dir, message);
  }

  async commitGlobalChange(message: string): Promise<string> {
    return await this._commitChangeSafe(this.globalDir, message);
  }

  /**
   * Returns a simplified diff of the working tree or specific commits.
   */
  private async _getStatusMatrixSafe(targetDir: string): Promise<any[]> {
    try {
      return await git.statusMatrix({
        fs: this.fs,
        dir: targetDir
      });
    } catch (err) {
      console.error(`[GitContextManager] Failed to get status matrix for ${targetDir}:`, err);
      return [];
    }
  }

  async getStatusMatrix(): Promise<any[]> {
    return await this._getStatusMatrixSafe(this.dir);
  }

  async getGlobalStatusMatrix(): Promise<any[]> {
    return await this._getStatusMatrixSafe(this.globalDir);
  }

  private async _hasCommitsSafe(targetDir: string): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: targetDir, ref: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  }

  async hasCommits(): Promise<boolean> {
    return await this._hasCommitsSafe(this.dir);
  }

  async hasGlobalCommits(): Promise<boolean> {
    return await this._hasCommitsSafe(this.globalDir);
  }

  private async _getCurrentBranchSafe(targetDir: string): Promise<string> {
    try {
      return await git.currentBranch({ fs: this.fs, dir: targetDir, fullname: false }) || 'main';
    } catch (err) {
      return 'main';
    }
  }

  async getCurrentBranch(): Promise<string> {
    return await this._getCurrentBranchSafe(this.dir);
  }

  async getGlobalBranch(): Promise<string> {
    return await this._getCurrentBranchSafe(this.globalDir);
  }
}
