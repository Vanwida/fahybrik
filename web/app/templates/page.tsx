import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { sql } from '@/lib/db';
import { TemplatesBrowse } from '@/components/templates/templates-browse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  version: number;
  is_draft: boolean;
  is_partner_workout: boolean;
  archived_at: Date | null;
  updated_at: Date;
  segment_count: number;
  assignment_count: number;
  last_assigned_at: Date | null;
  day_position: string | null;
}

export default async function TemplatesPage() {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const rows = await sql<TemplateRow[]>`
    select
      t.id::text                             as id,
      t.name                                 as name,
      t.format::text                         as format,
      t.target_block::text                   as target_block,
      t.target_level                         as target_level,
      t.version                              as version,
      t.is_draft                             as is_draft,
      t.is_partner_workout                   as is_partner_workout,
      t.archived_at                          as archived_at,
      t.updated_at                           as updated_at,
      t.day_position                         as day_position,
      coalesce(seg.cnt, 0)::int              as segment_count,
      coalesce(asg.cnt, 0)::int              as assignment_count,
      asg.last_at                            as last_assigned_at
    from templates t
    left join (
      select template_id, count(*)::int as cnt
      from template_segments group by template_id
    ) seg on seg.template_id = t.id
    left join (
      select template_id, count(*)::int as cnt, max(created_at) as last_at
      from workout_assignments group by template_id
    ) asg on asg.template_id = t.id
    where t.coach_id = ${session.coach_id} and t.archived_at is null
    order by t.updated_at desc
    limit 200
  `;

  const initial = rows.map((r) => ({
    id: r.id,
    name: r.name,
    format: r.format,
    target_block: r.target_block,
    target_level: r.target_level,
    version: r.version,
    is_draft: r.is_draft,
    is_partner_workout: r.is_partner_workout,
    archived_at: r.archived_at?.toISOString() ?? null,
    updated_at: r.updated_at.toISOString(),
    day_position: r.day_position,
    segment_count: r.segment_count,
    assignment_count: r.assignment_count,
    last_assigned_at: r.last_assigned_at?.toISOString() ?? null,
  }));

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="font-display italic font-black text-3xl tracking-tight">
            Plantillas
          </h1>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)] mt-1">
            {initial.length} total
          </p>
        </div>
        <Link
          href="/templates/new"
          className="h-9 px-4 inline-flex items-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] font-medium text-sm hover:bg-[var(--accent-press)] transition-colors"
        >
          + Nueva
        </Link>
      </header>

      <TemplatesBrowse initial={initial} />
    </div>
  );
}
