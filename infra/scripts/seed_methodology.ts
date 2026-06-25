/**
 * Seed Pablo's REAL methodology defaults (spec §4) into the methodology-system
 * tables (migration 0048), then synthesize a deterministic RAG document into
 * methodology_documents / methodology_chunks (spec §5 "Síntesis a RAG").
 *
 * SOURCE OF EVERY DEFAULT: docs/design/methodology-system/spec.md §4 — each value
 * cites its origin (seed #N from seed_day_paired_templates, example-templates §,
 * coach_notes, or master doc §). Items marked [confirmar con Pablo] in §7 are
 * seeded as `authored:'system_default'` so the dashboard surfaces them for
 * confirmation; everything Pablo authored is `authored:'pablo'`.
 *
 * EMBEDDINGS ARE STUBBED. No embedding provider is wired in this environment
 * (LLM_EMBEDDING_MODEL / LLM_API_KEY unset). The synthesis writes chunks with
 * embedding = NULL: structured-rule chunks NEVER need an embedding (spec §5: they
 * are a DETERMINISTIC SQL filter, not vector retrieval); narrative chunks DO want
 * one — those are written now and the embedding backfill is left as a documented
 * follow-up (see synthesizeRag()).
 *
 * Idempotent: upserts on the natural unique keys (coach_id + discriminator).
 * Re-running keeps the row set in sync with this file.
 *
 * Run: pnpm --filter @fahybrid/infra seed:methodology
 */
import { methodologyRuleRowSchema } from '@fahybrid/shared/schema';
import {
  STANDARD_ZONES_PER_500M,
  STANDARD_ZONES_PER_KM,
} from '@fahybrid/shared/domain/methodology';
import { getSql } from './_db.ts';
import { PABLO_DEFAULT_RULES } from './seed_methodology_rules.ts';

const PABLO_COACH = {
  email: 'pablo@fabrik.training',
  full_name: 'Pablo (DEMO)',
  bio: 'Fabrik Training Club Barcelona — HYROX methodology (DEMO seed).',
};

type Sql = ReturnType<typeof getSql>;

// ── Resolve (or create) Pablo's coach row — same identity used by other seeds ─
async function ensureCoach(sql: Sql): Promise<string> {
  const existingUser = await sql<{ id: string }[]>`
    select id::text as id from users where email = ${PABLO_COACH.email} limit 1
  `;
  let userId: string;
  if (existingUser.length === 0 || !existingUser[0]) {
    const [u] = await sql<{ id: string }[]>`
      insert into users (email, role) values (${PABLO_COACH.email}, 'coach')
      returning id::text as id
    `;
    if (!u) throw new Error('failed to create coach user');
    userId = u.id;
  } else {
    userId = existingUser[0].id;
  }
  const existingCoach = await sql<{ id: string }[]>`
    select id::text as id from coaches where user_id = ${userId}::bigint limit 1
  `;
  if (existingCoach[0]) return existingCoach[0].id;
  const [c] = await sql<{ id: string }[]>`
    insert into coaches (user_id, full_name, bio)
    values (${userId}::bigint, ${PABLO_COACH.full_name}, ${PABLO_COACH.bio})
    returning id::text as id
  `;
  if (!c) throw new Error('failed to create coach');
  return c.id;
}

// ── coach_methodology (Áreas 1,5,6,8,12,14) — all defaults from §4 ───────────
async function seedCoachMethodology(sql: Sql, coachId: string): Promise<void> {
  await sql`
    insert into coach_methodology (
      coach_id, hr_zone_count, hr_anchor, run_pace_anchor, erg_row_anchor,
      erg_ski_anchor, bike_anchor, rpe_scale, one_rm_estimation,
      intensity_spacing_min_hours, max_consecutive_hi_days, decoupling_target_pct,
      decoupling_regress_threshold_pct, hrv_skip_threshold_pct,
      hrv_modify_threshold_pct, sleep_min_hours, soreness_skip_threshold,
      presession_rpe_skip_threshold, gate_logic, recalc_policy, test_cadence_mode,
      freshness_1rm_weeks, freshness_pace_hr_weeks, freshness_stations_weeks,
      taper_duration_days, taper_volume_reduction_pct, taper_keep_intensity,
      tone_motivador, tone_tecnico, tone_estricto, tone_calido, why_depth,
      language_primary, language_fallback, address_form, emoji_use,
      checkin_feedback_style, philosophy_narrative
    ) values (
      ${coachId}::bigint, 5, 'lthr', '5k', '2k',
      '1k', 'ftp', '0_10_cr10', 'Epley',
      6, 1, 5,
      8, -15,
      -10, 6, 4,
      5, 'ANY_triggers', 'propose_review', 'block_start',
      12, 6, 8,
      7, 50, true,
      60, 80, 50, 40, 'una_linea',
      'es', 'en', 'tu', 'nunca',
      'dato+accion', ${PHILOSOPHY_NARRATIVE}
    )
    on conflict (coach_id) do update set
      hr_zone_count = excluded.hr_zone_count,
      intensity_spacing_min_hours = excluded.intensity_spacing_min_hours,
      decoupling_target_pct = excluded.decoupling_target_pct,
      decoupling_regress_threshold_pct = excluded.decoupling_regress_threshold_pct,
      hrv_skip_threshold_pct = excluded.hrv_skip_threshold_pct,
      hrv_modify_threshold_pct = excluded.hrv_modify_threshold_pct,
      taper_volume_reduction_pct = excluded.taper_volume_reduction_pct,
      tone_motivador = excluded.tone_motivador, tone_tecnico = excluded.tone_tecnico,
      tone_estricto = excluded.tone_estricto, tone_calido = excluded.tone_calido,
      philosophy_narrative = excluded.philosophy_narrative,
      updated_at = now()
  `;
}

