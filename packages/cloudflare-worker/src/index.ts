import { Ai } from '@cloudflare/ai';

export interface Env {
  // Bindings
  AI: any;
  VECTORIZE: any;
  // Secrets
  APPWRITE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // Very basic security on the webhook
      const signature = request.headers.get('x-appwrite-webhook-signature');
      // In a real app we'd crypto.verify this against APPWRITE_WEBHOOK_SECRET
      if (!signature) {
         return new Response('Missing Signature', { status: 401 });
      }

      const payload: any = await request.json();
      
      // Expected Appwrite Document payload for our sessions collection
      // $id is the sessionId
      // data is the stringified JSON of the session context
      const sessionId = payload.$id;
      const rawData = payload.data;
      
      let sessionData;
      try {
        sessionData = JSON.parse(rawData);
      } catch (err) {
        return new Response('Invalid session data JSON', { status: 400 });
      }

      if (!sessionData.messages || sessionData.messages.length === 0) {
        return new Response('Empty session, skipped vectorization', { status: 200 });
      }

      // We extract all human/user messages or general context to build an embedding text
      const messagesText = sessionData.messages
        .filter((m: any) => m.role === 'user' || m.role === 'model')
        .map((m: any) => `${m.role}: ${m.content}`)
        .join('\n');

      const chunk = messagesText.substring(0, 8000); // chunk limit roughly

      // Using the bound AI model to generate embeddings
      const ai = new Ai(env.AI);
      const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [chunk]
      });

      const vectors = data[0];

      // Upsert into Vectorize
      await env.VECTORIZE.upsert([
        {
          id: sessionId,
          values: vectors,
          metadata: {
            customName: payload.customName || 'Untitled',
            timestamp: payload.timestamp || Date.now()
          }
        }
      ]);

      return new Response('Vectorized successfully', { status: 200 });
    } catch (e: any) {
      console.error(e);
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  },
};
