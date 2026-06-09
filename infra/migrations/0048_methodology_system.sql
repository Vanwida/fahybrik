-- 0048: METHODOLOGY SYSTEM — the coach DECISION layer (spec
-- docs/design/methodology-system/spec.md §5).
--
-- WHY
-- ---
-- Per-exercise dosage is already structured (0043 prescription_json) and so are
-- templates/blocks. What did NOT exist anywhere was HOW the coach decides:
-- selects, sequences, progresses, adapts. That lived as free text in
-- coach_notes / template_segments.notes, or not at all. This migration persists
-- the structured decision layer for the 14 areas (spec §4).
--
-- MODELING PRINCIPLE (project rule: explicit columns; JSONB only where justified)
-- ------------------------------------------------------------------------------
--   * Fixed-shape data  -> typed columns + CHECK constraints (mirror the zod
--     enums in @fahybrid/shared/schema/methodology-system.ts and
--     @fahybrid/shared/domain/methodology/*).
--   * VARIABLE-ARITY data (a rule's conditions[]/actions[], the per-block
--     modality mix, am/pm pairs, level-scaling) -> bounded JSONB, the SAME
--     precedent as prescription_json (0043). Each JSONB column is validated by a
--     zod schema before write (server-side validation, project rule).
--
-- methodology_documents / methodology_chunks already exist (0001 + 0009) — this
-- migration does NOT recreate them. The RAG-synthesis seed writes into them.
--
-- FKs: coach_id -> coaches(id); methodology_group_id -> methodology_groups(id)
-- (1..10); source_template_id -> templates(id); athlete_id -> athletes(id).
-- Substitution/station slugs reference exercises by slug (soft ref: a slug may
-- name an alt that is not yet in the catalog, so no hard FK — matches how
-- athlete_benchmarks.exercise_slug is modeled in 0001).
--
-- Idempotent: `if not exists` everywhere; the migrate runner journals by stem.

begin;

-- =============================================================================
-- coach_methodology — 1 row per coach. Global scalars (Áreas 1,5,6,8,12,14).
-- =============================================================================
create table if not exists coach_methodology (
  id                              bigint generated always as identity primary key,
  coach_id                        bigint not null references coaches(id) on delete cascade,

  -- Zone model (Área 5)
  hr_zone_count                   smallint not null default 5,
  hr_anchor                       text not null default 'lthr',
  run_pace_anchor                 text not null default '5k',
  erg_row_anchor                  text not null default '2k',
  erg_ski_anchor                  text not null default '1k',
  bike_anchor                     text not null default 'ftp',
  rpe_scale                       text not null default '0_10_cr10',
  one_rm_estimation               text not null default 'Epley',
  rpe_to_pct1rm_table_json        jsonb null,

  -- Non-negotiables / spacing (Área 1)
  intensity_spacing_min_hours     smallint not null default 6,
  max_consecutive_hi_days         smallint not null default 1,
  decoupling_target_pct           numeric(5,2) not null default 5,
  decoupling_regress_threshold_pct numeric(5,2) not null default 8,

  -- Readiness gates (Área 6)
  hrv_skip_threshold_pct          numeric(5,2) not null default -15,
  hrv_modify_threshold_pct        numeric(5,2) not null default -10,
  sleep_min_hours                 numeric(4,1) not null default 6,
  soreness_skip_threshold         smallint not null default 4,
  presession_rpe_skip_threshold   numeric(4,1) not null default 5,
  gate_logic                      text not null default 'ANY_triggers',

  -- Tests (Área 8)
  recalc_policy                   text not null default 'propose_review',
  test_cadence_mode               text not null default 'block_start',
  freshness_1rm_weeks             smallint not null default 12,
  freshness_pace_hr_weeks         smallint not null default 6,
  freshness_stations_weeks        smallint not null default 8,

  -- Taper (Área 12)
  taper_duration_days             smallint not null default 7,
  taper_volume_reduction_pct      numeric(5,2) not null default 50,
  taper_keep_intensity            boolean not null default true,

  -- Voice (Área 14)
  tone_motivador                  smallint not null default 60,
  tone_tecnico                    smallint not null default 80,
  tone_estricto                   smallint not null default 50,
  tone_calido                     smallint not null default 40,
  why_depth                       text not null default 'una_linea',
  language_primary                text not null default 'es',
  language_fallback               text null,
  address_form                    text not null default 'tu',
  emoji_use                       text not null default 'nunca',
  checkin_feedback_style          text not null default 'dato+accion',
  philosophy_narrative            text null,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint coach_methodology_coach_unique unique (coach_id),
  constraint coach_methodology_hr_anchor_chk check (hr_anchor in ('lthr','max_hr','tanaka')),
  constraint coach_methodology_rpe_scale_chk check (rpe_scale in ('0_10_cr10')),
  constraint coach_methodology_one_rm_chk check (one_rm_estimation in ('Epley','Brzycki','Lombardi')),
  constraint coach_methodology_gate_logic_chk check (gate_logic in ('ANY_triggers','ALL_triggers')),
  constraint coach_methodology_recalc_chk check (recalc_policy in ('auto_on_result','propose_review','manual')),
  constraint coach_methodology_cadence_chk check (test_cadence_mode in ('block_start','every_n_weeks','on_plateau','manual')),
  constraint coach_methodology_why_depth_chk check (why_depth in ('ninguno','una_linea','parrafo')),
  constraint coach_methodology_lang_chk check (language_primary in ('es','en') and (language_fallback is null or language_fallback in ('es','en'))),
  constraint coach_methodology_address_chk check (address_form in ('tu','usted')),
  constraint coach_methodology_emoji_chk check (emoji_use in ('nunca','raro','libre')),
  constraint coach_methodology_tone_chk check (
    tone_motivador between 0 and 100 and tone_tecnico between 0 and 100
    and tone_estricto between 0 and 100 and tone_calido between 0 and 100
  ),
  constraint coach_methodology_hr_zone_count_chk check (hr_zone_count between 3 and 7)
);

-- =============================================================================
-- methodology_blocks — ACC/TRANS/REAL per coach (Áreas 2 & 3).
-- =============================================================================
create table if not exists methodology_blocks (
  id                            bigint generated always as identity primary key,
  coach_id                      bigint not null references coaches(id) on delete cascade,
  block_type                    text not null,           -- ACC | TRANS | REAL (atr_block_type)
  label_athlete                 text not null,
  duration_weeks                smallint not null,
  objective_json                jsonb not null,          -- string[] of block objectives
  intensity_ceiling             text not null,           -- Z2..Z5
  sequence_order                smallint not null,
  progression_shape_volume      text not null,           -- lineal|escalon|onda
  progression_shape_intensity   text not null,
  weekly_volume_delta_pct       numeric(5,2) null,
  intensity_ramp_low_pct        numeric(5,2) null,
  intensity_ramp_high_pct       numeric(5,2) null,
  deload_trigger                text not null,
  deload_volume_reduction_pct   numeric(5,2) not null,
  deload_intensity_reduction_pct numeric(5,2) not null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint methodology_blocks_coach_type_unique unique (coach_id, block_type),
  constraint methodology_blocks_type_chk check (block_type in ('ACC','TRANS','REAL')),
  constraint methodology_blocks_ceiling_chk check (intensity_ceiling in ('Z2','Z3','Z4','Z5')),
  constraint methodology_blocks_dur_chk check (duration_weeks between 1 and 8),
  constraint methodology_blocks_shape_vol_chk check (progression_shape_volume in ('lineal','escalon','onda')),
  constraint methodology_blocks_shape_int_chk check (progression_shape_intensity in ('lineal','escalon','onda')),
  constraint methodology_blocks_deload_trigger_chk check (deload_trigger in ('every_n_weeks','last_week_of_block','readiness_based','none'))
);

-- =============================================================================
-- methodology_zones — coach × system(hr|pace|erg|power) × zone (Área 5).
-- =============================================================================
create table if not exists methodology_zones (
  id          bigint generated always as identity primary key,
  coach_id    bigint not null references coaches(id) on delete cascade,
  system      text not null,             -- hr | pace | erg | power
  modality    text null,                 -- run|row|ski|bike for pace/erg/power; null for hr
  zone        smallint not null,
  label       text not null,
  anchor      text not null,             -- lthr | pace5k | split2k | split1k | ftp
  lower       numeric(8,3) not null,     -- fraction (hr/power) OR s offset (pace/erg)
  upper       numeric(8,3) not null,
  unit        text not null,             -- fraction_of_anchor | s_per_km | s_per_500m | pct_ftp
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint methodology_zones_unique unique (coach_id, system, modality, zone),
  constraint methodology_zones_system_chk check (system in ('hr','pace','erg','power')),
  constraint methodology_zones_zone_chk check (zone between 1 and 5),
  constraint methodology_zones_unit_chk check (unit in ('fraction_of_anchor','s_per_km','s_per_500m','pct_ftp'))
);

-- =============================================================================
-- methodology_tests — coach × test catalog entry (Área 8).
-- =============================================================================
create table if not exists methodology_tests (
  id                       bigint generated always as identity primary key,
  coach_id                 bigint not null references coaches(id) on delete cascade,
  slug                     text not null,
  modality                 text not null,
  protocol                 text not null,
  output_field             text not null,   -- onboarding field this test writes
  feeds_anchor             text null,        -- which anchor it calibrates
  cadence                  text not null,
  freshness_weeks          smallint not null,
  recalc_propagation_json  jsonb not null default '[]'::jsonb,
  progression_cap_pct      numeric(5,2) null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint methodology_tests_coach_slug_unique unique (coach_id, slug),
  constraint methodology_tests_freshness_chk check (freshness_weeks between 1 and 52)
);

-- =============================================================================
-- methodology_weekly_structure — coach × level (Área 4).
-- =============================================================================
create table if not exists methodology_weekly_structure (
  id                              bigint generated always as identity primary key,
  coach_id                        bigint not null references coaches(id) on delete cascade,
  level                           smallint not null,
  sessions_per_week               smallint not null,
  two_a_day_enabled               boolean not null default false,
  modality_mix_json               jsonb not null default '{}'::jsonb,  -- {block:{modality:pct}}
  hard_easy_pattern               text not null,
  key_session_by_block_json       jsonb not null default '{}'::jsonb,  -- {ACC:'z2_long',...}
  am_pm_pairs_json                jsonb not null default '[]'::jsonb,  -- [{am,pm,gap_min_h}]
  forbidden_adjacent_json         jsonb not null default '[]'::jsonb,  -- [[typeA,typeB]]
  rest_day_placement              text not null,
  min_separation_strength_cardio_h smallint not null default 6,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint methodology_weekly_coach_level_unique unique (coach_id, level),
  constraint methodology_weekly_level_chk check (level between 1 and 4),
  constraint methodology_weekly_spw_chk check (sessions_per_week between 1 and 14),
  constraint methodology_weekly_pattern_chk check (hard_easy_pattern in ('hard_easy_alt','2hard_1easy','block_undulating')),
  constraint methodology_weekly_rest_chk check (rest_day_placement in ('post_hardest','mid_week','pre_race_sim','fixed'))
);

-- =============================================================================
-- methodology_substitutions — coach × edge of the stimulus-preserving graph (Área 9).
-- exercise slugs are SOFT refs (an alt may not yet be in the catalog).
-- =============================================================================
create table if not exists methodology_substitutions (
  id               bigint generated always as identity primary key,
  coach_id         bigint not null references coaches(id) on delete cascade,
  target_slug      text not null,
  alt_slug         text not null,
  stimulus_match   text not null,    -- exact | high | partial
  movement_pattern text not null,
  energy_system    text not null,
  condition        text not null,    -- no_equipment | injury_area | space | noise | any
  injury_area      text null,
  scale_factor     numeric(5,3) null,
  flag_coach       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint methodology_subs_unique unique (coach_id, target_slug, alt_slug, condition),
  constraint methodology_subs_match_chk check (stimulus_match in ('exact','high','partial')),
  constraint methodology_subs_condition_chk check (condition in ('no_equipment','injury_area','space','noise','any'))
);

-- =============================================================================
-- methodology_station_strategy — coach × HYROX station 1-8 (Área 12).
-- =============================================================================
create table if not exists methodology_station_strategy (
  id                 bigint generated always as identity primary key,
  coach_id           bigint not null references coaches(id) on delete cascade,
  station_position   smallint not null,
  station_slug       text not null,
  time_m_seconds     integer null,
  time_w_seconds     integer null,
  load_m_kg          numeric(6,2) null,
  load_w_kg          numeric(6,2) null,
  fractionation      text null,
  breathing_cue      text null,
  level_scaling_json jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint methodology_station_unique unique (coach_id, station_position),
  constraint methodology_station_pos_chk check (station_position between 1 and 8)
);

-- =============================================================================
-- methodology_nutrition_rules — coach × fueling moment (Área 13).
-- =============================================================================
create table if not exists methodology_nutrition_rules (
  id                 bigint generated always as identity primary key,
  coach_id           bigint not null references coaches(id) on delete cascade,
  moment             text not null,
  carbs_g_per_kg     numeric(5,2) null,
  carbs_g_abs_low    smallint null,
  carbs_g_abs_high   smallint null,
  protein_g_per_kg   numeric(5,2) null,
  protein_g_abs      smallint null,
  carb_protein_ratio text null,         -- "3:1"
  timing_minutes     smallint null,
  hydration          boolean not null default false,
  electrolytes       boolean not null default false,
  note               text null,
  authored           text not null default 'pablo',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint methodology_nutrition_unique unique (coach_id, moment),
  constraint methodology_nutrition_moment_chk check (moment in (
    'pre_endurance','post_glycogen','post_strength','post_threshold',
    'between_am_pm_strength_endurance','between_am_pm_pm_recovery',
    'post_recovery_evening','race_morning','intra_race'
  )),
  constraint methodology_nutrition_authored_chk check (authored in ('pablo','ai_suggested','system_default'))
);

-- =============================================================================
-- methodology_rules — THE ENGINE (Áreas 1,2,3,6,7,10,11,12). Typed scalar axes
-- as columns; the variable-arity conditions[]/actions[] as bounded JSONB
-- (prescription_json precedent). Validated by @fahybrid/shared/domain/methodology
-- before every write.
-- =============================================================================
create table if not exists methodology_rules (
  id                       bigint generated always as identity primary key,
  coach_id                 bigint not null references coaches(id) on delete cascade,
  area                     smallint not null,         -- 1..14
  trigger_phase            text not null,             -- pre_session|intra_session|cross_session|selection
  scope                    text not null,             -- set|exercise|session|day|week|block|global
  priority                 text not null,             -- critical|high|medium|low
  authored                 text not null,             -- pablo|ai_suggested|system_default
  source_template_id       bigint null references templates(id) on delete set null,
  source_excerpt           text null,
  requires_coach_approval  boolean not null,
  enabled                  boolean not null default true,
  conditions_json          jsonb not null,            -- ConditionGroup[]  (zod-validated)
  actions_json             jsonb not null,            -- RuleAction[]      (zod-validated)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint methodology_rules_area_chk check (area between 1 and 14),
  constraint methodology_rules_phase_chk check (trigger_phase in ('pre_session','intra_session','cross_session','selection')),
  constraint methodology_rules_scope_chk check (scope in ('set','exercise','session','day','week','block','global')),
  constraint methodology_rules_priority_chk check (priority in ('critical','high','medium','low')),
  constraint methodology_rules_authored_chk check (authored in ('pablo','ai_suggested','system_default')),
  -- JSONB shape guards (second net behind zod): must be non-empty arrays.
  constraint methodology_rules_conditions_arr_chk check (jsonb_typeof(conditions_json) = 'array' and jsonb_array_length(conditions_json) >= 1),
  constraint methodology_rules_actions_arr_chk check (jsonb_typeof(actions_json) = 'array' and jsonb_array_length(actions_json) >= 1)
);

create index if not exists methodology_rules_coach_area_idx
  on methodology_rules (coach_id, area, trigger_phase)
  where enabled = true;

create index if not exists methodology_rules_phase_idx
  on methodology_rules (trigger_phase, priority)
  where enabled = true;

-- =============================================================================
-- athlete_emphasis — per-ATHLETE state (Área 10): which methodology groups to
-- emphasize and the computed modality profile. NOT methodology (coach) — this is
-- derived athlete state, so it lives keyed by athlete_id, not coach_id.
-- =============================================================================
create table if not exists athlete_emphasis (
  id                    bigint generated always as identity primary key,
  athlete_id            bigint not null references athletes(id) on delete cascade,
  methodology_group_id  integer not null references methodology_groups(id) on delete restrict,
  multiplier            numeric(4,2) not null default 1.0,
  modality_profile_json jsonb null,   -- {run:4,strength:2,erg:3,...} 1-5 scores
  source                text not null default 'ai_suggested',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint athlete_emphasis_unique unique (athlete_id, methodology_group_id),
  constraint athlete_emphasis_mult_chk check (multiplier between 0.5 and 2.0),
  constraint athlete_emphasis_source_chk check (source in ('pablo','ai_suggested','system_default'))
);

create index if not exists athlete_emphasis_athlete_idx on athlete_emphasis (athlete_id);

-- =============================================================================
-- Column comments (self-documenting schema for implementers).
-- =============================================================================
comment on table coach_methodology is 'Spec §5: 1 row/coach. Global methodology scalars (zone model, gates, taper, voice, tests).';
comment on table methodology_blocks is 'Spec §5: ACC/TRANS/REAL block definitions per coach (Áreas 2 & 3 — periodization + intra-block progression).';
comment on table methodology_zones is 'Spec §5: coach × system(hr|pace|erg|power) × zone bounds (Área 5). lower/upper = fraction-of-anchor (hr/power) or s-offset (pace/erg).';
comment on table methodology_tests is 'Spec §5: test catalog per coach (Área 8). output_field maps a test to an onboarding benchmark field that feeds an anchor.';
comment on table methodology_weekly_structure is 'Spec §5: coach × level weekly structure (Área 4). modality_mix/am_pm/forbidden_adjacent as bounded JSONB (variable arity).';
comment on table methodology_substitutions is 'Spec §5: stimulus-preserving substitution graph edges (Área 9). exercise slugs are soft refs.';
comment on table methodology_station_strategy is 'Spec §5: per-HYROX-station strategy (Área 12) — times/loads M/W, fractionation, breathing cue, level scaling.';
comment on table methodology_nutrition_rules is 'Spec §5: fueling rules per moment (Área 13). g/kg AND absolute grams (IA resolves by athlete weight).';
comment on table methodology_rules is 'Spec §5: the rule ENGINE. Typed axes as columns; conditions_json/actions_json JSONB (variable arity — prescription_json precedent). Validated by @fahybrid/shared/domain/methodology.';
comment on table athlete_emphasis is 'Spec §5: per-ATHLETE emphasis state (Área 10). Group multipliers + modality profile that bias library block SELECTION.';

commit;
