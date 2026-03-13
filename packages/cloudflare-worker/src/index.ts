import { Ai } from '@cloudflare/ai';

export interface Env {
  // Bindings
  AI: any;
  VECTORIZE: any;
  GIT_PACKS_BUCKET: R2Bucket;
  // Secrets
  APPWRITE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (path.startsWith('/git/') && path.endsWith('/info/refs')) {
      return handleGitInfoRefs(request, env);
    }

    if (path.startsWith('/git/') && path.endsWith('/git-receive-pack')) {
      return handleGitReceivePack(request, env);
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Appwrite Webhook (vectorization)
    try {
      const signature = request.headers.get('x-appwrite-webhook-signature');
      if (!signature) {
         return new Response('Missing Signature', { status: 401 });
      }

      const payload: any = await request.json();
      const sessionId = payload.$id;
      const rawData = payload.data;
      
      let sessionData;
      try {
        sessionData = JSON.parse(rawData);
      } catch (err) {
        return new Response('Invalid session data JSON', { status: 400 });
      }

      if (!sessionData.messages || sessionData.messages.length === 0) {
        return new Response('Empty session', { status: 200 });
      }

      const messagesText = sessionData.messages
        .filter((m: any) => m.role === 'user' || m.role === 'model')
        .map((m: any) => `${m.role}: ${m.content}`)
        .join('\n');

      const chunk = messagesText.substring(0, 8000);

      const ai = new Ai(env.AI);
      const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [chunk] });
      const vectors = data[0];

      await env.VECTORIZE.upsert([
        {
          id: sessionId,
          values: vectors,
          metadata: { customName: payload.customName || 'Untitled', timestamp: payload.timestamp || Date.now() }
        }
      ]);

      return new Response('Vectorized successfully', { status: 200 });
    } catch (e: any) {
      console.error(e);
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  },
};

async function handleGitInfoRefs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  
  if (service !== 'git-receive-pack') {
    return new Response('Only git-receive-pack is supported', { status: 400 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const headers = new Headers({
    'Content-Type': `application/x-${service}-advertisement`,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization',
  });

  const str1 = `# service=${service}\n`;
  const len1 = (str1.length + 4).toString(16).padStart(4, '0');
  const str2 = '0000';
  const str3 = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v1\n`;
  const len3 = (str3.length + 4).toString(16).padStart(4, '0');
  
  const body = `${len1}${str1}${str2}${len3}${str3}0000`;

  return new Response(body, { status: 200, headers });
}

async function handleGitReceivePack(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const packfileBuffer = await request.arrayBuffer();
  
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2]; // /git/sessionId/...

  console.log(`Received packfile of ${packfileBuffer.byteLength} bytes for session ${sessionId}`);

  try {
    const fileName = `pack-${sessionId}-${Date.now()}.pack`;
    await env.GIT_PACKS_BUCKET.put(fileName, packfileBuffer);
    console.log(`Successfully persisted packfile to R2 for ${sessionId}`);
  } catch (err: any) {
    console.warn(`Failed to push to R2 Bucket: ${err.message}`);
    // We still return 200 to the git client so it doesn't hard-crash the local repo right now
  }

  const headers = new Headers({
    'Content-Type': 'application/x-git-receive-pack-result',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });

  const report1 = "unpack ok\n";
  const len1 = (report1.length + 4).toString(16).padStart(4, '0');
  const report2 = "ok refs/heads/main\n";
  const len2 = (report2.length + 4).toString(16).padStart(4, '0');
  
  const body = `${len1}${report1}${len2}${report2}0000`;

  return new Response(body, { status: 200, headers });
}
