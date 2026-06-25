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
  WeekSession as DomainWeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { modalityColorSlug } from './editor-axes';
import { inferGroup, weekDayPartToEditorBlock } from './part-to-editor-block';
import type {
  DayEditorModel,
  EditorBlock,
  EditorItem,
  EditorSession,
  LibraryBlockRow,
  LibrarySessionRow,
  SessionEditorModel,
} from './editor-types';

// Days of the week per the [idx] route convention (idx is a flat 0-based index
// across the month → week = floor/7, day_of_week = idx%7 + 1).
const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_PER_WEEK = 7;

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

  return {
    month_id: monthData.month.id,
    month_name: monthData.month.name,
    week_id: week.id,
    week_index: weekPos,
    week_name: week.name ?? `Semana ${weekPos + 1}`,
    day_of_week: dayOfWeek,
    day_label: WEEKDAY_NAMES[dayOfWeek - 1] ?? `Día ${dayOfWeek}`,
    sessions,
  };
}

function mapSession(s: DomainWeekSession, index: number): EditorSession {
  const slot: EditorSession['slot'] = index === 0 ? 'am' : index === 1 ? 'pm' : 'extra';
  return {
    uid: `session-${index}`,
    slot,
    time_hint: slot === 'am' ? '08:00' : slot === 'pm' ? '18:00' : undefined,
    // WeekDayPart → EditorBlock via the shared client-safe mapper (one source of
    // truth, also used by the Pablo IA compose action).
    blocks: (s.blocks ?? []).map((b, bi) => weekDayPartToEditorBlock(b, bi)),
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
