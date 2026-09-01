// lib/athlete/profile.ts
//
// Single source of truth for the athlete profile SELECT + DTO mapping.
// Used by GET /api/auth/me and PATCH /api/athlete/profile so both return the
// exact same shape.
//
// Accepts either the top-level pool or a transaction client so helpers that run
// inside sql.begin() can reuse the same logic.

import { type Sql, type TransactionClient } from '@/lib/db';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';
import { buildHrZonesDTO, loadAthleteHrZones, type HrZonesDTO } from './hr-zones';

// ── DTO ──────────────────────────────────────────────────────────────────────

export interface AthleteProfileDTO {
  id: string;
  full_name: string;
  /**
   * La foto de perfil, YA LISTA PARA PINTAR — con su variante pegada, no la base que
   * guarda la columna. La app la mete en un círculo tal cual llega, así que darle la
   * base sería darle una URL que no carga; y darle el original sería servirle varios
   * MB para un avatar. Se sirve la variante grande porque el retrato de Perfil es el
   * mayor sitio donde la pinta. Null = todavía no hay foto, y se ven las iniciales.
   */
  avatar_url: string | null;
  dob: string | null;
  sex: 'male' | 'female' | 'other' | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  // Measured max HR (bpm). null = never measured. Persisted by PATCH
  // /api/athlete/profile. It is an INPUT to the zone model, never a zone anchor
  // itself — see hr_zones below.
  max_hr_bpm: number | null;
  /**
   * The athlete's five HEART-RATE zones, resolved server-side.
   *
   * The app does not compute zones. It used to, from a percentage of a max it
   * invented when the athlete had none, which put its bands on a different
   * stretch of the dial from the coach's. The server is now the only place they
   * exist (shared/domain/methodology/hr-zones.ts) and it ships them with the
   * identity, so the live engine has them before a session can start.
   *
   * Null when nothing anchors them — the app then says so and offers the test.
   */
  hr_zones: HrZonesDTO | null;
  training_experience_years: number | null;
  primary_discipline: string | null;
  training_days_per_week: number | null;
  equipment_access: string | null;
  injuries_json: unknown;
  onboarded_at: string | null;
  coach_id: string | null;
  created_at: string;
  // Extended fields (also returned by the PATCH /api/athlete/profile endpoint)
  goal_type: string | null;
  goal_other_text: string | null;
  preferred_language: string | null;
}

// ── Internal row shape coming off Postgres ────────────────────────────────────

interface AthleteRow {
  athlete_id: string;
  full_name: string;
  /** La BASE de entrega tal y como está en la columna (sin variante). */
  avatar_url: string | null;
  dob: string | null;
  sex: 'male' | 'female' | 'other' | null;
  height_cm: string | null;
  weight_kg: string | null;
  body_fat_pct: string | null;
  // int column → postgres.js returns a JS number (no ::text cast, like training_days_per_week).
  max_hr_bpm: number | null;
  training_experience_years: string | null;
  primary_discipline: string | null;
  training_days_per_week: number | null;
  equipment_access: string | null;
  injuries_json: unknown;
  onboarded_at: Date | null;
  coach_id: string | null;
  created_at: Date;
  goal_type: string | null;
  goal_other_text: string | null;
  preferred_language: string | null;
}

// postgres.js returns numeric columns as strings when using explicit ::text
// casts. Convert to a JS number (null if not finite).
function toNumber(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToDTO(row: AthleteRow, hr_zones: HrZonesDTO | null): AthleteProfileDTO {
  return {
    hr_zones,
    id: row.athlete_id,
    full_name: row.full_name,
    avatar_url: profilePhotoUrl(row.avatar_url, PROFILE_PHOTO_VARIANTS.ficha),
    dob: row.dob,
    sex: row.sex,
    height_cm: toNumber(row.height_cm),
    weight_kg: toNumber(row.weight_kg),
    body_fat_pct: toNumber(row.body_fat_pct),
    max_hr_bpm: row.max_hr_bpm,
    training_experience_years: toNumber(row.training_experience_years),
    primary_discipline: row.primary_discipline,
    training_days_per_week: row.training_days_per_week,
    equipment_access: row.equipment_access,
    injuries_json: row.injuries_json ?? [],
    onboarded_at: row.onboarded_at?.toISOString() ?? null,
    coach_id: row.coach_id,
    created_at: row.created_at.toISOString(),
    goal_type: row.goal_type,
    goal_other_text: row.goal_other_text,
    preferred_language: row.preferred_language,
  };
}

// ── Public loaders ────────────────────────────────────────────────────────────

/**
 * Load the athlete profile for the user identified by their users.id (bigint).
 * Used by GET /api/auth/me which authenticates via bearer → AthleteSession.user_id.
 */
export async function loadAthleteProfileByUserId(
  client: Sql | TransactionClient,
  userId: bigint,
): Promise<AthleteProfileDTO | null> {
  const rows = await (client as Sql)<AthleteRow[]>`
    select
      a.id::text                              as athlete_id,
      a.full_name,
      a.avatar_url,
      to_char(a.dob, 'YYYY-MM-DD')           as dob,
      a.sex,
      a.height_cm::text,
      a.weight_kg::text,
      a.body_fat_pct::text,
      a.max_hr_bpm,
      a.training_experience_years::text,
      a.primary_discipline,
      a.training_days_per_week,
      a.equipment_access,
      a.injuries_json,
      a.onboarded_at,
      a.coach_id::text,
      a.created_at,
      a.goal_type::text                       as goal_type,
      a.goal_other_text,
      a.preferred_language
    from users u
    join athletes a on a.user_id = u.id
    where u.id = ${userId}
      and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  // The zones ride along with the identity so the live engine never has to ask
  // a second time — and so it can never start a session without them.
  return rowToDTO(row, buildHrZonesDTO(await loadAthleteHrZones(Number(row.athlete_id), client as Sql)));
}

/**
 * Load the athlete profile by athletes.id (integer PK, as a JS number).
 * Used by PATCH /api/athlete/profile to return the updated row.
 */
export async function loadAthleteProfileById(
  client: Sql | TransactionClient,
  athleteId: number,
): Promise<AthleteProfileDTO | null> {
  const rows = await (client as Sql)<AthleteRow[]>`
    select
      a.id::text                              as athlete_id,
      a.full_name,
      a.avatar_url,
      to_char(a.dob, 'YYYY-MM-DD')           as dob,
      a.sex,
      a.height_cm::text,
      a.weight_kg::text,
      a.body_fat_pct::text,
      a.max_hr_bpm,
      a.training_experience_years::text,
      a.primary_discipline,
      a.training_days_per_week,
      a.equipment_access,
      a.injuries_json,
      a.onboarded_at,
      a.coach_id::text,
      a.created_at,
      a.goal_type::text                       as goal_type,
      a.goal_other_text,
      a.preferred_language
    from athletes a
    where a.id = ${athleteId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  // The zones ride along with the identity so the live engine never has to ask
  // a second time — and so it can never start a session without them.
  return rowToDTO(row, buildHrZonesDTO(await loadAthleteHrZones(Number(row.athlete_id), client as Sql)));
}
