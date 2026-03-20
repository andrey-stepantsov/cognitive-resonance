import * as path from 'path';
import * as fs from 'fs';
import { applyPatch } from 'diff';
import { execSync } from 'child_process';
import type { IEvent, ArtefactProposalPayload, ArtefactKeyframePayload, ProjectConfigPayload } from '../interfaces/IEvents';
import { validateEventSequence } from '../schemas/EventsSchema';

export class Materializer {
  private baseDir: string;
  public projects = new Map<string, ProjectConfigPayload>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
  }

  /**
   * Computes the virtual filesystem state (in-memory) from a list of events.
   * Processes ARTEFACT_KEYFRAME and ARTEFACT_PROPOSAL events sequentially.
   */
  public computeVirtualState(events: IEvent[]): Map<string, string> {
    const vfs = new Map<string, string>();
    this.projects.clear();

    for (const rawEvt of events) {
      let evt: IEvent;
      try {
         evt = validateEventSequence(rawEvt);
      } catch (err: any) {
         console.warn(`[Materializer] Invalid event skipped (${rawEvt.type}):`, err.message);
         continue;
      }

      if (evt.type === 'PROJECT_CONFIG') {
         const payload = typeof evt.payload === 'string'
           ? JSON.parse(evt.payload) as ProjectConfigPayload
           : evt.payload as any as ProjectConfigPayload;
         this.projects.set(payload.projectId, payload);
      } else if (evt.type === 'ARTEFACT_KEYFRAME') {
        const payload = typeof evt.payload === 'string' 
          ? JSON.parse(evt.payload) as ArtefactKeyframePayload 
          : evt.payload as any as ArtefactKeyframePayload;
          
        if (payload.files) {
          for (const [filePath, content] of Object.entries(payload.files)) {
            vfs.set(filePath, content);
          }
        }
      } else if (evt.type === 'ARTEFACT_PROPOSAL') {
        const payload = typeof evt.payload === 'string'
          ? JSON.parse(evt.payload) as ArtefactProposalPayload
          : evt.payload as any as ArtefactProposalPayload;
          
        if (payload.isFullReplacement) {
          vfs.set(payload.path, payload.patch);
        } else {
          // Apply unified diff patch
          const currentContent = vfs.get(payload.path) || '';
          
          if (!currentContent && !payload.patch.includes('+++')) {
              // Edge case: diff package might act weird if it's a new file and not standard format.
              // Assuming if it's not a standard patch, it might be the content itself if we missed isFullReplacement flag.
              // But strictly speaking, patch should be standard.
          }
          
          try {
            // diff's applyPatch can take multiple params or just the patch string
            const result = applyPatch(currentContent, payload.patch);
            // applyPatch returns false if it fails or the patched string if successful
            if (result !== false) {
              vfs.set(payload.path, result);
            } else {
              console.warn(`[Materializer] Failed to apply patch for ${payload.path}`);
              // Fallback if the chunk failed? In a strict event-source, we probably keep it or fail.
            }
          } catch (e) {
            console.warn(`[Materializer] Error applying patch to ${payload.path}:`, e);
          }
        }
      } else if (evt.type === 'FILE_DELETED' || evt.type === 'PWA_DELETE') {
         const payload = typeof evt.payload === 'string'
           ? JSON.parse(evt.payload)
           : evt.payload;
         const targetPath = payload.path || payload.target;
         if (targetPath) {
             vfs.delete(targetPath);
         }
      }
    }

    return vfs;
  }

  public async materializeToDisk(vfs: Map<string, string>, targetDir: string): Promise<void> {
    try {
      await fs.promises.stat(targetDir);
    } catch {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    // 1. Physical Overlay: Copy physical project directories (excluding heavy folders)
    // and symlink their physical node_modules so execution has standard dependencies.
    if (this.projects.size > 0) {
      for (const project of this.projects.values()) {
        const sourceProjectDir = path.join(this.baseDir, project.basePath);
        const targetProjectDir = path.join(targetDir, project.basePath);
        
        try {
          await fs.promises.cp(sourceProjectDir, targetProjectDir, {
            recursive: true,
            force: true,
            filter: (src) => {
               const basename = path.basename(src);
               return basename !== 'node_modules' && basename !== '.git' && basename !== '.cr' && basename !== 'dist' && basename !== 'build';
            }
          });

          // Symlink physical node_modules to the sandbox project so we don't have to npm install
          const sourceNodeModules = path.join(sourceProjectDir, 'node_modules');
          const targetNodeModules = path.join(targetProjectDir, 'node_modules');
          
          try {
             const stat = await fs.promises.lstat(sourceNodeModules);
             if (stat.isDirectory() || stat.isSymbolicLink()) {
                await fs.promises.symlink(sourceNodeModules, targetNodeModules, 'dir');
             }
          } catch (e) {
             // Physical node_modules might not exist, ignore
          }
        } catch (e) {
          console.warn(`[Materializer] Failed to overlay physical directory for project ${project.projectId}:`, e);
        }
      }
    }

    // 2. Apply Virtual File System layer on top of physical overlay
    for (const [filePath, content] of vfs.entries()) {
      const fullPath = path.join(targetDir, filePath);
      const dir = path.dirname(fullPath);
      
      try {
        await fs.promises.stat(dir);
      } catch {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      
      await fs.promises.writeFile(fullPath, content, 'utf8');
    }

    // 3. Cross-Project Dependency Synchronization (Local Linking)
    // For every project, if it depends on another materialized project, symlink it to the target workspace
    for (const project of this.projects.values()) {
       if (!project.dependencies || project.dependencies.length === 0) continue;

       for (const depId of project.dependencies) {
         const depProject = this.projects.get(depId);
         if (depProject) {
            const depSourcePath = path.join(targetDir, depProject.basePath);
            const targetNodeModulesPath = path.join(targetDir, project.basePath, 'node_modules', depId);
            
            try {
              await fs.promises.mkdir(path.dirname(targetNodeModulesPath), { recursive: true });
              try { await fs.promises.rm(targetNodeModulesPath, { recursive: true, force: true }); } catch {}
              await fs.promises.symlink(path.resolve(depSourcePath), targetNodeModulesPath, 'dir');
              console.log(`[Materializer] Synthesized cross-project link: ${depId} -> ${project.basePath}`);
            } catch (err) {
              console.warn(`[Materializer] Failed to synthesize cross-project link for ${depId} in ${project.basePath}:`, err);
            }
         }
       }
    }

    // 4. Cross-Language Environment Initialization
    for (const project of this.projects.values()) {
       const targetProjectDir = path.join(targetDir, project.basePath);
       try {
          const files = await fs.promises.readdir(targetProjectDir);
          const hasPythonFiles = files.some(f => f.endsWith('.py'));
          const hasRequirements = files.includes('requirements.txt');
          
          if (hasPythonFiles || hasRequirements) {
             console.log(`[Materializer] Initializing Python venv for ${project.projectId}`);
             try {
                execSync('python3 -m venv venv', { cwd: targetProjectDir, stdio: 'ignore' });
                if (hasRequirements) {
                   console.log(`[Materializer] Installing pip dependencies for ${project.projectId}`);
                   // Prefer venv/bin/pip, fallback to whatever works if it didn't create properly, but venv/bin/pip should exist.
                   execSync('venv/bin/pip install -r requirements.txt', { cwd: targetProjectDir, stdio: 'ignore' });
                }
             } catch (err: any) {
                console.warn(`[Materializer] Failed to initialize Python environment for ${project.projectId}:`, err.message);
             }
          }
       } catch (e) {
          // Directory might not exist or be empty, skip
       }
    }
  }

  /**
   * Helper method to compute state and materialize it in one go.
   */
  public async computeAndMaterialize(events: IEvent[], targetDir: string): Promise<void> {
    const vfs = this.computeVirtualState(events);
    await this.materializeToDisk(vfs, targetDir);
  }

  /**
   * Retrieves the current content of a specific file from the virtual state.
   */
  public async getFileFromMain(filePath: string): Promise<string> {
     // In a real scenario, this gets the baseline file from the main Git branch
     // so we have a starting point before applying AI proposals.
     const fullPath = path.join(this.baseDir, filePath);
     try {
       return await fs.promises.readFile(fullPath, 'utf8');
     } catch (e) {
       return ''; // File doesn't exist yet
     }
  }

  /**
   * Computes the virtual state by starting with a file's content from the main filesystem
   * and applying any session ARTEFACT_PROPOSALs on top of it.
   * This bridges the physical baseline with the ephemeral virtual events.
   */
  public async getVirtualFileContent(filePath: string, sessionEvents: IEvent[]): Promise<string> {
    // 1. Get physical baseline
    const physicalContent = await this.getFileFromMain(filePath);
    
    // 2. Play events on top of it
    // Note: A keyframe would overwrite the physical baseline entirely for that file
    let currentContent = physicalContent;
    
    for (const rawEvt of sessionEvents) {
      let evt: IEvent;
      try {
        evt = validateEventSequence(rawEvt);
      } catch (err) {
        continue;
      }

      if (evt.type === 'ARTEFACT_KEYFRAME') {
        const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
        if (payload.files && typeof payload.files[filePath] !== 'undefined') {
          currentContent = payload.files[filePath];
        }
      } else if (evt.type === 'ARTEFACT_PROPOSAL') {
        const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
        if (payload.path === filePath) {
          if (payload.isFullReplacement) {
            currentContent = payload.patch;
          } else {
            const result = applyPatch(currentContent, payload.patch);
            if (result !== false) {
              currentContent = result;
            }
          }
        }
      } else if (evt.type === 'FILE_DELETED' || evt.type === 'PWA_DELETE') {
        const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
        if ((payload.path || payload.target) === filePath) {
            currentContent = ''; // Truncate content for deleted baseline projections
        }
      }
    }
    
    return currentContent;
  }
}
