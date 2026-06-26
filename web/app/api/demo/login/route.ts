import { jsonError, jsonOk, getClientIp } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { demoCoachBySlot, isDemoAccessEnabled } from '@/lib/auth/demo-access';
import { setDemoCoachCookie } from '@/lib/auth/demo-cookie';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Gated demo coach sign-in. POST { slot: 1 | 2 } → sets a DB-backed, revocable
// coach JWT in the demo cookie for the matching seeded demo coach, then the
// caller redirects to /hoy. 404 (never 403) when the flag is off so the
// endpoint is indistinguishable from non-existent on production.
export async function POST(req: Request) {
  if (!isDemoAccessEnabled()) {
    return jsonError('not_found', 'Not found', 404);
  }

  let body: { slot?: unknown };
  try {
    body = (await req.json()) as { slot?: unknown };
  } catch {
    return jsonError('bad_request', 'Invalid JSON body', 400);
  }

  const slot = Number(body.slot);
  const spec = demoCoachBySlot(slot);
  if (!spec) {
    return jsonError('bad_request', 'Unknown demo slot', 400);
  }

  // Resolve the seeded demo coach by email. We never CREATE here — if the demo
  // DB has not been seeded, the slot simply does not exist.
  const rows = await sql<{ user_id: string; full_name: string }[]>`
    select u.id::text as user_id, c.full_name
    from users u
    join coaches c on c.user_id = u.id
    where lower(u.email) = ${spec.coach_email.toLowerCase()} and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return jsonError('not_found', 'Demo coach not seeded', 404);
  }

  const session = await issueSession({
    user_id: BigInt(row.user_id),
    audience: audiences.coach,
    ttl_seconds: AUTH_CONFIG.coachSessionTtlSeconds,
    user_agent: req.headers.get('user-agent'),
    ip: getClientIp(req),
  });

  await setDemoCoachCookie(session.token, session.expires_at);

  return jsonOk({
    slot: spec.slot,
    coach_email: spec.coach_email,
    full_name: row.full_name,
  });
}
