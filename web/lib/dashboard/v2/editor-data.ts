import 'server-only';

// editor-data — server loaders for the v2 editing cluster. Each REUSES an
// existing real loader (getTemplateDetail, loadMonthTemplateWithWeeks,
// listTemplatesForCoach, listBlocks) and maps it into the client-safe view
// models in editor-types.ts. No new tables, no invented data: an empty result
// degrades to an empty model (the UI shows an EmptyState), never throws.

import { getTemplateDetail, listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { legacyItemToPrescription } from '@fahybrid/shared/domain/prescription';
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
      items: b.items.map<EditorItem>((it) => ({
        uid: `tpl-item-${it.id}`,
        exercise_id: Number(it.exercise_id),
        exercise_name: it.exercise_name,
        notes: it.notes ?? undefined,
        prescription: legacyItemToPrescription({
          params_json: it.params_json,
          notes: it.notes,
        }),
      })),
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

  const sessions: EditorSession[] = (day.sessions ?? []).map((s, si) =>
    mapSession(s, si),
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
  // to `/microciclos/{month}/dia/{week_day_base + (dow-1)}`.
  const week_day_base = week.week_index * DAYS_PER_WEEK;

  return {
    month_id: monthData.month.id,
    month_name: monthData.month.name,
    week_id: week.id,
    week_index: weekPos,
    week_name: week.name ?? `Semana ${weekPos + 1}`,
    day_of_week: dayOfWeek,
    day_label: WEEKDAY_NAMES[dayOfWeek - 1] ?? `Día ${dayOfWeek}`,
    sessions,
    week_days,
    week_day_base,
  };
}

function mapSession(s: DomainWeekSession, index: number): EditorSession {
  const slot: EditorSession['slot'] = index === 0 ? 'am' : index === 1 ? 'pm' : 'extra';
  return {
    uid: `session-${index}`,
    slot,
    time_hint: slot === 'am' ? '08:00' : slot === 'pm' ? '18:00' : undefined,
    // Workout title round-trips from slots_json (WeekSession.focus).
    ...(s.focus ? { focus: s.focus } : {}),
    blocks: (s.blocks ?? []).map((b, bi) => mapPart(b, bi)),
  };
}

function mapPart(part: WeekDayPart, index: number): EditorBlock {
  return {
    uid: part.uid || `block-${index}`,
    title: part.title,
    format: part.format,
    methodology_group_id: part.methodology_group_id ?? null,
    group: inferGroup(part.title, part.format),
    source_block_id: part.source_block_id ?? null,
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
    listBlocks(null).catch(() => []),
  ]);

  return {
    sessions: sessions.map<LibrarySessionRow>((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      block_count: t.block_count,
      segment_count: t.segment_count,
    })),
    blocks: blocks.map<LibraryBlockRow>((b) => ({
      id: b.id,
      title: b.title,
      format: b.format,
      methodology_group_id: b.methodology_group_id,
      modality_slug: blockFormatToModalitySlug(b.format),
      // TODO(endpoint): real per-block usage count not exposed by listBlocks.
      usage_count: 0,
    })),
  };
}

// Map a block's template_format to the v2 modality color axis (best-effort; the
// block model has no explicit modality, format is the strongest available signal).
function blockFormatToModalitySlug(format: string | null): string {
  switch (format) {
    case 'strength_block':
      return 'fuerza';
    case 'tempo':
    case 'intervals':
      return 'carrera';
    case 'test':
      // The default test type is ergo; the form's hue follows the picked type.
      return 'ergo';
    case 'amrap':
    case 'emom':
    case 'for_time':
    case 'circuit':
    case 'hyrox_sim':
      return 'circuito';
    default:
      return modalityColorSlug('functional');
  }
}
