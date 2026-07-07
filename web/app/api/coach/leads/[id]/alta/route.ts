// POST /api/coach/leads/[id]/alta — give a lead the alta as an athlete (funnel #5).
// Coach-guarded. Body = the coach-confirmed alta modal (name, email, edad, sexo,
// días/semana, level_id, modality, notes). Creates the athlete carrying the onboarding
// data, mints a claim invite stamped with this lead, marks the alta sent, and emails
// the lead. The lead becomes `convertido` LATER, when the invite is redeemed.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { altaInputSchema, altaLeadAsAthlete, AltaError } from '@/lib/leads/alta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseLeadId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const leadId = parseLeadId(id);
  if (leadId == null) return jsonError('invalid_id', 'id debe ser un entero positivo', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = altaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'validation_error',
      'Datos de alta inválidos: revisa nombre, email y nivel.',
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const result = await altaLeadAsAthlete({
      lead_id: leadId,
      coach_id: BigInt(session.coach_id),
      input: parsed.data,
    });
    return jsonOk({ alta: result }, 201);
  } catch (err) {
    if (err instanceof AltaError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/leads/[id]/alta]', err);
    return jsonError('alta_failed', 'No se pudo dar de alta al lead', 500);
  }
}
