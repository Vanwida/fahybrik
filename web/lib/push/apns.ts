// Apple Push Notification Service client.
//
// APNS uses HTTP/2 with provider authentication tokens (JWT, ES256-signed
// with the .p8 key from Apple Developer). APNS accepts ONLY HTTP/2, so this
// talks to it through `node:http2` — NOT `fetch`. Node's global fetch (undici)
// offers only `http/1.1` in the TLS handshake unless an agent opts into h2, and
// an h2-only server like APNS refuses it (`ERR_SSL_TLSV1_ALERT_NO_APPLICATION_
// PROTOCOL`). Until 2026-09-24 this used `fetch`: every iOS push failed inside
// a `catch` nobody read. One HTTP/2 connection per host is opened per send,
// shared by all of the user's devices, and closed at the end.
//
// Required env (load lazily so missing creds → 503 only when push is
// actually attempted):
//   * APNS_TEAM_ID         — 10-char Apple team id
//   * APNS_KEY_ID          — 10-char auth key id
//   * APNS_PRIVATE_KEY     — full .p8 file contents incl. BEGIN/END
//                            PRIVATE KEY lines, '\n' literal allowed
//   * APNS_BUNDLE_ID       — iOS app bundle id
//   * APNS_USE_SANDBOX     — '1' / 'true' to hit sandbox (default: respect
//                            per-token apns_env)
//
// Token caching: JWTs are valid for up to 60 minutes. We cache one JWT per
// process and rotate every 50 minutes.

import { createPrivateKey, createSign } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import type { Sql } from '@/lib/db';
import { BRAND_WORDMARK } from '@fahybrid/shared/domain/coach/club-skin';

const APNS_PRODUCTION_HOST = 'https://api.push.apple.com';
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com';
const JWT_TTL_MS = 50 * 60 * 1000;
/** Cap per request: a hung connection must not hold the function open. */
const APNS_REQUEST_TIMEOUT_MS = 10_000;

export type ApnsResponse = { status: number; body: string };

/** Opens the HTTP/2 session to a host (ALPN h2). `ca` exists only for the transport test. */
export function apnsConnect(host: string, opts: { ca?: string } = {}): Promise<ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    const session = connect(host, opts.ca ? { ca: opts.ca } : {});
    let open = false;
    // A permanent listener: an 'error' after connect (GOAWAY, reset) with no
    // listener would crash the process. In-flight requests reject on their own.
    session.on('error', (err) => {
      if (!open) reject(err);
    });
    session.once('connect', () => {
      open = true;
      resolve(session);
    });
  });
}

/** One HTTP/2 POST on an open session. */
export function apnsPost(
  session: ClientHttp2Session,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ApnsResponse> {
  return new Promise((resolve, reject) => {
    const req = session.request({ ':method': 'POST', ':path': path, ...headers });
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.setTimeout(APNS_REQUEST_TIMEOUT_MS, () => {
      req.close();
      reject(new Error('apns_timeout'));
    });
    req.on('response', (h) => {
      status = Number(h[':status'] ?? 0);
    });
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => resolve({ status, body: data }));
    req.on('error', reject);
    req.end(body);
  });
}

type ApnsConfig = {
  team_id: string;
  key_id: string;
  private_key_pem: string;
  bundle_id: string;
};

export class ApnsConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`APNS not configured (missing: ${missing.join(', ')})`);
    this.missing = missing;
  }
}

let cachedJwt: { token: string; expires_at: number } | null = null;

export function loadApnsConfig(): { ok: true; config: ApnsConfig } | { ok: false; missing: string[] } {
  const team_id = process.env.APNS_TEAM_ID;
  const key_id = process.env.APNS_KEY_ID;
  const private_key_pem_raw = process.env.APNS_PRIVATE_KEY;
  const bundle_id = process.env.APNS_BUNDLE_ID;
  const missing: string[] = [];
  if (!team_id) missing.push('APNS_TEAM_ID');
  if (!key_id) missing.push('APNS_KEY_ID');
  if (!private_key_pem_raw) missing.push('APNS_PRIVATE_KEY');
  if (!bundle_id) missing.push('APNS_BUNDLE_ID');
  if (missing.length > 0) return { ok: false, missing };
  // Allow encoded newlines in the env var (Vercel env doesn't preserve raw
  // newlines well).
  const private_key_pem = private_key_pem_raw!.replace(/\\n/g, '\n');
  return { ok: true, config: { team_id: team_id!, key_id: key_id!, private_key_pem, bundle_id: bundle_id! } };
}

