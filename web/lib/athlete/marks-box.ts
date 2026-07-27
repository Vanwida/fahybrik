import 'server-only';

// Marcas × el box (#Marcas, mockup marcas-ranking): where a mark sits inside the
// coach's roster — percentile, median, anonymous histogram — designed for the
// ~100-athlete launch scale, never for today's test rows.
//
// The rules, decided in the mockup and enforced here:
//   · POOL: the coach's athletes minus baja, SAME sex, and for run marks the SAME
//     context (a belt 5K never enters the street pool — same rule as the PR).
//   · One value per athlete: their BEST comparable — otherwise whoever self-tests
//     weekly populates the whole curve alone.
//   · Honest start: under MIN_POOL comparables the percentile is null (a percentile
//     of 6 people is a rank in a costume) — the UI says "a 4 s de la mediana".
//   · The athlete-facing shape is anonymous by construction: counts, never names.
//     Names are the coach's view, built elsewhere.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { markBySlug, type RunContext } from '@fahybrid/shared/domain/athlete/marks';

/** Fewer comparables than this → no percentile, median-gap framing instead. */
export const MIN_POOL_FOR_PERCENTILE = 10;
/** Histogram resolution — matches the mockup's strip. */
export const HISTOGRAM_BUCKETS = 11;

export interface MarkBoxView {
  /** Athletes with a comparable best (the athlete included). */
  n: number;
  /** % of the pool this athlete beats (0–100). null under the honest-start floor. */
  percentile: number | null;
  median: number;
  /** Signed gap to the median, oriented so NEGATIVE = better for time marks. */
  delta_to_median: number;
  /** Anonymous distribution, worst→best buckets; which bucket is the athlete's. */
  histogram: number[];
  own_bucket: number;
  /** Same percentile computed with the best they already had 90 days ago — the
   *  "hace 3 meses estabas en el 50%" line. null when no mark existed back then. */
  percentile_90d_ago: number | null;
}

/**
 * Box standing for every mark the athlete has a best in. One query for the whole
 * roster's bests, grouped in memory — at launch scale (~100 athletes × 9 marks)
 * this is hundreds of rows, not thousands.
 */
export async function loadMarkBoxViews(params: {
  athlete_id: bigint;
  client?: Sql;
}): Promise<Map<string, MarkBoxView>> {
  const client = params.client ?? defaultSql;

  // The athlete's own coach + sex anchor the pool.
  const meRows = await client<{ coach_id: string | null; sex: string | null }[]>`
    select coach_id::text as coach_id, sex from athletes where id = ${params.athlete_id as unknown as number} limit 1
  `;
  const me = meRows[0];
  if (!me?.coach_id) return new Map();

  // Every roster athlete's marks (best resolved in memory to honor direction+context).
  const rows = await client<
    {
      athlete_id: string;
      exercise_slug: string;
      value: number;
      run_context: string | null;
      recorded_at: Date;
    }[]
  >`
    select b.athlete_id::text as athlete_id, b.exercise_slug, b.value::float8 as value,
           b.run_context, b.recorded_at
    from athlete_benchmarks b
    join athletes a on a.id = b.athlete_id
    where a.coach_id = ${Number(me.coach_id)}
      and a.lifecycle_status <> 'baja'
      and coalesce(a.sex, '') = coalesce(${me.sex}, '')
  `;

  const out = new Map<string, MarkBoxView>();
  const myId = params.athlete_id.toString();
  const cutoff90 = Date.now() - 90 * 86_400_000;

  for (const spec of ['run_1k', 'cooper_12min', 'run_5k', 'row_500m', 'row_1k', 'ski_1k', 'run_10k', 'run_half', 'run_marathon']
    .map((s) => markBySlug(s)!)
    .filter(Boolean)) {
    const markRows = rows.filter((r) => r.exercise_slug === spec.slug);
    if (markRows.length === 0) continue;

    // My best decides my comparable context for run marks (PR rule, unchanged).
    const better = (a: number, b: number) => (spec.lower_is_better ? a < b : a > b);
    const mine = markRows.filter((r) => r.athlete_id === myId);
    if (mine.length === 0) continue;
    const myBestRow = mine.reduce((best, r) => (better(r.value, best.value) ? r : best));
    const context: RunContext | null = spec.group === 'run' ? ((myBestRow.run_context as RunContext | null) ?? 'outdoor') : null;
    const comparable = (r: (typeof markRows)[number]) =>
      spec.group === 'run' ? (r.run_context ?? 'outdoor') === context : true;

    // Best comparable per athlete — one voice per person in the curve.
    const bestBy = new Map<string, number>();
    for (const r of markRows.filter(comparable)) {
      const prev = bestBy.get(r.athlete_id);
      if (prev === undefined || better(r.value, prev)) bestBy.set(r.athlete_id, r.value);
    }
    const myBest = bestBy.get(myId);
    if (myBest === undefined) continue;

    const values = [...bestBy.values()];
    const n = values.length;
    const beaten = values.filter((v) => better(myBest, v)).length;
    const percentile = n >= MIN_POOL_FOR_PERCENTILE ? Math.round((beaten / (n - 1 || 1)) * 100) : null;

    const sorted = [...values].sort((a, b) => a - b);
    const median =
      n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;

    // Histogram worst→best so the strip always reads left-bad → right-good.
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(1e-9, hi - lo);
    const bucketOf = (v: number) => {
      const t = (v - lo) / span; // 0 at fastest/most for time? lo = smallest value
      const asc = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor(t * HISTOGRAM_BUCKETS));
      // Time marks: smaller = better → bucket 0 (lo) is BEST; flip so index 0 = worst.
      return spec.lower_is_better ? HISTOGRAM_BUCKETS - 1 - asc : asc;
    };
    const histogram = Array.from({ length: HISTOGRAM_BUCKETS }, () => 0);
    for (const v of values) histogram[bucketOf(v)]! += 1;

    // The 90-days-ago look: my best using only marks that existed then, vs TODAY's
    // pool — "how far have I moved inside this group".
    const mineOld = mine.filter((r) => comparable(r) && r.recorded_at.getTime() <= cutoff90);
    let percentile_90d_ago: number | null = null;
    if (mineOld.length > 0 && n >= MIN_POOL_FOR_PERCENTILE) {
      const oldBest = mineOld.reduce((best, r) => (better(r.value, best.value) ? r : best)).value;
      const beatenOld = values.filter((v) => better(oldBest, v)).length;
      percentile_90d_ago = Math.round((beatenOld / (n - 1 || 1)) * 100);
    }

    out.set(spec.slug, {
      n,
      percentile,
      median: Math.round(median * 10) / 10,
      delta_to_median: Math.round((myBest - median) * 10) / 10,
      histogram,
      own_bucket: bucketOf(myBest),
      percentile_90d_ago,
    });
  }

  return out;
}
