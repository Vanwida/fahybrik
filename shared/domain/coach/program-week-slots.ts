import {
  normalizeWeekSlotsInput,
  weekSlotsSchema,
  type WeekSlots,
} from '../../schema/program-templates';

/**
 * Núcleo compartido de slots de plantilla semanal — SIN serialización al wire.
 *
 * IMPORTANTE: la serialización de `template_id`/`exercise_id` diverge a propósito
 * entre apps (web → string para el JSON que consume iOS; coach → number para el
 * dashboard). Por eso `normalizeSession`/`normalizeWeekSlots` viven en cada app y
 * NO se unifican aquí. Este módulo sólo cubre lo verdaderamente común: shape
 * vacío, key estable, y el unwrap+validación de la jsonb cruda.
 */

/** Client-safe — no DB imports. */
export function emptyWeekSlots(): WeekSlots {
  return {
    days: [1, 2, 3, 4, 5, 6, 7].map((day_of_week) => ({
      day_of_week,
      sessions: [],
    })),
  };
}

/**
 * Unwrap legacy double-encoded jsonb (string holding JSON text) y normaliza
 * shape legacy (am/pm/parts/pm_parts) → nuevo (sessions[]). Devuelve el
 * `WeekSlots` validado SIN aplicar serialización de IDs — cada app aplica su
 * propio `normalizeWeekSlots` encima según su wire-format.
 */
export function parseWeekSlotsRaw(raw: unknown): WeekSlots {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    value = JSON.parse(value);
  }
  // Compat: si la fila aún no pasó por 0019, normaliza am/pm → sessions[].
  const normalized = normalizeWeekSlotsInput(value);
  return weekSlotsSchema.parse(normalized);
}

export function templateIdKey(id: string | number | bigint | null | undefined): string | null {
  if (id == null) return null;
  return String(id);
}
