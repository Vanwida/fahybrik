import 'server-only';

import { z } from 'zod';

/**
 * Canonical surfaces supported server-side. Public-facing aliases
 * (`block_title`, `day_focus`, `week_name`) are accepted for ergonomics
 * and normalised to canonical values before processing.
 */
const CANONICAL_SURFACES = [
  'workout_name',
  'coach_note',
  'block_name',
  'week_focus',
  'template_name',
] as const;

const SURFACE_ALIASES: Record<string, (typeof CANONICAL_SURFACES)[number]> = {
  block_title: 'block_name',
  day_focus: 'week_focus',
  week_name: 'template_name',
};

const allSurfaces = [
  ...CANONICAL_SURFACES,
  ...(Object.keys(SURFACE_ALIASES) as Array<keyof typeof SURFACE_ALIASES>),
] as [string, ...string[]];

export const textSuggestInputSchema = z
  .object({
    surface: z.enum(allSurfaces),
    context: z.record(z.unknown()).default({}),
  })
  .transform((input) => ({
    ...input,
    surface: (SURFACE_ALIASES[input.surface] ?? input.surface) as (typeof CANONICAL_SURFACES)[number],
  }));

export type TextSuggestInput = z.infer<typeof textSuggestInputSchema>;

/** v1: sugerencias heurísticas sin LLM — sustituible por Pablo IA Compose en 1b+. */
export function suggestFreeText(input: TextSuggestInput): string[] {
  const exercises = Array.isArray(input.context.exercises)
    ? (input.context.exercises as string[])
    : [];
  const zone =
    typeof input.context.hr_zone === 'number' ? `Z${input.context.hr_zone}` : null;
  const duration =
    typeof input.context.duration_min === 'number' ? `${input.context.duration_min}'` : null;

  if (input.surface === 'workout_name') {
    const base = exercises[0] ?? 'Sesión';
    const hints = [
      [zone, duration].filter(Boolean).join(' · ') || `${base} — principal`,
      `Entreno ${duration ?? ''}`.trim(),
      exercises.length > 1 ? `${exercises[0]} + ${exercises.length - 1} más` : base,
    ];
    return [...new Set(hints.map((s) => s.trim()).filter(Boolean))].slice(0, 3);
  }

  if (input.surface === 'coach_note') {
    return [
      'Priorizar técnica en series principales. Si fatiga acumulada, bajar 1 escalón de zona.',
      'Hidratación y movilidad post-sesión. Comentar sensaciones en check-in.',
      'Respetar RPE techo; no perseguir números si el readiness está bajo.',
    ];
  }

  if (input.surface === 'week_focus') {
    return [
      'Densidad media, una sesión clave',
      'Semana de acumulación controlada',
      'Recuperación activa entre estímulos duros',
    ];
  }

  if (input.surface === 'block_name') {
    const format = typeof input.context.format === 'string' ? input.context.format : '';
    const itemsCount =
      typeof input.context.items_count === 'number' ? input.context.items_count : 0;
    const base: string[] = [];
    if (format.includes('warmup') || itemsCount <= 2) base.push('Calentamiento');
    if (format === 'strength_block' || format === 'circuit') base.push('Principal');
    if (format === 'hyrox_sim' || format === 'amrap' || format === 'for_time') base.push('Finisher');
    base.push('Bloque principal', 'Trabajo metabólico', 'Accesorios');
    return [...new Set(base)].slice(0, 3);
  }

  if (input.surface === 'template_name') {
    const level = typeof input.context.level === 'string' ? input.context.level : 'Pro';
    return [
      `${level} · Semana base`,
      `${level} · densidad media`,
      `${level} HYROX`,
    ];
  }

  return ['Propuesta 1', 'Propuesta 2', 'Propuesta 3'];
}