const PHILOSOPHY_NARRATIVE =
  'Periodización ATR conservadora. La seguridad (recuperación, evitar sobreentrenamiento) ' +
  'siempre manda sobre la progresión. En Acumulación se construye base aeróbica y densidad ' +
  'muscular sin trabajo glucolítico; la sesión de Zona 2 larga es intocable. En ' +
  'Transformación se eleva el umbral con series de running y ergómetros. En Realización se ' +
  'afila con simulaciones de carrera y se mantiene la fuerza, nunca se busca PR. Cada ' +
  'prescripción es completa (medida + objetivo) o no se entrega.';

// ── methodology_blocks (Áreas 2 & 3) ─────────────────────────────────────────
const BLOCKS = [
  {
    block_type: 'ACC', label_athlete: 'Acumulación', duration_weeks: 5,
    objective_json: ['volumen_aerobico', 'densidad_muscular'], intensity_ceiling: 'Z2',
    sequence_order: 1, progression_shape_volume: 'lineal', progression_shape_intensity: 'escalon',
    weekly_volume_delta_pct: 7.5, intensity_ramp_low_pct: 60, intensity_ramp_high_pct: 80,
    deload_trigger: 'last_week_of_block', deload_volume_reduction_pct: 15, deload_intensity_reduction_pct: 0,
  },
  {
    block_type: 'TRANS', label_athlete: 'Intensificación', duration_weeks: 4,
    objective_json: ['umbral_anaerobico', 'lactate_clearance', 'pace_consistency'], intensity_ceiling: 'Z4',
    sequence_order: 2, progression_shape_volume: 'escalon', progression_shape_intensity: 'escalon',
    weekly_volume_delta_pct: 5, intensity_ramp_low_pct: 70, intensity_ramp_high_pct: 85,
    deload_trigger: 'last_week_of_block', deload_volume_reduction_pct: 15, deload_intensity_reduction_pct: 0,
  },
  {
    block_type: 'REAL', label_athlete: 'Tapering/Realización', duration_weeks: 3,
    objective_json: ['especificidad_carrera', 'peaking_freshness', 'mantenimiento_fuerza'], intensity_ceiling: 'Z5',
    sequence_order: 3, progression_shape_volume: 'onda', progression_shape_intensity: 'onda',
    weekly_volume_delta_pct: -10, intensity_ramp_low_pct: 80, intensity_ramp_high_pct: 87,
    deload_trigger: 'readiness_based', deload_volume_reduction_pct: 50, deload_intensity_reduction_pct: 18,
  },
] as const;

async function seedBlocks(sql: Sql, coachId: string): Promise<void> {
  for (const b of BLOCKS) {
    await sql`
      insert into methodology_blocks (
        coach_id, block_type, label_athlete, duration_weeks, objective_json,
        intensity_ceiling, sequence_order, progression_shape_volume,
        progression_shape_intensity, weekly_volume_delta_pct, intensity_ramp_low_pct,
        intensity_ramp_high_pct, deload_trigger, deload_volume_reduction_pct,
        deload_intensity_reduction_pct
      ) values (
        ${coachId}::bigint, ${b.block_type}, ${b.label_athlete}, ${b.duration_weeks},
        ${sql.json([...b.objective_json])}, ${b.intensity_ceiling}, ${b.sequence_order},
        ${b.progression_shape_volume}, ${b.progression_shape_intensity},
        ${b.weekly_volume_delta_pct}, ${b.intensity_ramp_low_pct}, ${b.intensity_ramp_high_pct},
        ${b.deload_trigger}, ${b.deload_volume_reduction_pct}, ${b.deload_intensity_reduction_pct}
      )
      on conflict (coach_id, block_type) do update set
        label_athlete = excluded.label_athlete,
        duration_weeks = excluded.duration_weeks,
        objective_json = excluded.objective_json,
        weekly_volume_delta_pct = excluded.weekly_volume_delta_pct,
        deload_volume_reduction_pct = excluded.deload_volume_reduction_pct,
        updated_at = now()
    `;
  }
}

