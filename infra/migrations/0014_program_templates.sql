-- Generic program template library: week → month → macrocycle (per coach, per level).
-- Session templates remain in `templates`. Assignment expands into atr_* + workout_assignments.

create type program_level as enum ('beginner', 'intermediate', 'pro', 'elite');

-- ---------------------------------------------------------------------------
-- Week template — 7 days × AM/PM slots referencing templates.id or rest
-- ---------------------------------------------------------------------------
create table program_week_templates (
  id                bigint generated always as identity primary key,
  coach_id          bigint not null references coaches(id) on delete cascade,
  name              text not null,
  level             program_level not null,
  atr_block_hint    atr_block_type,
  slots_json        jsonb not null default '{"days":[]}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint program_week_templates_name_len check (char_length(name) between 1 and 200)
);

create index program_week_templates_coach_level_idx
  on program_week_templates (coach_id, level);

-- ---------------------------------------------------------------------------
-- Month template — ordered week templates (typically 4)
-- ---------------------------------------------------------------------------
create table program_month_templates (
  id                bigint generated always as identity primary key,
  coach_id          bigint not null references coaches(id) on delete cascade,
  name              text not null,
  level             program_level not null,
  atr_block_hint    atr_block_type,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint program_month_templates_name_len check (char_length(name) between 1 and 200)
);

create index program_month_templates_coach_level_idx
  on program_month_templates (coach_id, level);

create table program_month_weeks (
  month_template_id   bigint not null references program_month_templates(id) on delete cascade,
  week_template_id    bigint not null references program_week_templates(id) on delete restrict,
  position            int not null,
  primary key (month_template_id, position),
  constraint program_month_weeks_position_chk check (position >= 0),
  unique (month_template_id, week_template_id)
);

-- ---------------------------------------------------------------------------
-- Macrocycle template — ATR blocks containing ordered months
-- ---------------------------------------------------------------------------
create table program_macrocycle_templates (
  id                bigint generated always as identity primary key,
  coach_id          bigint not null references coaches(id) on delete cascade,
  name              text not null,
  level             program_level not null,
  is_default        boolean not null default false,
  total_weeks       int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint program_macrocycle_templates_name_len check (char_length(name) between 1 and 200),
  constraint program_macrocycle_templates_weeks_chk check (total_weeks is null or total_weeks between 1 and 52)
);

create unique index program_macrocycle_templates_default_uniq
  on program_macrocycle_templates (coach_id, level)
  where is_default = true;

create index program_macrocycle_templates_coach_level_idx
  on program_macrocycle_templates (coach_id, level);

create table program_macrocycle_blocks (
  id                    bigint generated always as identity primary key,
  macrocycle_template_id bigint not null references program_macrocycle_templates(id) on delete cascade,
  type                  atr_block_type not null,
  position              int not null,
  constraint program_macrocycle_blocks_position_unique unique (macrocycle_template_id, position),
  constraint program_macrocycle_blocks_position_chk check (position >= 0)
);

create table program_block_months (
  block_id            bigint not null references program_macrocycle_blocks(id) on delete cascade,
  month_template_id   bigint not null references program_month_templates(id) on delete restrict,
  position            int not null,
  primary key (block_id, position),
  constraint program_block_months_position_chk check (position >= 0),
  unique (block_id, month_template_id)
);
