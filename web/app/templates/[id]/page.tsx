import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { TemplateBuilder } from '@/components/templates/template-builder';
import type { TemplateBuilderInitialState } from '@/components/templates/template-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  format: string;
  target_block: string;
  target_level: number | null;
  version: number;
  parent_template_id: string | null;
  day_position: string | null;
  paired_with_template_id: string | null;
  is_draft: boolean;
  is_partner_workout: boolean;
  warmup: string | null;
  cooldown: string | null;
  coach_notes: string | null;
  archived_at: Date | null;
  updated_at: Date;
  assignment_count: number;
}

interface SegmentRow {
  id: string;
  position: number;
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  exercise_category: string;
  params_json: Record<string, unknown>;
  notes: string | null;
}

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect('/auth/verify-failed');
  const { id } = await params;

  const rows = await sql<TemplateRow[]>`
    select
      t.id::text                        as id,
      t.name                            as name,
      t.description                     as description,
      t.format::text                    as format,
      t.target_block::text              as target_block,
      t.target_level                    as target_level,
      t.version                         as version,
      t.parent_template_id::text        as parent_template_id,
      t.day_position                    as day_position,
      t.paired_with_template_id::text   as paired_with_template_id,
      t.is_draft                        as is_draft,
      t.is_partner_workout              as is_partner_workout,
      t.warmup                          as warmup,
      t.cooldown                        as cooldown,
      t.coach_notes                     as coach_notes,
      t.archived_at                     as archived_at,
      t.updated_at                      as updated_at,
      coalesce(asg.cnt, 0)::int         as assignment_count
    from templates t
    left join (
      select template_id, count(*)::int as cnt from workout_assignments group by template_id
    ) asg on asg.template_id = t.id
    where t.id = ${id}::bigint and t.coach_id = ${session.coach_id}
    limit 1
  `;
  const row = rows[0];
  if (!row) redirect('/templates');

  const segments = await sql<SegmentRow[]>`
    select
      s.id::text          as id,
      s.position          as position,
      s.exercise_id::text as exercise_id,
      e.slug              as exercise_slug,
      e.name              as exercise_name,
      e.category::text    as exercise_category,
      s.params_json       as params_json,
      s.notes             as notes
    from template_segments s
    join exercises e on e.id = s.exercise_id
    where s.template_id = ${id}::bigint
    order by s.position asc
  `;

  const initial: TemplateBuilderInitialState = {
    id: row.id,
    version: row.version,
    parent_template_id: row.parent_template_id,
    name: row.name,
    description: row.description,
    format: row.format as TemplateBuilderInitialState['format'],
    target_block: row.target_block as TemplateBuilderInitialState['target_block'],
    target_level: row.target_level,
    day_position: row.day_position,
    paired_with_template_id: row.paired_with_template_id,
    is_draft: row.is_draft,
    is_partner_workout: row.is_partner_workout,
    warmup: row.warmup,
    cooldown: row.cooldown,
    coach_notes: row.coach_notes,
    assignment_count: row.assignment_count,
    updated_at: row.updated_at.toISOString(),
    segments: segments.map((s) => ({
      id: s.id,
      position: s.position,
      exercise_id: s.exercise_id,
      exercise_slug: s.exercise_slug,
      exercise_name: s.exercise_name,
      exercise_category: s.exercise_category,
      params_json: s.params_json ?? {},
      notes: s.notes,
    })),
  };

  return <TemplateBuilder mode="edit" initial={initial} />;
}
