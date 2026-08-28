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

// ── jsonb → DTO ───────────────────────────────────────────────────────────────
//
// `to_jsonb(a)` only serializes columns that EXIST. A Preview Neon that has
// not run 0179 (`avatar_url`) or 0129 (`max_hr_bpm`) must still produce a
// session — missing key = null, never 42703, never TypeError on .toISOString().

function jsonbText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function jsonbId(value: unknown): string | null {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function jsonbNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function jsonbInt(value: unknown): number | null {
  const n = jsonbNumber(value);
  return n == null ? null : Math.round(n);
}

function jsonbIso(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function jsonbDob(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m?.[1] ?? null;
}

function jsonbSex(value: unknown): AthleteProfileDTO['sex'] {
  return value === 'male' || value === 'female' || value === 'other' ? value : null;
}

/** Mapper puro: clave ausente = null. Sin id no hay atleta. */
export function athleteProfileFromJsonb(raw: unknown): AthleteProfileDTO | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = jsonbId(row.id);
  if (!id) return null;
  return {
    id,
    full_name: jsonbText(row.full_name) ?? '',
    avatar_url: profilePhotoUrl(jsonbText(row.avatar_url), PROFILE_PHOTO_VARIANTS.ficha),
    dob: jsonbDob(row.dob),
    sex: jsonbSex(row.sex),
    height_cm: jsonbNumber(row.height_cm),
    weight_kg: jsonbNumber(row.weight_kg),
    body_fat_pct: jsonbNumber(row.body_fat_pct),
    max_hr_bpm: jsonbInt(row.max_hr_bpm),
    hr_zones: null,
    training_experience_years: jsonbNumber(row.training_experience_years),
    primary_discipline: jsonbText(row.primary_discipline),
    training_days_per_week: jsonbInt(row.training_days_per_week),
    equipment_access: jsonbText(row.equipment_access),
    injuries_json: row.injuries_json ?? [],
    onboarded_at: jsonbIso(row.onboarded_at),
    coach_id: jsonbId(row.coach_id),
    created_at: jsonbIso(row.created_at) ?? new Date(0).toISOString(),
    goal_type: jsonbText(row.goal_type),
    goal_other_text: jsonbText(row.goal_other_text),
    preferred_language: jsonbText(row.preferred_language),
  };
}

async function withHrZones(
  profile: AthleteProfileDTO,
  client: Sql | TransactionClient,
): Promise<AthleteProfileDTO> {
  profile.hr_zones = buildHrZonesDTO(
    await loadAthleteHrZones(Number(profile.id), client as Sql),
  );
  return profile;
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
  const rows = await (client as Sql)<{ athlete: unknown }[]>`
    select to_jsonb(a) as athlete
    from users u
    join athletes a on a.user_id = u.id
    where u.id = ${userId}
      and u.deleted_at is null
    limit 1
  `;
  const profile = athleteProfileFromJsonb(rows[0]?.athlete);
  if (!profile) return null;
  return withHrZones(profile, client);
}

/**
 * Load the athlete profile by athletes.id (integer PK, as a JS number).
 * Used by PATCH /api/athlete/profile to return the updated row.
 */
export async function loadAthleteProfileById(
  client: Sql | TransactionClient,
  athleteId: number,
): Promise<AthleteProfileDTO | null> {
  const rows = await (client as Sql)<{ athlete: unknown }[]>`
    select to_jsonb(a) as athlete
    from athletes a
    where a.id = ${athleteId}
    limit 1
  `;
  const profile = athleteProfileFromJsonb(rows[0]?.athlete);
  if (!profile) return null;
  return withHrZones(profile, client);
}
