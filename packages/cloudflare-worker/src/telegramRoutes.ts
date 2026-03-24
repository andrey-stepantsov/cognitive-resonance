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
             await sendTelegramMessage(chatId, helpMsg, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/agents') {
             const agentsMsg = "🎭 *Edge Personas*\n\n" +
                 "1. `@Guide`: RAG / Documentation.\n" +
                 "2. `@Operator`: Operations / Admin.\n" +
                 "3. `@SRE`: Red-Teaming / Costs.\n\n" +
                 "_Note: Local personas (@coder, @architect) require the CLI daemon `cr serve` running locally._";
             await sendTelegramMessage(chatId, agentsMsg, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/multiplayer') {
             const mpMsg = "🌍 *Multiplayer Sessions*\n\n" +
                 "Add me to a Telegram group! I will build a shared memory graph. " +
                 "To trigger a response in a group, you *must* explicitly ping an agent (e.g. `@guide what do you think?`). Un-pinged messages are just committed to the memory graph silently.";
             await sendTelegramMessage(chatId, mpMsg, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/memory') {
             const row = await env.DB.prepare('SELECT estimated_tokens FROM sessions WHERE id = ?').bind(sessionId).first();
             const numTokens = row?.estimated_tokens || 0;
             await sendTelegramMessage(chatId, `🧠 *Memory Graph Size*: ~${numTokens} tokens.\n\n(Threshold for deep-compilation is 6,000 tokens)`, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/clear') {
             await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
             await env.DB.prepare('DELETE FROM events WHERE session_id = ?').bind(sessionId).run();
             await sendTelegramMessage(chatId, `🧹 *Memory cleared*. The context graph for this chat has been flushed.`, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/model') {
             if (!args) {
                 await sendTelegramMessage(chatId, `Please specify a model. Example: \`/model gemini-2.5-pro\``, botToken, env);
                 return new Response('OK', { status: 200 });
             }
             let config = {};
             const row = await env.DB.prepare('SELECT config FROM sessions WHERE id = ?').bind(sessionId).first();
             try { if (row && row.config) config = JSON.parse(row.config as string); } catch(e){}
             config = { ...config, model: args };
             await env.DB.prepare('INSERT INTO sessions (id, timestamp, config, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET config = ?3').bind(
                 sessionId, Date.now(), JSON.stringify(config), ownerId
             ).run();
             await sendTelegramMessage(chatId, `⚙️ Active LLM switched to \`${args}\` for this chat.`, botToken, env);
             return new Response('OK', { status: 200 });
         }
         if (cmd === '/promote') {
             if (!args) {
                 await sendTelegramMessage(chatId, `Please specify an agent to promote. Example: \`/promote operator\``, botToken, env);
                 return new Response('OK', { status: 200 });
             }
             const target = args.replace('@', '').toLowerCase().trim();
             let config = {};
             const row = await env.DB.prepare('SELECT config FROM sessions WHERE id = ?').bind(sessionId).first();
             try { if (row && row.config) config = JSON.parse(row.config as string); } catch(e){}
             
             if (target === 'none' || target === 'clear') {
                 delete (config as any).defaultAgent;
                 await sendTelegramMessage(chatId, `⚙️ Promoted agent cleared. Reverting to base Agent.`, botToken, env);
             } else {
                 (config as any).defaultAgent = target;
                 await sendTelegramMessage(chatId, `👑 Promoted \`@${target}\` as the default agent for this chat.`, botToken, env);
             }
             await env.DB.prepare('INSERT INTO sessions (id, timestamp, config, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET config = ?3').bind(
                 sessionId, Date.now(), JSON.stringify(config), ownerId
             ).run();
             return new Response('OK', { status: 200 });
         }

         if (cmd === '/bind_env') {
             // Create table if not exists
             await env.DB.prepare('CREATE TABLE IF NOT EXISTS telegram_channel_envs (chat_id TEXT PRIMARY KEY, environment_name TEXT, linked_by TEXT)').run();
             
             // Ghost command immediately
             await deleteTelegramMessage(chatId, update.message.message_id, botToken);
             
             if (!args) {
                 const current = await env.DB.prepare('SELECT environment_name FROM telegram_channel_envs WHERE chat_id = ?').bind(chatId.toString()).first();
                 const text = current ? `🎩 Currently wearing hat: \`${current.environment_name}\`` : "🎩 No environment hat is worn. Operating in default global namespace.";
                 await sendTelegramMessage(chatId, text, botToken, env);
                 return new Response('OK', { status: 200 });
             }
             
             if (args === 'none' || args === 'clear') {
                 await env.DB.prepare('DELETE FROM telegram_channel_envs WHERE chat_id = ?').bind(chatId.toString()).run();
                 await sendTelegramMessage(chatId, `🎩 Hat removed. Operating in default global namespace.`, botToken, env);
                 return new Response('OK', { status: 200 });
             }
             
             // Swap hat
             await env.DB.prepare('INSERT INTO telegram_channel_envs (chat_id, environment_name, linked_by) VALUES (?1, ?2, ?3) ON CONFLICT(chat_id) DO UPDATE SET environment_name = ?2').bind(chatId.toString(), args, ownerId).run();
             await sendTelegramMessage(chatId, `🎩 Hat swapped! This chat is now physically routed to environment: \`${args}\``, botToken, env);
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
      
      // --- Hat-Switching Resolution ---
      let targetD1Id: string | null = null;
      try {
         // Gracefully check if the routing table exists and has a mapping
         const hasTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_channel_envs'").first();
         if (hasTable) {
             const mapping = await env.DB.prepare("SELECT environment_name FROM telegram_channel_envs WHERE chat_id = ?").bind(chatId.toString()).first();
             if (mapping && mapping.environment_name) {
                 // Check if environments table exists
                 const envRow = await env.DB.prepare("SELECT metadata FROM environments WHERE name = ?").bind(mapping.environment_name).first();
                 if (envRow) {
                     let meta: any = {};
                     try { meta = JSON.parse(envRow.metadata as string); } catch(e){}
                     if (meta.d1_id) targetD1Id = meta.d1_id;
                 }
             }
         }
      } catch (e) {
         logger.error('Failed to resolve dynamic hat mapping', e);
      }

      const executeDynamicQuery = async (sql: string, params: any[], expected: 'run' | 'first' = 'run') => {
          if (targetD1Id && env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
              const isTest = (env && env.CR_ENV === 'test') || 
                             (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') || 
                             (typeof globalThis !== 'undefined' && ('__vitest_environment__' in globalThis || 'VITEST' in globalThis || '__VITEST_WORKER_ID__' in globalThis));
              if (isTest) {
                  console.warn(`[TEST SECURE-DROP] Simulated D1 HTTP query blocked.`);
                  if (expected === 'first') return null;
                  return { success: true };
              }

              const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${targetD1Id}/query`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sql, params })
              });
              if (!res.ok) throw new Error(`D1 API failed: ${res.statusText}`);
              const data = await res.json() as any;
              if (data.success && data.result && data.result[0]) {
                  if (expected === 'first') return data.result[0].results[0] || null;
                  return data.result[0];
              }
              return null;
          } else {
              // Fallback to static binding
              const stmt = env.DB.prepare(sql).bind(...params);
              if (expected === 'first') return await stmt.first();
              return await stmt.run();
          }
      };

      await executeDynamicQuery(`
         INSERT OR IGNORE INTO events (id, session_id, timestamp, actor, type, payload, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `, [eventId, sessionId, timestamp, 'Human', 'message', JSON.stringify(payloadObj), userId], 'run');
      
      // Multi-Agent Delegation: Check if prompt contains explicit @agent or @@host routing.
      const routingIntents = parseDslRouting(payloadObj.content);
      const isDelegatedToLocal = routingIntents.some(intent => intent.agent !== null || intent.host !== null);

      // Token tracking and threshold
      const tokens = Math.ceil(payloadObj.content.length / 4);
      const sessionRow: any = await executeDynamicQuery('SELECT estimated_tokens, has_graph, config FROM sessions WHERE id = ?', [sessionId], 'first');
      
      let newTotal = tokens;
      let sessionConfig: any = {};
      
      if (sessionRow) {
          newTotal += (sessionRow.estimated_tokens as number || 0);
          try { if (sessionRow.config) sessionConfig = JSON.parse(sessionRow.config); } catch(e){}
          await executeDynamicQuery('UPDATE sessions SET estimated_tokens = ? WHERE id = ?', [newTotal, sessionId], 'run');
      } else {
          await executeDynamicQuery(
              'INSERT INTO sessions (id, timestamp, estimated_tokens, user_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET estimated_tokens = estimated_tokens + ?3',
              [sessionId, timestamp, tokens, userId], 'run'
          );
      }

      // Dispatch async AI execution
      const defaultAgent = sessionConfig?.defaultAgent;
      let targetAgent = routingIntents[0]?.agent?.toLowerCase() || defaultAgent;
      const isEdgeBoundPersona = targetAgent === 'guide' || targetAgent === 'operator' || targetAgent === 'sre';
      
      // Spam protection: prevent auto-replying to every un-pinged message in a multiplayer group.
      const hasExplicitPing = text.includes('@') || routingIntents.length > 0;
      const shouldTriggerAI = !isGroupChat || hasExplicitPing;
      
      if (shouldTriggerAI && env.AI_QUEUE && (!isDelegatedToLocal || isEdgeBoundPersona)) {
         await telegramFetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' })
         }, env).catch(e => logger.error('Failed to send typing indicator', e));

         if (newTotal >= 6000 && (!sessionRow || !sessionRow.has_graph)) {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'compile_graph' });
         } else {
             await env.AI_QUEUE.send({ sessionId, userId, type: 'reply', targetAgent });
         }
      } else if (isDelegatedToLocal && shouldTriggerAI) {
         logger.info(`Delegated to local agent/host: ${JSON.stringify(routingIntents)}. Skipping Edge AI.`);
         await sendTelegramMessage(chatId, `_Dispatched to local @${targetAgent || 'default'} host. Awaiting response..._`, botToken, env);
      }

    } catch (err: any) {
      logger.error('Failed to process telegram update', err);
    }
  }

  // Always return 200 OK so Telegram stops retrying
  return new Response('OK', { status: 200 });
}

export async function telegramFetch(url: string, params: RequestInit, env?: Env): Promise<Response> {
    const isTest = (env && env.CR_ENV === 'test') || 
                   (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') || 
                   (typeof globalThis !== 'undefined' && ('__vitest_environment__' in globalThis || 'VITEST' in globalThis || '__VITEST_WORKER_ID__' in globalThis));

    // Prevent firewall hits in local E2E test environments
    if (isTest) {
        // Hitting `fetch` here so that vitest's global.fetch mock can intercept the call.
        // If not mocked, it hits network but with fake tokens.
        const isMocked = (typeof globalThis !== 'undefined' && (globalThis as any).fetch && typeof (globalThis as any).fetch.mock !== 'undefined') || 
                         (typeof global !== 'undefined' && (global as any).fetch && typeof (global as any).fetch.mock !== 'undefined');
        if (isMocked) {
             return fetch(url, params);
        }
        console.warn(`[TEST SECURE-DROP] Simulated Telegram API call to prevent outbound leaking: ${url}`);
        return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (env && env.CR_ENV === 'local') {
        if (!env.PROD_WORKER_URL) {
            console.error("❌ [FIREWALL BLOCK] Local outbound Telegram request denied. Please set PROD_WORKER_URL in .dev.vars to proxy through Cloudflare Edge!");
            return new Response('{"ok":false, "error":"Blocked by local firewall"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return fetch(`${env.PROD_WORKER_URL}/api/admin/telegram-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.PROD_API_KEY || env.API_KEY || ''}`
            },
            body: JSON.stringify({
                url,
                method: params.method,
                headers: params.headers,
                payload: params.body ? JSON.parse(params.body as string) : undefined
            })
        });
    }
    
    // Remote environments simply hit the actual endpoint
    return fetch(url, params);
}

export async function sendTelegramMessage(chatId: string | number, text: string, botToken?: string, env?: Env) {
  if (!botToken) return;
  let finalText = text;
  if (env && env.CR_ENV === 'staging') {
      finalText = `[DEV 🧪]\n${text}`;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
     const resp = await telegramFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           chat_id: chatId,
           text: finalText,
           parse_mode: 'Markdown'
        })
     }, env);
     if (!resp.ok) {
        console.error("Telegram send failed: " + await resp.text());
     }
  } catch (err) {
     console.error("Telegram exact send error", err);
  }
}

export async function deleteTelegramMessage(chatId: string | number, messageId: number, botToken?: string, env?: Env) {
   if (!botToken) return;
   const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
   try {
      const resp = await telegramFetch(url, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ chat_id: chatId, message_id: messageId })
      }, env);
      if (!resp.ok) {
         console.error("Telegram delete failed: " + await resp.text());
      }
   } catch (err) {
      console.error("Telegram exact delete error", err);
   }
}
