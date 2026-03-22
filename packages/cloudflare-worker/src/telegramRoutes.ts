import { Env, jsonResponse, corsResponse } from './index';
import { checkRateLimit } from './index';
import { parseDslRouting } from '@cr/core/src/services/CommandParser';
import { getEdgeLogger } from './logger';

export async function handleTelegramWebhook(request: Request, env: Env, ownerId: string, botToken: string): Promise<Response> {
  const logger = getEdgeLogger(request);
  
  if (request.method !== 'POST') {
    return corsResponse('Method Not Allowed', 405);
  }

  let update: any;
  try {
    update = await request.json();
  } catch (e) {
    return corsResponse('Invalid JSON', 400);
  }

  // Telegram expects a 200 OK immediately, otherwise it will infinitely retry.
  // We process the message synchronously here because Workers allow up to 30ms CPU time and we are just writing to D1.
  // But if we generated the AI response here, we'd hit timeout limits. So we just insert the event, and a background daemon will answer it (or we trigger it here if fast). 
  // Wait, the prompt says "The Worker pushes events directly to the Telegram API whenever a new AI event targeting that user is appended". 
  // For the MVP, if the local daemon isn't pulling and answering, how do we trigger the AI?
  // Our system relies on the `cr serve` daemon running locally, picking up the un-acked Human prompt event from D1, generating the AI completion, and writing it back to D1.
  // So the webhooks ONLY job is to ingest the Telegram message into D1. But wait... the Telegram bot also needs to SEND the response back.
  // We can write a route that `cr serve` hits when it generates a response, OR we can just have the webhook trigger the AI directly if the AI is edge-bound.
  // Cognitive Resonance uses local LLMs or Gemini on the edge... actually the `GeminiService.ts` is usually run by the local `cr serve` daemon in this architecture.
  // Wait, let's look at `ARCHITECTURE.md`. It says:
  // "The Cloudflare Worker pushes events directly to the Telegram API (sendMessage) whenever a new event targeting that user is appended to the log."
  // Wait, if D1 gets an AI event, how does the Worker know? Workers cannot "listen" to D1 changes. 
  // The local `cr serve` daemon chunks events to `/api/events/batch`. 
  // So we can intercept the inbound `/api/events/batch` POST. If it contains an event from "Agent", we can check if it belongs to a Telegram user, and fire `sendMessage`.
  
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const fromId = update.message.from?.id;
    const text = update.message.text;

    // Validate whitelist
    if (env.ALLOWED_TELEGRAM_USERS) {
       const allowedIds = env.ALLOWED_TELEGRAM_USERS.split(',').map(s => s.trim());
       if (!allowedIds.includes(fromId?.toString())) {
          await sendTelegramMessage(chatId, "Unauthorized. Please use the /link command from the CLI/PWA to link your identity.", botToken);
          return new Response('OK', { status: 200 });
       }
    }

    // Accept message and map to Event Graph
    try {
      // In BYOB, the core Event stream is locked to the owner's CR User ID
      // We partition chat threads via the session ID
      const userId = ownerId;
      const sessionId = `tg_chat_${chatId}`; // Give them a persistent single session
      
      const eventId = crypto.randomUUID();
      const timestamp = Date.now();
      
      const payloadObj = {
         content: text,
         role: 'user',
      };
      
      await env.DB.prepare(`
         INSERT OR IGNORE INTO events (id, session_id, timestamp, actor, type, payload, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(
         eventId, sessionId, timestamp, 'Human', 'message', JSON.stringify(payloadObj), userId
      ).run();
      
      // Multi-Agent Delegation: Check if prompt contains explicit @agent or @@host routing.
      const routingIntents = parseDslRouting(payloadObj.content);
      const isDelegatedToLocal = routingIntents.some(intent => intent.agent !== null || intent.host !== null);

      // Token tracking and threshold
      const tokens = Math.ceil(payloadObj.content.length / 4);
      const sessionRow = await env.DB.prepare('SELECT estimated_tokens, has_graph FROM sessions WHERE id = ?').bind(sessionId).first();
      let newTotal = tokens;
      if (sessionRow) {
          newTotal += (sessionRow.estimated_tokens as number || 0);
          await env.DB.prepare('UPDATE sessions SET estimated_tokens = ? WHERE id = ?').bind(newTotal, sessionId).run();
      } else {
          await env.DB.prepare(
              'INSERT INTO sessions (id, timestamp, estimated_tokens, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET estimated_tokens = estimated_tokens + ?3'
          ).bind(sessionId, timestamp, tokens, userId).run();
      }

      // Dispatch async AI execution ONLY if no other agent is mentioned
      if (env.AI_QUEUE && !isDelegatedToLocal) {
         if (newTotal >= 6000 && (!sessionRow || !sessionRow.has_graph)) {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'compile_graph' });
         } else {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'reply' });
         }
      } else if (isDelegatedToLocal) {
         logger.info(`Delegated to local agent/host: ${JSON.stringify(routingIntents)}. Skipping Edge AI.`);
      }

    } catch (err: any) {
      logger.error('Failed to process telegram update', err);
    }
  }

  // Always return 200 OK so Telegram stops retrying
  return new Response('OK', { status: 200 });
}

export async function sendTelegramMessage(chatId: string | number, text: string, botToken?: string) {
  if (!botToken) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
     const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           chat_id: chatId,
           text: text,
           parse_mode: 'Markdown'
        })
     });
     if (!resp.ok) {
        console.error("Telegram send failed: " + await resp.text());
     }
  } catch (err) {
     console.error("Telegram exact send error", err);
  }
}