function buildJwt(config: ApnsConfig): string {
  const now = cachedJwt?.expires_at && cachedJwt.expires_at > Date.now() ? null : cachedJwt;
  if (cachedJwt && cachedJwt.expires_at > Date.now()) {
    return cachedJwt.token;
  }
  const header = { alg: 'ES256', kid: config.key_id, typ: 'JWT' };
  const claims = { iss: config.team_id, iat: Math.floor(Date.now() / 1000) };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const claimsB64 = base64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = createPrivateKey(config.private_key_pem);
  const sign = createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  // Convert DER ECDSA signature → JOSE r||s concatenation per RFC 7515 §3.
  const der = sign.sign({ key, dsaEncoding: 'ieee-p1363' });
  const sig = base64url(der);
  const token = `${signingInput}.${sig}`;

  cachedJwt = { token, expires_at: Date.now() + JWT_TTL_MS };
  void now;
  return token;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type SendPushArgs = {
  sql: Sql;
  user_id: bigint;
  title: string;
  body: string;
  badge?: number;
  category?: string;
  deeplink?: Record<string, unknown>;
  // Override env (otherwise per-token apns_env wins).
  forceEnv?: 'sandbox' | 'production';
};

export type PushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  errors: Array<{ token_prefix: string; reason: string }>;
};

export async function sendPush(args: SendPushArgs): Promise<PushSendResult> {
  const cfg = loadApnsConfig();
  const result: PushSendResult = { attempted: 0, sent: 0, failed: 0, errors: [] };
  if (!cfg.ok) {
    return result; // silently no-op when APNS not provisioned (dev env)
  }

  const tokens = await args.sql<
    { id: string; device_token: string; apns_env: string }[]
  >`
    select id::text, device_token, apns_env
    from apns_push_tokens
    where user_id = ${args.user_id as unknown as number}
      and last_failure is null
  `;
  if (tokens.length === 0) return result;

  const jwt = buildJwt(cfg.config);
  const aps: Record<string, unknown> = {
    alert: { title: args.title, body: args.body },
    sound: 'default',
  };
  if (args.badge != null) aps.badge = args.badge;
  if (args.category) aps.category = args.category;
  const payload = {
    aps,
    ...(args.deeplink ?? {}),
  };
  const payloadStr = JSON.stringify(payload);
  // One HTTP/2 session per host (production / sandbox), shared by every device
  // of the user in this send.
  const sessions = new Map<string, Promise<ClientHttp2Session>>();
  const sessionFor = (host: string) => {
    let session = sessions.get(host);
    if (!session) {
      session = apnsConnect(host);
      sessions.set(host, session);
    }
    return session;
  };

  try {
    for (const t of tokens) {
      result.attempted += 1;
      const env = args.forceEnv ?? (t.apns_env === 'sandbox' ? 'sandbox' : 'production');
      const host = env === 'sandbox' ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;

      try {
        const res = await apnsPost(
          await sessionFor(host),
          `/3/device/${t.device_token}`,
          {
            authorization: `bearer ${jwt}`,
            'apns-topic': cfg.config.bundle_id,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'content-type': 'application/json',
          },
          payloadStr,
        );

        if (res.status >= 200 && res.status < 300) {
          result.sent += 1;
          await args.sql`
            update apns_push_tokens
            set last_pushed_at = now(), updated_at = now()
            where id = ${t.id}::bigint
          `;
          continue;
        }

        let reason = `http_${res.status}`;
        try {
          const j = JSON.parse(res.body) as { reason?: string };
          if (j.reason) reason = j.reason;
        } catch {
          // ignore JSON parse failures — keep http_<status> as reason.
        }
        result.failed += 1;
        result.errors.push({ token_prefix: t.device_token.slice(0, 8), reason });

        // 410 Unregistered or 400 BadDeviceToken → mark dead.
        if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
          await args.sql`
            update apns_push_tokens
            set last_failure = ${reason}, failed_at = now(), updated_at = now()
            where id = ${t.id}::bigint
          `;
        }
      } catch (err) {
        result.failed += 1;
        const reason = err instanceof Error ? err.message : 'unknown_error';
        result.errors.push({ token_prefix: t.device_token.slice(0, 8), reason });
      }
    }

  } finally {
    for (const session of sessions.values()) {
      session.then((open) => open.close()).catch(() => undefined);
    }
  }

  return result;
}

// Manual smoke-test helper used by /api/devices/test-push (admin only).
export async function smokeTestPush(args: {
  sql: Sql;
  user_id: bigint;
}): Promise<PushSendResult> {
  return sendPush({
    sql: args.sql,
    user_id: args.user_id,
    title: BRAND_WORDMARK,
    body: 'Test push',
    category: 'system',
  });
}
