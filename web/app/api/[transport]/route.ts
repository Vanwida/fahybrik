// The coach's MCP server. Phase 1: OAuth + three read tools.
//
// WHY THE ROUTE LIVES HERE. `mcp-handler` needs one dynamic segment to serve
// both transports from a single file. It cannot go at the app root because
// `app/[locale]` already owns that position, so it sits under `api/` and
// `basePath: '/api'` derives the endpoints:
//
//   POST /api/mcp   → Streamable HTTP (what Claude and Grok speak today)
//        /api/sse   → 404, see DISABLED SSE below
//
// The dynamic segment is a SIBLING of ~25 static folders under app/api. Next
// resolves static segments first, so /api/coach/*, /api/athlete/* and the rest
// are untouched; only paths with no static folder reach this file. And a path
// that reaches it without being a known transport gets mcp-handler's own 404, so
// a typo'd API URL still 404s exactly as it did before this route existed.
//
// DISABLED SSE. The SSE transport in mcp-handler 1.x is stateful and requires
// Redis to fan messages between the two halves of a session; it throws
// "redisUrl is required" on the first request without it. There is no Redis in
// this stack on purpose (rate limiting is a Postgres table for the same reason),
// so SSE is turned OFF rather than left to 500 on first contact. Nothing is lost
// for phase 1: SSE was deprecated by the MCP spec in 2025-03-26 and every client
// we target uses Streamable HTTP.

import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { clerkUserIdFromAuthInfo, verifyMcpToken } from '@/lib/mcp/auth';
import { MCP_BASE_PATH, MCP_RESOURCE_METADATA_PATH } from '@/lib/mcp/paths';
import { registerCoachReadTools } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A briefing fans out into a cohort roll-up per athlete. Comfortably inside
// Vercel's ceiling, and far above the ~2 s a real call takes.
export const maxDuration = 60;

const handler = createMcpHandler(
  registerCoachReadTools,
  { serverInfo: { name: 'fahybrid-coach', version: '1.0.0' } },
  { basePath: MCP_BASE_PATH, disableSse: true },
);

/**
 * Throttle before the tools run, keyed by the identity in the token.
 *
 * Keyed by the Clerk user rather than by `coach_id` on purpose: the coach id is
 * only knowable by running the membership query, which is exactly the work the
 * limiter exists to bound, so a coach-keyed bucket cannot protect the lookup
 * that produces its own key. The Clerk user id is already in the verified token,
 * costs nothing to read, and is the truer subject anyway — a club can have
 * several members, and one of them burning the budget should not silence the
 * others.
 */
async function throttled(req: Request): Promise<Response> {
  const clerkUserId = clerkUserIdFromAuthInfo(req.auth);
  if (!clerkUserId) {
    // Unreachable behind `required: true` (withMcpAuth already returned 401),
    // but the limiter must never fall back to an unkeyed bucket shared by
    // everyone, so the request stops here instead.
    return new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'Missing token identity' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const rl = await withRateLimit({
    scope: 'mcp-user',
    identifier: clerkUserId,
    ...RATE_LIMITS.mcp,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  return handler(req);
}

// `resourceMetadataPath` is what the 401's WWW-Authenticate header points at.
// mcp-handler defaults it to the BARE well-known path, which describes a resource
// mounted at the domain root; ours is not, so it is passed explicitly from the
// same constant the metadata route derives its `resource` from.
const authedHandler = withMcpAuth(throttled, verifyMcpToken, {
  required: true,
  resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
});

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