// ── methodology_zones (Área 5) — the 6-zone OFFSET model (migration 0061). ────
// The standard bands are single-sourced in @fahybrid/shared (Pablo's VERIFIED
// per_500m bands + the per_km run set). Migration 0061 already seeds them on
// apply; this keeps the upsert in sync if the seed is run independently.
const ZONES = [...STANDARD_ZONES_PER_500M, ...STANDARD_ZONES_PER_KM];

async function seedZones(sql: Sql, coachId: string): Promise<void> {
  for (const z of ZONES) {
    await sql`
      insert into methodology_zones
        (coach_id, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s)
      values
        (${coachId}::bigint, ${z.code}, ${z.label}, ${z.color}, ${z.role}, ${z.sort_order},
         'threshold', ${z.pace_unit}, ${z.low_offset_s}, ${z.high_offset_s})
      on conflict (coach_id, pace_unit, code) do update set
        label = excluded.label, color = excluded.color, role = excluded.role,
        sort_order = excluded.sort_order, anchor = excluded.anchor,
        low_offset_s = excluded.low_offset_s, high_offset_s = excluded.high_offset_s,
        updated_at = now()
    `;
  }
}

// ── methodology_tests (Área 8) — the 17-test catalog ─────────────────────────
const TESTS: Array<{
  slug: string; modality: string; protocol: string; output_field: string;
  feeds_anchor: string | null; cadence: string; freshness_weeks: number;
  recalc: string[]; cap: number | null;
}> = [
  { slug: '1rm_back_squat', modality: 'strength', protocol: 'Build to a true 1RM back squat', output_field: 'one_rm_back_squat_kg', feeds_anchor: 'pct_rm_squat', cadence: 'block_start_ACC_REAL', freshness_weeks: 12, recalc: ['pct_rm_squat', 'accessory_loads'], cap: 7.5 },
  { slug: '1rm_deadlift', modality: 'strength', protocol: 'Build to a true 1RM deadlift', output_field: 'one_rm_deadlift_kg', feeds_anchor: 'pct_rm_deadlift', cadence: 'block_start_ACC_REAL', freshness_weeks: 12, recalc: ['pct_rm_deadlift'], cap: 7.5 },
  { slug: '1rm_bench', modality: 'strength', protocol: 'Build to a true 1RM bench press', output_field: 'one_rm_bench_kg', feeds_anchor: 'pct_rm_bench', cadence: 'block_start_ACC_REAL', freshness_weeks: 12, recalc: ['pct_rm_bench'], cap: 7.5 },
  { slug: '1rm_ohp', modality: 'strength', protocol: 'Build to a true 1RM overhead press', output_field: 'one_rm_ohp_kg', feeds_anchor: 'pct_rm_ohp', cadence: 'block_start_ACC_REAL', freshness_weeks: 12, recalc: ['pct_rm_ohp'], cap: 7.5 },
  { slug: '1rm_clean', modality: 'strength', protocol: 'Build to a true 1RM clean', output_field: 'one_rm_clean_kg', feeds_anchor: 'pct_rm_clean', cadence: 'block_start_ACC_REAL', freshness_weeks: 12, recalc: ['pct_rm_clean'], cap: 7.5 },
  { slug: 'pullups_max', modality: 'strength', protocol: 'Max strict pull-ups', output_field: 'pullups_max', feeds_anchor: null, cadence: 'block_start', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'tt_5k', modality: 'run', protocol: '5K time trial', output_field: 'time_5k_seconds', feeds_anchor: 'pace5k', cadence: 'block_start', freshness_weeks: 6, recalc: ['run_pace_zones'], cap: 3 },
  { slug: 'tt_1mile', modality: 'run', protocol: '1 mile time trial', output_field: 'time_1mile_seconds', feeds_anchor: 'pace5k_fallback', cadence: 'on_plateau', freshness_weeks: 6, recalc: ['run_pace_zones'], cap: 3 },
  { slug: 'tt_2k_row', modality: 'row', protocol: '2000m row time trial', output_field: 'time_2k_row_seconds', feeds_anchor: 'split2k', cadence: 'block_start', freshness_weeks: 6, recalc: ['erg_row_zones'], cap: 3 },
  { slug: 'tt_1k_ski', modality: 'ski', protocol: '1000m SkiErg time trial', output_field: 'time_1k_ski_seconds', feeds_anchor: 'split1k', cadence: 'block_start', freshness_weeks: 6, recalc: ['erg_ski_zones'], cap: 3 },
  { slug: 'ftp_20min', modality: 'bike', protocol: '20-min FTP test (0.95×)', output_field: 'ftp_watts', feeds_anchor: 'ftp', cadence: 'block_start', freshness_weeks: 6, recalc: ['bike_power_zones'], cap: null },
  { slug: 'lthr_30min', modality: 'run', protocol: '30-min LTHR test (avg HR last 20min)', output_field: 'lthr_bpm', feeds_anchor: 'lthr', cadence: 'block_start', freshness_weeks: 6, recalc: ['hr_zones_all'], cap: null },
  { slug: 'hr_max', modality: 'run', protocol: 'Max HR field test', output_field: 'max_hr_bpm', feeds_anchor: 'lthr_fallback', cadence: 'manual', freshness_weeks: 12, recalc: ['hr_zones_all'], cap: null },
  { slug: 'station_wallball', modality: 'hyrox_station', protocol: 'Wall balls — max unbroken / standard reps', output_field: 'station_wallball', feeds_anchor: null, cadence: 'block_start_ACC_mid_TRANS', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'station_sled_push', modality: 'hyrox_station', protocol: 'Sled push test at race weight', output_field: 'station_sled_push', feeds_anchor: null, cadence: 'block_start_ACC_mid_TRANS', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'station_bbj', modality: 'hyrox_station', protocol: 'Burpee broad jumps — 80m time', output_field: 'station_bbj', feeds_anchor: null, cadence: 'block_start_ACC_mid_TRANS', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'station_farmer', modality: 'hyrox_station', protocol: "Farmer's carry — 200m time at race weight", output_field: 'station_farmer', feeds_anchor: null, cadence: 'block_start_ACC_mid_TRANS', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'station_sandbag_lunges', modality: 'hyrox_station', protocol: 'Sandbag lunges — 100m time', output_field: 'station_sandbag_lunges', feeds_anchor: null, cadence: 'block_start_ACC_mid_TRANS', freshness_weeks: 8, recalc: [], cap: null },
  { slug: 'hyrox_half_sim', modality: 'hyrox_sim', protocol: 'Half HYROX simulation', output_field: 'hyrox_half_sim_seconds', feeds_anchor: null, cadence: 'every_4_6_weeks_TRANS', freshness_weeks: 8, recalc: ['race_pace'], cap: null },
];

