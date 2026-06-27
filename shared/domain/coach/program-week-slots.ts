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
  try {
    let value: unknown = raw;
    for (let i = 0; i < 2 && typeof value === 'string'; i++) {
      value = JSON.parse(value);
    }
    // Compat: si la fila aún no pasó por 0019, normaliza am/pm → sessions[].
    const normalized = normalizeWeekSlotsInput(value);
    return weekSlotsSchema.parse(normalized);
  } catch (err) {
    // ROBUSTEZ: una sola fila con `slots_json` corrupto (doble-encodeado mal,
    // JSON concatenado `{...}{...}`, o shape inválido) NO debe tumbar la página
    // entera (biblioteca, editor de microciclo, instanciado, publish-preview
    // todos pasan por aquí). Degradamos esa semana a descanso y seguimos.
    // Mirror del patrón skip+log de week-adjustments.ts (fila omitida).
    //
    // Este módulo es PURO (sin DOM/Node lib, compartido web+otras superficies),
    // así que accedemos a `console` vía `globalThis` tipado en línea — registra
    // en runtime (Node/Vercel logs) sin acoplar el módulo a una runtime concreta.
    const c = (globalThis as { console?: { warn?: (...a: unknown[]) => void } }).console;
    c?.warn?.('[program-week-slots] slots_json inválido; semana degradada a descanso:', err);
    return emptyWeekSlots();
  }
}

export function templateIdKey(id: string | number | bigint | null | undefined): string | null {
  if (id == null) return null;
  return String(id);
}
