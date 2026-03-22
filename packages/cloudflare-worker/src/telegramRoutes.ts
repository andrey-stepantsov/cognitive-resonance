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

    if (fromId) {
       const linkRow = await env.DB.prepare('SELECT 1 FROM telegram_links WHERE tg_user_id = ? AND user_id = ?').bind(fromId, ownerId).first();
       if (!linkRow) {
          // Fallback to global ALLOWED_TELEGRAM_USERS if it exists (legacy support)
          let allowed = false;
          if (env.ALLOWED_TELEGRAM_USERS) {
             const allowedIds = env.ALLOWED_TELEGRAM_USERS.split(',').map(s => s.trim());
             if (allowedIds.includes(fromId.toString())) allowed = true;
          }
          if (!allowed) {
             await sendTelegramMessage(chatId, `Unauthorized. Your Telegram ID is \`${fromId}\`. Please ask the administrator to run: \n\n\`cr admin bot link ${ownerId} ${fromId}\``, botToken);
             return new Response('OK', { status: 200 });
          }
       }
    }

    // Accept message and map to Event Graph
    try {
      const userId = ownerId;
      const sessionId = `tg_chat_${chatId}`; // Give them a persistent single session
      
      // -- Slash Commands Interception --
      if (text.startsWith('/')) {
         const cmd = text.split(' ')[0].toLowerCase().trim();
         const args = text.split(' ').slice(1).join(' ').trim();
         
         if (cmd === '/help') {
             const helpMsg = "🤖 *Cognitive Resonance Bot Help*\n\n" +
                 "I am your interface to the Cognitive Resonance network. Speak to me naturally to use the default agent, or route messages to specific agents!\n\n" +
                 "• `@Guide` - Questions about architecture, RAG, and codebase.\n" +
                 "• `@Operator` - System admin (metrics, caching, identity).\n" +
                 "• `@SRE` - Analytics, red-teaming, cost forecasting.\n\n" +
                 "Use `/agents` to list all edge personas, `/multiplayer` for group info, or `/promote <agent>` to set a default for this chat.";
             await sendTelegramMessage(chatId, helpMsg, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/agents') {
             const agentsMsg = "🎭 *Edge Personas*\n\n" +
                 "1. `@Guide`: RAG / Documentation.\n" +
                 "2. `@Operator`: Operations / Admin.\n" +
                 "3. `@SRE`: Red-Teaming / Costs.\n\n" +
                 "_Note: Local personas (@coder, @architect) require the CLI daemon `cr serve` running locally._";
             await sendTelegramMessage(chatId, agentsMsg, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/multiplayer') {
             const mpMsg = "🌍 *Multiplayer Sessions*\n\n" +
                 "Add me to a Telegram group! I will build a shared memory graph. " +
                 "To trigger a response in a group, you *must* explicitly ping an agent (e.g. `@guide what do you think?`). Un-pinged messages are just committed to the memory graph silently.";
             await sendTelegramMessage(chatId, mpMsg, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/memory') {
             const row = await env.DB.prepare('SELECT estimated_tokens FROM sessions WHERE id = ?').bind(sessionId).first();
             const numTokens = row?.estimated_tokens || 0;
             await sendTelegramMessage(chatId, `🧠 *Memory Graph Size*: ~${numTokens} tokens.\n\n(Threshold for deep-compilation is 6,000 tokens)`, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/clear') {
             await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
             await env.DB.prepare('DELETE FROM events WHERE session_id = ?').bind(sessionId).run();
             await sendTelegramMessage(chatId, `🧹 *Memory cleared*. The context graph for this chat has been flushed.`, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/model') {
             if (!args) {
                 await sendTelegramMessage(chatId, `Please specify a model. Example: \`/model gemini-2.5-pro\``, botToken);
                 return new Response('OK', { status: 200 });
             }
             let config = {};
             const row = await env.DB.prepare('SELECT config FROM sessions WHERE id = ?').bind(sessionId).first();
             try { if (row && row.config) config = JSON.parse(row.config as string); } catch(e){}
             config = { ...config, model: args };
             await env.DB.prepare('INSERT INTO sessions (id, timestamp, config, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET config = ?3').bind(
                 sessionId, Date.now(), JSON.stringify(config), ownerId
             ).run();
             await sendTelegramMessage(chatId, `⚙️ Active LLM switched to \`${args}\` for this chat.`, botToken);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/promote') {
             if (!args) {
                 await sendTelegramMessage(chatId, `Please specify an agent to promote. Example: \`/promote operator\``, botToken);
                 return new Response('OK', { status: 200 });
             }
             const target = args.replace('@', '').toLowerCase().trim();
             let config = {};
             const row = await env.DB.prepare('SELECT config FROM sessions WHERE id = ?').bind(sessionId).first();
             try { if (row && row.config) config = JSON.parse(row.config as string); } catch(e){}
             
             if (target === 'none' || target === 'clear') {
                 delete (config as any).defaultAgent;
                 await sendTelegramMessage(chatId, `⚙️ Promoted agent cleared. Reverting to base Agent.`, botToken);
             } else {
                 (config as any).defaultAgent = target;
                 await sendTelegramMessage(chatId, `👑 Promoted \`@${target}\` as the default agent for this chat.`, botToken);
             }
             await env.DB.prepare('INSERT INTO sessions (id, timestamp, config, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET config = ?3').bind(
                 sessionId, Date.now(), JSON.stringify(config), ownerId
             ).run();
             return new Response('OK', { status: 200 });
         }
      }

      const eventId = crypto.randomUUID();
      const timestamp = Date.now();
      
      let isGroupChat = false;
      let textContent = text;
      if (chatId < 0) {
          isGroupChat = true;
          const firstName = update.message.from?.first_name || 'User';
          textContent = `${firstName}: ${text}`;
      }
      
      const payloadObj = {
         content: textContent,
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
      const sessionRow = await env.DB.prepare('SELECT estimated_tokens, has_graph, config FROM sessions WHERE id = ?').bind(sessionId).first();
      let newTotal = tokens;
      let sessionConfig: any = {};
      if (sessionRow) {
          newTotal += (sessionRow.estimated_tokens as number || 0);
          try { if (sessionRow.config) sessionConfig = JSON.parse(sessionRow.config as string); } catch(e){}
          await env.DB.prepare('UPDATE sessions SET estimated_tokens = ? WHERE id = ?').bind(newTotal, sessionId).run();
      } else {
          await env.DB.prepare(
              'INSERT INTO sessions (id, timestamp, estimated_tokens, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET estimated_tokens = estimated_tokens + ?3'
          ).bind(sessionId, timestamp, tokens, userId).run();
      }

      // Dispatch async AI execution
      const defaultAgent = sessionConfig?.defaultAgent;
      let targetAgent = routingIntents[0]?.agent?.toLowerCase() || defaultAgent;
      const isEdgeBoundPersona = targetAgent === 'guide' || targetAgent === 'operator' || targetAgent === 'sre';
      
      // Spam protection: prevent auto-replying to every un-pinged message in a multiplayer group.
      const hasExplicitPing = text.includes('@') || routingIntents.length > 0;
      const shouldTriggerAI = !isGroupChat || hasExplicitPing;
      
      if (shouldTriggerAI && env.AI_QUEUE && (!isDelegatedToLocal || isEdgeBoundPersona)) {
         await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' })
         }).catch(e => logger.error('Failed to send typing indicator', e));

         if (newTotal >= 6000 && (!sessionRow || !sessionRow.has_graph)) {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'compile_graph' });
         } else {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'reply', targetAgent });
         }
      } else if (isDelegatedToLocal && shouldTriggerAI) {
         logger.info(`Delegated to local agent/host: ${JSON.stringify(routingIntents)}. Skipping Edge AI.`);
         await sendTelegramMessage(chatId, `_Dispatched to local @${targetAgent || 'default'} host. Awaiting response..._`, botToken);
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
