import 'server-only';

// editor-data — server loaders for the v2 editing cluster. Each REUSES an
// existing real loader (getTemplateDetail, loadMonthTemplateWithWeeks,
// listTemplatesForCoach, listBlocks) and maps it into the client-safe view
// models in editor-types.ts. No new tables, no invented data: an empty result
// degrades to an empty model (the UI shows an EmptyState), never throws.

import { sql } from '@/lib/db';
import { getTemplateDetail, listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import {
  getBlockById,
  getBlockExerciseRowsForEdit,
  listBlocksWithStructure,
} from '@/lib/dashboard/coach/blocks';
import {
  legacyItemToPrescription,
  safeParsePrescription,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { normalizeWeekDay } from '@fahybrid/shared/schema/program-templates';
import type {
  WeekDayPart,
  WeekDayPartItem,
  WeekSession as DomainWeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { modalityColorSlug } from './editor-axes';
import { deriveWeekModalities } from './planes-model';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import type {
  BlockEditorModel,
  DayEditorModel,
  EditorBlock,
  EditorItem,
  EditorSession,
  LibraryBlockRow,
  LibrarySessionRow,
  SessionEditorModel,
  StructureGroup,
} from './editor-types';

// Days of the week per the [idx] route convention (idx is a flat 0-based index
// across the month → week = floor/7, day_of_week = idx%7 + 1).
const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_PER_WEEK = 7;

// ── Block → structure group heuristic (rail headings) ────────────────────────
// A session has no explicit calentamiento/principal/vuelta column; we infer the
// rail group from the block's format/title so the editor groups blocks like the
// sketch. The first warmup-ish block falls to calentamiento, cooldown/mobility
// to vuelta, everything else to principal — a coach can still see all blocks.
function inferGroup(title: string, format: string | null): StructureGroup {
  const t = `${title} ${format ?? ''}`.toLowerCase();
  if (/calent|warm|movilidad|mobility|activación/.test(t)) return 'calentamiento';
  if (/vuelta|cooldown|cool|estiramiento|stretch/.test(t)) return 'vuelta';
  return 'principal';
}

// ── SCREEN 5 · load a session template into the editor model ─────────────────
export async function loadSessionEditorModel(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
}): Promise<SessionEditorModel | null> {
  const detail = await getTemplateDetail({
    coach_id: params.coach_id,
    template_id: params.template_id,
  });
  if (!detail) return null;

  const blocks: EditorBlock[] = detail.blocks.map((b, i) => {
    const title = b.block_title ?? `Bloque ${i + 1}`;
    return {
      uid: `tpl-block-${b.block_position}`,
      title,
      format: b.block_format ?? detail.format,
      group: inferGroup(title, b.block_format ?? detail.format),
      ...(b.coach_note ? { coach_note: b.coach_note } : {}),
      items: b.items.map<EditorItem>((it) => {
        // Prefiere la prescripción ESTRUCTURADA (0043) y degrada a la legacy solo
        // si falta o no valida — igual que loadBlockEditorModel. Antes se llamaba
        // a legacyItemToPrescription SIEMPRE: una sesión con prescripción
        // estructurada se abría degradada y, al volver a guardar, PERSISTÍA lo
        // degradado (pérdida silenciosa). getTemplateDetail ya la trae parseada.
        const prescription: Prescription =
          it.prescription_json ??
          legacyItemToPrescription({
            params_json: it.params_json,
            notes: it.notes,
          });
        return {
          uid: `tpl-item-${it.id}`,
          exercise_id: Number(it.exercise_id),
          exercise_name: it.exercise_name,
          exercise_modality: (it.exercise_modality ?? null) as Modality | null,
          notes: it.notes ?? undefined,
          prescription,
        };
      }),
    };
  });

  return {
    template_id: detail.id,
    name: detail.name,
    format: detail.format,
    is_draft: detail.is_draft,
    blocks,
    used_in_plans: 0, // TODO(endpoint): plan-usage count not exposed by getTemplateDetail
  };
}

// ── Library BLOCK · load a block into the editor model ───────────────────────
// A library block is structurally a mini-session: its block_exercises rows,
// grouped by block_position, become EditorBlock[] (one EditorBlock per group).
// Returns null when the block doesn't exist / isn't owned by this coach
// (getBlockById enforces coach ownership). Prefers the structured prescription_json,
// degrading to the legacy params_json only when absent/invalid.
export async function loadBlockEditorModel(params: {
  coach_id: number | bigint;
  block_id: number;
}): Promise<BlockEditorModel | null> {
  const block = await getBlockById(params.coach_id, params.block_id);
  if (!block) return null;

  const rows = await getBlockExerciseRowsForEdit(params.block_id, params.coach_id);

  // Group rows by block_position, preserving first-seen order.
  const groupsMap = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = groupsMap.get(row.block_position);
    if (list) list.push(row);
    else groupsMap.set(row.block_position, [row]);
  }

  const blocks: EditorBlock[] = Array.from(groupsMap.entries()).map(([blockPosition, groupRows], i) => {
    const title = groupRows[0]?.block_title ?? `Bloque ${i + 1}`;
    const format = groupRows[0]?.block_format ?? block.format;
    return {
      uid: `be-block-${blockPosition}`,
      title,
      format,
      group: inferGroup(title, format),
      items: groupRows.map<EditorItem>((it) => {
        const parsed = safeParsePrescription(it.prescription_json);
        const prescription: Prescription = parsed.success
          ? (parsed.data as Prescription)
          : legacyItemToPrescription({
              params_json: (it.params_json ?? null) as Record<string, unknown> | null,
              notes: it.notes ?? null,
            });
        return {
          uid: `be-item-${it.position}`,
          exercise_id: Number(it.exercise_id),
          exercise_name: it.exercise_name,
          // La modalidad del CATÁLOGO viaja al cliente para que el editor juzgue
          // la dosis con el mismo dato que la Biblioteca (si no, se contradicen).
          exercise_modality: (it.exercise_modality ?? null) as Modality | null,
          notes: it.notes ?? undefined,
          prescription,
        };
      }),
    };
  });

  return {
    block_id: block.id,
    title: block.title,
    description: block.description,
    methodology_group_id: block.methodology_group_id,
    format: block.format,
    blocks,
  };
}

// ── SCREEN 8 · load a day (within a microcycle) into the editor model ────────
export async function loadDayEditorModel(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  day_index: number; // flat 0-based across the month
}): Promise<DayEditorModel | null> {
  const monthData = await loadMonthTemplateWithWeeks({
    coach_id: params.coach_id,
    month_id: params.month_id,
  });
  if (!monthData) return null;

  const weekPos = Math.floor(params.day_index / DAYS_PER_WEEK);
  const dayOfWeek = (params.day_index % DAYS_PER_WEEK) + 1; // 1..7
  const week = monthData.weeks.find((w) => w.week_index === weekPos) ?? monthData.weeks[0];

  // The week's days[] is a WeekSlots shape; normalize to the new sessions[] form.
  const rawDays = (week?.slots_json as { days?: unknown[] } | null)?.days ?? [];
  const dayRaw = rawDays.find(
    (d) => (d as { day_of_week?: number })?.day_of_week === dayOfWeek,
  );
  const day = dayRaw ? normalizeWeekDay(dayRaw) : { day_of_week: dayOfWeek, sessions: [] };

  const sessions: EditorSession[] = await withSourceBlockTitles(
    (day.sessions ?? []).map((s, si) => mapSession(s, si)),
    params.coach_id,
  );

  if (!week) return null; // microcycle with no weeks → no day to edit

  // The WEEK CONTEXT strip: summarise all 7 days of the focused week with the
  // SAME derivation the microcycle screen uses (modality per block, dominant,
  // honest counts). Reuse, don't reinvent. An empty/absent slots_json degrades
  // to 7 empty days, never throws.
  const week_days = deriveWeekModalities(
    (week.slots_json as WeekSlots | null) ?? { days: [] },
  );
  // The week's Monday in the month-wide flat index space → each strip cell links
  // in-place to `/microciclos/{month}?dia={week_day_base + (dow-1)}`.
  const week_day_base = week.week_index * DAYS_PER_WEEK;

  // ALL weeks of the microciclo, summarised, for the cross-week "Copiar día a…"
  // target picker. Same per-day derivation as week_days; never throws on empties.
  const weeks = monthData.weeks
    .slice()
    .sort((a, b) => a.week_index - b.week_index)
    .map((w) => ({
      id: w.id,
      week_index: w.week_index,
      name: w.name ?? `Semana ${w.week_index + 1}`,
      days: deriveWeekModalities((w.slots_json as WeekSlots | null) ?? { days: [] }),
    }));

  return {
    month_id: monthData.month.id,
    month_name: monthData.month.name,
    week_id: week.id,
    week_index: weekPos,
    week_name: week.name ?? `Semana ${weekPos + 1}`,
    day_of_week: dayOfWeek,
    day_label: WEEKDAY_NAMES[dayOfWeek - 1] ?? `Día ${dayOfWeek}`,
    // Tipo del día enfocado: 'rest' explícito (descanso deliberado) o 'workout'
    // (día con sesiones o vacío en modo autoría). Single source = WeekDay.kind.
    kind: day.kind ?? 'workout',
    // Sugerencias de recuperación del día (oferta blanda); [] salvo día de descanso.
    recovery_suggestions: day.recovery_suggestions ?? [],
    sessions,
    week_days,
    week_day_base,
    weeks,
  };
}

