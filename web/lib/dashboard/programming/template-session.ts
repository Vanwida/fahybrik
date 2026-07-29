import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type {
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';

// Mapeo bidireccional entreno (template + segments) ⇄ sesión del SessionDrawer
// (WeekSession + WeekDayPart[]). Única fuente de verdad compartida por la
// biblioteca única de /programar (drawer de sesión sobre un entreno propio) y
// el rail de biblioteca del week-studio (insertar un entreno en un día).

/** Shape del GET /api/coach/templates/[id] (snake_case, ver templates.ts). */
export interface TemplateDetailWire {
  id: string;
  name: string;
  format: string;
  target_level: number | null;
  methodology_group_id: number | null;
  coach_notes: string | null;
  is_draft: boolean;
  updated_at: string;
  blocks: Array<{
    block_position: number;
    block_title: string | null;
    block_format: string | null;
    items: Array<{
      id: string;
      position: number;
      exercise_id: string;
      exercise_name: string;
      exercise_category: string;
      params_json: Record<string, unknown>;
      notes: string | null;
    }>;
  }>;
}

/** Metadatos de catálogo del entreno (los "tags" editables en el drawer). */
export interface TemplateMeta {
  format: TemplateFormat;
  target_level: number | null;
  methodology_group_id: number | null;
  coach_notes: string | null;
  is_draft: boolean;
}

const DEFAULT_BLOCK_TITLE = 'Bloque principal';

/**
 * Bloques del entreno → WeekDayPart[] con uids nuevos. El grupo metodológico
 * del entreno colorea sus bloques (un entreno no guarda grupo por bloque).
 */
export function templateBlocksToParts(detail: TemplateDetailWire): WeekDayPart[] {
  const blocks =
    detail.blocks.length > 0
      ? detail.blocks
      : [{ block_position: 0, block_title: null, block_format: null, items: [] }];
  return blocks.map((block, index) => {
    const items: WeekDayPartItem[] = block.items.map((item) => ({
      uid: newBlockUid(),
      exercise_id: Number(item.exercise_id),
      exercise_name: item.exercise_name.slice(0, 200),
      params_json: item.params_json ?? {},
      ...(item.notes ? { notes: item.notes.slice(0, 500) } : {}),
    }));
    const part: WeekDayPart = {
      uid: newBlockUid(),
      format: (block.block_format ?? detail.format) as TemplateFormat,
      title: (block.block_title ?? (index === 0 ? DEFAULT_BLOCK_TITLE : `Bloque ${index + 1}`)).slice(0, 120),
      items,
    };
    if (detail.methodology_group_id != null) {
      part.methodology_group_id = detail.methodology_group_id;
    }
    return part;
  });
}

/** Entreno completo → sesión editable en el SessionDrawer. */
export function templateDetailToSession(detail: TemplateDetailWire): WeekSession {
  return {
    kind: 'workout',
    focus: detail.name.slice(0, 120),
    blocks: templateBlocksToParts(detail),
  };
}

interface TemplateSegmentPayload {
  exercise_id: number;
  position: number;
  block_position: number;
  block_title: string | null;
  block_format: string | null;
  params_json: Record<string, unknown>;
  notes: string | null;
  prescription_json: unknown;
}

/**
 * Sesión del drawer → payload del PUT /api/coach/templates/[id] (snake_case,
 * validado server-side por templateUpdateSchema). Los bloques se aplanan a
 * segments con block_position/block_title/block_format; la prescripción
 * estructurada viaja en prescription_json cuando la fila la lleva.
 */
export function sessionToTemplateUpdatePayload(
  session: WeekSession,
  meta: TemplateMeta,
): {
  name: string;
  format: TemplateFormat;
  target_level: number | null;
  methodology_group_id: number | null;
  coach_notes: string | null;
  is_draft: boolean;
  segments: TemplateSegmentPayload[];
} {
  const blocks = session.blocks ?? [];
  return {
    name: (session.focus ?? '').trim() || 'Sesión sin título',
    format: meta.format,
    target_level: meta.target_level,
    methodology_group_id: meta.methodology_group_id,
    coach_notes: meta.coach_notes,
    is_draft: meta.is_draft,
    segments: blocks.flatMap((part, blockIndex) =>
      part.items.map((item, itemIndex) => ({
        exercise_id: Number(item.exercise_id),
        position: itemIndex,
        block_position: blockIndex,
        block_title: part.title || null,
        block_format: part.format ?? null,
        params_json: (item.params_json ?? {}) as Record<string, unknown>,
        notes: item.notes ?? null,
        prescription_json: item.prescription_json ?? null,
      })),
    ),
  };
}
