import { ageLabel, type AthleteSignal, type AthleteStatus } from '@fahybrid/shared/domain/coach/athlete-state';
import type { AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import type { HoyRow, SystemicGroup } from './hoy-types';

/** Mismos hechos y señales ya cargados; ninguna consulta ni regla nueva. */
export function withGroupRows(
  groups: SystemicGroup[], facts: ReadonlyArray<AthletePlanFacts>,
  live: ReadonlyMap<string, AthleteSignal[]>, replies: HoyRow[], now: Date,
  statuses: ReadonlyMap<string, AthleteStatus>,
): SystemicGroup[] {
  const byId = new Map(facts.map((f) => [f.athlete_id, f]));
  const replyBy = new Map(replies.map((r) => [r.athlete_id, r]));
  return groups.map((group) => ({ ...group, rows: group.athlete_ids.flatMap((id) => {
    const f = byId.get(id);
    if (!f) return [];
    const reply = replyBy.get(id);
    if (group.kind === 'awaiting_reply') return reply ? [{ ...reply, status_key: statuses.get(id)?.key }] : [];
    const kind = group.kind === 'payments_overdue' ? 'billing_at_risk'
      : group.kind === 'intake_pending' ? 'intake_pending' : 'programming_status';
    const engine = (live.get(id) ?? []).find((s) => s.kind === kind && (
      group.kind === 'payments_overdue' ? s.severity === 'critical'
        : group.kind === 'no_program' ? /:(no_month|block_ended)$/.test(s.dedupe_key)
          : group.kind === 'intake_pending'
    ));
    const signal: AthleteSignal = engine ?? {
      kind, severity: group.kind === 'payments_overdue' ? 'critical' : 'warning',
      label: group.kind === 'week_hidden' ? (f.week_chip.kind === 'no_lo_ve' ? 'No ve su semana' : 'No verá la semana que viene')
        : group.kind === 'no_program' ? (f.plan === 'terminado' ? 'Programa terminado' : 'Sin programa')
          : group.kind === 'intake_pending' ? 'Alta pendiente' : 'Pago vencido',
      evidence: group.detail, value: null, baseline: null, window_label: null, observed_at: null,
      action: group.kind === 'week_hidden' ? 'publicar_semana'
        : group.kind === 'no_program' ? 'asignar_programa'
          : group.kind === 'intake_pending' ? 'revisar_alta' : 'recordar_pago',
      lens: group.kind === 'intake_pending' ? 'altas' : group.kind === 'payments_overdue' ? 'cobros' : 'plan',
      first_seen_at: group.kind === 'intake_pending' ? f.onboarded_at : null,
      dedupe_key: `hoy:${group.kind}:${id}:${group.week_start ?? ''}`,
    };
    return [{ athlete_id: id, name: f.name, avatar_url: f.avatar_url, level_label: f.level?.label ?? null, status_key: statuses.get(id)?.key,
      primary: signal, others: [], other_count: 0, age_label: signal.first_seen_at ? ageLabel(signal.first_seen_at, now) : 'ahora',
      snoozable: false }];
  }) }));
}
