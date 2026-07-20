import { jsonError, jsonOk, getClientIp } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { demoCoachBySlot } from '@/lib/auth/demo-access';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mint a long-lived athlete Bearer JWT for one of the two seeded DEMO athletes
// (Atleta Demo 1 / 2), so anyone can log into the iOS app as that athlete without
// a real Apple ID — a permanent, credential-free showcase login in the single
// production universe (Alex's ask: "NADA DE ENTORNOS DEMO", these must just work).
//
// SAFE: it resolves ONLY the two hard-coded demo athlete emails from DEMO_COACHES
// and issues the SAME kind of athlete session every real sign-in uses
// (lib/auth/session, athlete audience) — DB-backed + revocable, no parallel auth.
// It does NOT touch the demo COACH path (that stays gated behind DEMO_ACCESS in
// proxy.ts / coach-session.ts, so no dashboard auth-bypass leaks to production).
// The exposure is intentional: these are demo-data accounts meant to be open.
export async function POST(req: Request) {
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

  const rows = await sql<{ user_id: string; athlete_id: string; full_name: string }[]>`
    select u.id::text as user_id, a.id::text as athlete_id, a.full_name
    from users u
    join athletes a on a.user_id = u.id
    where lower(u.email) = ${spec.athlete_email.toLowerCase()} and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return jsonError('not_found', 'Demo athlete not seeded', 404);
  }

  const session = await issueSession({
    user_id: BigInt(row.user_id),
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: req.headers.get('user-agent'),
    ip: getClientIp(req),
  });

  return jsonOk({
    slot: spec.slot,
    athlete_id: Number(row.athlete_id),
    athlete_email: spec.athlete_email,
    full_name: row.full_name,
    bearer: session.token,
    expires_at: session.expires_at.toISOString(),
  });
}