async function seedTests(sql: Sql, coachId: string): Promise<void> {
  for (const t of TESTS) {
    await sql`
      insert into methodology_tests (coach_id, slug, modality, protocol, output_field, feeds_anchor, cadence, freshness_weeks, recalc_propagation_json, progression_cap_pct)
      values (${coachId}::bigint, ${t.slug}, ${t.modality}, ${t.protocol}, ${t.output_field}, ${t.feeds_anchor}, ${t.cadence}, ${t.freshness_weeks}, ${sql.json(t.recalc)}, ${t.cap})
      on conflict (coach_id, slug) do update set
        protocol = excluded.protocol, output_field = excluded.output_field,
        feeds_anchor = excluded.feeds_anchor, cadence = excluded.cadence,
        freshness_weeks = excluded.freshness_weeks,
        recalc_propagation_json = excluded.recalc_propagation_json,
        progression_cap_pct = excluded.progression_cap_pct, updated_at = now()
    `;
  }
}

// ── methodology_weekly_structure (Área 4) — L1/L2/L3 ─────────────────────────
const WEEKLY = [
  {
    level: 1, sessions_per_week: 4, two_a_day_enabled: false,
    modality_mix: { ACC: { z2: 40, strength: 35, ergo: 15, recovery: 10 }, TRANS: { threshold: 35, ergo: 25, stations: 25, recovery: 15 }, REAL: { race_sim: 35, race_pace: 25, strength_maint: 20, recovery: 20 } },
    hard_easy: 'hard_easy_alt', key: { ACC: 'z2_long', TRANS: 'threshold', REAL: 'hyrox_sim' },
    am_pm: [] as Array<{ am: string; pm: string; gap_min_h: number }>,
    forbidden: [['threshold', 'strength'], ['threshold', 'intervals']] as Array<[string, string]>,
    rest: 'post_hardest', gap: 6,
  },
  {
    level: 2, sessions_per_week: 6, two_a_day_enabled: false,
    modality_mix: { ACC: { z2: 35, strength: 35, ergo: 20, recovery: 10 }, TRANS: { threshold: 35, ergo: 25, stations: 25, recovery: 15 }, REAL: { race_sim: 35, race_pace: 25, strength_maint: 20, recovery: 20 } },
    hard_easy: 'hard_easy_alt', key: { ACC: 'z2_long', TRANS: 'threshold', REAL: 'hyrox_sim' },
    am_pm: [{ am: 'strength_lower', pm: 'z2_long', gap_min_h: 6 }],
    forbidden: [['threshold', 'strength'], ['threshold', 'intervals']] as Array<[string, string]>,
    rest: 'post_hardest', gap: 6,
  },
  {
    level: 3, sessions_per_week: 9, two_a_day_enabled: true,
    modality_mix: { ACC: { z2: 30, strength: 35, ergo: 25, recovery: 10 }, TRANS: { threshold: 35, ergo: 25, stations: 25, recovery: 15 }, REAL: { race_sim: 40, race_pace: 25, strength_maint: 20, recovery: 15 } },
    hard_easy: 'hard_easy_alt', key: { ACC: 'z2_long', TRANS: 'threshold', REAL: 'hyrox_sim' },
    am_pm: [{ am: 'strength_lower', pm: 'z2_long', gap_min_h: 6 }, { am: 'intervals_race_pace', pm: 'circuit_recovery', gap_min_h: 6 }],
    forbidden: [['threshold', 'strength'], ['threshold', 'intervals']] as Array<[string, string]>,
    rest: 'post_hardest', gap: 6,
  },
] as const;