/**
 * Resuelve el TÍTULO del bloque de origen de los parts que vinieron de la
 * Biblioteca, para que el día pueda decir "Desde tu bloque «X»".
 *
 * Es PROCEDENCIA, no un vínculo vivo: la inserción copia la estructura y editar
 * el bloque en la Biblioteca NO cambia esta semana. Por eso el título se resuelve
 * al LEER y no se persiste — así nunca se queda obsoleto ni miente.
 *
 * Scoped por coach: un `source_block_id` que ya no existe (o de otro coach) se
 * queda en `null` y no se pinta nada. Un solo query batch para todo el día.
 */
async function withSourceBlockTitles(
  sessions: EditorSession[],
  coachId: number | bigint,
): Promise<EditorSession[]> {
  const ids = Array.from(
    new Set(
      sessions.flatMap((s) =>
        s.blocks.filter((b) => b.source_block_id != null).map((b) => Number(b.source_block_id)),
      ),
    ),
  );
  if (ids.length === 0) return sessions;

  type SourceBlockRow = { id: string; title: string };
  const rows: SourceBlockRow[] = await sql<SourceBlockRow[]>`
    select id::text as id, title
      from blocks
     where id = any(${ids}::bigint[])
       and coach_id = ${Number(coachId)}
  `.catch(() => []);

  const titleById = new Map<number, string>(rows.map((r) => [Number(r.id), r.title]));
  return sessions.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) =>
      b.source_block_id == null
        ? b
        : { ...b, source_block_title: titleById.get(Number(b.source_block_id)) ?? null },
    ),
  }));
}

