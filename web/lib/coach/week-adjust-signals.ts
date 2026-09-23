import 'server-only';

// Las señales del cuerpo que llevan al coach a pedir una descarga — la entrada
// del motor de ajuste semanal (`evaluateAthleteWeek`, `week_adjustment_proposals`).
//
// Son las MISMAS que ve en Hoy (`loadAthleteSignals`: vivas, sin lo pospuesto o
// hecho) y cuya acción es «Proponer descarga» (`signalActionFor`: readiness bajo
// CON base, HRV hundida, RPE alto). Así el botón y el motor hablan de lo mismo:
// si Hoy ofrece la descarga por un readiness de hoy, el motor lo lee, en vez de
// contestar «mantener» mirando solo la adherencia de la semana pasada.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isActionable, type AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { BodySignal } from '@fahybrid/shared/domain/coach/coach-ia-context';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';

/** De las señales vivas de un atleta, las que piden descarga (puro). */
export function bodySignalsFrom(signals: ReadonlyArray<AthleteSignal>): BodySignal[] {
  return signals
    .filter((s) => s.action === 'proponer_descarga' && isActionable(s))
    .map((s) => ({
      kind: s.kind,
      severity: s.severity === 'critical' ? 'critical' : 'warning',
      label: s.label,
      evidence: s.evidence,
    }));
}

/** Las señales del cuerpo que piden descarga de UN atleta (del coach que lo lleva). */
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
