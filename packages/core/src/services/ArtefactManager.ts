import git from 'isomorphic-git';
import { GitContextManager } from './GitContextManager';
import { createTwoFilesPatch } from 'diff';

export interface DraftProposal {
  branch: string;
  commitSha: string;
}

export class ArtefactManager {
  private gitManager: GitContextManager;

  constructor(sessionId: string, customFs?: any, baseDir?: string) {
    this.gitManager = new GitContextManager(sessionId, customFs, baseDir);
  }

  /**
   * Initializes the repository for this session if it doesn't exist.
   */
  private async initIfNeeded(): Promise<void> {
    await this.gitManager.initRepo();
  }

  /**
   * Proposes a new draft by branching off main, staging the file change, and committing.
   */
  async proposeDraft(filepath: string, content: string, actor: string = 'Cognitive Resonance'): Promise<DraftProposal> {
    await this.initIfNeeded();

    const dir = this.gitManager.dir;

    // Ensure we are on main before branching
    const currentBranch = await this.gitManager.getCurrentBranch();
    if (currentBranch !== 'main') {
      await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });
    }

    // Branch off main
    const timestamp = Date.now();
    const safeFilepath = filepath.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const branchName = `draft/${safeFilepath}/${timestamp}`;

    await git.branch({ fs: this.gitManager.fs, dir, ref: branchName, checkout: true });

    // Ensure the directory for the file exists
    const fullPath = `${dir}/${filepath}`;
    const parts = fullPath.split('/');
    parts.pop();
    const fileDir = parts.join('/');
    
    // Create intermediate directories if they don't exist
    try {
      await this.gitManager.fs.promises.stat(fileDir);
    } catch {
      await this.gitManager.fs.promises.mkdir(fileDir, { recursive: true });
    }

    await this.gitManager.stageFile(filepath, content);
    const commitSha = await git.commit({
      fs: this.gitManager.fs,
      dir,
      author: {
        name: actor,
        email: 'system@cr.local'
      },
      message: `Draft proposal for ${filepath}`
    });

    return {
      branch: branchName,
      commitSha
    };
  }

  /**
   * Promotes an approved draft by cleanly merging it into the permanent timeline (main).
   */
  async promoteDraft(draftBranch: string, _filepath: string, actor: string = 'Human'): Promise<string> {
    await this.initIfNeeded();
    const dir = this.gitManager.dir;

    // Checkout main
    await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });

    // Merge draft into main
    try {
      const mergeResult = await git.merge({
        fs: this.gitManager.fs,
        dir,
        ours: 'main',
        theirs: draftBranch,
        author: {
          name: actor,
          email: 'system@cr.local'
        },
        fastForward: true
      });

      console.log(`[ArtefactManager] Promoted draft ${draftBranch} to main. Merge result:`, mergeResult);
      
      const headSha = await git.resolveRef({ fs: this.gitManager.fs, dir, ref: 'main' });
      return headSha;
    } catch (err) {
      console.error(`[ArtefactManager] Failed to merge draft ${draftBranch}:`, err);
      throw err;
    }
  }

  /**
   * Generates a diff/patch representing the changes from main to the Draft.
   */
  async getDiff(filepath: string, draftBranch: string): Promise<string> {
    await this.initIfNeeded();
    const dir = this.gitManager.dir;

    let mainContent = '';
    let draftContent = '';

    // Helper to read blob securely
    const readBlob = async (ref: string): Promise<string> => {
      try {
        const commitOid = await git.resolveRef({ fs: this.gitManager.fs, dir, ref });
        const { blob } = await git.readBlob({ fs: this.gitManager.fs, dir, oid: commitOid, filepath });
        return Buffer.from(blob).toString('utf8');
      } catch (e) {
        // File might not exist in that ref
        return '';
      }
    };

    mainContent = await readBlob('main');
    draftContent = await readBlob(draftBranch);

    // If both are empty, there's no diff. (Or perhaps it's a new file)
    // createPatch uses unified diff format
    const patch = createTwoFilesPatch(
      filepath,
      filepath,
      mainContent,
      draftContent,
      'main',
      draftBranch
    );

    return patch;
  }

  /**
   * Directly stages and commits changes to the main branch.
   * Useful for external modifications (e.g. IDE) via CLI.
   */
  async commitDirect(filepath: string, content: string, actor: string = 'Local Development'): Promise<string> {
    await this.initIfNeeded();
    const dir = this.gitManager.dir;

    const currentBranch = await this.gitManager.getCurrentBranch();
    if (currentBranch !== 'main') {
      await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });
    }

    try {
      await this.gitManager.stageFile(filepath, content);
      const commitSha = await git.commit({
        fs: this.gitManager.fs,
        dir,
        author: {
          name: actor,
          email: 'local@cr.local'
        },
        message: `Manual update to ${filepath}`
      });

      console.log(`[ArtefactManager] Direct commit applied for ${filepath} (SHA: ${commitSha})`);
      return commitSha;
    } catch (err) {
      console.error(`[ArtefactManager] Failed to commitDirect for ${filepath}:`, err);
      throw err;
    }
  }
}