async function seedWeekly(sql: Sql, coachId: string): Promise<void> {
  for (const w of WEEKLY) {
    await sql`
      insert into methodology_weekly_structure (
        coach_id, level, sessions_per_week, two_a_day_enabled, modality_mix_json,
        hard_easy_pattern, key_session_by_block_json, am_pm_pairs_json,
        forbidden_adjacent_json, rest_day_placement, min_separation_strength_cardio_h
      ) values (
        ${coachId}::bigint, ${w.level}, ${w.sessions_per_week}, ${w.two_a_day_enabled},
        ${sql.json(w.modality_mix)}, ${w.hard_easy}, ${sql.json(w.key)},
        ${sql.json([...w.am_pm])}, ${sql.json(w.forbidden.map((p) => [...p]))}, ${w.rest}, ${w.gap}
      )
      on conflict (coach_id, level) do update set
        sessions_per_week = excluded.sessions_per_week,
        two_a_day_enabled = excluded.two_a_day_enabled,
        modality_mix_json = excluded.modality_mix_json,
        am_pm_pairs_json = excluded.am_pm_pairs_json, updated_at = now()
    `;
  }
}

// ── methodology_substitutions (Área 9) — the 8-station graph edges ───────────
const SUBS: Array<{
  target: string; alt: string; match: string; pattern: string; energy: string;
  condition: string; injury: string | null; scale: number | null; flag: boolean;
}> = [
  { target: 'skierg', alt: 'rowing', match: 'high', pattern: 'vert_pull', energy: 'aero_thr', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'skierg', alt: 'bike', match: 'partial', pattern: 'vert_pull', energy: 'aero_thr', condition: 'no_equipment', injury: null, scale: 1.0, flag: true },
  { target: 'sled_push', alt: 'sled_drag', match: 'high', pattern: 'horiz_push', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'sled_push', alt: 'loaded_squat_lunge', match: 'partial', pattern: 'squat', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 0.8, flag: true },
  { target: 'sled_pull', alt: 'cable_row', match: 'high', pattern: 'horiz_pull', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'sled_pull', alt: 'trx_ring_row', match: 'partial', pattern: 'horiz_pull', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 0.7, flag: true },
  { target: 'burpee_broad_jump', alt: 'burpee_box_jump', match: 'high', pattern: 'jump_plyo', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'burpee_broad_jump', alt: 'burpee_step_out', match: 'partial', pattern: 'jump_plyo', energy: 'glyco', condition: 'injury_area', injury: 'rodilla', scale: 0.8, flag: false },
  { target: 'rowing', alt: 'skierg', match: 'high', pattern: 'horiz_pull', energy: 'aero_thr', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'rowing', alt: 'bike', match: 'partial', pattern: 'cyclic', energy: 'aero_thr', condition: 'no_equipment', injury: null, scale: 1.0, flag: true },
  { target: 'farmers_carry', alt: 'kb_db_carry', match: 'exact', pattern: 'carry', energy: 'aero_grip', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'farmers_carry', alt: 'suitcase_carry', match: 'partial', pattern: 'carry', energy: 'aero_grip', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'sandbag_lunges', alt: 'bb_db_goblet_lunge', match: 'high', pattern: 'lunge', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'sandbag_lunges', alt: 'split_squat', match: 'partial', pattern: 'lunge', energy: 'glyco', condition: 'injury_area', injury: 'rodilla', scale: 0.8, flag: false },
  { target: 'wall_balls', alt: 'medball_db_bb_thruster', match: 'high', pattern: 'squat_vert_push', energy: 'glyco', condition: 'no_equipment', injury: null, scale: 1.0, flag: false },
  { target: 'wall_balls', alt: 'air_squat_band_press', match: 'partial', pattern: 'squat_vert_push', energy: 'glyco', condition: 'injury_area', injury: 'hombro', scale: 0.7, flag: false },
];

