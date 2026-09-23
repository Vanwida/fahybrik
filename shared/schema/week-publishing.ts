import { z } from 'zod';
import { apiIdSchema, mondaySchema } from './assign-many';
import { AUTO_PUBLISH_DAYS_MAX, AUTO_PUBLISH_DAYS_MIN } from '../domain/coach/week-publishing';

// Publicar por semana (§4.7): publicar / retener una semana de un atleta, publicar
// la misma semana a muchos, y el ajuste del coach «N días antes».
// La visibilidad sigue siendo UNA puerta: `weekly_plans.status = 'draft'` esconde.

/** Retener: `{ held: true }` retiene, `{ held: false }` suelta. Sin cuerpo = alternar. */
export const weekHoldInputSchema = z.object({ held: z.boolean().optional() }).strict();
export type WeekHoldInput = z.infer<typeof weekHoldInputSchema>;

export const bulkWeekPublishSchema = z.object({
  athlete_ids: z.array(apiIdSchema).min(1, 'Elige al menos un atleta.').max(500),
  week_start: mondaySchema,
});
export type BulkWeekPublishInput = z.infer<typeof bulkWeekPublishSchema>;

export const autoPublishPatchSchema = z
  .object({
    /** null = volver al defecto del producto. */
    auto_publish_days_before: z
      .number()
      .int('Tiene que ser un número entero de días.')
      .min(AUTO_PUBLISH_DAYS_MIN, `Como mínimo ${AUTO_PUBLISH_DAYS_MIN} días (el mismo lunes).`)
      .max(AUTO_PUBLISH_DAYS_MAX, `Como máximo ${AUTO_PUBLISH_DAYS_MAX} días antes.`)
      .nullable(),
  })
  .strict();
export type AutoPublishPatch = z.infer<typeof autoPublishPatchSchema>;

export interface AutoPublishSetting {
  /** Lo guardado; null = usa el defecto. */
  auto_publish_days_before: number | null;
  /** Lo que se aplica de verdad. */
  effective_days: number;
  default_days: number;
}

/** Una semana de un atleta, tal como la ve el coach. */
export interface AthleteWeekState {
  week_start: string;
  /** La puerta única: false solo si la fila es `draft`. */
  visible: boolean;
  /** Retenida: oculta hasta que el coach la publique (draft + manual). */
  held: boolean;
  /** `weekly_plans.status`, o null si no hay fila (y sin fila se ve). */
  status: 'draft' | 'published' | 'archived' | null;
  /** Si está en borrador automático: el día en que se abre sola. */
  opens_on: string | null;
  /** Entrenos del coach esa semana (sin contar los libres del atleta). */
  sessions: number;
}

export interface WeekPublishResult {
  athlete_id: string;
  week_start: string;
  /** Estado tras la acción. */
  week: AthleteWeekState;
  /** ¿Pasó de oculta a visible con esta acción? */
  became_visible: boolean;
  notified: boolean;
}

export interface BulkWeekPublishResult {
  week_start: string;
  published: number;
  already_visible: number;
  results: Array<{ athlete_id: string; became_visible: boolean; sessions: number; notified: boolean }>;
}
