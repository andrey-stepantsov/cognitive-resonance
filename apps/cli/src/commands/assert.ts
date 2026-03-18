import { Command } from 'commander';
import { readFileSync } from 'fs';
import { DatabaseEngine } from '../db/DatabaseEngine';

export function registerAssertCommand(program: Command) {
  program
    .command('assert <expected-file>')
    .description('Assert materialized state against expectations')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action((expectedFile, options) => {
        const expectedStr = readFileSync(expectedFile, 'utf8');
        const expected = JSON.parse(expectedStr);
        
        const db = new DatabaseEngine(options.db);
        let allPassed = true;

        if (expected.entities) {
          for (const ent of expected.entities) {
              const actual = db.getEntityByName(ent.name) as any;
              if (!actual) {
                  console.error(`Assertion failed: Entity ${ent.name} not found`);
                  allPassed = false;
              } else if (ent.latest_artefact_id && actual.latest_artefact_id !== ent.latest_artefact_id) {
                  console.error(`Assertion failed for ${ent.name}: expected latest_artefact_id ${ent.latest_artefact_id}, got ${actual.latest_artefact_id}`);
                  allPassed = false;
              }
              
              if (ent.expected_content) {
                  const artefact = db.getArtefact(actual.latest_artefact_id) as any;
                  const actualContent = typeof artefact.content === 'string' && artefact.content.startsWith('{') ? JSON.parse(artefact.content) : artefact.content;
                  
                  if (JSON.stringify(actualContent) !== JSON.stringify(ent.expected_content)) { 
                      console.error(`Assertion failed for ${ent.name} content: expected ${JSON.stringify(ent.expected_content)}, got ${JSON.stringify(actualContent)}`);
                      allPassed = false;
                  }
              }
          }
        }
        
        if (expected.users) {
           for (const expUser of expected.users) {
               const actualUser = db.getUserByEmail(expUser.email);
               if (!actualUser) {
                   console.error(`Assertion failed: User ${expUser.email} not found`);
                   allPassed = false;
               } else {
                   if (expUser.nick && actualUser.nick !== expUser.nick) {
                       console.error(`Assertion failed for ${expUser.email}: nick expected ${expUser.nick}, got ${actualUser.nick}`);
                       allPassed = false;
                   }
                   if (expUser.status && actualUser.status !== expUser.status) {
                       console.error(`Assertion failed for ${expUser.email}: status expected ${expUser.status}, got ${actualUser.status}`);
                       allPassed = false;
                   }
               }
           }
        }

        db.close();

        if (!allPassed) {
            console.error('Assertions failed.');
            process.exit(1);
        } else {
            console.log('All assertions passed.');
        }
    });
}
