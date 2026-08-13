import 'server-only';
import type { Sql, TransactionClient } from '@/lib/db';
import { aggregateHeights, resolveAttempt, type JumpAttempt } from '@fahybrid/shared/domain/jump/session';
import { BENCH_CMJ, BENCH_CMJ_LOADED } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import type { JumpAttemptInput, TestResultEntry } from '@fahybrid/shared/schema/test-battery';

const HEIGHT_TOLERANCE_CM = 0.05;

export type JumpPersistError = 'frames_invalid' | 'height_mismatch';

export function signJumpResults(
  attempts: JumpAttemptInput[],
  results: TestResultEntry[],
  keep: 'best' | 'mean_best_2' = 'best',
): { ok: true } | { ok: false; error: JumpPersistError } {
  const resolved: { kind: string; height_cm: number; kept: boolean }[] = [];
  for (const raw of attempts) {
    const attempt: JumpAttempt = {
      kind: raw.kind,
      takeoff_frame: raw.takeoff_frame,
      landing_frame: raw.landing_frame,
      fps: raw.fps,
      load: raw.kind === 'loaded_cmj' ? { kind: 'kg', kg: 1 } : { kind: 'none' },
      quality: raw.quality,
    };
    const r = resolveAttempt(attempt);
    if (raw.quality !== 'discarded' && r == null) return { ok: false, error: 'frames_invalid' };
    if (r) resolved.push({ kind: raw.kind, height_cm: r.height_cm, kept: raw.kept });
  }

  const check = (slug: string, kind: string) => {
    const posted = results.find((x) => x.slug === slug);
    if (!posted) return true;
    const kept = resolved.filter((a) => a.kind === kind && a.kept).map((a) => a.height_cm);
    const agg = aggregateHeights(kept, keep);
    if (agg == null) return false;
    return Math.abs(agg - posted.value) <= HEIGHT_TOLERANCE_CM;
  };

  if (!check(BENCH_CMJ, 'cmj')) return { ok: false, error: 'height_mismatch' };
  if (!check(BENCH_CMJ_LOADED, 'loaded_cmj')) return { ok: false, error: 'height_mismatch' };
  return { ok: true };
}

export async function insertJumpAttempts(
  client: Sql | TransactionClient,
  input: {
    athlete_id: number;
    assignment_id: number;
    body_mass_kg: number | null;
    load_kg: number | null;
    attempts: JumpAttemptInput[];
  },
): Promise<void> {
  for (const raw of input.attempts) {
    const resolved = resolveAttempt({
      kind: raw.kind,
      takeoff_frame: raw.takeoff_frame,
      landing_frame: raw.landing_frame,
      fps: raw.fps,
      load: { kind: 'none' },
      quality: raw.quality,
    });
    if (resolved == null) continue;
    const loadKg = raw.kind === 'loaded_cmj' ? input.load_kg : null;
    await client`
      insert into jump_attempts (
        athlete_id, assignment_id, kind, load_kg, body_mass_kg,
        takeoff_frame, landing_frame, fps, flight_time_s, height_cm, quality, kept
      ) values (
        ${input.athlete_id}, ${input.assignment_id}, ${raw.kind},
        ${loadKg}, ${input.body_mass_kg},
        ${raw.takeoff_frame}, ${raw.landing_frame}, ${raw.fps},
        ${resolved.flight_time_s}, ${resolved.height_cm}, ${raw.quality}, ${raw.kept}
      )
    `;
  }
}
