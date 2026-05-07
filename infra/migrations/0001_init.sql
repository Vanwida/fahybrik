-- FAHYBRIK initial schema (v1)
-- Postgres 17 + pgvector 0.8
-- Conventions:
--   * snake_case identifiers
--   * bigint generated always as identity primary keys
--   * timestamptz everywhere
--   * explicit foreign keys with on delete policy
--   * enums via create type for closed sets
--   * text over varchar
--   * JSON only for ML feature vectors, embedding vectors, raw provider payloads, audit diffs

begin;

create extension if not exists vector;

-- =============================================================================
-- Enums
-- =============================================================================

create type user_role as enum ('athlete', 'coach', 'admin');

create type athlete_sex as enum ('male', 'female', 'other');

create type discipline as enum ('hyrox', 'crossfit', 'hybrid', 'running', 'strength', 'other');

create type equipment_access as enum ('full_gym', 'home_gym', 'minimal', 'travel');

create type event_type as enum ('hyrox', 'crossfit', 'other');

create type target_priority as enum ('A', 'B', 'C');

create type exercise_category as enum (
  'cardio',
  'strength',
  'skill',
  'hyrox_station',
  'mobility',
  'plyometric',
  'core'
);

create type template_format as enum (
  'amrap',
  'for_time',
  'emom',
  'intervals',
  'strength_block',
  'hyrox_sim',
  'tempo',
  'circuit'
);

create type atr_block_type as enum ('ACC', 'TRANS', 'REAL');

create type target_block as enum ('ACC', 'TRANS', 'REAL', 'any');

create type macrocycle_status as enum ('planned', 'active', 'completed', 'cancelled');

create type block_status as enum ('planned', 'active', 'completed', 'skipped');

create type assignment_status as enum ('scheduled', 'completed', 'missed', 'skipped');

create type biometric_source as enum ('healthkit', 'garmin', 'concept2', 'manual', 'whoop', 'oura', 'polar', 'coros', 'wahoo');

create type biometric_metric as enum (
  'hr',
  'hr_resting',
  'hrv',
  'sleep_duration',
  'sleep_score',
  'vo2max',
  'recovery',
  'training_load',
  'body_battery',
  'stress',
  'respiration',
  'spo2',
  'steps',
  'calories_active',
  'weight',
  'body_fat'
);

create type device_type as enum ('apple_watch', 'iphone', 'garmin', 'concept2', 'whoop', 'oura', 'other');

create type methodology_source_type as enum ('text', 'interview_transcript', 'document_upload', 'voice_note');

create type notification_type as enum (
  'workout_assigned',
  'workout_edited',
  'chat_message',
  'event_reminder',
  'recovery_alert',
  'milestone',
  'system'
);

create type audit_action as enum ('create', 'update', 'delete', 'restore');

-- =============================================================================
-- Auth root: users
-- =============================================================================

create table users (
  id            bigint generated always as identity primary key,
  email         text not null,
  apple_user_id text,
  role          user_role not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  deleted_at    timestamptz,
  constraint users_email_unique unique (email),
  constraint users_apple_user_id_unique unique (apple_user_id)
);

create index users_role_idx on users (role) where deleted_at is null;

-- =============================================================================
-- Coaches (1:1 with users where role = coach)
-- =============================================================================

create table coaches (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  full_name       text not null,
  bio             text,
  default_methodology_doc_id bigint, -- FK added later (forward reference)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint coaches_user_id_unique unique (user_id)
);

-- =============================================================================
-- Athletes (1:1 with users where role = athlete)
-- =============================================================================

create table athletes (
  id                         bigint generated always as identity primary key,
  user_id                    bigint not null references users(id) on delete cascade,
  coach_id                   bigint references coaches(id) on delete set null,
  full_name                  text not null,
  dob                        date,
  sex                        athlete_sex,
  height_cm                  numeric(5,2),
  weight_kg                  numeric(5,2),
  body_fat_pct               numeric(4,2),
  training_experience_years  numeric(4,1),
  primary_discipline         discipline,
  training_days_per_week     int,
  equipment_access           equipment_access,
  injuries_json              jsonb not null default '[]'::jsonb,
  onboarded_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint athletes_user_id_unique unique (user_id),
  constraint athletes_training_days_chk check (training_days_per_week is null or (training_days_per_week between 1 and 14)),
  constraint athletes_height_chk check (height_cm is null or (height_cm between 80 and 260)),
  constraint athletes_weight_chk check (weight_kg is null or (weight_kg between 25 and 250))
);

