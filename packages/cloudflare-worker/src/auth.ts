import type { Env } from "./index";

// ─── Base64Url Utilities ─────────────────────────────────────────

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Password Hashing ───────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const newHashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return newHashHex === hashHex;
}

// ─── JWT Utilities ───────────────────────────────────────────────

export function decodeJwtParts(
  token: string,
): {
  header: any;
  payload: any;
  signatureB64: string;
  headerB64: string;
  payloadB64: string;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[0])),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[1])),
    );
    return {
      header,
      payload,
      signatureB64: parts[2],
      headerB64: parts[0],
      payloadB64: parts[1],
    };
  } catch {
    return null;
  }
}

export async function signJwt(
  payload: any,
  secret: string,
  expiresInSec: number = 86400 * 7,
): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));

  const signatureInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(signatureInput),
  );

  const signatureB64 = base64UrlEncode(signature);
  return `${signatureInput}.${signatureB64}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<{ userId: string } | null> {
  try {
    const decoded = decodeJwtParts(token);
    if (!decoded) return null;

    const { payload, signatureB64, headerB64, payloadB64 } = decoded;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      signatureInput,
    );
    if (!valid) return null;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const userId = payload.sub || payload.userId || payload.user_id;
    if (!userId) return null;

    return { userId };
  } catch {
    return null;
  }
}

// ─── API Key Utilities ───────────────────────────────────────────

// Generates a random secure API key, and returns [plainKey, keyHash]
export async function generateApiKey(): Promise<[string, string]> {
  const plainBytes = crypto.getRandomValues(new Uint8Array(32));
  const plainKey =
    "cr_" +
    base64UrlEncode(plainBytes)
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 32);

  const enc = new TextEncoder();
  const hashBytes = await crypto.subtle.digest("SHA-256", enc.encode(plainKey));
  const keyHash = Array.from(new Uint8Array(hashBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [plainKey, keyHash];
}