function mapSession(s: DomainWeekSession, index: number): EditorSession {
  const slot: EditorSession['slot'] = index === 0 ? 'am' : index === 1 ? 'pm' : 'extra';
  return {
    uid: `session-${index}`,
    slot,
    time_hint: slot === 'am' ? '08:00' : slot === 'pm' ? '18:00' : undefined,
    // Workout title round-trips from slots_json (WeekSession.focus).
    ...(s.focus ? { focus: s.focus } : {}),
    // La NOTA del entreno también: sin hidratarla, abrir y guardar el día la
    // borraría (el serializer la toma autoritativa del input, como el título).
    ...(s.notes ? { notes: s.notes } : {}),
    blocks: (s.blocks ?? []).map((b, bi) => mapPart(b, bi)),
  };
}

function mapPart(part: WeekDayPart, index: number): EditorBlock {
  return {
    uid: part.uid || `block-${index}`,
    title: part.title,
    format: part.format,
    methodology_group_id: part.methodology_group_id ?? null,
    // Prefer the coach's PERSISTED structure group; fall back to the title/format
    // heuristic only for legacy parts saved before `group` existed.
    group: part.group ?? inferGroup(part.title, part.format),
    source_block_id: part.source_block_id ?? null,
    optional: part.optional ?? false,
    // Circuito: pass-through tal cual (undefined = sin configurar todavía, el
    // comportamiento legacy). Nunca se infiere ni se rellena aquí — solo el
    // coach lo completa desde ComponentsForm.
    circuit: part.circuit,
    ...(part.coach_note ? { coach_note: part.coach_note } : {}),
    items: (part.items ?? []).map((it) => mapItem(it)),
  };
}

