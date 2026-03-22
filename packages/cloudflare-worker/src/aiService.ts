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

     const targetAgent = job.targetAgent || 'base';

     // Append system instructions based on persona
     let sysText = "You are Cognitive Resonance, an advanced AI interacting via Telegram. Keep responses highly concise and formatted cleanly in Telegram Markdown without complex UI elements.";
     
     let tools: any[] = [];
     let isAdmin = false;

     if (targetAgent === 'guide') {
         sysText = "You are the @Guide persona, the conceptual educator for Cognitive Resonance. You help users understand the architecture and onboarding process. You MUST use the `queryVectorSearch` tool to search the documentation whenever asked a question. If the document search returns poor results, state that you couldn't find a direct reference, but try to help using your base knowledge.";
         tools.push({
             functionDeclarations: [{
                 name: 'queryVectorSearch',
                 description: 'Search the project documentation for architectural concepts, CLI commands, or troubleshooting steps.',
                 parameters: {
                     type: 'OBJECT',
                     properties: { query: { type: 'STRING', description: 'The semantic search query' } },
                     required: ['query']
                 }
             }]
         });
     } else if (targetAgent === 'operator') {
         // RBAC Check
         if (env.SECRET_SUPER_ADMIN_IDS && env.SECRET_SUPER_ADMIN_IDS.includes(userId)) {
             isAdmin = true;
         }
         sysText = `You are the @Operator persona, the system administration agent. You mutate state. You are currently interacting with ${isAdmin ? 'the Master Admin (unrestricted)' : 'a Standard User (restricted)'}. If asked to perform an action you lack tools for, explain your restrictions.`;
         
         // Standard User Tools
         const opFuncs: any[] = [
             { name: 'getMyUsageStats', description: 'Get the token usage and session count for the current user.' },
             { name: 'rotateMyApiKeys', description: 'Rotate the API keys for the current user.' },
             { name: 'flushMyMemory', description: 'Clear the semantic memory graph for the current active session.' }
         ];

         // Admin Tools
         if (isAdmin) {
             opFuncs.push({ name: 'getGlobalMetrics', description: 'Get platform-wide analytics.' });
             opFuncs.push({ 
                 name: 'revokeUserAccess', 
                 description: 'Revoke an identity to block them at the Edge.',
                 parameters: {
                     type: 'OBJECT',
                     properties: { idToRevoke: { type: 'STRING' } },
                     required: ['idToRevoke']
                 }
             });
         }
         tools.push({ functionDeclarations: opFuncs });
     }

     if (hasGraph && sessionRow.semantic_graph) {
         sysText += "\n\nSTATE OF THE WORLD (Semantic Graph):\n" + sessionRow.semantic_graph;
         sysText += "\n\nYou MUST use this state to answer historical queries. You MUST generate your response as JSON matching the schema.";
     }

     const systemInstruction = { parts: [{ text: sysText }] };

     const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
     const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
     
     // Build request body
     const reqBody: any = {
        contents,
        system_instruction: systemInstruction,
        generationConfig: { temperature: 0.7 }
     };

     if (tools.length > 0 && !hasGraph) {
       // Note: Currently, combining tools and JSON Schema native responseMimeType in Gemini can be fragile.
       // We only inject tools if not in hasGraph structured mode for now.
       reqBody.tools = tools;
     }

     if (hasGraph) {
         reqBody.generationConfig.responseMimeType = "application/json";
         reqBody.generationConfig.responseSchema = {
             type: "OBJECT",
             properties: {
                 replyText: { type: "STRING" },
                 addedNodes: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, label: { type: "STRING" } } } },
                 addedEdges: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, target: { type: "STRING" }, relation: { type: "STRING" } } } }
             },
             required: ["replyText"]
         };
     }

     // Execute Gemini Call Loop (handling Tool Calls if necessary)
     let replyText = "No response generated.";
     let graphMutations: any = null;
     let finalResponseData = null;

     let resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
     if (!resp.ok) throw new Error(`Gemini API Error: ${await resp.text()}`);
     let data = await resp.json() as any;
     
     // Handle Function Calling
     if (data.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
         const call = data.candidates[0].content.parts[0].functionCall;
         let toolResponse = { error: 'Tool execution not fully implemented' };
         
         if (call.name === 'queryVectorSearch' && targetAgent === 'guide') {
             // Execute RAG
             const query = call.args.query;
             const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env.GEMINI_API_KEY}`;
             const embeddingRes = await fetch(embedUrl, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: query }] } })
             });
             const embeddingData = await embeddingRes.json() as any;
             const vector = embeddingData?.embedding?.values?.slice(0, 1536);
             
             let chunks = 'No matching chunks found in Vectorize.';
             
             if (vector && env.VECTORIZE && env.VECTORIZE.query) {
                 const matches = await env.VECTORIZE.query(vector, { topK: 3 });
                 if (matches?.matches && matches.matches.length > 0) {
                     // The actual text payload is stored in metadata.content (which we built in Phase 1)
                     const topMatches = matches.matches.filter((m: any) => m.score > 0.5);
                     if (topMatches.length > 0) {
                        chunks = topMatches.map((m: any, i: number) => `[Doc ${i+1} Score ${m.score.toFixed(2)}] ${m.metadata?.content || ''}`).join('\n\n');
                     }
                 }
             }
             toolResponse = { result: chunks };
         } else if (targetAgent === 'operator') {
             // Execute Operator Action Mocks
             if (call.name === 'revokeUserAccess') {
                 // Real execution: await env.DB.prepare('INSERT INTO revoked_identities (identity) VALUES (?)').bind(call.args.idToRevoke).run();
                 toolResponse = { result: `Success: User ${call.args.idToRevoke} revoked.` };
             } else {
                 toolResponse = { result: `Executed ${call.name} successfully. (Mock)` };
             }
         }

         // Send back the tool response to Gemini
         reqBody.contents.push(data.candidates[0].content); // Append assistant's function call block
         reqBody.contents.push({
             role: 'user',
             parts: [{ functionResponse: { name: call.name, response: toolResponse } }]
         });
         
         resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
         if (!resp.ok) throw new Error(`Gemini API Error on Tool Response: ${await resp.text()}`);
         data = await resp.json() as any;
     }

     replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

     if (hasGraph && targetAgent !== 'guide' && targetAgent !== 'operator') {
         try {
             const parsed = JSON.parse(replyText);
             replyText = parsed.replyText || "JSON parse missing replyText";
             
             if ((parsed.addedNodes && parsed.addedNodes.length > 0) || (parsed.addedEdges && parsed.addedEdges.length > 0)) {
                 const currentGraph = JSON.parse(sessionRow.semantic_graph || '{"semanticNodes":[],"semanticEdges":[]}');
                 if (parsed.addedNodes) currentGraph.semanticNodes.push(...parsed.addedNodes);
                 if (parsed.addedEdges) currentGraph.semanticEdges.push(...parsed.addedEdges);
                 await env.DB.prepare('UPDATE sessions SET semantic_graph = ? WHERE id = ?').bind(JSON.stringify(currentGraph), sessionId).run();
                 graphMutations = { addedNodes: parsed.addedNodes, addedEdges: parsed.addedEdges };
             }
         } catch(e) { console.error("Structured D1 JSON failed parse:", e); }
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
