// PATCH /api/athlete/profile
//
// Athlete edits their own profile. The edit form always sends the full set of
// editable fields (prefilled from the current profile), so every field is a
// direct SET — absent keys (Swift JSONEncoder omits nil) map to null, which
// clears the column. full_name is required because it is NOT NULL in the DB.

import { z } from 'zod';
import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadAthleteProfileById } from '@/lib/athlete/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const profilePatchSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  height_cm: z.number().min(80).max(260).nullable().optional(),
  weight_kg: z.number().min(25).max(250).nullable().optional(),
  // Measured max HR (bpm). Explicit null clears it → the app reverts to an
  // age-estimated max. Range mirrors the athletes.max_hr_bpm DB CHECK.
  max_hr_bpm: z.number().int().min(100).max(230).nullable().optional(),
  training_experience_years: z.number().min(0).max(80).nullable().optional(),
  goal_type: z
    .enum(['first_hyrox', 'improve_hyrox_mark', 'improve_running', 'complete_fun', 'other'])
    .nullable()
    .optional(),
  goal_other_text: z.string().trim().max(500).nullable().optional(),
  preferred_language: z.enum(['es', 'en']).nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body must be valid JSON', 400);
  }

  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid profile payload', 422, parsed.error.flatten());
  }

  const d = parsed.data;

  // goal_other_text is only meaningful when goal_type === 'other'; clear it
  // otherwise so stale text doesn't leak between goal changes.
  const goalOther = d.goal_type === 'other' ? (d.goal_other_text ?? null) : null;

  const athleteId = Number(session.athlete_id);

  try {
    const updated = await sql<Array<{ id: string }>>`
      update athletes
      set
        full_name                  = ${d.full_name},
        dob                        = ${d.dob ?? null}::date,
        sex                        = ${d.sex ?? null}::athlete_sex,
        height_cm                  = ${d.height_cm ?? null},
        weight_kg                  = ${d.weight_kg ?? null},
        max_hr_bpm                 = ${d.max_hr_bpm ?? null},
        training_experience_years  = ${d.training_experience_years ?? null},
        goal_type                  = ${d.goal_type ?? null}::onboarding_goal_type,
        goal_other_text            = ${goalOther},
        preferred_language         = ${d.preferred_language ?? null},
        updated_at                 = now()
      where id = ${athleteId}
      returning id::text as id
    `;

    if (updated.length === 0) {
      return jsonError('not_found', 'Athlete not found', 404);
    }

    const athlete = await loadAthleteProfileById(sql, athleteId);
    if (!athlete) {
      return jsonError('not_found', 'Athlete not found after update', 404);
    }

    return jsonOk({ athlete });
  } catch (err) {
    console.error('[PATCH /api/athlete/profile]', err);
    return jsonError('internal_error', 'Failed to update profile', 500);
  }
}