function mapItem(it: WeekDayPartItem): EditorItem {
  return {
    uid: it.uid,
    exercise_id: Number(it.exercise_id),
    exercise_name: it.exercise_name,
    notes: it.notes,
    // Prefer the structured prescription; else derive from legacy params_json.
    prescription:
      it.prescription_json ??
      legacyItemToPrescription({
        params_json: (it.params_json ?? null) as Record<string, unknown> | null,
        notes: it.notes ?? null,
      }),
  };
}

// ── Library rail / add-block data (SCREEN 8 rail + SCREEN 9 modal) ───────────
export async function loadLibraryRail(params: {
  coach_id: number | bigint;
}): Promise<{ sessions: LibrarySessionRow[]; blocks: LibraryBlockRow[] }> {
  const [sessions, blocks] = await Promise.all([
    listTemplatesForCoach(params.coach_id).catch(() => []),
    loadLibraryBlockRail(params),
  ]);

  return {
    sessions: sessions.map<LibrarySessionRow>((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      block_count: t.block_count,
      segment_count: t.segment_count,
    })),
    blocks,
  };
}

/**
 * La mitad de BLOQUES del rail: la biblioteca del coach con su estado
 * ESTRUCTURAL, que es lo que decide si una fila se puede insertar en un día.
 * `listBlocksWithStructure` lo resuelve en UNA consulta (bloques + nº de
 * ejercicios + nº de piezas), así que el rail no necesita ninguna más.
 *
 * Separado de `loadLibraryRail` para que el rail del editor de día pueda pedir
 * SOLO los bloques (es lo único que inserta hoy) sin arrastrar la consulta de
 * plantillas de sesión, que nadie renderiza todavía.
 */
export async function loadLibraryBlockRail(params: {
  coach_id: number | bigint;
}): Promise<LibraryBlockRow[]> {
  const blocks = await listBlocksWithStructure(params.coach_id, null).catch(() => []);
  return blocks.map<LibraryBlockRow>((b) => ({
    id: b.id,
    title: b.title,
    format: b.format,
    methodology_group_id: b.methodology_group_id,
    modality_slug: blockFormatToModalitySlug(b.format),
    source_ref: b.source_ref,
    typed: b.typed,
    part_count: b.part_count,
    // TODO(endpoint): real per-block usage count not exposed by listBlocksWithStructure.
    usage_count: 0,
  }));
}

// Map a block's format to the v2 modality color axis (best-effort; the block model
// has no explicit modality, format is the strongest available signal).
//
// OJO — `blocks.format` tiene DOS vocabularios que conviven: el del IMPORTADOR del
// plan del coach (run_intervals, race_sim, zone2, erg_intervals, metcon,
// core_mobility, plyometric, tapering, functional_circuit) y el que escribe
// `createBlockFromArchetype` (tempo, intervals, amrap, emom, for_time, circuit,
// hyrox_sim, test). Los dos se mapean aquí: con solo el segundo, 87 de los 99
// bloques reales caían al default y el rail salía casi monocolor — inescaneable.
function blockFormatToModalitySlug(format: string | null): string {
  switch (format) {
    // Fuerza — barra y potencia.
    case 'strength_block':
    case 'plyometric':
      return 'fuerza';
    // Correr.
    case 'tempo':
    case 'intervals':
    case 'run_intervals':
      return 'carrera';
    case 'test':
      // The default test type is ergo; the form's hue follows the picked type.
      return 'ergo';
    // Ergómetros (row / ski / bike). `zone2` es mayoritariamente ergo en el plan
    // real, aunque algún bloque mezcle carrera al final.
    case 'erg_intervals':
    case 'zone2':
      return 'ergo';
    // Trabajo mixto / competición.
    case 'amrap':
    case 'emom':
    case 'for_time':
    case 'circuit':
    case 'hyrox_sim':
    case 'race_sim':
    case 'metcon':
    case 'functional_circuit':
      return 'circuito';
    // Core, movilidad, calentamiento y vuelta a la calma.
    case 'core_mobility':
    case 'tapering':
    case 'warmup':
    case 'cooldown':
      return 'calentamiento';
    default:
      return modalityColorSlug('functional');
  }
}
