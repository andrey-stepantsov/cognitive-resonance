/**
 * GeminiService — Direct browser-side calls to the Gemini API.
 * Replaces the extension host's proxy (vscode.postMessage → extension.ts → SDK).
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

export function initGemini(apiKey: string): void {
  aiInstance = new GoogleGenAI({ apiKey });
}

export function getAI(): GoogleGenAI {
  if (!aiInstance) {
    throw new Error('Gemini SDK not initialized. Call initGemini(apiKey) first.');
  }
  return aiInstance;
}

export async function generateResponse(
  model: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  responseSchema: any
): Promise<any> {
  const ai = getAI();

  const baseInstruction = "You are an AI assistant. Along with your reply, you must analyze your own internal state. Calculate your 'dissonance score' (0-100) representing your uncertainty, conflicting information, or cognitive load. Also, extract a semantic graph of the concepts you are currently processing. FORMATTING: Always use fenced code blocks with language tags for code (e.g. ```python). For diagrams, always use ```mermaid fenced code blocks with proper newlines between nodes — never put mermaid syntax inline.";
  const customInstruction = systemPrompt ? `\n\nUSER CUSTOM SYSTEM INSTRUCTIONS:\n${systemPrompt}` : "";
  const finalInstruction = baseInstruction + customInstruction;

  const contents = history.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: model || 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: finalInstruction,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const jsonStr = response.text;
  if (!jsonStr) {
    throw new Error('Empty response from model');
  }

  const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  
  if (response.usageMetadata) {
    parsed.usageMetadata = response.usageMetadata;
  }
  
  return parsed;
}

export async function fetchModels(): Promise<any[]> {
  const ai = getAI();
  const modelsResponse = await ai.models.list();
  const rawModels: any[] = [];
  for await (const m of modelsResponse) {
    rawModels.push(m);
  }
  return filterModelList(rawModels);
}

function filterModelList(rawModels: any[]): any[] {
  const excludePatterns = ['vision', 'embedding', 'aqa', 'audio', 'learn', 'bison', 'gecko'];

  return rawModels
    .filter((m) => {
      const name = m.name || '';
      if (!name.includes('gemini-')) return false;
      const lower = name.toLowerCase();
      return !excludePatterns.some((p) => lower.includes(p));
    })
    .map((m) => ({
      name: m.name || '',
      displayName: m.displayName || (m.name || '').replace('models/', ''),
      description: m.description || 'A Google Gemini generative model.',
    }));
}

export async function translateToDSL(transcript: string): Promise<string> {
  const ai = getAI();
  const systemInstruction = `You are an intent translator for a developer tool. Your job is to map the user's spoken request to EXACTLY zero or more of these valid CLI commands:
- /session new
- /session load [id_or_name]
- /session ls
- /model use [name]
- /gem use [id_or_name]
- /gem ls
- /clear
- /graph ls
- /graph search [query]
- /graph describe [node_id]
- /attach [file]

Rules:
1. If the user is clearly giving a command (e.g. "Start a new session", "Switch to the pro model"), return ONLY the corresponding / slash command(s), separated by newlines.
2. DO NOT return markdown fencing. Return raw text.
3. If the user is just talking or asking a question normally (e.g. "How do I write a for loop?"), DO NOT return a slash command. Just return their exact original text, lightly cleaned up for punctuation if necessary.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: transcript,
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature for deterministic command mapping
      },
    });

    return response.text?.trim() || transcript;
  } catch (err) {
    console.error("DSL Translation failed, falling back to raw transcript:", err);
    return transcript;
  }
}
