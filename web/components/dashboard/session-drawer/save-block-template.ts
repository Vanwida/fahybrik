// save-block-template — "Guardar bloque en biblioteca" (drawer footer, UX
// redesign §2b). Converts an OWN session block (WeekDayPart) into a reusable
// template via the existing POST /api/coach/templates contract (snake_case,
// Zod-validated server-side by templateCreateSchema). The structured
// prescription_json travels with each segment — that is the source of truth;
// params_json is the scalar back-compat summary.

import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';

export interface SaveBlockResult {
  ok: boolean;
  /** Coach-facing error when ok=false. */
  message?: string;
}

interface TemplateSegmentPayload {
  exercise_id: number;
  position: number;
  block_position: number;
  block_title: string;
  block_format: WeekDayPart['format'];
  params_json: Record<string, unknown>;
  notes: string | null;
  prescription_json: unknown;
}

export function blockToTemplatePayload(part: WeekDayPart): {
  name: string;
  format: WeekDayPart['format'];
  target_block: 'any';
  methodology_group_id: number | null;
  coach_notes: string | null;
  is_draft: false;
  segments: TemplateSegmentPayload[];
} {
  return {
    name: part.title,
    format: part.format,
    target_block: 'any',
    methodology_group_id: part.methodology_group_id ?? null,
    coach_notes: part.coach_note ?? null,
    is_draft: false,
    segments: part.items.map((item, index) => ({
      exercise_id: Number(item.exercise_id),
      position: index,
      block_position: 0,
      block_title: part.title,
      block_format: part.format,
      params_json: (item.params_json ?? {}) as Record<string, unknown>,
      notes: item.notes ?? null,
      prescription_json: item.prescription_json ?? null,
    })),
  };
}

export async function saveBlockToLibrary(part: WeekDayPart): Promise<SaveBlockResult> {
  try {
    const res = await fetch('/api/coach/templates', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blockToTemplatePayload(part)),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, message: err?.message ?? 'No se pudo guardar en la biblioteca' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Sin conexión — vuelve a intentarlo' };
  }
}
