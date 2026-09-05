// POST /api/athlete/wearables/coros/confirm  (athlete bearer)
// { confirmation_id, answer: 'yes' | 'no' }

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { confirmCorosLink } from '@/lib/sync/coros-link';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    confirmation_id: z.string().regex(/^\d+$/),
    answer: z.enum(['yes', 'no']),
  })
  .strict();

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'confirmation_id and answer (yes|no) are required', 400);
  }

  const result = await confirmCorosLink({
    sql,
    athlete_id: session.athlete_id,
    confirmationId: parsed.data.confirmation_id,
    answer: parsed.data.answer,
  });
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 409;
    return jsonError(result.error, 'Confirmation is not pending', status);
  }
  return jsonOk({ ok: true, answer: result.answer });
}
