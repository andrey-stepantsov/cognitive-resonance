import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { decodeBase32 } from 'oslo/encoding';
import { TOTPController } from 'oslo/otp';
import { verifyEd25519Signature, signJwt, verifyJwt } from './auth';
import environments from './environments';

// Define expected DB schemas locally for the binding cast if needed, 
// or import from admin-core. We'll rely on any cast.

type Bindings = {
  DB_ADMIN: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings, Variables: { admin: any } }>();

app.use('*', cors());

app.get('/health', async (c) => {
  try {
    const dbCheck = await c.env.DB_ADMIN.prepare("SELECT 1").first();
    return c.json({ status: 'healthy', admin_db: 'ok', timestamp: Date.now() });
  } catch(e: any) {
    return c.json({ status: 'unhealthy', error: e.message }, 500);
  }
});

// Issue a completely stateless cryptographic challenge
app.post('/api/auth/challenge', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.public_key) return c.json({ error: 'Missing public_key' }, 400);

  // Check if admin exists and is active
  const admin = await c.env.DB_ADMIN.prepare(
    "SELECT id, status FROM global_admins WHERE public_key = ?"
  ).bind(body.public_key).first();

  if (!admin) {
    // Return a dummy challenge to prevent user enumeration attacks
    const dummyNonce = await signJwt({ type: 'challenge', dummy: true }, c.env.JWT_SECRET || 'dev_secret', 60);
    return c.json({ nonce: dummyNonce, expires_at: Date.now() + 60000 });
  }

  if (admin.status !== 'active') {
    return c.json({ error: 'Identity revoked or suspended' }, 403);
  }

  // Generate a stateless 60-second challenge nonce
  const nonce = await signJwt({ type: 'challenge', admin_id: admin.id }, c.env.JWT_SECRET || 'dev_secret', 60);

  return c.json({ nonce, expires_at: Date.now() + 60000 });
});

// Verify the response
app.post('/api/auth/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { public_key, nonce, totp_code, signature } = body;
  
  if (!public_key || !nonce || !totp_code || !signature) {
    return c.json({ error: 'Missing required cryptographic proofs' }, 400);
  }

  // 1. Fetch Admin
  const admin: any = await c.env.DB_ADMIN.prepare(
    "SELECT * FROM global_admins WHERE public_key = ?"
  ).bind(public_key).first();

  if (!admin || admin.status !== 'active') {
    return c.json({ error: 'Authentication failed' }, 401);
  }

  // 2. Verify the Math (Ed25519 Signature over nonce + totp)
  const isValidSig = await verifyEd25519Signature(public_key, signature, `${nonce}${totp_code}`);
  if (!isValidSig) {
    return c.json({ error: 'Invalid Cryptographic Signature' }, 401);
  }

  // 3. Verify TOTP
  try {
    const secretBuffer = decodeBase32(admin.totp_secret);
    const validTOTP = await new TOTPController().verify(totp_code, secretBuffer);
    if (!validTOTP) {
      return c.json({ error: 'Invalid or Expired Authenticator Code' }, 401);
    }
  } catch(e) {
    return c.json({ error: 'Failed to process TOTP' }, 401);
  }

  // 4. Issue the 1-hour session
  const sessionToken = await signJwt({ 
    type: 'session', 
    admin_id: admin.id, 
    role_binding: admin.role_binding 
  }, c.env.JWT_SECRET || 'dev_secret', 3600);

  return c.json({
    token: sessionToken,
    admin: {
      id: admin.id,
      email: admin.email,
      role_binding: admin.role_binding,
      status: admin.status
    }
  });
});

app.use('/api/environments/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or Invalid Authorization Header' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET || 'dev_secret');
    if (payload.type !== 'session') throw new Error('Invalid token type');
    
    c.set('admin', payload);
    await next();
  } catch(e: any) {
    return c.json({ error: e.message }, 401);
  }
});

app.route('/api/environments', environments);

export default app;