async function seedSubs(sql: Sql, coachId: string): Promise<void> {
  for (const s of SUBS) {
    await sql`
      insert into methodology_substitutions (coach_id, target_slug, alt_slug, stimulus_match, movement_pattern, energy_system, condition, injury_area, scale_factor, flag_coach)
      values (${coachId}::bigint, ${s.target}, ${s.alt}, ${s.match}, ${s.pattern}, ${s.energy}, ${s.condition}, ${s.injury}, ${s.scale}, ${s.flag})
      on conflict (coach_id, target_slug, alt_slug, condition) do update set
        stimulus_match = excluded.stimulus_match, scale_factor = excluded.scale_factor,
        flag_coach = excluded.flag_coach, updated_at = now()
    `;
  }
}

// ── methodology_station_strategy (Área 12) — 8 stations, M/W times+loads ─────
// Loads/times from §12 station_strategy + §9 station graph. Sled Pull weight is
// HYROX-Open standard ([confirmar] per §7.2). Level scaling captured in JSONB.
const STATIONS: Array<{
  pos: number; slug: string; tM: number | null; tW: number | null; lM: number | null;
  lW: number | null; frac: string | null; cue: string | null; scaling: Record<string, unknown>;
}> = [
  { pos: 1, slug: 'skierg', tM: 240, tW: 270, lM: null, lW: null, frac: 'continuo', cue: 'Drive de cadera, finish pasado caderas. Damper 6-8, stroke 28-32.', scaling: { all: '1000m Open' } },
  { pos: 2, slug: 'sled_push', tM: null, tW: null, lM: 102, lW: 52, frac: '4×12.5m', cue: 'Cuerpo bajo, pasos cortos y rápidos.', scaling: { N1: 'race_weight×0.5' } },
  { pos: 3, slug: 'sled_pull', tM: null, tW: null, lM: 78, lW: 52, frac: 'continuo', cue: 'Hand-over-hand, peso bajo.', scaling: { note: 'peso HYROX-Open, confirmar con Pablo' } },
  { pos: 4, slug: 'burpee_broad_jump', tM: null, tW: null, lM: null, lW: null, frac: '~40 reps / 80m', cue: 'Pecho al suelo, salida con dos pies. Micro-respiración cada 5.', scaling: { all: '80m' } },
  { pos: 5, slug: 'rowing', tM: 220, tW: 250, lM: null, lW: null, frac: 'continuo', cue: 'Damper 4-6, 24-28 spm.', scaling: { all: '1000m' } },
  { pos: 6, slug: 'farmers_carry', tM: null, tW: null, lM: 24, lW: 16, frac: '2×100m', cue: 'Postura alta, hombros atrás. Peso por mano.', scaling: {} },
  { pos: 7, slug: 'sandbag_lunges', tM: null, tW: null, lM: 20, lW: 10, frac: 'continuo', cue: 'Rodilla trasera al suelo en cada zancada.', scaling: {} },
  { pos: 8, slug: 'wall_balls', tM: null, tW: null, lM: 6, lW: 4, frac: '25-15-10 +5s resp', cue: 'Hip crease bajo rodilla, target 3.05m M / 2.74m W. Reps 100/75.', scaling: { N1: '4kg/60reps', N2_N4: '6kg M·4kg W / 75-100reps' } },
];

async function seedStations(sql: Sql, coachId: string): Promise<void> {
  for (const s of STATIONS) {
    await sql`
      insert into methodology_station_strategy (coach_id, station_position, station_slug, time_m_seconds, time_w_seconds, load_m_kg, load_w_kg, fractionation, breathing_cue, level_scaling_json)
      values (${coachId}::bigint, ${s.pos}, ${s.slug}, ${s.tM}, ${s.tW}, ${s.lM}, ${s.lW}, ${s.frac}, ${s.cue}, ${sql.json(s.scaling as Record<string, string>)})
      on conflict (coach_id, station_position) do update set
        station_slug = excluded.station_slug, load_m_kg = excluded.load_m_kg,
        load_w_kg = excluded.load_w_kg, fractionation = excluded.fractionation,
        breathing_cue = excluded.breathing_cue, level_scaling_json = excluded.level_scaling_json, updated_at = now()
    `;
  }
}

