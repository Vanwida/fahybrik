import 'server-only';

// Evidencia de vida del alta: entrenó, escribió, o el chip de semana ya no
// es un alta a oscuras. Batched, una consulta por tabla. No cierra el alta.
// No asigna el mes. No publica.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  FRESH_ALTA_LIFE,
  type AltaLifeEvidence,
} from '@fahybrid/shared/domain/coach/alta-stance';
import type { PendingIntakeAthlete } from '@/lib/coach/intake';
import type { PendingAlta } from '@/lib/coach/pending-alta';
import { loadAthleteWeekChipMap } from '@/lib/dashboard/coach/load-athlete-week-chip';

export type { PendingAlta };

export async function loadAltaLifeMap(params: {
  athlete_ids: Array<number | bigint | string>;
  client?: Sql;
}): Promise<Map<string, AltaLifeEvidence>> {
  const client = params.client ?? defaultSql;
  const ids = [...new Set(params.athlete_ids.map((id) => Number(id)))].filter((n) => Number.isFinite(n));
  const map = new Map<string, AltaLifeEvidence>();
  for (const id of ids) map.set(String(id), { ...FRESH_ALTA_LIFE });
  if (ids.length === 0) return map;

  const [chips, trained, chatted] = await Promise.all([
    loadAthleteWeekChipMap({ athlete_ids: ids, client }),
    client<Array<{ athlete_id: string }>>`
      select distinct athlete_id::text as athlete_id
      from workout_executions
      where athlete_id = any(${ids}::bigint[])
    `,
    client<Array<{ athlete_id: string }>>`
      select distinct t.athlete_id::text as athlete_id
      from chat_threads t
      join chat_messages m on m.thread_id = t.id
      where t.athlete_id = any(${ids}::bigint[])
        and m.sender_role = 'athlete'
    `,
  ]);

  const trainedSet = new Set(trained.map((r) => r.athlete_id));
  const chattedSet = new Set(chatted.map((r) => r.athlete_id));

  for (const id of ids) {
    const key = String(id);
    map.set(key, {
      has_trained: trainedSet.has(key),
      has_chatted: chattedSet.has(key),
      week_kind: chips.get(key)?.kind ?? 'sin_plan',
    });
  }
  return map;
}

export async function withAltaLife(
  pending: PendingIntakeAthlete[],
  client?: Sql,
): Promise<PendingAlta[]> {
  const lifeMap = await loadAltaLifeMap({
    athlete_ids: pending.map((p) => p.athlete_id),
    client,
  });
  return pending.map((p) => ({
    ...p,
    life: lifeMap.get(p.athlete_id) ?? { ...FRESH_ALTA_LIFE },
  }));
}
