/**
 * Backfill `doubles_pairs` from existing `users.partner_id` relationships
 * (migration 0065 ⟵ 0021/0026).
 *
 * EJE ÚNICO — the invariant we heal
 * ---------------------------------
 * For a SAME-COACH pair, an active `doubles_pairs` row (the TRAINING axis) must
 * exist iff `users.partner_id` is set both ways (the ACCOUNT axis). `partner_id`
 * predates `doubles_pairs`, so accounts linked before 0065 have the account axis
 * but no training pair. This one-shot creates the MISSING training pair for every
 * such relationship, mirroring what `createDoublesPair` does at link time:
 *   · canonical order athlete_a_id < athlete_b_id,
 *   · reconcile the shared (level, days) — adopt the set side when one is null,
 *     require equality when both are set (skip a genuine mismatch),
 *   · align both athletes onto that shared (level, days) so they resolve to the
 *     SAME sequence cell.
 * We do NOT touch `users.partner_id` (it is the SOURCE we read) nor
 * `subscriptions.partner_user_id` (already mirrored at link time), and never
 * `workout_executions` (joint history is conserved).
 *
 * SCOPE — honest-empty on cross-coach
 * -----------------------------------
 * We only pair two athletes who share the SAME non-null coach_id. Cross-coach
 * account links (or an athlete with no coach) are LEFT AS-IS — a training pair
 * is a coach instrument; fabricating one across coaches would be dishonest. The
 * summary reports how many were skipped for this reason.
 *
 * IDEMPOTENT
 * ----------
 * A candidate is skipped when EITHER athlete is already in an active
 * `doubles_pairs`, so re-running inserts nothing new. Safe to run repeatedly.
 *
 *   pnpm --filter @fahybrid/infra exec tsx scripts/backfill_doubles_pairs_from_partner_id.ts
 */
import {
  SEQUENCE_DAYS_MIN,
  SEQUENCE_DAYS_MAX,
} from '@fahybrid/shared/schema/program-sequences';
import { getSql } from './_db.js';

/** One bidirectional partner_id relationship whose two users share a coach. */
interface CandidateRow {
  athlete_a_id: string;
  athlete_b_id: string;
  coach_id: string;
  a_level_id: string | null;
  b_level_id: string | null;
  a_days: number | null;
  b_days: number | null;
}

type SkipReason =
  | 'already_paired'
  | 'level_mismatch'
  | 'days_mismatch'
  | 'days_out_of_band';

/**
 * Reconcile a shared classification value the way createDoublesPair does:
 *   · both set & equal    → use it
 *   · both set & different → { mismatch: true } (caller skips the candidate)
 *   · exactly one set      → adopt the set one
 *   · both null            → null
 */
function reconcile(
  a: number | null,
  b: number | null,
): { value: number | null; mismatch: boolean } {
  if (a != null && b != null) {
    return a === b ? { value: a, mismatch: false } : { value: null, mismatch: true };
  }
  return { value: a ?? b ?? null, mismatch: false };
}

