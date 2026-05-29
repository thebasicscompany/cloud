import "server-only";

import { SignJWT } from "jose";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";

/**
 * Server-only minting of the short-lived workspace JWT consumed by the deployed
 * runtime API's `requireWorkspaceJwt` middleware (api/src/middleware/jwt.ts →
 * api/src/lib/jwt.ts `verifyWorkspaceToken`).
 *
 * The verifier does HS256 verification only (no DB membership re-check on these
 * routes) and requires these six STRING claims to be present, plus a valid
 * signature and a non-expired `exp`:
 *
 *   { workspace_id, account_id, plan, seat_status, issued_at, expires_at }
 *
 * `issued_at` / `expires_at` are ISO-8601 strings (JWT-safe). `iat` / `exp` are
 * the numeric registered claims jose sets via setIssuedAt/setExpirationTime —
 * jose's jwtVerify enforces `exp`. We mirror the exact payload the API itself
 * signs in api/src/routes/auth.ts (`mintWorkspaceTokenForAccessToken`).
 */

const ALGORITHM = "HS256";
const EXPIRY_SECONDS = 24 * 60 * 60;

/** Workspace plan tiers carried in the JWT claims (must be one of these). */
export type WorkspacePlan = "free" | "pro" | "team" | "enterprise";

/** Default basichome account — the operator account for `PRIMARY_WORKSPACE_ID`. */
export const PRIMARY_ACCOUNT_ID = "aa9dd140-def8-4e8e-9955-4acc04e11fea";

function secretKey(): Uint8Array {
  const secret = process.env.WORKSPACE_JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "WORKSPACE_JWT_SECRET is not set. Add it to web/.env.local (server-only).",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Mint a 24h HS256 workspace JWT for the deployed runtime API.
 *
 * Defaults to the primary basichome workspace + account when omitted.
 */
export async function mintWorkspaceJwt(
  workspaceId: string = PRIMARY_WORKSPACE_ID,
  accountId: string = PRIMARY_ACCOUNT_ID,
  options?: { plan?: WorkspacePlan; seatStatus?: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = new Date(now * 1000);
  const expiresAt = new Date((now + EXPIRY_SECONDS) * 1000);

  const payload = {
    workspace_id: workspaceId,
    account_id: accountId,
    plan: options?.plan ?? "pro",
    seat_status: options?.seatStatus ?? "active",
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(now)
    .setExpirationTime(now + EXPIRY_SECONDS)
    .sign(secretKey());
}
