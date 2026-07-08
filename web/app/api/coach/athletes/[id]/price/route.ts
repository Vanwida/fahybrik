import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { updateAgreedPrice } from '@/lib/coach/billing-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// The coach edits the agreed monthly price in integer CENTS (money is never a
// float). A price must be > 0 — a comp athlete is set via the alta cortesía path,
// not by pricing at 0 here.
const patchPriceSchema = z.object({
  amount_cents: z.number().int().positive(),
});

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/athletes/[id]/price
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = patchPriceSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'validation_error',
      'Datos inválidos: amount_cents debe ser un entero positivo',
      422,
      parsed.error.flatten(),
    );
  }

  const coach_id = Number(session.coach_id);

  // Ownership gate — the athlete must belong to this coach.
  const owned = await sql<Array<{ id: string }>>`
    select id::text as id from athletes
    where id = ${athlete_id} and coach_id = ${coach_id}
    limit 1
  `;
  if (!owned[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const result = await updateAgreedPrice({
    athlete_id: BigInt(athlete_id),
    amount_cents: parsed.data.amount_cents,
  });

  return jsonOk({ amount_cents: parsed.data.amount_cents, stripe_synced: result.stripe_synced });
}
