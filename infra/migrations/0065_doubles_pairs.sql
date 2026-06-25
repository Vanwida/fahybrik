-- 0065: DOUBLES PAIRS — coach-created training pair (HYROX Dobles).
--
-- WHAT THIS IS
-- ------------
-- A `doubles_pair` links TWO of a coach's athletes who train the SAME plan at
-- the SAME level + days/week. It is a COORDINATOR, not a plan store: assigning a
-- plan to a pair runs the EXISTING per-athlete materialization pipeline
-- (resolveSequenceForAthlete → assignSequenceToAthlete → instantiateMonthFromTemplate)
-- once for EACH athlete. Each athlete keeps their own dated workout_assignments
-- and their own athlete_sequence_progress cursor; the numbers (%RM / zona / ritmo)
-- come from each athlete's own zone profile. The pair only guarantees the two
-- resolve to the SAME (level, days) sequence cell — i.e. the same plan STRUCTURE.
--
-- There is NO shared-plan table and NO duplicate materialization model: the pair
-- drives the individual pipeline for both. (This is distinct from users.partner_id
-- / partner_invitations / subscriptions.partner_user_id (0021), which is the
-- athlete-initiated BILLING/social pairing — a different axis, left untouched.)
--
-- AGNOSTIC: no ATR / phase coupling. level_id → athlete_levels (per-coach data),
-- days in the 3-6 sequence band (matches program_sequences / SEQUENCE_DAYS_*).
--
-- INVARIANTS
-- ----------
-- · athlete_a_id < athlete_b_id  → canonical order, dedupes (a,b) == (b,a).
-- · an athlete is in AT MOST ONE active pair (enforced by two partial-unique
--   indexes, one per column, PLUS the transactional membership check in app code
--   that also catches the a-side-here / b-side-there cross-column case).
-- · level / days are nullable: a pair may be formed before classification, but
--   the assign call gates on a resolvable sequence exactly like an individual.
--
-- ADDITIVE & NON-BREAKING: only CREATE TABLE / index. Nothing dropped or altered.

begin;

create table if not exists doubles_pairs (
  id                     bigint generated always as identity primary key,
  coach_id               bigint   not null references coaches(id)        on delete cascade,
  athlete_a_id           bigint   not null references athletes(id)       on delete cascade,
  athlete_b_id           bigint   not null references athletes(id)       on delete cascade,
  -- Shared (level, days) the pair trains at. Nullable: a pair can be linked
  -- before both athletes are classified; the assign call resolves the sequence
  -- from the athletes' own (level_id, training_days_per_week) at assign time.
  level_id               bigint   references athlete_levels(id)          on delete set null,
  training_days_per_week smallint,
  status                 text     not null default 'active',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint doubles_pairs_status_chk   check (status in ('active', 'dissolved')),
  constraint doubles_pairs_distinct_chk check (athlete_a_id <> athlete_b_id),
  -- Canonical ordering so the unordered pair {a,b} has ONE representation.
  constraint doubles_pairs_order_chk    check (athlete_a_id < athlete_b_id),
  constraint doubles_pairs_days_chk
    check (training_days_per_week is null or training_days_per_week between 3 and 6)
);

-- An athlete appears in at most ONE active pair, per column. The two partial
-- uniques cover "X is a-side twice" and "X is b-side twice"; the remaining
-- cross-column case (X a-side in one, b-side in another) is caught by the
-- transactional membership check in the create service (defense in depth).
create unique index if not exists doubles_pairs_active_a_uq
  on doubles_pairs (athlete_a_id) where status = 'active';
create unique index if not exists doubles_pairs_active_b_uq
  on doubles_pairs (athlete_b_id) where status = 'active';

-- Coach-scoped lookups (roster: "which of my athletes are paired").
create index if not exists doubles_pairs_coach_idx
  on doubles_pairs (coach_id, status);

comment on table doubles_pairs is
  '0065: coach-created HYROX Dobles training pair. Coordinator over the existing per-athlete materialization pipeline (no shared-plan storage). Distinct from users.partner_id (billing/social pairing, 0021).';

commit;
