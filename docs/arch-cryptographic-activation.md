# Cryptographic Activation Architecture

## Overview
This document outlines the Dual-Token Public Key Infrastructure (PKI) designed for secure, offline-first authentication across the Cognitive Resonance application ecosystem (CLI, PWA, VS Code Extension). 
The architecture relies on an asymmetric Ed25519 identity key paired with high-performance symmetric HMAC session keys. Read latency and cloud computation costs are minimized via background token exchange patterns.

## 1. Requirements Map
- **Keys with and without expiration**: Overcome by providing an optional timeframe parameter during the minting process.
- **Selective Revocation**: Addressed by routing the identity through a fast D1 Cloudflare SQL lookup table.
- **Cloud-Agnostic Master Key**: Addressed by strictly retaining the Private Key on the Developer's machine, deploying only the Public Key.
- **Optimized Cost/Performance**: Addressed by shifting the authorization state check away from high-frequency syncs into a 1-hour sparse cycle.
- **Dynamic Key Reissuance**: Addressed by a silent background heartbeat in the Client daemon.
- **Multi-Tenant Identity Bound**: Addressed geometrically; both tokens mathematically lock to the user's `sub` profile string.

## 2. Theoretical Architecture

The authentication model employs a **Dual-Token Exchange Flow**:

### Phase A: Offline Issuance (Identity Token)
1. The Administrator runs `npx tsx scripts/mint_token.ts <user@domain.com> [days-valid]` securely offline.
2. The script utilizes the native `Ed25519` mathematical curve to sign an **Identity Token**. 
3. The token payload encodes the user's `sub` (identity). If `days-valid` is omitted, the mathematical payload lacks an `exp` entirely and asserts permanent mathematical validity.
4. The user inputs `/activate <token>` into the Client CLI. The Client persists this Master Identity Token locally (e.g., in `.cr/token`).

### Phase B: Cloudflare Exchange Protocol (Session Token)
1. Upon connection setup, the Client CLI does *not* utilize the heavy Identity Token to authenticate WebSocket packet streams.
2. Instead, the Client submits the Identity Token as a payload to a dedicated Cloudflare endpoint: `/api/auth/exchange`.
3. The Edge Worker performs a two-tier verification:
   - **Mathematical Verification**: Dissects the token via the globally cached `CR_PUBLIC_KEY` calling `crypto.subtle.verify("Ed25519")` with near-zero latency constraint.
   - **Stateful Revocation Check**: Executes `SELECT 1 FROM revoked_identities WHERE identity = ?` on Cloudflare D1. This is the **only** structured database read in the entire authentication lifecycle.
4. If valid, the Edge internally leverages the legacy symmetric `JWT_SECRET` HMAC algorithm to sign an extremely fast **Session Token** (expiring strictly in 1 hour) mapped to that exact identity, returning it to the Client.

### Phase C: Proactive Sync (Heartbeat Refresh)
1. The Client isolates the new HMAC Session Token and natively attaches it to all persistent execution requests and sync event pushes. 
2. The Edge mathematically validates the symmetric HMAC instantaneously (Cost: $0.00, Latency: ~0.1ms), completely ignoring D1.
3. **The Heartbeat Buffer**: At **T-minus 5 minutes** (Minute 55), the Client daemon quietly spins up a background background task. It strikes `/api/auth/exchange` identically utilizing the frozen Master Token, gracefully swapping the ensuing symmetric Session Token into memory prior to the formal expiration event—utterly neutralizing jitter "blackouts" otherwise prevalent in traditional timed-out JWT applications.

## 3. Target Implementation Details
- **Schema Addition**: `CREATE TABLE revoked_identities (identity TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL);` inside Cloudflare D1.
- **Token Format Specifications**:
  - `Identity Token`: Pure Base64Url parameters resolving locally to `sub`, `nbf`, and loosely `exp`. Signature logic runs on the `node:crypto` polyfills.
  - `Session Token`: Classical `HS256` standardized algorithm easily decoded seamlessly by web browsers and React PWAs.
