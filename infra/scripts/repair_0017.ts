import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const sql = getSql();

try {
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'week_adjustment_proposals',
        'monthly_block_proposals',
        'athlete_month_assignments',
        'athlete_daily_readiness_snapshots'
      )
  `;
  console.log('existing:', tables.map((t) => t.tablename));

  const types = await sql<{ typname: string }[]>`
    select typname from pg_type
    where typname in (
      'week_adjustment_status',
      'monthly_block_proposal_status'
    )
  `;
  console.log('types:', types.map((t) => t.typname));

  if (!tables.some((t) => t.tablename === 'week_adjustment_proposals')) {
    console.log('Creating week_adjustment_proposals…');
    await sql.unsafe(`
      create table if not exists week_adjustment_proposals (
        id                      bigint generated always as identity primary key,
        athlete_id              bigint not null references athletes(id) on delete cascade,
        week_start              date not null,
        status                  week_adjustment_status not null default 'pending',
        verdict                 text not null,
        context_pack_json       jsonb not null default '{}'::jsonb,
        proposal_json           jsonb not null default '{}'::jsonb,
        methodology_snippet_ids bigint[] not null default '{}',
        reviewed_by_coach_id    bigint references coaches(id) on delete set null,
        reviewed_at             timestamptz,
        created_at              timestamptz not null default now(),
        updated_at              timestamptz not null default now(),
        constraint week_adjustment_proposals_verdict_chk check (verdict in ('ok', 'needs_adjustment'))
      );
      create unique index if not exists week_adjustment_proposals_pending_uniq
        on week_adjustment_proposals (athlete_id, week_start)
        where status = 'pending';
      create index if not exists week_adjustment_proposals_athlete_idx
        on week_adjustment_proposals (athlete_id, week_start desc);
    `);
    console.log('week_adjustment_proposals OK');
  }

  if (!types.some((t) => t.typname === 'monthly_block_proposal_status')) {
    await sql.unsafe(`create type monthly_block_proposal_status as enum ('pending', 'approved', 'rejected');`);
  }

  if (!tables.some((t) => t.tablename === 'monthly_block_proposals')) {
    console.log('Creating monthly_block_proposals…');
    await sql.unsafe(`
      create table if not exists monthly_block_proposals (
        id                    bigint generated always as identity primary key,
        athlete_id            bigint not null references athletes(id) on delete cascade,
        month_template_id     bigint not null references program_month_templates(id) on delete restrict,
        proposed_start_date   date not null,
        status                monthly_block_proposal_status not null default 'pending',
        rationale             text,
        context_pack_json     jsonb not null default '{}'::jsonb,
        reviewed_by_coach_id  bigint references coaches(id) on delete set null,
        reviewed_at           timestamptz,
        created_at            timestamptz not null default now(),
        updated_at            timestamptz not null default now()
      );
      create unique index if not exists monthly_block_proposals_pending_uniq
        on monthly_block_proposals (athlete_id)
        where status = 'pending';
    `);
    console.log('monthly_block_proposals OK');
  }

  if (!tables.some((t) => t.tablename === 'athlete_month_assignments')) {
    console.log('Creating athlete_month_assignments…');
    await sql.unsafe(`
      create table if not exists athlete_month_assignments (
        id                  bigint generated always as identity primary key,
        athlete_id          bigint not null references athletes(id) on delete cascade,
        month_template_id   bigint not null references program_month_templates(id) on delete restrict,
        start_date          date not null,
        end_date            date not null,
        microcycle_ids      bigint[] not null default '{}',
        assignment_count    int not null default 0,
        created_by_coach_id bigint references coaches(id) on delete set null,
        created_at          timestamptz not null default now(),
        constraint athlete_month_assignments_dates_chk check (end_date >= start_date)
      );
      create index if not exists athlete_month_assignments_athlete_idx
        on athlete_month_assignments (athlete_id, start_date desc);
    `);
    console.log('athlete_month_assignments OK');
  }

  if (!tables.some((t) => t.tablename === 'athlete_daily_readiness_snapshots')) {
    console.log('Creating athlete_daily_readiness_snapshots…');
    await sql.unsafe(`
      create table if not exists athlete_daily_readiness_snapshots (
        id              bigint generated always as identity primary key,
        athlete_id      bigint not null references athletes(id) on delete cascade,
        recorded_for    date not null,
        score           smallint not null,
        breakdown_json  jsonb not null default '{}'::jsonb,
        computed_at     timestamptz not null default now(),
        constraint athlete_daily_readiness_score_chk check (score between 0 and 100),
        constraint athlete_daily_readiness_athlete_day_unique unique (athlete_id, recorded_for)
      );
      create index if not exists athlete_daily_readiness_athlete_day_idx
        on athlete_daily_readiness_snapshots (athlete_id, recorded_for desc);
    `);
    console.log('athlete_daily_readiness_snapshots OK');
  }

  console.log('Repair complete');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
