import 'server-only';

import { z } from 'zod';
import { subscriptionPlanType } from '@fahybrid/shared/schema/_primitives';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Coach-granted "comp" (courtesy / comp'd) athletes.
//
// A comp athlete gets FULL app access with NO billing: the coach creates the
// account manually (for themselves, for the coach, or to gift access). We model
// this as a normal `users` row (role='athlete') + an `athletes` row linked to
// the coach + a `subscriptions` row with status='active' and source='comp'.
//
// status='active' is what every surface (iOS + dashboard) checks for full
// access, so the comp athlete is indistinguishable from a paying one at the
// access layer. The `source='comp'` flag is purely for revenue accounting
// (MRR / revenue-churn EXCLUDE comp — they pay nothing) and for the UI badge.

/** Validated body for POST /api/coach/athletes. */
export const compAthleteInputSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  modality: subscriptionPlanType,
});
export type CompAthleteInput = z.infer<typeof compAthleteInputSchema>;

export interface CompAthleteResult {
  id: string;
  full_name: string;
  modality: z.infer<typeof subscriptionPlanType>;
  comp: true;
}

/**
 * Optional structured profile written onto the athlete row alongside the base
 * create. Used by the lead alta (#5) to carry the onboarding answers into the
 * athlete (sex, dob, days/week, level, coach notes). Every field is optional and
 * only overwrites an existing athlete's value when provided (COALESCE) — the plain
 * AddAthleteModal path passes none of this and behaves exactly as before.
 */
export interface CompAthleteProfile {
  sex?: 'male' | 'female' | 'other' | null;
  /** ISO yyyy-mm-dd. */
  dob?: string | null;
  training_days_per_week?: number | null;
  level_id?: number | bigint | null;
  level_source?: 'algorithm' | 'coach' | 'self_reported' | null;
  /** Coach-facing intake notes (jsonb) — JSON-scalar values only. */
  intake_notes_json?: Record<string, string | number | boolean | null> | null;
}

export type CompAthleteErrorCode = 'email_in_use' | 'athlete_other_coach';

/** Domain error with an HTTP-friendly code + status the route maps directly. */
export class CompAthleteError extends Error {
  constructor(
    readonly code: CompAthleteErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CompAthleteError';
  }
}

/**
 * Idempotently create (or attach) a comp athlete for a coach.
 *
 * Steps, all inside ONE transaction:
 *   1. Find user by email (deleted_at is null).
 *      - exists & role='athlete' → reuse.
 *      - exists & role!='athlete' → 409 (don't convert a coach/admin account).
 *      - absent → insert users (role='athlete', idioma DB-default 'es').
 *   2. Find athlete by user_id.
 *      - exists & coach_id is another coach → 409.
 *      - exists & coach_id null or == this coach → set coach_id (idempotent).
 *      - absent → insert athletes (user_id, full_name, coach_id).
 *   3. Comp subscription: if NO status='active' sub exists for the user →
 *      insert one (source='comp', current_period_end=null). If one already
 *      exists → leave it untouched (no duplicate active sub).
 *
 * Calling twice with the same email is a no-op beyond the first call: no
 * duplicate user / athlete / active subscription.
 */
