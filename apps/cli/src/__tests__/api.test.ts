import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveWorkspaceRoot } from '../utils/api.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        existsSync: vi.fn(actual.existsSync),
        statSync: vi.fn(actual.statSync),
        realpathSync: vi.fn(actual.realpathSync)
    };
});

describe('Workspace Context Crawler (resolveWorkspaceRoot)', () => {
    const mockHomedir = os.homedir();
    
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falls back to the global os.homedir .cr directory if no local workspace exists anywhere', () => {
        // Mock that NO directories exist
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const resolved = resolveWorkspaceRoot('/tmp/false/cwd', undefined, undefined, '/tmp/false/dirname');
        expect(resolved).toBe(path.join(mockHomedir, '.cr'));
    });

    it('prioritizes process.cwd() perfectly if the user launches from within a local workspace', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: any) => {
            if (p === '/var/local/project/.cr') return true;
            return false;
        });
        vi.mocked(fs.statSync).mockImplementation((p: any) => ({ isDirectory: () => true }) as any);

        const resolved = resolveWorkspaceRoot('/var/local/project/deep/nested', undefined, undefined, '/tmp/dirname');
        expect(resolved).toBe('/var/local/project/.cr');
    });

    it('successfully climbs process.argv[1] if the explicit shell alias strips __dirname locally', () => {
        // Assume cwd holds no workspace
        vi.mocked(fs.existsSync).mockImplementation((p: any) => {
            if (p === '/dev/cognitive-resonance/.cr') return true;
            if (p === '/dev/cognitive-resonance/apps/cli/bin/cr.js') return true;
            return false;
        });
        vi.mocked(fs.statSync).mockImplementation((p: any) => ({ isDirectory: () => true }) as any);
        vi.mocked(fs.realpathSync).mockImplementation((p: any) => p);

        // argv1 is injected pointing safely to bin/cr.js
        const resolved = resolveWorkspaceRoot(
            '/tmp/random/no-workspace', 
            undefined, 
            '/dev/cognitive-resonance/apps/cli/bin/cr.js', 
            '/tmp/broken/__dirname'
        );
        expect(resolved).toBe('/dev/cognitive-resonance/.cr');
    });

    it('bypasses transpiler alias wrappers globally using require.main.filename fallback tracing', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: any) => {
            if (p === '/dev/cognitive-resonance/.cr') return true;
            // The true source index.ts exists!
            if (p === '/dev/cognitive-resonance/apps/cli/src/index.ts') return true;
            return false;
        });
        vi.mocked(fs.statSync).mockImplementation((p: any) => ({ isDirectory: () => true }) as any);
        vi.mocked(fs.realpathSync).mockImplementation((p: any) => p);

        // Even though argv1 points to a random 3rd party wrapper `npx tsx`, require.main escapes it!
        const resolved = resolveWorkspaceRoot(
            '/tmp/random/no-workspace', 
            '/dev/cognitive-resonance/apps/cli/src/index.ts', // mainFilename string
            '/Users/stepants/.npm/tsx/cli.js', // fake process.argv wrapper
            '/tmp/broken/__dirname' 
        );
        expect(resolved).toBe('/dev/cognitive-resonance/.cr');
    });
});
