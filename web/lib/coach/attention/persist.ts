import 'server-only';

// Persistencia del barrido: upsert de las señales que disparan + auto-limpieza de
// las que ya no (una transacción por atleta), y la retirada de las señales de
// atletas que el barrido ya no evalúa. Extraído de recompute.ts (límite de 500
// líneas).

import type { Sql } from '@/lib/db';
import type { SignalResult } from '@fahybrid/shared/domain/coach/signals';

// ── Upsert firing + auto-clear (one athlete, one transaction) ─────────────────

export async function persistAthlete(
  client: Sql,
  coach_id: bigint | number,
  athlete_id: string,
  results: SignalResult[],
  now: Date,
): Promise<number> {
  const athleteIdNum = Number(athlete_id);
  const firingKinds = results.map((r) => r.kind);

  return client.begin(async (tx) => {
    for (const r of results) {
      await tx`
        insert into coach_attention_items (
          coach_id, athlete_id, signal_kind, severity,
          value_numeric, baseline_numeric, trend, label, detail, dedupe_key,
          observed_at, window_label,
          first_seen_at, computed_at
        )
        values (
          ${coach_id as number}, ${athleteIdNum}, ${r.kind}, ${r.severity},
          ${r.value}, ${r.baseline}, ${r.trend}, ${r.label}, ${r.detail}, ${r.dedupe_key},
          ${r.observed_at ?? null}::timestamptz, ${r.window_label ?? null},
          ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
        )
        on conflict (athlete_id, signal_kind) do update set
          -- A NEW instance (another proposal, comunicado or readiness episode) is
          -- a new item: its age starts again.
          first_seen_at = case
            when coach_attention_items.dedupe_key is distinct from excluded.dedupe_key
              then excluded.first_seen_at
            else coach_attention_items.first_seen_at
          end,
          severity = excluded.severity,
          observed_at = excluded.observed_at,
          window_label = excluded.window_label,
          value_numeric = excluded.value_numeric,
          baseline_numeric = excluded.baseline_numeric,
          trend = excluded.trend,
          label = excluded.label,
          detail = excluded.detail,
          dedupe_key = excluded.dedupe_key,
          computed_at = excluded.computed_at
      `;
    }

    // Auto-clear: delete this athlete's rows whose kind no longer fires.
    const deleted = firingKinds.length
      ? await tx<Array<{ signal_kind: string }>>`
          delete from coach_attention_items
          where athlete_id = ${athleteIdNum}
            and signal_kind <> all(${firingKinds}::text[])
          returning signal_kind
        `
      : await tx<Array<{ signal_kind: string }>>`
          delete from coach_attention_items
          where athlete_id = ${athleteIdNum}
          returning signal_kind
        `;
    return deleted.length;
  });
}

/**
 * Delete this coach's items for athletes the sweep no longer evaluates: paused,
 * baja, or moved to another coach. By lifecycle, not by «who produced facts», so
 * a transient error on one athlete never wipes their queue.
 */
export async function clearUnevaluated(client: Sql, coach_id: bigint | number): Promise<number> {
  const deleted = await client<Array<{ id: string }>>`
    delete from coach_attention_items i
    where i.coach_id = ${Number(coach_id)}
      and not exists (
        select 1 from athletes a
        where a.id = i.athlete_id
          and a.coach_id = ${Number(coach_id)}
          and a.lifecycle_status = 'activo'
      )
    returning i.id::text
  `;
  return deleted.length;
}