export async function createCompAthlete(params: {
  coach_id: number | bigint;
  input: CompAthleteInput;
  client?: Sql | TransactionClient;
  profile?: CompAthleteProfile;
}): Promise<CompAthleteResult> {
  const { coach_id } = params;
  const email = params.input.email.trim().toLowerCase();
  const full_name = params.input.full_name.trim();
  const modality = params.input.modality;

  // Structured profile carry-over (nullable; only set/overwrite when provided).
  const p = params.profile ?? {};
  const pSex = p.sex ?? null;
  const pDob = p.dob ?? null;
  const pDays = p.training_days_per_week ?? null;
  const pLevelId = p.level_id != null ? Number(p.level_id) : null;
  const pLevelSource = p.level_source ?? null;
  const pNotes = p.intake_notes_json ?? null;

  // Run on the caller's transaction when one is passed (keeps the lead alta atomic),
  // otherwise open our own. `tx` is a transaction client either way — no nested begin.
  const run = async (tx: Sql | TransactionClient): Promise<CompAthleteResult> => {
    // 1. user
    const existingUsers = await tx<Array<{ id: string; role: string }>>`
      select id::text as id, role
      from users
      where email = ${email}
        and deleted_at is null
      limit 1
    `;
    let userId: bigint;
    const existingUser = existingUsers[0];
    if (existingUser) {
      if (existingUser.role !== 'athlete') {
        throw new CompAthleteError(
          'email_in_use',
          'Ese email ya es una cuenta no-atleta (coach o admin).',
          409,
        );
      }
      userId = BigInt(existingUser.id);
      await tx`update users set last_seen_at = now() where id = ${userId}`;
    } else {
      const inserted = await tx<Array<{ id: string }>>`
        insert into users (email, role, last_seen_at)
        values (${email}, 'athlete', now())
        returning id::text as id
      `;
      userId = BigInt(inserted[0]!.id);
    }

    // 2. athlete
    const existingAthletes = await tx<
      Array<{ id: string; coach_id: string | null }>
    >`
      select id::text as id, coach_id::text as coach_id
      from athletes
      where user_id = ${userId}
      limit 1
    `;
    let athleteId: string;
    const existingAthlete = existingAthletes[0];
    if (existingAthlete) {
      const currentCoach =
        existingAthlete.coach_id != null ? Number(existingAthlete.coach_id) : null;
      if (currentCoach != null && currentCoach !== coach_id) {
        throw new CompAthleteError(
          'athlete_other_coach',
          'Ese atleta ya pertenece a otro coach.',
          409,
        );
      }
      // coach_id null or already this coach → (re)assign idempotently. Profile
      // fields overwrite only when provided (COALESCE), so re-running the alta
      // never blanks data the coach already curated.
      const updated = await tx<Array<{ id: string }>>`
        update athletes set
          coach_id               = ${coach_id},
          sex                    = coalesce(${pSex}::athlete_sex, sex),
          dob                    = coalesce(${pDob}::date, dob),
          training_days_per_week = coalesce(${pDays}, training_days_per_week),
          level_id               = coalesce(${pLevelId}, level_id),
          suggested_level_id     = coalesce(${pLevelId}, suggested_level_id),
          level_source           = coalesce(${pLevelSource}, level_source),
          intake_notes_json      = coalesce(${pNotes ? tx.json(pNotes) : null}, intake_notes_json)
          where id = ${BigInt(existingAthlete.id)}
        returning id::text as id
      `;
      athleteId = updated[0]!.id;
    } else {
      const inserted = await tx<Array<{ id: string }>>`
        insert into athletes (
          user_id, full_name, coach_id,
          sex, dob, training_days_per_week,
          level_id, suggested_level_id, level_source,
          intake_notes_json
        )
        values (
          ${userId}, ${full_name}, ${coach_id},
          ${pSex}::athlete_sex, ${pDob}::date, ${pDays},
          ${pLevelId}, ${pLevelId}, ${pLevelSource},
          ${pNotes ? tx.json(pNotes) : tx.json({})}
        )
        returning id::text as id
      `;
      athleteId = inserted[0]!.id;
    }

    // 3. comp subscription — only if no active sub exists for this user.
    const activeSubs = await tx<Array<{ id: string }>>`
      select id::text as id
      from subscriptions
      where user_id = ${userId}
        and status = 'active'
      limit 1
    `;
    if (activeSubs.length === 0) {
      await tx`
        insert into subscriptions (user_id, plan_type, status, source, current_period_end)
        values (${userId}, ${modality}, 'active', 'comp', null)
      `;
    }

    return {
      id: athleteId,
      full_name,
      modality,
      comp: true as const,
    };
  };

  return params.client ? run(params.client) : defaultSql.begin(run);
}
