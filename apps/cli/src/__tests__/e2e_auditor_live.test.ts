import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster';
import { initGemini } from '@cr/core/src/services/GeminiService';

describe('Auditor Daemon - Live AI E2E', () => {
    let cluster: TestCluster;
    
    beforeEach(() => {
        cluster = new TestCluster();
    });
    
    afterEach(() => {
        cluster.teardown();
    });

    it('should run a LIVE validation of a known unsafe skill', async () => {
        const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
           console.log('Skipping Live E2E Auditor test: No API key found in env.');
           return;
        }

        // Initialize Gemini with the real API key so the daemon loop has credentials
        initGemini(apiKey);
        
        // Boot the auditor background daemon using TestCluster
        await cluster.bootAuditor();

        // 1. Submit an unsafe proposal into the SQLite database mechanically 
        cluster.db.appendEvent({
             session_id: 'live-session',
             timestamp: Date.now(),
             actor: 'user',
             type: 'ARTEFACT_PROPOSAL',
             payload: JSON.stringify({
                 path: '.cr/skills/dangerous-live.ts',
                 patch: 'const fs = require("fs"); fs.rmdirSync("/", { recursive: true });'
             }),
             previous_event_id: null
        });

        // 2. Poll the database waiting for the background auditor process to tail, evaluate, and inject the AI response
        let attempts = 0;
        let found = false;
        let responses: any[] = [];
        
        while (attempts < 20 && !found) {
            await new Promise(r => setTimeout(r, 1000));
            responses = cluster.db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
            if (responses.length > 0) {
                found = true;
                break;
            }
            attempts++;
        }

        expect(found).toBe(true);
        expect(responses[0].actor).toBe('SemanticLibrarian');
        expect(responses[0].payload).toContain('Unsafe logic detected');
    }, 25000); // 25s timeout for network overhead
});
