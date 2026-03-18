import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { initGemini, generateResponse } from '@cr/core/src/services/GeminiService';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load env from root so we get the Gemini API Key
dotenv.config({ path: join(__dirname, '../../../../.env') });

describe('Local E2E Scenario: User -> Session -> AI Chat', () => {
    let db: DatabaseEngine;
    
    beforeAll(() => {
        db = new DatabaseEngine(':memory:'); // Use isolated in-memory DB
        
        // initialize gemini if key exists
        const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (apiKey) {
            initGemini(apiKey);
        } else {
            console.warn("⚠️ No Gemini API Key found in env. Test will mock the AI response.");
        }
    });

    afterAll(() => {
        db.close();
    });

    it('creates a user, session, and chats with AI', async () => {
        // 1. Create a User Record
        const userId = 'user-123';
        db.upsertUser({
            id: userId,
            email: 'test@example.com',
            nick: 'Test User',
            password_hash: 'hashedpassword',
            status: 'active'
        });

        const user = db.getUserByEmail('test@example.com');
        expect(user).toBeDefined();
        expect(user?.nick).toBe('Test User');
        expect(user?.id).toBe(userId);

        // 2. Start a Session Owned by the User
        const sessionId = db.createSession(userId, 'session-abc');
        expect(sessionId).toBe('session-abc');

        // 3. User Chats with AI
        const chatInput = "Hello AI! Please reply with a short 1-sentence greeting for the user 'Test User'. What is 2+2?";

        // Record User Prompt to Event Stream
        const promptEventId = db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: userId,
            type: 'USER_PROMPT',
            payload: JSON.stringify({ text: chatInput }),
            previous_event_id: null
        });

        let replyText = "I am a mock response because the Gemini API key was missing. 2+2 is 4.";
        let dissonance = 10;

        // Call AI if key is present
        if (process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) {
            const history = [{ role: 'user', content: chatInput }];
            const schema = {
              type: 'OBJECT',
              properties: { 
                  reply: { type: 'STRING' }, 
                  dissonanceScore: { type: 'INTEGER' } 
              },
              required: ['reply', 'dissonanceScore']
            };
            try {
               const responsePayload = await generateResponse('gemini-2.5-flash', history, 'You are a helpful assistant.', schema, undefined, false);
               replyText = responsePayload.reply;
               dissonance = responsePayload.dissonanceScore;
            } catch (err: any) {
               console.warn("Gemini API call failed, using mock. Error:", err.message);
            }
        }

        // Record AI Response to Event Stream
        const responseEventId = db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: 'gemini-2.5-flash',
            type: 'AI_RESPONSE',
            payload: JSON.stringify({ text: replyText, dissonance }),
            previous_event_id: promptEventId
        });

        // 4. Verify the Event Stream
        const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]);
        expect(events.length).toBe(2);
        
        expect(events[0].actor).toBe(userId);
        expect(events[0].type).toBe('USER_PROMPT');
        
        expect(events[1].actor).toBe('gemini-2.5-flash');
        expect(events[1].type).toBe('AI_RESPONSE');
        
        const payload = JSON.parse(events[1].payload);
        expect(payload.text).toBeDefined();
        
        console.log(`\n--- E2E Flow Success! ---`);
        console.log(`User  : ${chatInput}`);
        console.log(`Agent : ${payload.text}`);
        console.log(`-------------------------\n`);
    });
});
