import { Env } from './index';

export async function forecastInferenceCosts(env: Env): Promise<any> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = await env.DB.prepare(
        'SELECT SUM(estimated_tokens) as total_tokens FROM sessions WHERE timestamp >= ?'
    ).bind(thirtyDaysAgo).first();
    
    const totalTokens = (result?.total_tokens as number) || 0;
    const cost = (totalTokens * 0.000075).toFixed(4); // approx cost
    
    return {
        trailing_30_days_tokens: totalTokens,
        forecasted_cost_usd: parseFloat(cost)
    };
}

export async function detectAbusePatterns(env: Env): Promise<any> {
    try {
        const { results } = await env.DB.prepare(
            `SELECT ip_address, count(*) as error_count 
             FROM bot_logs 
             WHERE status_code IN (401, 429) AND timestamp >= ? 
             GROUP BY ip_address 
             HAVING error_count > 10 
             ORDER BY error_count DESC LIMIT 5`
        ).bind(Date.now() - 24 * 60 * 60 * 1000).all();
        return { flagged_ips: results };
    } catch (e: any) {
        if (e.message.includes('no such table')) {
             return { error: 'bot_logs table not found', flagged_ips: [] };
        }
        throw e;
    }
}

export async function auditZombieKeys(env: Env): Promise<any> {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const { results } = await env.DB.prepare(
        'SELECT user_id, last_used_at FROM api_keys WHERE last_used_at < ? OR last_used_at IS NULL LIMIT 20'
    ).bind(ninetyDaysAgo).all();
    
    return { zombie_keys: results };
}

export async function evaluateAgentAccuracy(env: Env, agentId: string): Promise<any> {
    const recentEvents = await env.DB.prepare(
        `SELECT id, session_id, timestamp, actor, payload FROM events ORDER BY timestamp DESC LIMIT 50`
    ).all();

    let guideEvent = null;
    let userEvent = null;
    
    if (recentEvents && recentEvents.results) {
        for (let i = 0; i < recentEvents.results.length; i++) {
            if (recentEvents.results[i].actor === 'Guide') {
                guideEvent = recentEvents.results[i];
                for (let j = i + 1; j < recentEvents.results.length; j++) {
                    if (recentEvents.results[j].actor === 'Human' && recentEvents.results[j].session_id === guideEvent.session_id) {
                        userEvent = recentEvents.results[j];
                        break;
                    }
                }
                break;
            }
        }
    }

    if (!guideEvent || !userEvent) {
        return { error: 'Could not pair a Guide response with a User prompt for evaluation' };
    }

    let userPromptText = '';
    try { userPromptText = typeof userEvent.payload === 'string' ? JSON.parse(userEvent.payload).content : (userEvent.payload as any).content; } catch(e) {}
    
    let guideResponseText = '';
    try { guideResponseText = typeof guideEvent.payload === 'string' ? JSON.parse(guideEvent.payload).content : (guideEvent.payload as any).content; } catch(e) {}

    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env.GEMINI_API_KEY}`;
    const embeddingRes = await fetch(embedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: userPromptText }] } })
    });
    const embeddingData = await embeddingRes.json() as any;
    const vector = embeddingData?.embedding?.values?.slice(0, 1536);
    
    let factualChunks = 'No chunks found.';
    if (vector && env.VECTORIZE && env.VECTORIZE.query) {
        const matches = await env.VECTORIZE.query(vector, { topK: 3 });
        if (matches?.matches && matches.matches.length > 0) {
            const topMatches = matches.matches.filter((m: any) => m.score > 0.5);
            if (topMatches.length > 0) {
                factualChunks = topMatches.map((m: any, i: number) => `[Doc ${i+1}] ${m.metadata?.content || ''}`).join('\n\n');
            }
        }
    }

    const prompt = `
You are the @SRE persona, performing AI Quality Assurance (Red Teaming).
Compare the Agent's response to the Factual Payload regarding the User's prompt. 
Provide a dissonance_score (0-100, where 0 is perfectly accurate and aligned, and 100 is completely disjointed/hallucinated).

User Prompt:
${userPromptText}

Factual Payload (RAG):
${factualChunks}

Agent's actual response:
${guideResponseText}
`;

    const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const llmUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
    const llmResp = await fetch(llmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        dissonance_score: { type: "INTEGER" },
                        reason: { type: "STRING" }
                    },
                    required: ["dissonance_score", "reason"]
                }
            }
        })
    });

    if (!llmResp.ok) {
        return { error: 'Failed to query LLM for evaluation' };
    }

    const llmData = await llmResp.json() as any;
    let evaluation = null;
    try {
        evaluation = JSON.parse(llmData.candidates[0].content.parts[0].text);
    } catch(e) {
        return { error: 'Failed to parse evaluation response' };
    }

    return {
        evaluated_session: guideEvent.session_id,
        user_prompt: userPromptText,
        evaluation
    };
}
