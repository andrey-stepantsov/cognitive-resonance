import { Env } from './index';
import { sendTelegramMessage } from './telegramRoutes';

export async function processAiQueueJob(job: any, env: Env) {
  const { sessionId, userId, type } = job;
  if (!env.GEMINI_API_KEY) {
     console.error("Missing GEMINI_API_KEY in worker secrets.");
     return;
  }

  try {
     const sessionRow = await env.DB.prepare('SELECT has_graph, semantic_graph FROM sessions WHERE id = ?').bind(sessionId).first() as any;
     const hasGraph = sessionRow?.has_graph === 1;

     if (type === 'compile_graph') {
         await compileSemanticGraph(sessionId, userId, env);
         return;
     }

     // 1. Fetch conversation history from D1
     // If graph exists, only fetch last 3 messages. Else fetch 50.
     const limit = hasGraph ? 3 : 50;
     const { results } = await env.DB.prepare(
       `SELECT actor, payload FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ${limit}`
     ).bind(sessionId).all();
     
     if (!results || results.length === 0) return;

     // D1 returns DESC, but we need ASC for the prompt
     const orderedResults = [...results].reverse();

     // 2. Format for Gemini Prompt
     const contents = orderedResults.map((row: any) => {
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
     let sysText = "You are Cognitive Resonance, an advanced AI interacting via Telegram. Keep responses highly concise and formatted cleanly in Telegram Markdown without complex UI elements.";
     
     if (hasGraph && sessionRow.semantic_graph) {
         sysText += "\n\nSTATE OF THE WORLD (Semantic Graph):\n" + sessionRow.semantic_graph;
         sysText += "\n\nYou MUST use this state to answer historical queries. You MUST generate your response as JSON matching the schema.";
     }

     const systemInstruction = { parts: [{ text: sysText }] };

     // 3. Call Gemini API
     const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
     const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
     
     const reqBody: any = {
        contents,
        system_instruction: systemInstruction,
        generationConfig: {
           temperature: 0.7
        }
     };

     if (hasGraph) {
         reqBody.generationConfig.responseMimeType = "application/json";
         reqBody.generationConfig.responseSchema = {
             type: "OBJECT",
             properties: {
                 replyText: { type: "STRING", description: "Your conversational response to the user" },
                 addedNodes: {
                     type: "ARRAY",
                     items: {
                         type: "OBJECT",
                         properties: {
                             id: { type: "STRING" },
                             label: { type: "STRING" }
                         }
                     }
                 },
                 addedEdges: {
                     type: "ARRAY",
                     items: {
                         type: "OBJECT",
                         properties: {
                             source: { type: "STRING" },
                             target: { type: "STRING" },
                             relation: { type: "STRING" }
                         }
                     }
                 }
             },
             required: ["replyText"]
         };
     }

     const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
     });

     if (!resp.ok) {
        throw new Error(`Gemini API Error: ${await resp.text()}`);
     }

     const data = await resp.json() as any;
     let replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
     let graphMutations: any = null;

     if (hasGraph) {
         try {
             const parsed = JSON.parse(replyText);
             replyText = parsed.replyText;
             
             // Update the semantic graph in D1
             if ((parsed.addedNodes && parsed.addedNodes.length > 0) || (parsed.addedEdges && parsed.addedEdges.length > 0)) {
                 const currentGraph = JSON.parse(sessionRow.semantic_graph || '{"semanticNodes":[],"semanticEdges":[]}');
                 if (parsed.addedNodes) currentGraph.semanticNodes.push(...parsed.addedNodes);
                 if (parsed.addedEdges) currentGraph.semanticEdges.push(...parsed.addedEdges);
                 await env.DB.prepare('UPDATE sessions SET semantic_graph = ? WHERE id = ?').bind(JSON.stringify(currentGraph), sessionId).run();
                 graphMutations = { addedNodes: parsed.addedNodes, addedEdges: parsed.addedEdges };
             }
         } catch(e) {
             console.error("Failed to parse JSON structured output from Gemini", e);
         }
     }

     // 4. Save the Agent event to D1
     const eventId = crypto.randomUUID();
     const timestamp = Date.now();
     const agentPayload: any = {
        content: replyText,
        role: 'agent',
        internalState: { dissonanceScore: 0 }
     };
     if (graphMutations) {
         agentPayload.internalState.graphMutations = graphMutations;
     }

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

async function compileSemanticGraph(sessionId: string, userId: string, env: Env) {
    const { results } = await env.DB.prepare(
       'SELECT actor, payload FROM events WHERE session_id = ? ORDER BY timestamp ASC'
    ).bind(sessionId).all();
    
    if (!results || results.length === 0) return;

    const contents = results.map((row: any) => {
       let text = '';
       try {
          const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          text = p.content || '';
       } catch(e) { text = row.payload; }
       return { role: row.actor === 'Agent' ? 'model' : 'user', parts: [{ text }] };
    });

    const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const reqBody = {
       contents,
       system_instruction: { parts: [{ text: "Condense this entire conversation into a semantic knowledge graph. Extract key entities and relationships." }] },
       generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
             type: "OBJECT",
             properties: {
                semanticNodes: {
                   type: "ARRAY",
                   items: {
                      type: "OBJECT",
                      properties: {
                         id: { type: "STRING" },
                         label: { type: "STRING" }
                      }
                   }
                },
                semanticEdges: {
                   type: "ARRAY",
                   items: {
                      type: "OBJECT",
                      properties: {
                         source: { type: "STRING" },
                         target: { type: "STRING" },
                         relation: { type: "STRING" }
                      }
                   }
                }
             },
             required: ["semanticNodes", "semanticEdges"]
          }
       }
    };

    const resp = await fetch(url, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(reqBody)
    });

    if (!resp.ok) {
       throw new Error(`Gemini API Error in compile_graph: ${await resp.text()}`);
    }

    const data = await resp.json() as any;
    const graphJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (graphJson) {
        await env.DB.prepare('UPDATE sessions SET has_graph = 1, semantic_graph = ? WHERE id = ?').bind(graphJson, sessionId).run();
        
        // Notify user compilation is done
        const tgRow = await env.DB.prepare('SELECT bot_token FROM telegram_integrations WHERE user_id = ?').bind(userId).first();
        if (tgRow && tgRow.bot_token) {
           const tgId = sessionId.startsWith('tg_chat_') ? sessionId.replace('tg_chat_', '') : null;
           if (tgId) {
              await sendTelegramMessage(tgId, "🧠 *System:* Memory limit reached. Conversation compiled into Semantic Graph. Entering Deep Mode.", tgRow.bot_token as string);
           }
        }
    }
}
