-- 0109_coach_exercise_synonyms.sql
--
-- Per-coach LEARNED synonym store: free-text notation term → catalog exercise.
--
-- WHY
-- ---
-- Pablo (and every future coach) writes workouts in HIS OWN shorthand — "SB
-- lunge", "DB snatch", "sentadilla frontal", "row 500". The importer (#28) maps
-- that free text to a catalog `exercises.id`. Two layers already exist and are
-- GLOBAL / static:
--   (1) the built-in alias map (~90 term→slug entries, ES + HYROX + shorthand),
--       source of truth `infra/scripts/parse_blocks_lib.ts::ALIASES`;
--   (2) the catalog itself (exact / substring match on `exercises.name`).
-- Neither LEARNS. The moment a coach's private notation isn't in the global map
-- (or he means a DIFFERENT catalog movement than the global guess), the resolver
-- must fall back to the LLM / a manual pick — and today that correction is thrown
-- away, so the same term costs the same round-trip forever.
--
-- WHAT
-- ----
-- This table is the coach-specific TOP layer of the resolver cascade: when the
-- coach corrects (or confirms) a mapping, `learnSynonym` upserts the normalized
-- term → exercise_id HERE, and every later import for THAT coach resolves it
-- deterministically, no LLM. It is the "aprende su notación" requirement made
-- durable. Keyed unique on (coach_id, term_normalized) — one canonical target
-- per coach per normalized term; re-learning the same term overwrites the target
-- (the coach changed his mind), never duplicates.
--
-- `term_normalized` is the OUTPUT of the resolver's `normalizeTerm` (lowercased,
-- accent-stripped, leading quantity/equipment noise and trailing `\d+kg` load
-- stripped, whitespace collapsed) — NOT the raw text — so lookups are a single
-- equality hit on the unique index and trivial spelling/spacing/quantity variants
-- collapse to the same key.
--
-- Precedence (both FKs `on delete cascade`): coach synonym  >  global alias  >
-- catalog name. The row is per-coach content: it disappears with the coach, and
-- retargets/vanishes if the referenced exercise is removed.
--
-- Precedent: `0085_coach_exercise_overrides.sql` (per-coach content keyed on
-- (coach_id, exercise_id)). ADDITIVE + IDEMPOTENT: guarded by `if not exists`,
-- safe to re-run.

create table if not exists coach_exercise_synonyms (
  id               bigint generated always as identity primary key,
  coach_id         bigint not null references coaches(id)   on delete cascade,
  -- The normalized notation key (see normalizeTerm) — the lookup + upsert target.
  term_normalized  text   not null,
  exercise_id      bigint not null references exercises(id) on delete cascade,
  created_at       timestamptz not null default now(),
  -- One learned target per coach per normalized term — the upsert conflict key,
  -- and the index the resolver's layer-1 lookup rides.
  unique (coach_id, term_normalized)
);

-- FK index for the reverse direction (cascade on exercise delete + "which terms
-- point at this exercise" admin views). The (coach_id, term_normalized) unique
-- already covers the hot read path.
create index if not exists coach_exercise_synonyms_exercise_idx
  on coach_exercise_synonyms (exercise_id);

comment on table coach_exercise_synonyms is
  'Per-coach LEARNED synonym store for the #28 importer: normalized notation term -> catalog exercise_id. Top layer of the resolve cascade (coach synonym > global alias > catalog name). Populated by learnSynonym on a coach correction. "Aprende su notacion".';
comment on column coach_exercise_synonyms.term_normalized is
  'normalizeTerm output (lowercased, accent-stripped, leading quantity/equipment noise + trailing NNkg load stripped, whitespace collapsed) — NOT raw text.';
comment on column coach_exercise_synonyms.exercise_id is
  'The catalog exercise this coach maps the term to; on delete cascade so a removed exercise drops its learned synonyms.';
