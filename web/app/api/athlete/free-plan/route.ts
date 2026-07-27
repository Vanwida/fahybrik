import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadFreePlan } from '@/lib/athlete/free-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/free-plan — the computed portrait behind the FREE Plan tab.
//
// WHY A NEW ROUTE RATHER THAN MORE FIELDS ON /plan/week:
//
//   · Different question. `/plan/week` answers "what did my coach publish this
//     week". This answers "what do your own numbers say, and what would a week
//     built on them look like". Only one of them is about a coach.
//   · It would tax the paying athlete. `/plan/week` already runs the macro
//     summary, the published week, the coach name and two race lookups on every
//     open of the paid app. Bolting four more reads onto it to serve users who
//     are, by definition, not calling it is a regression for the people paying.
//   · Additive by construction. A route that did not exist cannot break an
//     installed build, so there is no wire-compat question to get wrong.
//
// The client only calls this when the athlete has no coach. An athlete WITH a
// coach sees exactly what they saw before — nothing on this path runs for them.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const payload = await loadFreePlan(Number(auth.athlete_id));
  return jsonOk(payload);
}
