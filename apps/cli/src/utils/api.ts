import * as path from 'path';
import * as fs from 'fs';

// Path to store the CLI authentication token
export const CR_DIR = path.resolve(process.cwd(), '.cr');
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

export async function backendFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const backendUrl = process.env.CR_CLOUD_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787';
  const url = `${backendUrl.replace(/\/$/, '')}${endpoint}`;
  const headers = new Headers(options.headers as any);
  headers.set('Content-Type', 'application/json');
  const token = getCliToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
