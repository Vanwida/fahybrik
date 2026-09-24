import 'server-only';

// Las señales de Hoy que piden tocar la semana — LA entrada (y el veredicto) del
// motor de ajuste semanal (`evaluateAthleteWeek`, `week_adjustment_proposals`,
// `weekly-verdict-rules`).
//
// Son las MISMAS que ve en Hoy (`loadAthleteSignals`: vivas, sin lo pospuesto o
// hecho): las de «Proponer descarga» (`signalActionFor`: readiness bajo CON base,
// HRV hundida, RPE alto) y los entrenos sin hacer (número y proporción del
// coach). Así el botón, el cron del lunes y Hoy contestan lo mismo: el motor ya
// no tiene reglas ni números propios (adherencia < 60 %, readiness < 45…).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isActionable, type AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { BodySignal } from '@fahybrid/shared/domain/coach/coach-ia-context';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';

/** Una señal de Hoy pide tocar la semana si ofrece la descarga o son entrenos sin hacer. */
export function asksToAdjustWeek(s: Pick<AthleteSignal, 'action' | 'kind' | 'severity'>): boolean {
  return isActionable(s) && (s.action === 'proponer_descarga' || s.kind === 'missed_sessions');
}

/** De las señales vivas de un atleta, las que piden tocar la semana (puro). */
export function bodySignalsFrom(signals: ReadonlyArray<AthleteSignal>): BodySignal[] {
  return signals
    .filter(asksToAdjustWeek)
    .map((s) => ({
      kind: s.kind,
      severity: s.severity === 'critical' ? 'critical' : 'warning',
      label: s.label,
      evidence: s.evidence,
    }));
}

/** Las señales de Hoy que piden tocar la semana de UN atleta (del coach que lo lleva). */
export async function loadBodySignals(params: {
  athlete_id: number | bigint;
  now?: Date;
  client?: Sql;
}): Promise<BodySignal[]> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${Number(params.athlete_id)} limit 1
  `;
  const coach_id = rows[0]?.coach_id;
  if (!coach_id) return [];
  const read = await loadAthleteSignals({
    coach_id: Number(coach_id),
    athlete_ids: [params.athlete_id],
    now: params.now,
    client,
  });
  return bodySignalsFrom(read.get(String(params.athlete_id))?.live ?? []);
}
