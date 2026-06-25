-- 0061: SIX-ZONE PACE MODEL + versioned athlete zone profiles.
--
-- WHY (the foundation for the Test feature)
-- -----------------------------------------
-- A "test" produces a THRESHOLD pace (the athlete's Z4 lower bound) for a
-- modality (remo, ski, run, …). From that single number every training zone is
-- derived as a fixed OFFSET band from threshold. Pablo's verified model:
--
--   offset bands in seconds/500m (ergo) from the threshold (test) pace —
--   IDENTICAL across modalities, only the threshold changes per athlete:
--     Z6 [-7,-4]  Z5 [-3,-1]  Z4 [0,+7]  Z3 [+8,+13]  Z2 [+14,+21]  Z1 [+22,+inf)
--
--   remo test 1:55 (115s): Z6 1:48-1:51, Z5 1:52-1:54, Z4 1:55-2:02,
--                          Z3 2:03-2:08, Z2 2:09-2:16, Z1 >2:17.
--   ski  test 2:04 (124s): Z6 1:57-2:00, Z5 2:01-2:03, Z4 2:04-2:11,
--                          Z3 2:12-2:17, Z2 2:18-2:25, Z1 >2:26.
--
-- These bands are a coach's METHODOLOGY DATA (seeded standard, editable), not
-- logic hardcoded in code — the same agnostic principle as methodology_phases
-- (0052) and athlete_levels (0057). Each coach owns their zone set.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- The 0048 `methodology_zones` shape (system hr|pace|erg|power / anchor / lower /
-- upper / unit) modeled FIVE zones across mixed axes (%LTHR fractions, %FTP,
-- s-offsets) and never matched Pablo's verified pace bands. It has ZERO rows in
-- any live DB and ZERO runtime readers (seed-only + a stale schema type). Rather
-- than leave two divergent zone tables (the two-calculation bug this feature
-- exists to prevent), this migration REPLACES that table in place with the clean
-- 6-zone OFFSET model and reseeds it with Pablo's verified bands.
--
--   methodology_zones      — the per-coach 6-zone offset model (seeded standard).
--   athlete_zone_profiles  — the VERSIONED resolved zones for one athlete ×
--                            modality (test pace in, the 6 absolute bands out).
--                            The plan resolver + the calculator read THIS — they
--                            never recompute zones independently (no divergence).
--
-- ADDITIVE to everything else: nothing outside methodology_zones is dropped. The
-- old table was empty, so the drop loses no data. Idempotent (`if not exists` /
-- guarded reseed); the migrate runner journals by stem.

begin;

-- =============================================================================
-- methodology_zones — REBUILT as the per-coach 6-zone OFFSET model.
-- A zone = identity (code/label/color/role/sort_order) + an offset band in
-- seconds from the threshold (test) pace, in `pace_unit` (per_500m ergo |
-- per_km run). Open ends: Z1 high_offset_s NULL (=infinity, slowest); Z6
-- low_offset_s is the fastest floor (-7). absolute_pace = threshold + offset.
-- =============================================================================
drop table if exists methodology_zones;

create table methodology_zones (
  id            bigint generated always as identity primary key,
  coach_id      bigint not null references coaches(id) on delete cascade,

  -- Stable per-coach machine code within a (coach, modality) set: 'Z1'..'Z6'.
  code          text not null,
  -- Athlete-facing display name (editable). e.g. 'Umbral anaeróbico'.
  label         text not null,
  -- Color: explicit token/hex for the UI band. Stored so the coach can edit it;
  -- not derived in code (agnostic — labels/colors are DATA, not logic).
  color         text not null,
  -- AGNOSTIC role axis (closed) — the semantic intensity tier the IA reasons on
  -- and the generic green->black ramp derives from. The only constrained dim.
  role          text not null,
  -- Display/ordering. 1 = easiest (Z1) … 6 = hardest (Z6).
  sort_order    smallint not null,

  -- Which test/pace the offsets are measured against (the Z4 lower bound = the
  -- test result = threshold). 'threshold' for the standard model; FREE per coach.
  anchor        text not null default 'threshold',
  -- Pace unit the offsets are in: per_500m for ergo (row/ski/bike-erg),
  -- per_km for run. A coach's zone SET is one unit (one modality family).
  pace_unit     text not null,

  -- The offset BAND in seconds from threshold pace (signed: negative = faster).
  --   low_offset_s  = the FAST edge of the band (smaller seconds).
  --   high_offset_s = the SLOW edge (larger seconds). NULL = open (Z1 = +inf).
  -- absolute fast bound = threshold + low_offset_s; slow bound = threshold +
  -- high_offset_s. Stored numeric so a coach can tune by sub-second if desired.
  low_offset_s  numeric(6,2) not null,
  high_offset_s numeric(6,2),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint methodology_zones_coach_unit_code_uq unique (coach_id, pace_unit, code),
  constraint methodology_zones_role_chk
    check (role in ('recovery','aerobic_base','aerobic_threshold','threshold','vo2max','sprint')),
  constraint methodology_zones_pace_unit_chk
    check (pace_unit in ('per_500m','per_km')),
  constraint methodology_zones_sort_chk check (sort_order between 1 and 12),
  -- Band must be ordered when closed: fast edge <= slow edge (smaller seconds
  -- first). Open-ended (high NULL) is always valid.
  constraint methodology_zones_band_chk
    check (high_offset_s is null or low_offset_s <= high_offset_s)
);

create index if not exists methodology_zones_coach_unit_idx
  on methodology_zones (coach_id, pace_unit, sort_order);

comment on table methodology_zones is
  '0061: per-coach 6-zone OFFSET model. A zone = identity + an offset band in seconds from threshold (test) pace, in pace_unit (per_500m ergo | per_km run). Seeded standard (Pablo verified), editable DATA. The resolver applies these bands to an athlete''s test pace.';
comment on column methodology_zones.role is
  'Agnostic intensity tier (closed): recovery|aerobic_base|aerobic_threshold|threshold|vo2max|sprint. Drives the IA semantics + generic color ramp. Everything else is coach data.';
comment on column methodology_zones.low_offset_s is
  'Fast edge of the band: seconds from threshold (negative=faster). absolute fast bound = threshold + low_offset_s.';
comment on column methodology_zones.high_offset_s is
  'Slow edge of the band: seconds from threshold. NULL = open-ended (Z1 = infinitely slow). absolute slow bound = threshold + high_offset_s.';

-- =============================================================================
-- athlete_zone_profiles — VERSIONED resolved zones for one athlete × modality.
-- The single stored source the plan resolver + calculator BOTH read, so zones
-- are computed ONCE (on test entry) and never recomputed divergently.
-- A new test for the same (athlete, modality) inserts a new row with version+1;
-- the highest version is current (history is kept for audit + analytics).
-- =============================================================================
create table if not exists athlete_zone_profiles (
  id              bigint generated always as identity primary key,
  athlete_id      bigint not null references athletes(id) on delete cascade,

  -- The modality family the zones apply to: row | ski | run | bike. (The erg
  -- bands are shared across row/ski/bike; the threshold pace differs per
  -- modality, so zones are stored per modality.)
  modality        text not null,
  -- The test result: the threshold (Z4 lower bound) pace, in seconds per unit.
  threshold_s     numeric(7,2) not null,
  -- Unit of threshold_s + the resolved bands: per_500m (ergo) | per_km (run).
  pace_unit       text not null,

  -- Provenance: which methodology_tests slug / test produced threshold_s, and
  -- the source benchmark row if any (soft refs — a test may be entered manually).
  source_test_slug   text,
  source_benchmark_id bigint references athlete_benchmarks(id) on delete set null,

  -- The RESOLVED 6 absolute zone bands snapshot, computed by the resolver from
  -- (threshold_s × the coach's methodology_zones at recording time). Shape:
  --   [{ code,label,color,role,sort_order,
  --      fast_s, slow_s|null }]   (absolute seconds per pace_unit; slow_s NULL =
  --                                open Z1). Stored as JSONB because it is a
  -- point-in-time SNAPSHOT (the coach's bands may change later; this row must
  -- keep the zones the athlete was actually trained on). This is the SAME bounded-
  -- snapshot precedent as prescription_json (0043) — validated by zod before write.
  zones_json      jsonb not null,

  -- Monotonic per (athlete, modality). Highest = current.
  version         int not null,
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint athlete_zone_profiles_modality_chk
    check (modality in ('row','ski','run','bike')),
  constraint athlete_zone_profiles_pace_unit_chk
    check (pace_unit in ('per_500m','per_km')),
  constraint athlete_zone_profiles_threshold_chk check (threshold_s > 0),
  constraint athlete_zone_profiles_version_chk check (version >= 1),
  constraint athlete_zone_profiles_version_uq unique (athlete_id, modality, version),
  -- Second net behind zod: must be a 6-element array.
  constraint athlete_zone_profiles_zones_arr_chk
    check (jsonb_typeof(zones_json) = 'array' and jsonb_array_length(zones_json) = 6)
);

-- The current profile = MAX(version) per (athlete, modality). This partial-free
-- index serves the "give me this athlete's current zones for modality X" read.
create index if not exists athlete_zone_profiles_current_idx
  on athlete_zone_profiles (athlete_id, modality, version desc);

comment on table athlete_zone_profiles is
  '0061: VERSIONED resolved zones per athlete × modality. threshold_s (test result) in + the 6 absolute bands snapshot (zones_json) out. The single source the plan resolver + calculator read — zones are computed once on test entry, never recomputed divergently. Highest version = current; history kept for audit.';
comment on column athlete_zone_profiles.zones_json is
  '0061: point-in-time snapshot of the 6 absolute zone bands [{code,label,color,role,sort_order,fast_s,slow_s|null}] in pace_unit. Snapshot (not a live join) so the athlete keeps the zones they were trained on even if the coach edits the model later.';

-- =============================================================================
-- SEED — the standard 6-zone OFFSET set for EVERY existing coach, per_500m
-- (ergo: row/ski/bike-erg) and per_km (run). Pablo verified the per_500m bands;
-- the run set uses the SAME tier semantics with a per_km band roughly 2x the
-- per_500m offset (a /km step ~= two /500m steps), so the resolver produces
-- sensible run zones until a coach tunes them. Idempotent.
--
-- Offset bands (seconds from threshold; low=fast edge, high=slow edge):
--   per_500m  Z6[-7,-4] Z5[-3,-1] Z4[0,7] Z3[8,13] Z2[14,21] Z1[22,NULL]
--   per_km    Z6[-14,-8] Z5[-6,-2] Z4[0,14] Z3[16,26] Z2[28,42] Z1[44,NULL]
-- =============================================================================
insert into methodology_zones
  (coach_id, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s)
select c.id, z.code, z.label, z.color, z.role, z.sort_order, 'threshold', z.pace_unit, z.low_offset_s, z.high_offset_s
from coaches c
cross join (values
  -- per_500m (ergo) — Pablo's VERIFIED bands.
  ('Z1', 'Recuperación activa',     '#22C55E', 'recovery',           1, 'per_500m',  22,  null),
  ('Z2', 'Aeróbico extensivo',      '#3B82F6', 'aerobic_base',       2, 'per_500m',  14,    21),
  ('Z3', 'Aeróbico intensivo',      '#F59E0B', 'aerobic_threshold',  3, 'per_500m',   8,    13),
  ('Z4', 'Umbral anaeróbico',       '#EF4444', 'threshold',          4, 'per_500m',   0,     7),
  ('Z5', 'VO2max / Potencia',       '#991B1B', 'vo2max',             5, 'per_500m',  -3,    -1),
  ('Z6', 'Sprint / Potencia máxima','#111827', 'sprint',             6, 'per_500m',  -7,    -4),
  -- per_km (run) — same tiers, per-km band (~2x the /500m offset).
  ('Z1', 'Recuperación activa',     '#22C55E', 'recovery',           1, 'per_km',    44,  null),
  ('Z2', 'Aeróbico extensivo',      '#3B82F6', 'aerobic_base',       2, 'per_km',    28,    42),
  ('Z3', 'Aeróbico intensivo',      '#F59E0B', 'aerobic_threshold',  3, 'per_km',    16,    26),
  ('Z4', 'Umbral anaeróbico',       '#EF4444', 'threshold',          4, 'per_km',     0,    14),
  ('Z5', 'VO2max / Potencia',       '#991B1B', 'vo2max',             5, 'per_km',    -6,    -2),
  ('Z6', 'Sprint / Potencia máxima','#111827', 'sprint',             6, 'per_km',   -14,    -8)
) as z(code, label, color, role, sort_order, pace_unit, low_offset_s, high_offset_s)
on conflict (coach_id, pace_unit, code) do update set
  label = excluded.label, color = excluded.color, role = excluded.role,
  sort_order = excluded.sort_order, anchor = excluded.anchor,
  low_offset_s = excluded.low_offset_s, high_offset_s = excluded.high_offset_s,
  updated_at = now();

commit;
