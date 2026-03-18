import git from 'isomorphic-git';
import { GitContextManager } from './GitContextManager';
import { createTwoFilesPatch } from 'diff';

export interface DraftProposal {
  branch: string;
  commitSha: string;
}

export class ArtefactManager {
  private gitManager: GitContextManager;
  private queue: Promise<any> = Promise.resolve();

  constructor(sessionId: string, customFs?: any, baseDir?: string) {
    this.gitManager = new GitContextManager(sessionId, customFs, baseDir);
  }

  /**
   * Initializes the repository for this session if it doesn't exist.
   */
  private async initIfNeeded(): Promise<void> {
    await this.gitManager.initRepo();
  }

  async proposeDraft(filepath: string, content: string, actor: string = 'Cognitive Resonance'): Promise<DraftProposal> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          await this.initIfNeeded();
          const dir = this.gitManager.dir;

          const currentBranch = await this.gitManager.getCurrentBranch();
          if (currentBranch !== 'main') {
            await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });
          }

          const timestamp = Date.now();
          const safeFilepath = filepath.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const branchName = `draft/${safeFilepath}/${timestamp}`;

          await git.branch({ fs: this.gitManager.fs, dir, ref: branchName, checkout: true });

          const fullPath = `${dir}/${filepath}`;
          const parts = fullPath.split('/');
          parts.pop();
          const fileDir = parts.join('/');
          
          try {
            await this.gitManager.fs.promises.stat(fileDir);
          } catch {
            await this.gitManager.fs.promises.mkdir(fileDir, { recursive: true });
          }

          await this.gitManager.stageFile(filepath, content);
          const commitSha = await git.commit({
            fs: this.gitManager.fs, dir,
            author: { name: actor, email: 'system@cr.local' },
            message: `Draft proposal for ${filepath}`
          });
          resolve({ branch: branchName, commitSha });
        } catch (err) { reject(err); }
      });
    });
  }

  async promoteDraft(draftBranch: string, _filepath: string, actor: string = 'Human'): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          await this.initIfNeeded();
          const dir = this.gitManager.dir;
          await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });

          await git.merge({
            fs: this.gitManager.fs, dir, ours: 'main', theirs: draftBranch,
            author: { name: actor, email: 'system@cr.local' }, fastForward: true
          });

          console.log(`[ArtefactManager] Promoted draft ${draftBranch} to main.`);
          const headSha = await git.resolveRef({ fs: this.gitManager.fs, dir, ref: 'main' });
          resolve(headSha);
        } catch (err) { reject(err); }
      });
    });
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

  async commitDirect(filepath: string, content: string, actor: string = 'Local Development'): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          await this.initIfNeeded();
          const dir = this.gitManager.dir;

          const currentBranch = await this.gitManager.getCurrentBranch();
          if (currentBranch !== 'main') {
            await git.checkout({ fs: this.gitManager.fs, dir, ref: 'main' });
          }

          await this.gitManager.stageFile(filepath, content);
          const commitSha = await git.commit({
            fs: this.gitManager.fs, dir, author: { name: actor, email: 'local@cr.local' },
            message: `Manual update to ${filepath}`
          });
          resolve(commitSha);
        } catch (err) { reject(err); }
      });
    });
  }
}
