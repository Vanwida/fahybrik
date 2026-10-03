import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { z } from 'zod';
import { weekAdjustmentProposeInputSchema } from '@fahybrid/shared/schema/week-adjustment';

/** Identidad PostgreSQL bigint como string, sin perder precisión por Number. */
export const adjustmentProposalIdSchema = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'ID fuera de rango');

/** Un origen explícito, sin aceptar duplicados ni sustituir uno por otro. */
const readQuerySchema = z.object({
  week_start: z.array(weekAdjustmentProposeInputSchema.shape.week_start.unwrap()).max(1),
  proposal_id: z.array(adjustmentProposalIdSchema).max(1),
}).refine((q) => !(q.week_start.length && q.proposal_id.length), 'Elige una semana o una propuesta')
  .transform((q) => ({ week_start: q.week_start[0], proposal_id: q.proposal_id[0] }));

export function parseWeekAdjustmentReadQuery(search: URLSearchParams) {
  return readQuerySchema.safeParse({ week_start: search.getAll('week_start'), proposal_id: search.getAll('proposal_id') });
}

/** La señal serializa tipo:atleta:propuesta. No se extrae identidad del texto visible. */
export function proposalIdFromSignal(dedupeKey: string, athleteId: string): string | null {
  const [kind, owner, id, extra] = dedupeKey.split(':');
  if (kind !== 'week_adjustment_pending' || owner !== athleteId || extra !== undefined) return null;
  const parsed = adjustmentProposalIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

/** Evaluar N produce un ajuste para N+1; no son el mismo periodo. */
export function adjustmentWeekFor(evaluatedWeek: string): string {
  return isoDateString(addDays(parseIsoDate(evaluatedWeek), 7));
}

export function evaluatedWeekFor(adjustmentWeek: string): string {
  return isoDateString(addDays(parseIsoDate(adjustmentWeek), -7));
}

/** ID explícito se resuelve exactamente; el modo manual conserva primera pendiente/N+1. */
export function pendingForEvaluation<T extends { week_start: string; id?: string }>(pending: T[], evaluatedWeek?: string, proposalId?: string): T | null {
  if (proposalId !== undefined) return pending.find((p) => p.id === proposalId) ?? null;
  return pending.find((p) => !evaluatedWeek || p.week_start === adjustmentWeekFor(evaluatedWeek)) ?? null;
}

/** La lista ya viene limitada al coach y a status=pending por el loader SQL. */
export function pendingForAthlete<T extends { athlete_id: string; week_start: string; id: string }>(
  pending: T[], athleteId: string, evaluatedWeek?: string, proposalId?: string,
): T | null {
  return pendingForEvaluation(pending.filter((p) => p.athlete_id === athleteId), evaluatedWeek, proposalId);
}