// ── methodology_nutrition_rules (Área 13) — 8 seed rules + 2 [confirmar] ─────
const NUTRITION: Array<{
  moment: string; cpkg: number | null; clo: number | null; chi: number | null;
  ppkg: number | null; pabs: number | null; ratio: string | null; tmin: number | null;
  hyd: boolean; elec: boolean; note: string | null; authored: string;
}> = [
  { moment: 'pre_endurance', cpkg: 1.0, clo: 40, chi: 60, ppkg: null, pabs: null, ratio: null, tmin: -75, hyd: true, elec: false, note: 'Carbohidratos 60-90min antes + hidratación.', authored: 'pablo' },
  { moment: 'post_glycogen', cpkg: 1.0, clo: null, chi: null, ppkg: 0.3, pabs: null, ratio: null, tmin: 30, hyd: false, elec: false, note: 'Recarga de glucógeno <30min.', authored: 'pablo' },
  { moment: 'post_strength', cpkg: null, clo: null, chi: null, ppkg: null, pabs: 30, ratio: null, tmin: 30, hyd: false, elec: false, note: 'Proteína 30g + carbohidratos.', authored: 'pablo' },
  { moment: 'post_threshold', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: '3:1', tmin: 30, hyd: false, elec: false, note: 'Ratio carb:proteína 3:1 <30min.', authored: 'pablo' },
  { moment: 'between_am_pm_strength_endurance', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: null, tmin: 360, hyd: true, elec: false, note: 'Strength AM → endurance PM 6h+: recargar antes de la PM.', authored: 'pablo' },
  { moment: 'between_am_pm_pm_recovery', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: null, tmin: null, hyd: false, elec: false, note: 'PM de recuperación: carbohidratos ligeros.', authored: 'pablo' },
  { moment: 'post_recovery_evening', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: null, tmin: null, hyd: false, elec: false, note: 'Carbohidratos + proteína + magnesio por la noche.', authored: 'pablo' },
  { moment: 'race_morning', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: null, tmin: -150, hyd: true, elec: false, note: 'Carbohidratos altos, baja grasa/fibra, 2-3h antes. [estándar de mercado, confirmar]', authored: 'system_default' },
  { moment: 'intra_race', cpkg: null, clo: null, chi: null, ppkg: null, pabs: null, ratio: null, tmin: null, hyd: false, elec: true, note: 'Electrolitos si la carrera supera ~70min. [estándar de mercado, confirmar]', authored: 'system_default' },
];

async function seedNutrition(sql: Sql, coachId: string): Promise<void> {
  for (const n of NUTRITION) {
    await sql`
      insert into methodology_nutrition_rules (coach_id, moment, carbs_g_per_kg, carbs_g_abs_low, carbs_g_abs_high, protein_g_per_kg, protein_g_abs, carb_protein_ratio, timing_minutes, hydration, electrolytes, note, authored)
      values (${coachId}::bigint, ${n.moment}, ${n.cpkg}, ${n.clo}, ${n.chi}, ${n.ppkg}, ${n.pabs}, ${n.ratio}, ${n.tmin}, ${n.hyd}, ${n.elec}, ${n.note}, ${n.authored})
      on conflict (coach_id, moment) do update set
        carbs_g_per_kg = excluded.carbs_g_per_kg, protein_g_abs = excluded.protein_g_abs,
        carb_protein_ratio = excluded.carb_protein_ratio, note = excluded.note, updated_at = now()
    `;
  }
}

// ── methodology_rules (the engine) — see seed_methodology_rules.ts ───────────
async function seedRules(sql: Sql, coachId: string): Promise<void> {
  // Clear this coach's seeded rules first so re-running reflects edits to the
  // rule set without leaving stale rows (rules have no natural unique key).
  await sql`delete from methodology_rules where coach_id = ${coachId}::bigint and authored in ('pablo','system_default')`;
  for (const r of PABLO_DEFAULT_RULES) {
    // Validate every field server-side before write (project rule). coach_id is
    // SQL-cast (string → bigint) so it is omitted from the zod row validation;
    // the load-bearing variable-arity JSONB (conditions/actions) and all typed
    // axes ARE validated by the row schema sans the DB-managed columns.
    const validated = methodologyRuleRowSchema
      .omit({ id: true, coach_id: true, created_at: true, updated_at: true })
      .parse({
        area: r.area,
        trigger_phase: r.trigger_phase,
        scope: r.scope,
        priority: r.priority,
        authored: r.authored,
        source_template_id: null,
        source_excerpt: r.source_excerpt ?? null,
        requires_coach_approval: r.requires_coach_approval,
        enabled: true,
        conditions_json: r.conditions,
        actions_json: r.actions,
      });
    await sql`
      insert into methodology_rules (coach_id, area, trigger_phase, scope, priority, authored, source_excerpt, requires_coach_approval, enabled, conditions_json, actions_json)
      values (${coachId}::bigint, ${validated.area}, ${validated.trigger_phase}, ${validated.scope}, ${validated.priority}, ${validated.authored}, ${validated.source_excerpt}, ${validated.requires_coach_approval}, ${validated.enabled}, ${sql.json(validated.conditions_json)}, ${sql.json(validated.actions_json)})
    `;
  }
}

// ── athlete_emphasis: NOT seeded here ────────────────────────────────────────
// athlete_emphasis is per-ATHLETE derived state (Área 10), not coach methodology.
// It is computed at onboarding/assignment time from the athlete's benchmarks, not
// part of Pablo's default methodology. The table exists (0048); rows are written
// by the assignment pipeline, not this seed.

