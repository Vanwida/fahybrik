import 'server-only';

// La Biblioteca como TABLA (informe D §4.4): entrenos (`templates` madre) y
// bloques (`blocks`) de este coach, con lo que hace falta para decidir sin
// abrir nada — sus líneas tipadas en compacto, estado (listo · sin dosis · por
// revisar), «Usado en N» programas, editado, etiquetas — y SIN la prosa entera
// de cada bloque (la auditoría midió ~200 KB enviados al cliente): solo un
// arranque para la vista previa; la prosa completa se lee al abrir el bloque.

import { prescriptionToText, safeParsePrescription, legacyItemToPrescription, checkPrescriptionCompleteness, isExecutable, type Modality, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { WeekDayPart, WeekSession } from '@fahybrid/shared/schema/program-templates';
import { sql as defaultSql, type Sql } from '@/lib/db';
import type { V2Modality } from '@/components/v2/constants';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { modalityForGroup } from '@/lib/dashboard/v2/planes-model';
import { loadBlockEditorModel, loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import { isInsertableBlockModel, libraryBlockToEditorBlocks } from '@/lib/dashboard/v2/library-block-to-editor';
import { compactDose } from './cell-summary';
import { editorBlocksToParts } from './editor-bridge';
import { freshUid } from './grid-model';

export type LibraryKind = 'entreno' | 'bloque';
export type LibraryStatus = 'listo' | 'sin_dosis' | 'por_revisar';

export interface LibraryRow {
  kind: LibraryKind;
  id: string;
  title: string;
  modality: V2Modality | null;
  tags: string[];
  /** Líneas tipadas en compacto («Sentadilla 5×5 @ 75% RM»), como en una celda. */
  lines: string[];
  line_count: number;
  status: LibraryStatus;
  /** Arranque de la prosa verbatim (solo bloques por revisar). */
  prose_excerpt: string | null;
  /** Programas de la biblioteca donde aparece. */
  used_in: number;
  updated_at: string;
  archived: boolean;
  /** Texto de búsqueda: título, etiquetas y nombres de ejercicio en ES y EN. */
  search: string;
  /** Firma del contenido (título normalizado + líneas) para «Posibles duplicados». */
  content_key: string;
}

interface LineJson {
  block_position: number | null;
  prescription_json: unknown;
  params_json: Record<string, unknown> | null;
  notes: string | null;
  name: string;
  name_en: string | null;
  modality: string | null;
}

const MAX_LINES = 8;
const EXCERPT = 180;

function linePrescription(l: LineJson): Prescription {
  const parsed = safeParsePrescription(l.prescription_json);
  return parsed.success ? (parsed.data as Prescription) : legacyItemToPrescription({ params_json: l.params_json, notes: l.notes });
}

function summarize(lines: LineJson[]): { lines: string[]; undosed: number; modality: V2Modality | null; search: string } {
  let undosed = 0;
  const counts = new Map<V2Modality, number>();
  const out: string[] = [];
  const names: string[] = [];
  for (const l of lines) {
    const p = linePrescription(l);
    const check = checkPrescriptionCompleteness(p, { modality: (l.modality ?? null) as Modality | null });
    if (!isExecutable(check)) undosed += 1;
    const m = (p.modality ?? (l.modality as Modality | null)) as Modality | null;
    if (m) {
      const slug = modalityColorSlug(m);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    const dose = compactDose(prescriptionToText(p));
    if (out.length < MAX_LINES) out.push(dose ? `${l.name} ${dose}` : l.name);
    names.push(l.name, l.name_en ?? '');
  }
  let modality: V2Modality | null = null;
  let best = 0;
  for (const [m, n] of counts) {
    if (n > best) {
      modality = m;
      best = n;
    }
  }
  return { lines: out, undosed, modality, search: names.join(' ') };
}

function contentKey(title: string, lines: string[]): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(title)}|${lines.map(norm).join(';')}`;
}

export async function listLibrary(params: { coach_id: number | bigint; client?: Sql }): Promise<{ entrenos: LibraryRow[]; bloques: LibraryRow[] }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const [blocks, templates, usage] = await Promise.all([
    client<Array<{ id: string; title: string; description: string; methodology_group_id: number; tags: string[]; archived: boolean; updated_at: string; lines: LineJson[] | null }>>`
      select b.id::text, b.title, b.description, b.methodology_group_id::int, b.tags,
             (b.archived_at is not null) as archived, b.updated_at::text,
             coalesce(json_agg(json_build_object(
               'block_position', be.block_position, 'prescription_json', be.prescription_json,
               'params_json', be.params_json, 'notes', be.notes,
               'name', coalesce(e.name_es, e.name), 'name_en', e.name_en, 'modality', e.modality
             ) order by be.position) filter (where be.id is not null), '[]') as lines
      from blocks b
      left join block_exercises be on be.block_id = b.id
      left join exercises e on e.id = be.exercise_id
      where b.coach_id = ${coachId}
      group by b.id
    `,
    client<Array<{ id: string; name: string; methodology_group_id: number | null; tags: string[]; archived: boolean; updated_at: string; lines: LineJson[] | null }>>`
      select t.id::text, t.name, t.methodology_group_id, t.tags,
             (t.archived_at is not null) as archived, t.updated_at::text,
             coalesce(json_agg(json_build_object(
               'block_position', s.block_position, 'prescription_json', s.prescription_json,
               'params_json', s.params_json, 'notes', s.notes,
               'name', coalesce(e.name_es, e.name), 'name_en', e.name_en, 'modality', e.modality
             ) order by s.position) filter (where s.id is not null), '[]') as lines
      from templates t
      left join template_segments s on s.template_id = t.id
      left join exercises e on e.id = s.exercise_id
      where t.coach_id = ${coachId} and t.instance_athlete_id is null
        and not exists (select 1 from coach_calibration_tests ct where ct.template_id = t.id)
      group by t.id
    `,
    // Dónde se usa: bloques por su procedencia (`source_block_id`) y entrenos
    // por su `template_id`, en los programas de biblioteca del coach.
    client<Array<{ kind: LibraryKind; id: string; n: number }>>`
      with parts as (
        select mw.month_template_id as program_id, s as session, b as part
        from program_month_templates m
        join program_month_weeks mw on mw.month_template_id = m.id
        join program_week_templates w on w.id = mw.week_template_id
        cross join lateral jsonb_array_elements(coalesce(w.slots_json->'days', '[]'::jsonb)) d
        cross join lateral jsonb_array_elements(coalesce(d->'sessions', '[]'::jsonb)) s
        left join lateral jsonb_array_elements(coalesce(s->'blocks', '[]'::jsonb)) b on true
        where m.coach_id = ${coachId} and m.athlete_id is null
      )
      select 'bloque'::text as kind, part->>'source_block_id' as id, count(distinct program_id)::int as n
        from parts where part ? 'source_block_id' group by 2
      union all
      select 'entreno'::text as kind, session->>'template_id' as id, count(distinct program_id)::int as n
        from parts where session->>'template_id' is not null group by 2
    `,
  ]);

  const used = new Map(usage.map((u) => [`${u.kind}:${u.id}`, u.n]));

  const bloques: LibraryRow[] = blocks.map((b) => {
    const s = summarize(b.lines ?? []);
    const typed = (b.lines ?? []).length > 0;
    const status: LibraryStatus = !typed ? 'por_revisar' : s.undosed > 0 ? 'sin_dosis' : 'listo';
    return {
      kind: 'bloque',
      id: b.id,
      title: b.title,
      modality: s.modality ?? modalityForGroup(b.methodology_group_id),
      tags: b.tags ?? [],
      lines: s.lines,
      line_count: (b.lines ?? []).length,
      status,
      prose_excerpt: typed ? null : b.description.slice(0, EXCERPT) || null,
      used_in: used.get(`bloque:${b.id}`) ?? 0,
      updated_at: b.updated_at,
      archived: b.archived,
      search: [b.title, (b.tags ?? []).join(' '), s.search, typed ? '' : b.description.slice(0, 400)].join(' '),
      content_key: contentKey(b.title, s.lines),
    };
  });

  const entrenos: LibraryRow[] = templates.map((t) => {
    const s = summarize(t.lines ?? []);
    const typed = (t.lines ?? []).length > 0;
    return {
      kind: 'entreno',
      id: t.id,
      title: t.name,
      modality: s.modality ?? modalityForGroup(t.methodology_group_id),
      tags: t.tags ?? [],
      lines: s.lines,
      line_count: (t.lines ?? []).length,
      status: !typed ? 'por_revisar' : s.undosed > 0 ? 'sin_dosis' : 'listo',
      prose_excerpt: null,
      used_in: used.get(`entreno:${t.id}`) ?? 0,
      updated_at: t.updated_at,
      archived: t.archived,
      search: [t.name, (t.tags ?? []).join(' '), s.search].join(' '),
      content_key: contentKey(t.name, s.lines),
    };
  });

  const byRecent = (a: LibraryRow, b: LibraryRow) => b.updated_at.localeCompare(a.updated_at);
  return { entrenos: entrenos.sort(byRecent), bloques: bloques.sort(byRecent) };
}

// ── Insertar en una celda / en un día ────────────────────────────────────────

/**
 * Una pieza de la biblioteca lista para caer en un día: sus partes guardables
 * con uids frescos. Un ENTRENO llega como un entreno más del día (su nombre es
 * el título); un BLOQUE, como partes que se añaden al entreno de la celda. Es
 * una COPIA: editar después la biblioteca no cambia el programa (como siempre);
 * la procedencia queda en `source_block_id` de cada parte.
 */
export async function libraryItemForCell(params: {
  coach_id: number | bigint;
  kind: LibraryKind;
  id: number;
}): Promise<{ kind: LibraryKind; title: string; parts: WeekDayPart[]; session: WeekSession | null } | null> {
  if (params.kind === 'bloque') {
    const model = await loadBlockEditorModel({ coach_id: params.coach_id, block_id: params.id });
    if (!model) return null;
    if (!isInsertableBlockModel(model)) return { kind: 'bloque', title: model.title, parts: [], session: null };
    const parts = editorBlocksToParts(libraryBlockToEditorBlocks(model)).map(withFreshUids);
    return { kind: 'bloque', title: model.title, parts, session: null };
  }
  const model = await loadSessionEditorModel({ coach_id: params.coach_id, template_id: params.id });
  if (!model) return null;
  const parts = editorBlocksToParts(model.blocks.map((b) => ({ ...b, group: undefined }))).map(withFreshUids);
  return {
    kind: 'entreno',
    title: model.name,
    parts,
    session: parts.length > 0 ? { kind: 'workout', template_id: null, focus: model.name.slice(0, 120), blocks: parts } : null,
  };
}

function withFreshUids(part: WeekDayPart): WeekDayPart {
  return { ...part, uid: freshUid(), items: part.items.map((it) => ({ ...it, uid: freshUid() })) };
}

// ── Acciones en bloque ───────────────────────────────────────────────────────

export async function setLibraryArchived(params: {
  coach_id: number | bigint;
  items: Array<{ kind: LibraryKind; id: number }>;
  archived: boolean;
  client?: Sql;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const blockIds = params.items.filter((i) => i.kind === 'bloque').map((i) => i.id);
  const tplIds = params.items.filter((i) => i.kind === 'entreno').map((i) => i.id);
  const stamp = params.archived ? client`now()` : null;
  const a = blockIds.length
    ? await client`update blocks set archived_at = ${stamp} where coach_id = ${coachId} and id = any(${blockIds}::bigint[]) returning id`
    : [];
  const b = tplIds.length
    ? await client`update templates set archived_at = ${stamp} where coach_id = ${coachId} and instance_athlete_id is null and id = any(${tplIds}::bigint[]) returning id`
    : [];
  return a.length + b.length;
}

export async function addLibraryTags(params: {
  coach_id: number | bigint;
  items: Array<{ kind: LibraryKind; id: number }>;
  add: string[];
  remove?: string[];
  client?: Sql;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const add = [...new Set(params.add.map((t) => t.trim()).filter(Boolean))];
  const remove = [...new Set((params.remove ?? []).map((t) => t.trim()).filter(Boolean))];
  const blockIds = params.items.filter((i) => i.kind === 'bloque').map((i) => i.id);
  const tplIds = params.items.filter((i) => i.kind === 'entreno').map((i) => i.id);
  const merged = (col: 'tags') => client`
    (select coalesce(array_agg(distinct t order by t), '{}') from unnest(${client(col)} || ${add}::text[]) t
      where not (t = any(${remove}::text[])))
  `;
  const a = blockIds.length
    ? await client`update blocks set tags = ${merged('tags')} where coach_id = ${coachId} and id = any(${blockIds}::bigint[]) returning id`
    : [];
  const b = tplIds.length
    ? await client`update templates set tags = ${merged('tags')} where coach_id = ${coachId} and instance_athlete_id is null and id = any(${tplIds}::bigint[]) returning id`
    : [];
  return a.length + b.length;
}
