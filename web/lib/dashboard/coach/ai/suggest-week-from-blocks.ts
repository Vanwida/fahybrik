import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isCoachIaLlmConfigured, CoachIaLlmError } from './llm';
import {
  blockIsTyped,
  loadComposableBlocks,
  loadMethodologyGroups,
  resolveGroupIds,
  summarizeUntypedGroups,
} from './blocks-catalog';
import { parseFocusConstraints } from './focus-constraints';
import { llmFallbackNotice, untypedBlocksNotice, type WeekNotice } from './week-notices';
import { computeTrainingDayDistribution, type ProgramLevel, type MatchedBlock, type SuggestedWeekDay } from './compose-week-parts';
import { composeWeekHeuristic } from './compose-week-heuristic';
import { composeWeekLlm } from './compose-week-llm';

/**
 * Coach IA — composición de SEMANA a partir de la BIBLIOTECA DE BLOQUES (0037).
 *
 * Principio de producto (Documento Maestro): la IA NO genera entrenos de cero —
 * SELECCIONA y ADAPTA bloques existentes del coach. Esta es la diferencia con
 * `suggest-week.ts`, que reparte TEMPLATES del catálogo (para coaches sin
 * biblioteca propia).
 *
 * Este módulo ORQUESTA y no compone: carga la biblioteca, traduce el foco a
 * restricciones, decide quién compone (modelo o heurístico) y — sobre todo —
 * reporta lo que NO pudo hacer. Cada pieza vive en su sitio:
 *   · `blocks-catalog`      — cargar y clasificar la biblioteca
 *   · `focus-constraints`   — foco en lenguaje natural → restricciones
 *   · `compose-week-llm`    — el modelo ELIGE sus bloques según el foco
 *   · `compose-week-heuristic` — red de seguridad determinista
 *   · `week-notices`        — lo que no se pudo honrar, dicho en voz alta
 *
 * Re-exporta los símbolos que ya consumían otros módulos y tests: el corte en
 * piezas es interno y no rompe a nadie.
 */

export type { ComposableBlock, MethodologyGroup } from './blocks-catalog';
export { loadComposableBlocks } from './blocks-catalog';
export { composeWeekHeuristic } from './compose-week-heuristic';
export { composeWeekLlm, materializeLlmWeek } from './compose-week-llm';
export type { MatchedBlock, SuggestedWeekDay } from './compose-week-parts';
export type { WeekNotice } from './week-notices';

const programLevel = z.enum(['beginner', 'intermediate', 'pro', 'elite']);

export const suggestWeekFromBlocksRequestSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    focus: z.string().min(2).max(400),
    level: programLevel.optional(),
    /**
     * `slow` = el modelo elige los bloques leyendo el foco. `fast` = reparto
     * determinista por grupos, SIN modelo — y por tanto sin leer el foco más allá
     * de sus restricciones estructuradas. Cualquier UI que diga «con IA» tiene que
     * pedir `slow`: prometer IA y resolver con una rotación es mentir.
     */
    mode: z.enum(['fast', 'slow']).default('fast'),
    /** Días de entreno. El foco manda sobre esto si los pide explícitamente. */
    days_per_week: z.number().int().min(3).max(7).optional(),
  })
  .strict();

export type SuggestWeekFromBlocksRequest = z.infer<typeof suggestWeekFromBlocksRequestSchema>;

export interface SuggestWeekFromBlocksResponse {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  name: string;
  focus: string;
  days: SuggestedWeekDay[];
  /** Bloques reales referenciados (trazabilidad: nunca se inventa contenido). */
  matched_blocks: MatchedBlock[];
  rest_days: number[];
  /** Lo que la IA no pudo honrar del foco. El llamador DEBE enseñarlo. */
  notices: WeekNotice[];
  notes?: string | undefined;
}

export class SuggestWeekFromBlocksError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SuggestWeekFromBlocksError';
  }
}

function defaultWeekName(focus: string): string {
  const head = focus.split(/[.,;]/)[0]!.trim().slice(0, 60);
  return `Semana · ${head || 'Coach IA'}`;
}

