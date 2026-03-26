import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Materializer } from 'cr-core-contracts';
import type { IEvent } from 'cr-core-contracts';
import { execSync } from 'child_process';

describe('Multi-Repo Materialization Architecture E2E', () => {
    const testWorkspace = path.join(__dirname, 'fixtures', 'multi-repo-test');
    const sandboxDir = path.join(testWorkspace, '.cr', 'sandbox', 'session123');

    beforeAll(() => {
        // Setup a multi-repo fixture with two packages: core and consumer
        // core exposes a function used by consumer
        fs.rmSync(testWorkspace, { recursive: true, force: true });
        
        const coreDir = path.join(testWorkspace, 'packages', 'core');
        const consumerDir = path.join(testWorkspace, 'apps', 'consumer');
        
        fs.mkdirSync(path.join(coreDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(consumerDir, 'src'), { recursive: true });
        
        // 1. Setup Core
        fs.writeFileSync(path.join(coreDir, 'package.json'), JSON.stringify({
            name: "@test/core",
            version: "1.0.0",
            main: "src/index.js"
        }));
        fs.writeFileSync(path.join(coreDir, 'src', 'index.js'), `
            module.exports = {
                greet: () => 'Hello from Core!'
            };
        `);
        
        // 2. Setup Consumer (which depends on @test/core)
        fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({
            name: "@test/consumer",
            version: "1.0.0",
            dependencies: {
                "@test/core": "1.0.0"
            }
        }));
        fs.writeFileSync(path.join(consumerDir, 'src', 'index.js'), `
            const core = require('@test/core');
            console.log(core.greet());
        `);
    });

    afterAll(() => {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
    });

    it('should project multiple repositories and synthesize local symlinks accurately', async () => {
        const materializer = new Materializer(testWorkspace);
        
        // Emulate events from MCP the AI would generate:
        // 1. Project configs telling Materializer about the repository bounds
        // 2. Artefact Proposal modifying the core module behavior
        const events: IEvent[] = [
            {
                session_id: 'session123',
                timestamp: Date.now(),
                actor: 'SYSTEM',
                type: 'PROJECT_CONFIG',
                payload: JSON.stringify({
                    projectId: '@test/core',
                    basePath: 'packages/core',
                    dependencies: []
                }),
                previous_event_id: null
            },
            {
                session_id: 'session123',
                timestamp: Date.now(),
                actor: 'SYSTEM',
                type: 'PROJECT_CONFIG',
                payload: JSON.stringify({
                    projectId: '@test/consumer',
                    basePath: 'apps/consumer',
                    dependencies: ['@test/core']
                }),
                previous_event_id: null
            },
            // Modify core to see if consumer picks it up via the synthesized node_modules link
            {
                session_id: 'session123',
                timestamp: Date.now(),
                actor: 'AI',
                type: 'ARTEFACT_PROPOSAL',
                payload: JSON.stringify({
                    path: 'packages/core/src/index.js',
                    patch: `module.exports = { greet: () => 'Hello from VIRTUAL Core!' };`,
                    isFullReplacement: true
                }),
                previous_event_id: null
            }
        ];

        // Process virtual state and synthesize links
        await materializer.computeAndMaterialize(events, sandboxDir);

        // 1. Validate the virtual state overtook the physical overlay
        const coreContent = fs.readFileSync(path.join(sandboxDir, 'packages/core/src/index.js'), 'utf8');
        expect(coreContent).toContain('VIRTUAL Core');

        // 2. Validate syntactic linking (Node resolve logic)
        // Since we symlinked @test/core in apps/consumer/node_modules,
        // running scripts via node in apps/consumer should resolve the updated code.
        const output = execSync('node src/index.js', { 
            cwd: path.join(sandboxDir, 'apps/consumer'),
            encoding: 'utf8'
        });
        
        expect(output.trim()).toBe('Hello from VIRTUAL Core!');
        
        // 3. Verify the actual symlink exists
        const stat = fs.lstatSync(path.join(sandboxDir, 'apps/consumer/node_modules/@test/core'));
        expect(stat.isSymbolicLink()).toBe(true);
    });
});
