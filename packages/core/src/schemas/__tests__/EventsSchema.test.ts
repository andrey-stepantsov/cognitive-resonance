import { describe, it, expect } from 'vitest';
import { validateEventSequence } from '../EventsSchema';

describe('EventsSchema Validation', () => {

  it('validates a correct SESSION_CREATED event', () => {
    const validEvent = {
       session_id: 'test-session',
       timestamp: Date.now(),
       actor: 'system',
       type: 'SESSION_CREATED',
       payload: JSON.stringify({
          config: {
             model: 'gemini-1.5-pro',
             systemPrompt: 'You are an AI'
          }
       }),
       previous_event_id: null
    };

    expect(() => validateEventSequence(validEvent)).not.toThrow();
  });

  it('throws on invalid payload for Event Type', () => {
    const invalidEvent = {
       session_id: 'test-session',
       timestamp: Date.now(),
       actor: 'system',
       type: 'CHAT_MESSAGE',
       payload: JSON.stringify({
          message: {
             // Missing 'role' and 'content' but message is strictly typed
             unknown_field: 'bad'
          }
       }),
       previous_event_id: null
    };

    expect(() => validateEventSequence(invalidEvent)).toThrow(/Validation Error/);
  });

  it('throws on invalid JSON string payload', () => {
    const badJsonEvent = {
       session_id: 'test-session',
       timestamp: Date.now(),
       actor: 'system',
       type: 'SESSION_CREATED',
       payload: 'this is not json',
       previous_event_id: null
    };

    expect(() => validateEventSequence(badJsonEvent)).toThrow(/Invalid JSON/);
  });

  it('accepts valid object payloads (not just strings) gracefully if provided', () => {
    const validObjEvent = {
       session_id: 'test-session',
       timestamp: Date.now(),
       actor: 'system',
       type: 'PWA_RENAME',
       payload: {
          customName: 'New Name'
       },
       previous_event_id: null
    };

    expect(() => validateEventSequence(validObjEvent)).not.toThrow();
  });

  it('validates EXECUTION_REQUESTED', () => {
     const validExec = {
       session_id: 'test-session',
       timestamp: Date.now(),
       actor: 'system',
       type: 'EXECUTION_REQUESTED',
       payload: JSON.stringify({
          target: 'swdev21',
          command: 'ls -la'
       }),
       previous_event_id: null
     };
     expect(() => validateEventSequence(validExec)).not.toThrow();
  });
});
