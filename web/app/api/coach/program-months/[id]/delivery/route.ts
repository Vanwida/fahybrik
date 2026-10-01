import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { retryProgramDelivery } from '@/lib/dashboard/programming/program-delivery';

const input = z.object({ week_ids: z.array(z.string().regex(/^\d+$/).refine((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)).min(1).max(26) });
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError('bad_request', 'Identificador inválido', 400);
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('invalid_payload', 'Indica las semanas pendientes.', 400);
  try {
    const delivery = await retryProgramDelivery({ coach_id: auth.session.coach_id, program_id: id, week_ids: parsed.data.week_ids });
    if (!delivery) return jsonError('not_found', 'Esas semanas no pertenecen a este programa.', 404);
    return jsonOk({ delivery });
  } catch { return jsonError('delivery_failed', 'No se pudo actualizar el plan del atleta. Reintenta la entrega.', 500); }
}
