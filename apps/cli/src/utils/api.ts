import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function findCRDir(startDir: string): string | null {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;
  while (currentDir !== root) {
    const testPath = path.join(currentDir, '.cr');
    if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
      return testPath;
    }
    currentDir = path.dirname(currentDir);
  }
  const testRoot = path.join(root, '.cr');
  if (fs.existsSync(testRoot) && fs.statSync(testRoot).isDirectory()) return testRoot;
  
  return null;
}

let binDir = __dirname;
try {
  if (require.main?.filename && fs.existsSync(require.main.filename)) {
    binDir = path.dirname(fs.realpathSync(require.main.filename));
  } else if (process.argv[1] && fs.existsSync(process.argv[1])) {
    binDir = path.dirname(fs.realpathSync(process.argv[1]));
  }
} catch (e) {}

export const CR_DIR = findCRDir(process.cwd()) || findCRDir(binDir) || findCRDir(__dirname) || path.join(os.homedir(), '.cr');
export const TOKEN_FILE_PATH = path.join(CR_DIR, 'token');

export function getCliToken(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) return fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim();
  } catch (e) {}
  return null;
}

export function saveCliToken(token: string) {
  try {
    if (!fs.existsSync(CR_DIR)) fs.mkdirSync(CR_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE_PATH, token, { mode: 0o600 });
   } catch (e) {
    console.error('[Error] Failed to save authentication token:', e);
  }
}

export function clearCliToken() {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) fs.unlinkSync(TOKEN_FILE_PATH);
  } catch (e) {
    console.error('[Error] Failed to remove authentication token:', e);
  }
}

let cachedSessionToken: string | null = null;
let sessionTokenExpiresAt: number = 0;

export async function fetchSessionToken(): Promise<string | null> {
  const now = Date.now();
  // Refresh gracefully at T-minus 5 minutes (Minute 55)
  if (cachedSessionToken && now < sessionTokenExpiresAt - 5 * 60 * 1000) {
    return cachedSessionToken;
  }

  const masterToken = getCliToken();
  if (!masterToken) return null;

  let backendUrl = 'http://localhost:8787';
  if (process.env.CR_ENV === 'prod') backendUrl = 'https://api.andrey-stepantsov.workers.dev';
  else if (process.env.CR_ENV === 'staging') backendUrl = 'https://api-staging.andrey-stepantsov.workers.dev';
  
  backendUrl = process.env.CR_EDGE_URL || process.env.CR_CLOUD_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || backendUrl;
  
  try {
    const url = `${backendUrl.replace(/\/$/, '')}/api/auth/exchange`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: masterToken })
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data.token) {
        cachedSessionToken = data.token;
        sessionTokenExpiresAt = now + 60 * 60 * 1000;
        return cachedSessionToken;
      }
    } else {
      const data = await res.json() as any;
      if (res.status === 401 || res.status === 403) {
         throw new Error(`AUTH_FATAL: ${data.error || 'Identity access revoked'}`);
      }
    }
  } catch (e: any) {
     if (e.message?.startsWith('AUTH_FATAL:')) throw e;
     // network failure, proceed without resetting cache if it still exists
  }
  
  return cachedSessionToken;
}

export async function backendFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  let backendUrl = 'http://localhost:8787';
  if (process.env.CR_ENV === 'prod') backendUrl = 'https://api.andrey-stepantsov.workers.dev';
  else if (process.env.CR_ENV === 'staging') backendUrl = 'https://api-staging.andrey-stepantsov.workers.dev';
  
  backendUrl = process.env.CR_EDGE_URL || process.env.CR_CLOUD_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || backendUrl;
  const url = `${backendUrl.replace(/\/$/, '')}${endpoint}`;
  const headers = new Headers(options.headers as any);
  headers.set('Content-Type', 'application/json');
  const token = (await fetchSessionToken()) || getCliToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