/** Motivo del fallback en lenguaje de coach, no de stacktrace. */
function fallbackReason(err: unknown): string {
  if (err instanceof CoachIaLlmError) {
    switch (err.code) {
      case 'unconfigured':
        return 'no está configurada';
      case 'http':
        return 'el proveedor devolvió un error';
      case 'empty':
        return 'respondió vacío';
      case 'invalid_json':
        return 'respondió algo que no he podido leer';
      default:
        return 'falló';
    }
  }
  return 'falló';
}

export async function suggestWeekFromBlocks(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<SuggestWeekFromBlocksResponse> {
  const parsed = suggestWeekFromBlocksRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new SuggestWeekFromBlocksError('invalid_request', parsed.error.message, 400);
  }
  const client = params.client ?? defaultSql;
  const req = parsed.data;

  const [allBlocks, groups] = await Promise.all([
    loadComposableBlocks(params.coach_id, client),
    loadMethodologyGroups(client),
  ]);
  if (allBlocks.length === 0) {
    throw new SuggestWeekFromBlocksError(
      'no_blocks',
      'No hay bloques en la biblioteca. Importa tus bloques primero.',
      409,
    );
  }

  // EL FOCO MANDA. Lo estructural se garantiza aquí (no se le pide por favor al
  // modelo); lo semántico lo decide quien componga.
  const constraints = parseFocusConstraints(req.focus);
  const requestedGroupIds = resolveGroupIds(groups, constraints.group_slugs);
  const trainingDays = computeTrainingDayDistribution(
    constraints.days_per_week ?? req.days_per_week ?? null,
  );

  // Solo se compone con lo que se puede EJECUTAR. Un bloque de solo prosa produce
  // un día que parece lleno y está vacío; se deja fuera y se dice.
  const usable = allBlocks.filter(blockIsTyped);
  const notices: WeekNotice[] = [];
  const untyped = untypedBlocksNotice(
    summarizeUntypedGroups({ blocks: allBlocks, groups, requested_group_ids: requestedGroupIds }),
  );
  if (untyped) notices.push(untyped);

  if (usable.length === 0) {
    throw new SuggestWeekFromBlocksError(
      'no_typed_blocks',
      'Tus bloques están sin tipar (son texto, sin ejercicios), así que no puedo componer una semana con ellos. Típalos en la Biblioteca y vuelve a intentarlo.',
      409,
    );
  }

  const name = req.name ?? defaultWeekName(req.focus);
  const heuristic = () =>
    composeWeekHeuristic({
      blocks: usable,
      training_days: trainingDays,
      level: req.level,
      sessions_per_day: constraints.sessions_per_day,
      preferred_group_ids: requestedGroupIds,
    });

  // ---- Sin modelo (por petición o por config) → heurístico determinista ------
  if (req.mode === 'fast' || !isCoachIaLlmConfigured()) {
    const built = heuristic();
    const unconfigured = req.mode === 'slow' && !isCoachIaLlmConfigured();
    if (unconfigured) notices.push(llmFallbackNotice('no está configurada'));
    return {
      mode: req.mode,
      source: unconfigured ? 'library_fallback' : 'library',
      name,
      focus: req.focus,
      days: built.days,
      matched_blocks: built.matched,
      rest_days: built.rest_days,
      notices,
      notes: built.notes,
    };
  }

  // ---- Con modelo: elige y coloca SUS bloques según el foco ------------------
  try {
    const built = await composeWeekLlm({
      blocks: usable,
      groups,
      training_days: trainingDays,
      focus: req.focus,
      level: (req.level ?? 'pro') as ProgramLevel,
      sessions_per_day: constraints.sessions_per_day,
      coach_id: params.coach_id,
    });
    return {
      mode: 'slow',
      source: 'llm',
      name,
      focus: req.focus,
      days: built.days,
      matched_blocks: built.matched,
      rest_days: built.rest_days,
      notices,
      notes: built.notes,
    };
  } catch (err) {
    // Un fallback MUDO es lo que hizo que esto explotara en producción sin que
    // nadie se enterara. Si el modelo no compuso, el coach se entera.
    const built = heuristic();
    notices.push(llmFallbackNotice(fallbackReason(err)));
    return {
      mode: 'slow',
      source: 'library_fallback',
      name,
      focus: req.focus,
      days: built.days,
      matched_blocks: built.matched,
      rest_days: built.rest_days,
      notices,
      notes: built.notes,
    };
  }
}
