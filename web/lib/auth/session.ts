import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { sql } from '../db';
import {
  AUTH_CONFIG,
  JWT_AUDIENCE_ATHLETE,
  JWT_AUDIENCE_COACH,
  JWT_ISSUER,
} from './config';

export type SessionAudience = typeof JWT_AUDIENCE_ATHLETE | typeof JWT_AUDIENCE_COACH;

export interface SessionClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

interface IssueSessionInput {
  user_id: bigint;
  audience: SessionAudience;
  ttl_seconds: number;
  user_agent?: string | null;
  ip?: string | null;
}

interface IssueSessionResult {
  token: string;
  jti: string;
  expires_at: Date;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(AUTH_CONFIG.authSecret());
}

export async function issueSession(input: IssueSessionInput): Promise<IssueSessionResult> {
  const jti = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + input.ttl_seconds;
  const expiresAtDate = new Date(expiresAt * 1000);

  await sql`
    insert into sessions (user_id, jti, expires_at, user_agent, ip)
    values (${input.user_id}, ${jti}, ${expiresAtDate}, ${input.user_agent ?? null}, ${
      input.ip ?? null
    })
  `;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.user_id.toString())
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setIssuer(JWT_ISSUER)
    .setAudience(input.audience)
    .sign(secretKey());

  return { token, jti, expires_at: expiresAtDate };
}

export interface VerifiedSession {
  user_id: bigint;
  jti: string;
  expires_at: Date;
}

export async function verifySession(
  token: string,
  audience: SessionAudience,
): Promise<VerifiedSession | null> {
  let payload: SessionClaims;
  try {
    const { payload: p } = await jwtVerify(token, secretKey(), {
      issuer: JWT_ISSUER,
      audience,
      algorithms: ['HS256'],
    });
    payload = p as unknown as SessionClaims;
  } catch {
    return null;
  }

  if (!payload.sub || !payload.jti) return null;

  const rows = await sql<{ user_id: string; expires_at: Date; revoked_at: Date | null }[]>`
    select user_id::text as user_id, expires_at, revoked_at
    from sessions
    where jti = ${payload.jti}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at.getTime() <= Date.now()) return null;

  await sql`update sessions set last_seen_at = now() where jti = ${payload.jti}`;

  return {
    user_id: BigInt(row.user_id),
    jti: payload.jti,
    expires_at: row.expires_at,
  };
}

export async function revokeSession(jti: string): Promise<void> {
  await sql`
    update sessions
    set revoked_at = now()
    where jti = ${jti} and revoked_at is null
  `;
}

export const audiences = {
  athlete: JWT_AUDIENCE_ATHLETE,
  coach: JWT_AUDIENCE_COACH,
} as const;
