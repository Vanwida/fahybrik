import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import { formatLabel } from '@/lib/studio/section-types';
import type { TemplateFormat } from '@/lib/templates/schema';
import type { TemplatePreview, TemplatePreviewBlock } from '@/lib/coach/template-preview-types';

interface BlockSnapshot {
  uid?: string;
  title?: string;
  segment_uids?: string[];
  section_format?: string;
}

interface SegmentRow {
  template_id: string;
  position: number;
  exercise_name: string;
  params_json: Record<string, unknown>;
  notes: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  warmup: string | null;
  coach_notes: string | null;
  meta_json: Record<string, unknown> | null;
}

export async function getTemplatePreviews(params: {
  coach_id: bigint;
  ids: string[];
  client?: Sql;
}): Promise<TemplatePreview[]> {
  const ids = [...new Set(params.ids.filter(Boolean))];
  if (ids.length === 0) return [];

  const client = params.client ?? defaultSql;
  const numericIds = ids.map((id) => BigInt(id));

  const templates = await client<TemplateRow[]>`
    select
      id::text as id,
      name,
      format::text as format,
      warmup,
      coach_notes,
      meta_json
    from templates
    where coach_id = ${params.coach_id}
      and id in ${client(numericIds)}
  `;

  if (templates.length === 0) return [];

  const segments = await client<SegmentRow[]>`
    select
      s.template_id::text as template_id,
      s.position,
      -- Coach's renamed exercise wins (mig 0132) — the preview headline/blocks are
      -- built from this exercise_name, and must show what THIS coach called it.
      coalesce(ceo.name, e.name) as exercise_name,
      s.params_json,
      s.notes
    from template_segments s
    join exercises e on e.id = s.exercise_id
    ${joinCoachOverride(client, params.coach_id)}
    where s.template_id in ${client(numericIds)}
    order by s.template_id, s.position
  `;

  const segsByTemplate = new Map<string, SegmentRow[]>();
  for (const seg of segments) {
    const list = segsByTemplate.get(seg.template_id) ?? [];
    list.push(seg);
    segsByTemplate.set(seg.template_id, list);
  }

  return templates.map((t) => buildPreview(t, segsByTemplate.get(t.id) ?? []));
}

function buildPreview(template: TemplateRow, segments: SegmentRow[]): TemplatePreview {
  const format = template.format as TemplateFormat;
  const format_label = formatLabel(format);
  const exercise_lines = segments.map((s) => {
    const params = summarizeParams(s.params_json);
    return params ? `${s.exercise_name} · ${params}` : s.exercise_name;
  });

  const blocks = buildBlocks(template.meta_json, segments);
  const headline = buildHeadline(template.name, format_label, exercise_lines);

  return {
    id: template.id,
    name: template.name,
    format: template.format,
    format_label,
    headline,
    blocks,
    exercise_lines,
    exercise_count: segments.length,
    warmup: template.warmup,
    coach_notes: template.coach_notes,
  };
}

function buildBlocks(meta: Record<string, unknown> | null, segments: SegmentRow[]): TemplatePreviewBlock[] {
  const metaObj = unwrapJsonObject(meta);
  const raw = metaObj?.studio_blocks;

  if (!Array.isArray(raw) || raw.length === 0) {
    if (segments.length === 0) return [];
    return [{ title: 'Ejercicios', exercises: segments.map((s) => s.exercise_name) }];
  }

  const snaps = raw as BlockSnapshot[];
  let cursor = 0;
  const blocks: TemplatePreviewBlock[] = [];

  for (const snap of snaps) {
    const title = snap.title?.trim() || 'Bloque';
    const take = snap.segment_uids?.length ?? 0;
    const slice = take > 0 ? segments.slice(cursor, cursor + take) : [];
    cursor += take;
    blocks.push({ title, exercises: slice.map((s) => s.exercise_name) });
  }

  const rest = segments.slice(cursor);
  if (rest.length > 0) {
    blocks.push({ title: 'Extra', exercises: rest.map((s) => s.exercise_name) });
  }

  if (blocks.every((b) => b.exercises.length === 0) && segments.length > 0) {
    return [{ title: 'Ejercicios', exercises: segments.map((s) => s.exercise_name) }];
  }

  return blocks;
}

function unwrapJsonObject(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildHeadline(name: string, formatLabel: string, exerciseLines: string[]): string {
  if (!isPlaceholderName(name)) return name;
  const names = exerciseLines.slice(0, 3).map((l) => l.split(' · ')[0] ?? l);
  if (names.length === 0) return formatLabel;
  const tail = exerciseLines.length > 3 ? ` +${exerciseLines.length - 3}` : '';
  return `${formatLabel} · ${names.join(', ')}${tail}`;
}

function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === 'entreno sin nombre' ||
    n === 'entreno sin título' ||
    n === 'entreno sin titulo' ||
    n === 'plantilla sin título' ||
    n === 'plantilla sin titulo'
  );
}

function summarizeParams(p: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof p.sets === 'number' && typeof p.reps === 'number') parts.push(`${p.sets}×${p.reps}`);
  else if (typeof p.reps === 'number') parts.push(`${p.reps} reps`);
  if (typeof p.distance_meters === 'number') parts.push(`${p.distance_meters}m`);
  if (typeof p.time_seconds === 'number') parts.push(`${p.time_seconds}s`);
  if (typeof p.rpe === 'number') parts.push(`RPE ${p.rpe}`);
  if (typeof p.weight_kg === 'number') parts.push(`${p.weight_kg}kg`);
  return parts.join(' · ');
}
