import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AthleteCustomEventInput } from '@fahybrid/shared/schema/events';
import { eventFamily } from '@fahybrid/shared/domain/objectives/catalog';

export class CustomObjectiveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CustomObjectiveError';
  }
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function uniqueSlug(base: string, athleteId: number): string {
  const trimmed = base || 'objetivo';
  return `${trimmed}-a${athleteId}-${Date.now().toString(36)}`;
}

export interface CreateAthleteCustomEventParams {
  athlete_id: number;
  input: AthleteCustomEventInput;
  client?: Sql;
}

export interface CreateAthleteCustomEventResult {
  event_id: string;
  slug: string;
}

/**
 * Inserts a private `events` row owned by the athlete. Visible only to them in
 * the calendar query (events.athlete_id = self). Never sets is_visible_to_athletes.
 */
export async function createAthleteCustomEvent(
  params: CreateAthleteCustomEventParams,
): Promise<CreateAthleteCustomEventResult> {
  const client = params.client ?? defaultSql;
  const input = params.input;

  if (!input.start_date) {
    throw new CustomObjectiveError(
      'validation_error',
      'Indica la fecha del objetivo.',
      400,
    );
  }

  const tentative = false;
  const series = input.series ?? 'other';
  const family = eventFamily(input.type, series);

  // Derive broad type when the athlete picked a series that implies family.
  let type = input.type;
  if (family === 'hybrid' && type === 'other') type = 'hyrox';
  if (family === 'crossfit' && type === 'other') type = 'crossfit';
  if (family === 'running' && type === 'other') type = 'running';
  if (family === 'ocr' && type === 'other') type = 'ocr';

  const baseSlug = slugify(input.name);
  const slug = uniqueSlug(baseSlug, params.athlete_id);

  const rows = await client<{ id: string; slug: string }[]>`
    insert into events (
      slug, name, type, series, location, start_date, is_tentative,
      division, source_url, is_visible_to_athletes, athlete_id, source
    ) values (
      ${slug},
      ${input.name.trim()},
      ${type}::event_type,
      ${series},
      ${input.location ?? null},
      ${input.start_date}::date,
      ${tentative},
      ${input.division_label ?? null},
      ${input.source_url ?? null},
      false,
      ${params.athlete_id},
      'athlete_custom'
    )
    returning id::text as id, slug
  `;

  const row = rows[0];
  if (!row) {
    throw new CustomObjectiveError('create_failed', 'No se pudo crear el evento', 500);
  }

  return { event_id: row.id, slug: row.slug };
}
