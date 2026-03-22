import { Env } from './index';
import { sendTelegramMessage } from './telegramRoutes';

export async function processAiQueueJob(job: any, env: Env) {
  const { sessionId, userId } = job;
  if (!env.GEMINI_API_KEY) {
     console.error("Missing GEMINI_API_KEY in worker secrets.");
     return;
  }

  try {
     // 1. Fetch conversation history from D1
     const { results } = await env.DB.prepare(
       'SELECT actor, payload FROM events WHERE session_id = ? ORDER BY timestamp ASC LIMIT 50'
     ).bind(sessionId).all();
     
     if (!results || results.length === 0) return;

     // 2. Format for Gemini Prompt
     const contents = results.map((row: any) => {
        let text = '';
        try {
           const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
           text = p.content || '';
        } catch(e) { text = row.payload; }

        return {
           role: row.actor === 'Agent' ? 'model' : 'user',
           parts: [{ text }]
        };
     });

     // Append system instructions
     const systemInstruction = {
        parts: [{ text: "You are Cognitive Resonance, an advanced AI interacting via Telegram. Keep responses highly concise and formatted cleanly in Telegram Markdown without complex UI elements." }]
     };

     // 3. Call Gemini API
     const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
     const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
     const resp = await fetch(url, {
        method: 'POST',
        headers: {
           'Content-Type': 'application/json'
        },
        body: JSON.stringify({
           contents,
           system_instruction: systemInstruction,
           generationConfig: {
              temperature: 0.7
           }
        })
     });

     if (!resp.ok) {
        throw new Error(`Gemini API Error: ${await resp.text()}`);
     }

     const data = await resp.json() as any;
     const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

     // 4. Save the Agent event to D1
     const eventId = crypto.randomUUID();
     const timestamp = Date.now();
     const agentPayload = {
        content: replyText,
        role: 'agent',
        internalState: { dissonanceScore: 0 } // Optional dissonance for MVP
     };

     await env.DB.prepare(`
        INSERT INTO events (id, session_id, timestamp, actor, type, payload, user_id)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     `).bind(
        eventId, sessionId, timestamp, 'Agent', 'message', JSON.stringify(agentPayload), userId
     ).run();

     // 5. Send Telegram Message back to user
     const tgRow = await env.DB.prepare('SELECT bot_token FROM telegram_integrations WHERE user_id = ?').bind(userId).first();
     if (tgRow && tgRow.bot_token) {
        const tgId = sessionId.startsWith('tg_chat_') ? sessionId.replace('tg_chat_', '') : null;
        if (tgId) {
           await sendTelegramMessage(tgId, replyText, tgRow.bot_token as string);
        }
     }

  } catch (err: any) {
     console.error("Error processing AI Job:", err);
     const tgRow = await env.DB.prepare('SELECT bot_token FROM telegram_integrations WHERE user_id = ?').bind(userId).first();
     if (tgRow && tgRow.bot_token) {
        const tgId = sessionId.startsWith('tg_chat_') ? sessionId.replace('tg_chat_', '') : null;
        if (tgId) {
           await sendTelegramMessage(tgId, `[⚠️ Edge AI Error: ${err.message}]`, tgRow.bot_token as string);
        }
     }
  }
}
