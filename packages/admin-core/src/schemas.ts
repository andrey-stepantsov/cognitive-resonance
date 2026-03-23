import { z } from 'zod';

export const GlobalAdminSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  public_key: z.string(),
  totp_secret: z.string(),
  role_binding: z.string(), // json string mapping
  created_at: z.number(),
  status: z.enum(['active', 'suspended', 'key_compromised'])
});

export type IGlobalAdmin = z.infer<typeof GlobalAdminSchema>;

export const AdminAuditLogSchema = z.object({
  id: z.string(),
  admin_id: z.string(),
  action: z.string(),
  target_environment: z.string().nullable().optional(),
  timestamp: z.number(),
  ip_address: z.string().nullable().optional(),
  signature: z.string()
});

export type IAdminAuditLog = z.infer<typeof AdminAuditLogSchema>;

// Vault Authentication API Payloads
export const AuthChallengeRequestSchema = z.object({
  public_key: z.string()
});

export const AuthChallengeResponseSchema = z.object({
  nonce: z.string(),
  expires_at: z.number()
});

export const AuthVerifyRequestSchema = z.object({
  public_key: z.string(),
  nonce: z.string(),
  totp_code: z.string().length(6),
  signature: z.string() // Ed25519 signature of (nonce + totp_code)
});

export const AuthVerifyResponseSchema = z.object({
  token: z.string(),
  admin: GlobalAdminSchema
});
