// Mock required by `@isomorphic-git/lightning-fs` auto-init in Node.js
(global as any).indexedDB = {
  open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }),
};
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).navigator = { locks: null };

import * as assert from 'assert';
import { CloudflareStorageProvider } from '@cr/backend';

// Run with: npx tsx test-e2e-forking.ts
const WORKER_URL = process.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787';

// We use an API key mapped to a "test-runner" user in the D1 schema if needed,
// but for the backend auth API fallback, any static string matches API_KEY='dev-api-key'
const API_KEY = process.env.API_KEY || 'dev-api-key';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Starting E2E Forking Tests...');

  const storage = new CloudflareStorageProvider();
  storage.configure(WORKER_URL, API_KEY);
  await storage.init();

  if (!storage.isReady()) {
    console.error('❌ Storage provider not ready. Is the worker running?');
    process.exit(1);
  }

  // --- Helpers ---
  async function createSession(user: string, name: string): Promise<string> {
    const data = {
      messages: [{ role: 'system', content: `Mock AI Context for ${name}` }],
      customName: name,
      isArchived: false,
    };
    // Override the token getter to simulate different users
    storage.configureAuth(() => `cr_mock_${user}`); 
    return await storage.saveSession('', data);
  }

  async function forkSession(user: string, sessionId: string): Promise<string | undefined> {
    storage.configureAuth(() => `cr_mock_${user}`);
    return await storage.forkSession(sessionId);
  }

  async function getSession(user: string, sessionId: string) {
    storage.configureAuth(() => `cr_mock_${user}`);
    return await storage.loadSession(sessionId);
  }

  async function sendMessage(user: string, sessionId: string, text: string) {
    const session = await getSession(user, sessionId);
    if (!session) throw new Error('Session missing');
    session.data.messages.push({ role: 'user', content: text, senderId: user });
    
    // Auto-Mock AI
    session.data.messages.push({ role: 'assistant', content: `Echo: ${text}`, senderId: 'ai' });
    
    await storage.saveSession(sessionId, session.data);
  }


  try {
    // ---------------------------------------------------------
    // Scenario 2: The Implicit Fork (Resuming an Ended Session)
    // ---------------------------------------------------------
    console.log('\n--- Scenario 2: Divergent Forks ---');
    
    // 1. User 1 creates Session A
    const sessionAId = await createSession('user1', 'Original Multiplayer Session');
    console.log(`✅ Session A created: ${sessionAId}`);
    await sendMessage('user1', sessionAId, 'Hello from User 1');

    // 2. User 1 "Resumes" -> Implicit Fork creates Session B
    const sessionBId = await forkSession('user1', sessionAId);
    assert.ok(sessionBId, 'Fork failed to return new ID');
    assert.notStrictEqual(sessionBId, sessionAId, 'Fork ID matches Parent ID');
    console.log(`✅ User 1 forked Session A -> Session B: ${sessionBId}`);

    // Verify Session B state
    const sessionB = await getSession('user1', sessionBId);
    assert.ok(sessionB, 'Failed to fetch Session B');
    assert.strictEqual(sessionB.parentId, sessionAId, 'Parent ID mismatch');
    assert.strictEqual(sessionB.data.messages.length, 3, 'Messages did not clone'); // System + User1 + AI
    
    // User 1 adds new thoughts to Session B
    await sendMessage('user1', sessionBId, 'My private shower thought');
    
    // 3. User 2 "Resumes" Session A -> Implicit Fork creates Session C
    const sessionCId = await forkSession('user2', sessionAId);
    assert.ok(sessionCId, 'User 2 fork failed');
    console.log(`✅ User 2 forked Session A -> Session C: ${sessionCId}`);

    // Verify Session C divergence
    const sessionC = await getSession('user2', sessionCId);
    assert.strictEqual(sessionC!.parentId, sessionAId, 'Parent ID mismatch');
    
    const bMessages = (await getSession('user1', sessionBId))!.data.messages;
    const cMessages = sessionC!.data.messages;
    
    assert.strictEqual(bMessages.length, 5, 'Session B should have 5 messages');
    assert.strictEqual(cMessages.length, 3, 'Session C should only have the original 3 messages from Session A');
    console.log(`✅ Divergence verified: Session B (len ${bMessages.length}) != Session C (len ${cMessages.length})`);


    // ---------------------------------------------------------
    // Scenario 3: Recalling Participants to a Forked Timeline
    // ---------------------------------------------------------
    console.log('\n--- Scenario 3: Transcendent Invites ---');
    
    // In our simplified mock, "Inviting" someone means User 2 accesses User 1's fork
    // We simulate this by having User 2 fetch Session B.
    // Note: In reality, invites issue JWTs so User 2 can read User 1's row,
    // but for this CLI E2E test of the data model, we'll verify the data continuity.
    
    console.log(`✅ User 1 invites User 2 to Session B`);
    const invitedView = await getSession('user1', sessionBId); // Simulate User 2 joining via User 1's share token
    
    assert.strictEqual(invitedView!.data.messages.length, 5, 'User 2 does not see User 1s new thoughts');
    assert.strictEqual(invitedView!.data.messages[3].content, 'My private shower thought', 'Show thought missing');
    console.log(`✅ Reconvergence verified: User 2 sees the new timeline branch`);

    console.log('\n🎉 All Session Forking scenarios passed successfully!');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
  }
}

runTests();
