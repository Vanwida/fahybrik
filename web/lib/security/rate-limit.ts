// Table-based rate limiting (A1).
//
// There is no Redis/Upstash in the stack, so throttling is implemented with a
// Postgres fixed-window counter (table `rate_limit_buckets`, migration 0025).
// Every limited endpoint composes an opaque bucket key from a scope, the
// endpoint name and an identifier (ip or user_id), then calls `withRateLimit`.
//
// Fixed-window semantics: the window is the request time truncated to a
// multiple of `windowSec`. The first request in a window inserts a row with
// count = 1; subsequent requests in the same window atomically increment it
// via ON CONFLICT. When count exceeds `limit` we reject with a `retry_after`
// (seconds until the window rolls over).
//
// The increment + read happens in ONE statement (insert ... on conflict ...
// returning count) so concurrent requests can't both read a stale count and
// each think they're under the limit.

import { NextResponse } from 'next/server';
import { sql, type Sql } from '@/lib/db';

export interface RateLimitParams {
  /** Logical scope: 'ip' or 'user' (or anything stable). */
  scope: string;
  /** Endpoint identifier, e.g. 'auth-email'. Keeps keys readable + isolated. */
  endpoint: string;
  /** The throttled identity: an IP string, a user_id string, etc. */
  identifier: string;
  /** Max allowed requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  /** true when the request is within the limit and may proceed. */
  allowed: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
  /** The window's start (truncated timestamp). Mostly for tests/observability. */
  windowStart: Date;
}

interface RateLimitDeps {
  client?: Sql;
  /** Injectable clock for tests. Defaults to Date.now(). */
  now?: () => number;
}

/**
 * Compute the fixed-window start for a given epoch-ms timestamp.
 * Exposed for unit tests so they can assert window boundaries.
 */
export function windowStartFor(nowMs: number, windowSec: number): Date {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

function bucketKey(params: Pick<RateLimitParams, 'scope' | 'endpoint' | 'identifier'>): string {
  return `${params.scope}:${params.endpoint}:${params.identifier}`;
}

/**
 * Atomically register one request against a fixed-window bucket and report
 * whether it is allowed. Fails OPEN (allowed:true) on DB errors so a transient
 * outage never locks legitimate users out of auth — security hardening must
 * not become a self-inflicted outage.
 */
export async function withRateLimit(
  params: RateLimitParams,
  deps: RateLimitDeps = {},
): Promise<RateLimitResult> {
  const client = deps.client ?? sql;
  const nowMs = (deps.now ?? Date.now)();
  const start = windowStartFor(nowMs, params.windowSec);
  const key = bucketKey(params);
  const retryAfter = Math.max(
    1,
    Math.ceil((start.getTime() + params.windowSec * 1000 - nowMs) / 1000),
  );

  try {
    const rows = await client<{ count: number }[]>`
      insert into rate_limit_buckets (bucket_key, window_start, count, updated_at)
      values (${key}, ${start}, 1, now())
      on conflict (bucket_key, window_start) do update
        set count = rate_limit_buckets.count + 1,
            updated_at = now()
      returning count
    `;
    const count = rows[0]?.count ?? 1;

    // Best-effort prune of windows older than this one for the same key. Keeps
    // the table from accumulating stale rows; not in a critical path.
    void client`
      delete from rate_limit_buckets
      where bucket_key = ${key} and window_start < ${start}
    `.catch(() => undefined);

    if (count > params.limit) {
      return { allowed: false, remaining: 0, retryAfter, windowStart: start };
    }
    return {
      allowed: true,
      remaining: Math.max(0, params.limit - count),
      retryAfter,
      windowStart: start,
    };
  } catch {
    // Fail open: never block a user because the limiter itself failed.
    return { allowed: true, remaining: params.limit, retryAfter, windowStart: start };
  }
}

/**
 * Canonical limits per endpoint (single source of truth — A1 spec). Keeps the
 * numbers out of route handlers so they can't drift.
 */
export const RATE_LIMITS = {
  authEmail: { endpoint: 'auth-email', limit: 5, windowSec: 60 },
  appleSignIn: { endpoint: 'apple-signin', limit: 5, windowSec: 60 },
  // Athlete email-code login (iOS). Request = "send me a code" (throttled per IP
  // AND per email so neither a scripted flood nor a targeted inbox-bomb gets far);
  // verify = "here's my code" (throttled per IP; the per-code attempt cap in
  // email_login_codes is the primary brute-force defense).
  emailCodeRequest: { endpoint: 'email-code-request', limit: 5, windowSec: 60 * 10 },
  emailCodeVerify: { endpoint: 'email-code-verify', limit: 10, windowSec: 60 * 10 },
  partnerInvite: { endpoint: 'partner-invite', limit: 10, windowSec: 60 * 60 },
  partnerRedeem: { endpoint: 'partner-redeem', limit: 10, windowSec: 60 },
  aiSuggest: { endpoint: 'ai-suggest', limit: 30, windowSec: 60 * 60 },
  exportData: { endpoint: 'export-data', limit: 3, windowSec: 60 * 60 },
  chatSend: { endpoint: 'chat-send', limit: 60, windowSec: 60 },
  devicesRegister: { endpoint: 'devices-register', limit: 30, windowSec: 60 },
  // In-app product feedback (#59). A real athlete sends one at a time; generous
  // enough for that, tight enough to blunt a scripted flood.
  appFeedback: { endpoint: 'app-feedback', limit: 10, windowSec: 60 * 10 },
  // Public lead funnel (fahybrid.com/empieza). Draft fires once per email step +
  // retries; submit fires once at the end. Generous enough for a real visitor,
  // tight enough to blunt scripted spam (the honeypot handles the rest).
  leadsDraft: { endpoint: 'leads-draft', limit: 20, windowSec: 60 * 10 },
  leadsSubmit: { endpoint: 'leads-submit', limit: 8, windowSec: 60 * 10 },
  // Public appointment booking (token-gated). Reads (slots/context) are cheap; the
  // booking write is tighter + honeypot-guarded.
  citasContext: { endpoint: 'citas-context', limit: 40, windowSec: 60 * 10 },
  citasBook: { endpoint: 'citas-book', limit: 8, windowSec: 60 * 10 },
  // Public RGPD unsubscribe (token-gated, idempotent). Generous — a real person confirms
  // once — but capped to blunt token enumeration / scripted abuse.
  leadsUnsubscribe: { endpoint: 'leads-unsubscribe', limit: 20, windowSec: 60 * 10 },
  // Coach MCP connector (/api/mcp), throttled per COACH, not per IP: the caller
  // is the assistant's datacentre, so an IP says nothing about who is asking.
  // These are conversational READS — one question from the coach routinely fans
  // out into several tool calls, and the assistant re-reads to check itself — so
  // the ceiling is high enough to never interrupt a real conversation while
  // still bounding a runaway agent loop against the club's data.
  mcp: { endpoint: 'mcp', limit: 120, windowSec: 60 },
} as const;

/**
 * Build a 429 JSON response body + headers. Route handlers stay terse:
 *   const rl = await withRateLimit(...);
 *   if (!rl.allowed) return rateLimitResponse(rl);
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: { code: 'rate_limited', message: 'Too many requests. Please slow down.' } },
    { status: 429, headers: { 'retry-after': String(result.retryAfter) } },
  );
}
