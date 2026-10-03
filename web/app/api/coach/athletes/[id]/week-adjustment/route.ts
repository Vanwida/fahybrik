import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  listPendingWeekAdjustments,
  loadProposalTemplateNames,
} from '@/lib/dashboard/coach/week-adjustments';
import { firedTriggersFromContext } from '@fahybrid/shared/domain/coach/weekly-evaluation';
import { parseWeekAdjustmentReadQuery, pendingForAthlete } from '@/lib/dashboard/v2/week-adjustment-period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Propuesta de ajuste de semana PENDIENTE para este atleta (si la hay). Alimenta
 * el panel "Evaluar semana" de la pestaña Rendimiento. Read-only:
 *  · `proposal`        → PendingAdjustment | null (getPendingProposalForAthlete).
 *  · `template_names`  → nombres from/to de los slot_changes (nunca IDs crudos).
 *  · `fired_triggers`  → el "por qué", re-derivado SOLO del context_pack persistido
 *                        con las MISMAS reglas puras del veredicto (cero divergencia
 *                        con la evaluación en vivo). [] si la fila no guardó pack.
 * Mismo guard coach-auth que el hermano propose/route.ts.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  const query = parseWeekAdjustmentReadQuery(new URL(request.url).searchParams);
  if (!query.success) return jsonError('bad_request', 'Semana o propuesta inválida', 400);
  const pending = (await listPendingWeekAdjustments({ coach_id: session.coach_id }))
    .filter((p) => p.athlete_id === String(parsedId.data.id));
  const proposal = pendingForAthlete(pending, String(parsedId.data.id), query.data.week_start, query.data.proposal_id);
  const other = pending.find((p) => p.id !== proposal?.id) ?? null;
  const other_pending = other ? { id: other.id, week_start: other.week_start } : null;

  if (!proposal) {
    return jsonOk({ proposal: null, template_names: {}, fired_triggers: [], other_pending });
  }

  const template_names =
    proposal.proposal.slot_changes.length > 0
      ? await loadProposalTemplateNames({ proposal: proposal.proposal, coach_id: session.coach_id })
      : {};

  const fired_triggers = proposal.context_pack
    ? firedTriggersFromContext(proposal.context_pack)
    : [];

  return jsonOk({ proposal, template_names, fired_triggers, other_pending });
}
