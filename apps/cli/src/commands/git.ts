import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine';
import crypto from 'crypto';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { memfs } from 'memfs';
import * as path from 'path';

export function registerGitCommands(program: Command) {
  program
    .command('git-clone <url>')
    .description('Clone a git repository into the DB as a Composite Artefact')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action(async (url, options, command) => {
      const globalOpts = command.parent?.opts() || {};
      const dbPath = (options.db && options.db !== 'test.sqlite') ? options.db : (globalOpts.db && globalOpts.db !== 'cr.sqlite' ? globalOpts.db : 'test.sqlite');
      console.log(`Cloning ${url}... DB Path: ${dbPath}`);
      const db = new DatabaseEngine(dbPath);
      const sessionId = db.createSession('SYSTEM');
      
      const eventId = db.appendEvent({
        session_id: sessionId,
        timestamp: Date.now(),
        actor: 'SYSTEM',
        type: 'GIT_CLONED',
        payload: JSON.stringify({ url }),
        previous_event_id: null
      });

      const { fs, vol } = memfs();
      const dir = '/repo';
      fs.mkdirSync(dir);

      await git.clone({ fs: fs as any, http, dir, url, singleBranch: true, depth: 1 });
      
      console.log(`Resolving submodules...`);
      if (fs.existsSync(path.posix.join(dir, '.gitmodules'))) {
          const gitmodules = fs.readFileSync(path.posix.join(dir, '.gitmodules'), 'utf8') as string;
          const blocks = gitmodules.split('[submodule').slice(1);
          for (const block of blocks) {
             const pathMatch = block.match(/path\s*=\s*(.+)/);
             const urlMatch = block.match(/url\s*=\s*(.+)/);
             if (pathMatch && urlMatch) {
                 const subPath = pathMatch[1].trim();
                 const subUrl = urlMatch[1].trim();
                 console.log(`Cloning submodule ${subPath} from ${subUrl}...`);
                 const fullSubPath = path.posix.join(dir, subPath);
                 if (!fs.existsSync(fullSubPath)) {
                     fs.mkdirSync(fullSubPath, { recursive: true });
                 }
                 await git.clone({ fs: fs as any, http, dir: fullSubPath, url: subUrl, singleBranch: true, depth: 1 });
             }
          }
      }

      console.log(`Materializing code artefacts...`);
      const tree: Record<string, string> = {}; // path -> artefactId
      
      function walkDir(currentPath: string) {
          const files = fs.readdirSync(currentPath) as string[];
          for (const file of files) {
              const fullPath = path.posix.join(currentPath, file);
              if (file === '.git') continue; 
              
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                  walkDir(fullPath);
              } else {
                  try {
                      // Attempt to read as utf8 text
                      const contentBytes = fs.readFileSync(fullPath);
                      // isomorphic-git clone might produce mostly valid UTF8. For safety we just read 'utf8'.
                      const content = fs.readFileSync(fullPath, 'utf8') as string;
                      const relPath = path.posix.relative(dir, fullPath);
                      const artId = db.createArtefact(sessionId, eventId, 'CODE', content, 1);
                      tree[relPath] = artId;
                  } catch (err: any) {
                      console.log(`Skipping binary or unreadable file ${fullPath}`);
                  }
              }
          }
      }
      
      walkDir(dir);
      
      const compositeId = db.createArtefact(sessionId, eventId, 'COMPOSITE', JSON.stringify(tree), 1);
      const entityId = db.promoteEntity(url, compositeId);
      
      db.close();
      console.log(`✨ Successfully cloned into Entity '${url}'`);
      console.log(`Canonical Entity ID: ${entityId}`);
      console.log(`Composite Artefact ID: ${compositeId}`);
    });

  program
    .command('git-push <entityName> <url>')
    .description('Push a materialized Entity back to a target git url')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action(async (entityName, url, options, command) => {
      const globalOpts = command.parent?.opts() || {};
      const dbPath = (options.db && options.db !== 'test.sqlite') ? options.db : (globalOpts.db && globalOpts.db !== 'cr.sqlite' ? globalOpts.db : 'test.sqlite');
      console.log(`Pushing entity '${entityName}' to ${url}... DB Path: ${dbPath}`);
      const db = new DatabaseEngine(dbPath);
      
      const entity = db.getEntityByName(entityName) as any;
      if (!entity) {
          console.error(`Entity '${entityName}' not found`);
          process.exit(1);
      }
      
      const compositeArt = db.getArtefact(entity.latest_artefact_id) as any;
      if (!compositeArt || compositeArt.type !== 'COMPOSITE') {
          console.error(`Latest artefact for entity is not a valid COMPOSITE`);
          process.exit(1);
      }
      
      const tree = JSON.parse(compositeArt.content);
      const { fs, vol } = memfs();
      const dir = '/repo';
      fs.mkdirSync(dir);
      
      await git.init({ fs: fs as any, dir, defaultBranch: 'main' });
      
      // We must add .git/config manually if we are using the remote URL directly, 
      // or we can add remote using git.addRemote.
      await git.addRemote({
        fs: fs as any,
        dir,
        remote: 'origin',
        url
      });

      console.log(`Applying files from DB to memory fs...`);
      for (const [relPath, artId] of Object.entries(tree)) {
          const fileArt = db.getArtefact(artId as string) as any;
          if (fileArt) {
              const fullPath = path.posix.join(dir, relPath);
              fs.mkdirSync(path.posix.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, fileArt.content, { encoding: 'utf8' });
              await git.add({ fs: fs as any, dir, filepath: relPath });
          }
      }
      
      const sha = await git.commit({
          fs: fs as any,
          dir,
          author: {
              name: 'Cognitive Resonance',
              email: 'bot@cognitiveresonance.ai',
          },
          message: 'Materialized commit from Event-Sourced Backend'
      });
      
      console.log(`Committed locally as ${sha}. Pushing...`);
      
      try {
          const pushResult = await git.push({
              fs: fs as any,
              http,
              dir,
              remote: 'origin',
              ref: 'main',
              onAuth: () => ({ username: process.env.GIT_USERNAME, password: process.env.GIT_PASSWORD })
          });
          console.log(`✨ Successfully pushed entity '${entityName}'`);
          if (pushResult && pushResult.error) {
              console.warn(`Push returned with warnings/errors:`, pushResult.error);
          }
      } catch (err: any) {
          console.error(`Push failed: ${err.message}`);
      }
      
      db.close();
    });
}
