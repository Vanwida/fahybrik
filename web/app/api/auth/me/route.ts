import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AthleteProfileRow {
  user_id: string;
  email: string;
  apple_user_id: string | null;
  athlete_id: string;
  full_name: string;
  dob: string | null;
  sex: 'male' | 'female' | 'other' | null;
  height_cm: string | null;
  weight_kg: string | null;
  body_fat_pct: string | null;
  training_experience_years: string | null;
  primary_discipline: string | null;
  training_days_per_week: number | null;
  equipment_access: string | null;
  injuries_json: unknown;
  onboarded_at: Date | null;
  coach_id: string | null;
  created_at: Date;
}

function toNumber(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Invalid or expired session', 401);
  }

  const rows = await sql<AthleteProfileRow[]>`
    select
      u.id::text             as user_id,
      u.email                as email,
      u.apple_user_id        as apple_user_id,
      a.id::text             as athlete_id,
      a.full_name            as full_name,
      to_char(a.dob, 'YYYY-MM-DD') as dob,
      a.sex                  as sex,
      a.height_cm::text      as height_cm,
      a.weight_kg::text      as weight_kg,
      a.body_fat_pct::text   as body_fat_pct,
      a.training_experience_years::text as training_experience_years,
      a.primary_discipline   as primary_discipline,
      a.training_days_per_week as training_days_per_week,
      a.equipment_access     as equipment_access,
      a.injuries_json        as injuries_json,
      a.onboarded_at         as onboarded_at,
      a.coach_id::text       as coach_id,
      a.created_at           as created_at
    from users u
    join athletes a on a.user_id = u.id
    where u.id = ${session.user_id} and u.deleted_at is null
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return jsonError('not_found', 'Athlete profile not found', 404);
  }

  return jsonOk({
    user: {
      id: row.user_id,
      email: row.email,
      apple_user_id: row.apple_user_id,
      role: 'athlete' as const,
    },
    athlete: {
      id: row.athlete_id,
      full_name: row.full_name,
      dob: row.dob,
      sex: row.sex,
      height_cm: toNumber(row.height_cm),
      weight_kg: toNumber(row.weight_kg),
      body_fat_pct: toNumber(row.body_fat_pct),
      training_experience_years: toNumber(row.training_experience_years),
      primary_discipline: row.primary_discipline,
      training_days_per_week: row.training_days_per_week,
      equipment_access: row.equipment_access,
      injuries_json: row.injuries_json ?? [],
      onboarded_at: row.onboarded_at?.toISOString() ?? null,
      coach_id: row.coach_id,
      created_at: row.created_at.toISOString(),
    },
  });
}
