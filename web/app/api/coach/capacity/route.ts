// POST /api/coach/capacity — set the single coach's max athlete cap (#18). Coach-guarded,
// Zod-validated. `max_athletes`: a non-negative integer, or null to remove the limit
// (uncapped → the waitlist never engages). Capacity is its own resource (coaches.max_athletes,
// lib/coach/capacity.ts), so it gets its own route rather than being folded into the
// availability PUT — the Disponibilidad "cupo" field posts here. Returns the persisted value.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getMaxAthletes, setMaxAthletes } from '@/lib/coach/capacity';
import { releaseWaitlistToCapacity } from '@/lib/leads/waitlist';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const capacityInput = z.object({
  max_athletes: z.number().int().min(0).nullable(),
});

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  const parsed = capacityInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Cupo no válido', 400, parsed.error.flatten());
  }

  await setMaxAthletes(session.coach_id, parsed.data.max_athletes);
  const max_athletes = await getMaxAthletes(session.coach_id);

  // Raising the cap opens plazas → auto-notify the next in line immediately (FIFO). Defensive:
  // the cap is already persisted, so a release failure must never fail the cupo save.
  let released = 0;
  try {
    ({ released } = await releaseWaitlistToCapacity());
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/capacity.POST', meta: { max_athletes } });
  }

  return jsonOk({ max_athletes, released });
}