async function main(): Promise<void> {
  const sql = getSql();
  try {
    // Candidate = a bidirectional partner_id pair (deduped via u1.id < u2.id)
    // whose BOTH athletes sit under the SAME non-null coach. Cross-coach links
    // are excluded here (honest-empty) and counted separately for the summary.
    const candidates = await sql<CandidateRow[]>`
      select
        a1.id::text as athlete_a_id,
        a2.id::text as athlete_b_id,
        a1.coach_id::text as coach_id,
        a1.level_id::text as a_level_id,
        a2.level_id::text as b_level_id,
        a1.training_days_per_week as a_days,
        a2.training_days_per_week as b_days
      from users u1
      join users u2 on u2.id = u1.partner_id and u2.partner_id = u1.id
      join athletes a1 on a1.user_id = u1.id
      join athletes a2 on a2.user_id = u2.id
      where u1.id < u2.id
        and u1.deleted_at is null
        and u2.deleted_at is null
        and a1.coach_id is not null
        and a1.coach_id = a2.coach_id
    `;

    // Informational: partner_id links we deliberately leave without a pair.
    const crossCoachRows = await sql<{ n: string }[]>`
      select count(*)::text as n
      from users u1
      join users u2 on u2.id = u1.partner_id and u2.partner_id = u1.id
      join athletes a1 on a1.user_id = u1.id
      join athletes a2 on a2.user_id = u2.id
      where u1.id < u2.id
        and u1.deleted_at is null
        and u2.deleted_at is null
        and (a1.coach_id is null or a2.coach_id is null or a1.coach_id is distinct from a2.coach_id)
    `;
    const crossCoach = Number(crossCoachRows[0]?.n ?? '0');

    let created = 0;
    const skipped: Record<SkipReason, number> = {
      already_paired: 0,
      level_mismatch: 0,
      days_mismatch: 0,
      days_out_of_band: 0,
    };

    for (const c of candidates) {
      const athA = Number(c.athlete_a_id);
      const athB = Number(c.athlete_b_id);
      // Canonical order (athlete_a_id < athlete_b_id) — independent of user order.
      const lo = Math.min(athA, athB);
      const hi = Math.max(athA, athB);

      const aLevel = c.a_level_id == null ? null : Number(c.a_level_id);
      const bLevel = c.b_level_id == null ? null : Number(c.b_level_id);
      const level = reconcile(aLevel, bLevel);
      if (level.mismatch) {
        skipped.level_mismatch += 1;
        console.warn(
          `[backfill:doubles-pairs] skip athletes ${lo}/${hi}: distinct level_id (${aLevel} vs ${bLevel})`,
        );
        continue;
      }
      const days = reconcile(c.a_days, c.b_days);
      if (days.mismatch) {
        skipped.days_mismatch += 1;
        console.warn(
          `[backfill:doubles-pairs] skip athletes ${lo}/${hi}: distinct training_days_per_week (${c.a_days} vs ${c.b_days})`,
        );
        continue;
      }
      if (
        days.value != null &&
        (days.value < SEQUENCE_DAYS_MIN || days.value > SEQUENCE_DAYS_MAX)
      ) {
        skipped.days_out_of_band += 1;
        console.warn(
          `[backfill:doubles-pairs] skip athletes ${lo}/${hi}: days ${days.value} out of ${SEQUENCE_DAYS_MIN}-${SEQUENCE_DAYS_MAX} band`,
        );
        continue;
      }

      await sql.begin(async (tx) => {
        // Idempotency: skip if EITHER athlete is already in an active pair.
        const existing = await tx<{ id: string }[]>`
          select id::text as id from doubles_pairs
          where status = 'active'
            and (athlete_a_id in (${lo}, ${hi}) or athlete_b_id in (${lo}, ${hi}))
          for update
        `;
        if (existing.length > 0) {
          skipped.already_paired += 1;
          return;
        }

        // Align both athletes onto the shared (level, days) — fills a gap only
        // (mismatches were already skipped above), so no set value is overwritten.
        if (level.value != null) {
          await tx`
            update athletes set level_id = ${level.value}
            where id in (${lo}, ${hi}) and (level_id is distinct from ${level.value})
          `;
        }
        if (days.value != null) {
          await tx`
            update athletes set training_days_per_week = ${days.value}
            where id in (${lo}, ${hi})
              and (training_days_per_week is distinct from ${days.value})
          `;
        }

        await tx`
          insert into doubles_pairs
            (coach_id, athlete_a_id, athlete_b_id, level_id, training_days_per_week, status)
          values
            (${c.coach_id}, ${lo}, ${hi}, ${level.value}, ${days.value}, 'active')
        `;
        created += 1;
      });
    }

    const totalSkipped =
      skipped.already_paired +
      skipped.level_mismatch +
      skipped.days_mismatch +
      skipped.days_out_of_band;

    console.log(
      `[backfill:doubles-pairs] done — ${created} created, ${totalSkipped} skipped ` +
        `(already_paired=${skipped.already_paired}, level_mismatch=${skipped.level_mismatch}, ` +
        `days_mismatch=${skipped.days_mismatch}, days_out_of_band=${skipped.days_out_of_band}); ` +
        `${crossCoach} cross-coach link(s) left honest-empty.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