create index athletes_coach_id_idx on athletes (coach_id);

-- =============================================================================
-- Athlete benchmarks (1RMs, 5K time, etc.)
-- =============================================================================

create table athlete_benchmarks (
  id            bigint generated always as identity primary key,
  athlete_id    bigint not null references athletes(id) on delete cascade,
  exercise_slug text not null,
  value         numeric(10,3) not null,
  unit          text not null,
  recorded_at   timestamptz not null default now(),
  notes         text,
  created_at    timestamptz not null default now()
);

create index athlete_benchmarks_athlete_idx on athlete_benchmarks (athlete_id, exercise_slug, recorded_at desc);
create index athlete_benchmarks_exercise_idx on athlete_benchmarks (exercise_slug);

-- =============================================================================
-- Events catalog (HYROX / CrossFit competitions)
-- =============================================================================

create table events (
  id          bigint generated always as identity primary key,
  slug        text not null,
  name        text not null,
  type        event_type not null,
  location    text,
  country     text,
  start_date  date not null,
  end_date    date,
  division    text,
  source_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_slug_unique unique (slug)
);

create index events_start_date_idx on events (start_date);
create index events_type_idx on events (type, start_date);

-- =============================================================================
-- Athlete target events (an athlete's A/B/C-priority races)
-- =============================================================================

create table athlete_target_events (
  id          bigint generated always as identity primary key,
  athlete_id  bigint not null references athletes(id) on delete cascade,
  event_id    bigint not null references events(id) on delete restrict,
  priority    target_priority not null,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint athlete_target_events_unique unique (athlete_id, event_id)
);

create index athlete_target_events_athlete_idx on athlete_target_events (athlete_id, priority);

-- =============================================================================
-- Exercise catalog
-- =============================================================================

create table exercises (
  id                      bigint generated always as identity primary key,
  slug                    text not null,
  name                    text not null,
  category                exercise_category not null,
  primary_muscle_groups   text[] not null default '{}',
  equipment               text[] not null default '{}',
  default_metrics_json    jsonb not null default '{}'::jsonb, -- which fields apply: reps/time/distance/weight/calories
  hyrox_station_position  int,
  description             text,
  cues                    text,
  video_url               text,
  source                  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint exercises_slug_unique unique (slug),
  constraint exercises_hyrox_station_chk check (
    hyrox_station_position is null
    or (category = 'hyrox_station' and hyrox_station_position between 1 and 8)
  )
);

create index exercises_category_idx on exercises (category);

-- =============================================================================
-- Templates (Pablo's IP — workout blueprints)
-- =============================================================================

create table templates (
  id                  bigint generated always as identity primary key,
  coach_id            bigint not null references coaches(id) on delete restrict,
  name                text not null,
  description         text,
  format              template_format not null,
  target_block        target_block not null default 'any',
  target_level        int,
  version             int not null default 1,
  parent_template_id  bigint references templates(id) on delete set null,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint templates_target_level_chk check (target_level is null or target_level between 1 and 10),
  constraint templates_version_chk check (version >= 1)
);

create index templates_coach_idx on templates (coach_id) where archived_at is null;
create index templates_parent_idx on templates (parent_template_id);
create index templates_format_block_idx on templates (format, target_block);

-- =============================================================================
-- Template segments (ordered exercises within a template)
-- =============================================================================

create table template_segments (
  id            bigint generated always as identity primary key,
  template_id   bigint not null references templates(id) on delete cascade,
  position      int not null,
  exercise_id   bigint not null references exercises(id) on delete restrict,
  params_json   jsonb not null default '{}'::jsonb, -- reps/time/distance/weight/rpe/HR_target/rest
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint template_segments_position_unique unique (template_id, position),
  constraint template_segments_position_chk check (position >= 0)
);

create index template_segments_exercise_idx on template_segments (exercise_id);

-- =============================================================================
-- ATR macrocycles / blocks / microcycles
-- =============================================================================

create table atr_macrocycles (
  id                bigint generated always as identity primary key,
  athlete_id        bigint not null references athletes(id) on delete cascade,
  target_event_id   bigint references events(id) on delete set null,
  name              text,
  start_date        date not null,
  end_date          date not null,
  status            macrocycle_status not null default 'planned',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint atr_macrocycles_dates_chk check (end_date >= start_date)
);

create index atr_macrocycles_athlete_idx on atr_macrocycles (athlete_id, start_date desc);

create table atr_blocks (
  id              bigint generated always as identity primary key,
  macrocycle_id   bigint not null references atr_macrocycles(id) on delete cascade,
  type            atr_block_type not null,
  position        int not null,
  start_date      date not null,
  end_date        date not null,
  status          block_status not null default 'planned',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint atr_blocks_position_unique unique (macrocycle_id, position),
  constraint atr_blocks_dates_chk check (end_date >= start_date),
  constraint atr_blocks_position_chk check (position >= 0)
);

create index atr_blocks_macrocycle_idx on atr_blocks (macrocycle_id, position);

create table microcycles (
  id            bigint generated always as identity primary key,
  block_id      bigint not null references atr_blocks(id) on delete cascade,
  week_number   int not null,
  start_date    date not null,
  end_date      date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint microcycles_week_unique unique (block_id, week_number),
  constraint microcycles_dates_chk check (end_date >= start_date),
  constraint microcycles_week_chk check (week_number >= 1)
);

create index microcycles_block_idx on microcycles (block_id, week_number);

-- =============================================================================
-- Workout assignments / executions / segment executions
-- =============================================================================

create table workout_assignments (
  id                bigint generated always as identity primary key,
  athlete_id        bigint not null references athletes(id) on delete cascade,
  microcycle_id     bigint references microcycles(id) on delete set null,
  scheduled_for     date not null,
  template_id       bigint not null references templates(id) on delete restrict,
  template_version  int not null,
  status            assignment_status not null default 'scheduled',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index workout_assignments_athlete_date_idx on workout_assignments (athlete_id, scheduled_for);
create index workout_assignments_microcycle_idx on workout_assignments (microcycle_id);
create index workout_assignments_template_idx on workout_assignments (template_id);

create table workout_executions (
  id                       bigint generated always as identity primary key,
  assignment_id            bigint not null references workout_assignments(id) on delete cascade,
  athlete_id               bigint not null references athletes(id) on delete cascade,
  started_at               timestamptz,
  ended_at                 timestamptz,
  total_duration_seconds   int,
  perceived_exertion       int,
  notes                    text,
  source                   biometric_source,
  source_workout_ref       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint workout_executions_assignment_unique unique (assignment_id),
  constraint workout_executions_rpe_chk check (perceived_exertion is null or perceived_exertion between 1 and 10),
  constraint workout_executions_duration_chk check (total_duration_seconds is null or total_duration_seconds >= 0)
);

create index workout_executions_athlete_idx on workout_executions (athlete_id, started_at desc);

create table segment_executions (
  id                     bigint generated always as identity primary key,
  execution_id           bigint not null references workout_executions(id) on delete cascade,
  template_segment_id    bigint references template_segments(id) on delete set null,
  position               int not null,
  started_at             timestamptz,
  ended_at               timestamptz,
  reps_completed         int,
  weight_used_kg         numeric(6,2),
  distance_meters        numeric(8,2),
  calories               numeric(7,2),
  avg_hr                 int,
  max_hr                 int,
  raw_lap_data_json      jsonb,
  reconciled_at          timestamptz,
  reconciled_by_user_id  bigint references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint segment_executions_position_unique unique (execution_id, position),
  constraint segment_executions_position_chk check (position >= 0),
  constraint segment_executions_hr_chk check (
    (avg_hr is null or avg_hr between 30 and 260)
    and (max_hr is null or max_hr between 30 and 260)
  )
);

create index segment_executions_segment_idx on segment_executions (template_segment_id);

-- =============================================================================
-- Biometric streams (provider-agnostic ingestion)
-- =============================================================================

create table biometric_streams (
  id                  bigint generated always as identity primary key,
  athlete_id          bigint not null references athletes(id) on delete cascade,
  source              biometric_source not null,
  source_workout_id   text,
  metric_type         biometric_metric not null,
  recorded_at         timestamptz not null,
  value_numeric       numeric(12,4) not null,
  unit                text not null,
  raw_payload_json    jsonb,
  created_at          timestamptz not null default now()
);

create index biometric_streams_athlete_metric_time_idx
  on biometric_streams (athlete_id, metric_type, recorded_at desc);
create index biometric_streams_source_idx on biometric_streams (source, recorded_at desc);
create index biometric_streams_source_workout_idx
  on biometric_streams (source, source_workout_id) where source_workout_id is not null;

-- =============================================================================
-- Devices
-- =============================================================================

create table devices (
  id            bigint generated always as identity primary key,
  athlete_id    bigint not null references athletes(id) on delete cascade,
  type          device_type not null,
  identifier    text not null,
  display_name  text,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint devices_identifier_unique unique (athlete_id, type, identifier)
);

create index devices_athlete_idx on devices (athlete_id);

-- =============================================================================
-- Garmin OAuth tokens (encrypted at rest)
-- =============================================================================

create table garmin_oauth_tokens (
  athlete_id              bigint primary key references athletes(id) on delete cascade,
  access_token_encrypted  bytea not null,
  refresh_token_encrypted bytea,
  token_secret_encrypted  bytea,
  expires_at              timestamptz,
  scope                   text,
  connected_at            timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- =============================================================================
-- HealthKit sync state (per-athlete anchor)
-- =============================================================================

create table healthkit_sync_state (
  athlete_id        bigint primary key references athletes(id) on delete cascade,
  last_anchor_data  bytea,
  last_sync_at      timestamptz,
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- Chat (1:1 thread per coach <-> athlete)
-- =============================================================================

create table chat_threads (
  id                   bigint generated always as identity primary key,
  coach_id             bigint not null references coaches(id) on delete cascade,
  athlete_id           bigint not null references athletes(id) on delete cascade,
  last_message_at      timestamptz,
  unread_for_coach     int not null default 0,
  unread_for_athlete   int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint chat_threads_coach_athlete_unique unique (coach_id, athlete_id),
  constraint chat_threads_unread_chk check (unread_for_coach >= 0 and unread_for_athlete >= 0)
);

create index chat_threads_coach_idx on chat_threads (coach_id, last_message_at desc nulls last);
create index chat_threads_athlete_idx on chat_threads (athlete_id, last_message_at desc nulls last);

create table chat_messages (
  id              bigint generated always as identity primary key,
  thread_id       bigint not null references chat_threads(id) on delete cascade,
  sender_user_id  bigint not null references users(id) on delete restrict,
  body            text not null,
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  edited_at       timestamptz,
  deleted_at      timestamptz
);

create index chat_messages_thread_idx on chat_messages (thread_id, created_at desc);

-- =============================================================================
-- Notifications
-- =============================================================================

create table notifications (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references users(id) on delete cascade,
  type          notification_type not null,
  payload_json  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;

-- =============================================================================
-- Methodology RAG corpus (Pablo's coaching IP, vectorized)
-- =============================================================================

create table methodology_documents (
  id            bigint generated always as identity primary key,
  coach_id      bigint not null references coaches(id) on delete cascade,
  source_type   methodology_source_type not null,
  title         text not null,
  raw_content   text not null,
  ingested_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index methodology_documents_coach_idx on methodology_documents (coach_id, ingested_at desc);

-- Forward FK from coaches.default_methodology_doc_id
alter table coaches
  add constraint coaches_default_methodology_doc_fk
  foreign key (default_methodology_doc_id) references methodology_documents(id)
  on delete set null;

-- Embedding dimension: 1536 is the OpenAI text-embedding-3-small / ada-002 default.
-- LLM not chosen yet (see CLAUDE.md). If we adopt a model with different dim
-- (e.g. 768, 1024, 3072), migrate via:
--   1. add new column embedding_v2 vector(N)
--   2. backfill via re-embed job
--   3. swap HNSW index, drop old column.
create table methodology_chunks (
  id           bigint generated always as identity primary key,
  document_id  bigint not null references methodology_documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(1536),
  created_at   timestamptz not null default now(),
  constraint methodology_chunks_index_unique unique (document_id, chunk_index),
  constraint methodology_chunks_index_chk check (chunk_index >= 0)
);

create index methodology_chunks_document_idx on methodology_chunks (document_id, chunk_index);

-- HNSW cosine index for semantic similarity search.
create index methodology_chunks_embedding_hnsw_idx
  on methodology_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- =============================================================================
-- Audit log
-- =============================================================================

create table audit_log (
  id              bigint generated always as identity primary key,
  actor_user_id   bigint references users(id) on delete set null,
  entity_type     text not null,
  entity_id       bigint not null,
  action          audit_action not null,
  diff_json       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on audit_log (actor_user_id, created_at desc);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
  tables text[] := array[
    'users', 'coaches', 'athletes', 'events', 'exercises', 'templates',
    'template_segments', 'atr_macrocycles', 'atr_blocks', 'microcycles',
    'workout_assignments', 'workout_executions', 'segment_executions',
    'devices', 'garmin_oauth_tokens', 'healthkit_sync_state',
    'chat_threads', 'chat_messages', 'methodology_documents'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end$$;

commit;
