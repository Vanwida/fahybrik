-- FAHYBRIK migration 0010: daily morning check-ins
--
-- UX spec /docs/ux/07-daily-morning-checkin.md (signed off 2026-05-07).
--
-- One row per athlete per local day (truncated server-side via UNIQUE on
-- (athlete_id, recorded_for)). Captures the 5-question wellness questionnaire
-- (soreness, mood, motivation, fatigue, sleep_quality) plus athlete free-text
-- notes plus the precomputed sub_score (0-100) the iOS client already
-- computes (kept canonical client-side per spec; server stores it verbatim).
--
-- Why store sub_score even though it's derivable: query-time recompute every
-- time we render Today / coach briefing / readiness composite is wasteful and
-- creates ambiguity if scoring formula evolves. Spec explicitly says iOS
-- computes it and ships it. Server enforces 0-100 invariant.
--
-- Why no foreign key to workout_assignments: adaptive override evaluation
-- happens out-of-band and the assignment may not yet be scheduled when the
-- check-in lands (athletes check in at 7am, assignments may shift later).

begin;

create table daily_checkins (
  id              bigint generated always as identity primary key,
  athlete_id      bigint not null references athletes(id) on delete cascade,
  -- Local-day key the iOS client computed (yyyy-MM-dd in athlete's timezone).
  -- This is the dedupe axis — second submit on same day overwrites.
  recorded_for    date not null,
  -- ISO8601 timestamp from the device when the user tapped CONTINUAR.
  recorded_at     timestamptz not null,
  soreness        smallint,
  mood            smallint,
  motivation      smallint,
  fatigue         smallint,
  sleep_quality   smallint,
  notes           text,
  -- 0..100 sub-score. iOS computes; server validates the bounds.
  sub_score       smallint not null,
  -- Adaptive override flag — populated server-side by checkin ingestion when
  -- HRV trend down + sub_score < 40 + planned RPE >= 8. Coach-facing.
  adaptive_flag   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint daily_checkins_athlete_day_unique unique (athlete_id, recorded_for),
  constraint daily_checkins_score_chk check (sub_score between 0 and 100),
  constraint daily_checkins_soreness_chk check (soreness is null or soreness between 1 and 5),
  constraint daily_checkins_mood_chk check (mood is null or mood between 1 and 5),
  constraint daily_checkins_motivation_chk check (motivation is null or motivation between 1 and 5),
  constraint daily_checkins_fatigue_chk check (fatigue is null or fatigue between 1 and 5),
  constraint daily_checkins_sleep_chk check (sleep_quality is null or sleep_quality between 1 and 5)
);

create index daily_checkins_athlete_day_idx
  on daily_checkins (athlete_id, recorded_for desc);

create index daily_checkins_flag_idx
  on daily_checkins (adaptive_flag, recorded_for desc)
  where adaptive_flag is not null;

commit;