// ── RAG synthesis (spec §5 "Síntesis a RAG") ─────────────────────────────────
// Serializes the structured methodology into ONE methodology_documents row with
// deterministic chunks. Separation (spec §5): structured-rule chunks are a
// DETERMINISTIC SQL filter (no embedding needed/used); the philosophy narrative
// is the embedding-retrieval chunk. Embeddings are STUBBED (no provider) — chunks
// are written with embedding = NULL and the backfill is a documented follow-up.
async function synthesizeRag(sql: Sql, coachId: string): Promise<void> {
  const title = 'Síntesis de metodología (estructurada) — Pablo';
  // Deterministic body: serialize the structured tables into readable text. This
  // is the human-auditable mirror of the structured rows; it is NOT the retrieval
  // surface for rules (those are queried by SQL), so its chunks stay embedding-null.
  const raw =
    `# Metodología estructurada (síntesis determinista)\n\n` +
    `## Bloques ATR\n` +
    BLOCKS.map((b) => `- ${b.block_type} (${b.label_athlete}): ${b.duration_weeks} sem, techo ${b.intensity_ceiling}, objetivos ${b.objective_json.join('/')}.`).join('\n') +
    `\n\n## No-negociables y reglas (${PABLO_DEFAULT_RULES.length})\n` +
    PABLO_DEFAULT_RULES.map((r) => `- [A${r.area}/${r.priority}] ${r.source_excerpt ?? r.actions.map((a) => a.verb).join(',')}`).join('\n') +
    `\n\n## Narrativa de filosofía (retrieval por embedding)\n${PHILOSOPHY_NARRATIVE}\n`;

  // Upsert the document (one synthesis doc per coach, identified by title).
  const existing = await sql<{ id: string }[]>`
    select id::text as id from methodology_documents
    where coach_id = ${coachId}::bigint and title = ${title} limit 1
  `;
  let docId: string;
  if (existing[0]) {
    docId = existing[0].id;
    await sql`update methodology_documents set raw_content = ${raw}, updated_at = now() where id = ${docId}::bigint`;
    await sql`delete from methodology_chunks where document_id = ${docId}::bigint`;
  } else {
    const [d] = await sql<{ id: string }[]>`
      insert into methodology_documents (coach_id, source_type, title, raw_content)
      values (${coachId}::bigint, 'text', ${title}, ${raw})
      returning id::text as id
    `;
    if (!d) throw new Error('failed to create methodology document');
    docId = d.id;
  }

  // Chunks: each structured section + the narrative. embedding = NULL (stubbed).
  // kind is encoded as a prefix so the retrieval layer can filter structured vs
  // narrative deterministically until embeddings are backfilled.
  const chunks: string[] = [
    `[structured:blocks] ${BLOCKS.map((b) => `${b.block_type}=${b.duration_weeks}w ceiling=${b.intensity_ceiling}`).join('; ')}`,
    `[structured:rules] ${PABLO_DEFAULT_RULES.length} reglas WHEN→THEN (filtro determinista, ver methodology_rules)`,
    `[narrative:philosophy] ${PHILOSOPHY_NARRATIVE}`,
  ];
  for (const [i, content] of chunks.entries()) {
    await sql`
      insert into methodology_chunks (document_id, chunk_index, content, embedding)
      values (${docId}::bigint, ${i}, ${content}, ${null})
      on conflict (document_id, chunk_index) do update set content = excluded.content
    `;
  }
  await sql`update methodology_documents set chunk_count = ${chunks.length} where id = ${docId}::bigint`;

  process.stdout.write(
    `\n[rag] synthesized doc ${docId} with ${chunks.length} chunks (embeddings STUBBED = NULL).\n` +
    `[rag] FOLLOW-UP: run the embedding backfill once LLM_EMBEDDING_MODEL + LLM_API_KEY are set\n` +
    `       to embed the [narrative:*] chunk(s). [structured:*] chunks stay NULL by design\n` +
    `       (deterministic SQL filter, not vector retrieval — spec §5).\n`,
  );
}

async function main(): Promise<void> {
  const sql = getSql();
  try {
    const coachId = await ensureCoach(sql);
    process.stdout.write(`Using coach_id=${coachId}\n`);
    await seedCoachMethodology(sql, coachId);
    await seedBlocks(sql, coachId);
    await seedZones(sql, coachId);
    await seedTests(sql, coachId);
    await seedWeekly(sql, coachId);
    await seedSubs(sql, coachId);
    await seedStations(sql, coachId);
    await seedNutrition(sql, coachId);
    await seedRules(sql, coachId);
    await synthesizeRag(sql, coachId);
    process.stdout.write(
      `\n[seed:methodology] done — coach_methodology(1), blocks(${BLOCKS.length}), zones(${ZONES.length}), ` +
      `tests(${TESTS.length}), weekly(${WEEKLY.length}), subs(${SUBS.length}), stations(${STATIONS.length}), ` +
      `nutrition(${NUTRITION.length}), rules(${PABLO_DEFAULT_RULES.length}).\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
