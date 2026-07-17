import {
  weekDaySchema,
  type BlockUseModifiers,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import type { Block } from '@fahybrid/shared/schema/blocks';
import { createPartFromLibraryBlock } from '@/lib/dashboard/programming/block-to-part';
import type { ComposableBlock } from './blocks-catalog';
import type { WeekNotice } from './week-notices';

/**
 * Materialización compartida: bloques elegidos → `WeekDay` tipado.
 *
 * La usan los DOS composers (heurístico y LLM), así que el saneado de
 * modificadores y el shape del día se escriben UNA vez. Si esto diverge, un
 * camino guarda bien y el otro da 400 — que es exactamente el tipo de fallo que
 * este módulo existe para hacer imposible.
 */

// ---------------------------------------------------------------------------
// Methodology-group taxonomy (the 10 fixed groups, migration 0030)
// ---------------------------------------------------------------------------

/**
 * Clasificación gruesa de cada grupo (1..10) para balancear la semana: evitar
 * apilar fuerza-fuerza-fuerza y alternar carga/recuperación. Es la misma
 * taxonomía del Documento Maestro §10.
 *
 * A diferencia de los NOMBRES (que son contenido del coach y viven en la DB),
 * esto es una decisión de SISTEMA sobre cómo repartir carga: no es editable ni
 * tiene por qué serlo.
 */
export type GroupKind = 'strength' | 'cardio' | 'metcon' | 'recovery';

export const GROUP_KIND: Record<number, GroupKind> = {
  1: 'strength', // Fuerza Base
  2: 'strength', // Fuerza Explosiva / Pliométrica
  3: 'cardio', // Series de Ergómetros
  4: 'cardio', // Series de Running
  5: 'recovery', // Zona 2 / Recuperación
  6: 'metcon', // WODs / Metcons
  7: 'metcon', // Simulaciones de Carrera (HYROX / DEKA)
  8: 'recovery', // Core, Movilidad y Preventivos
  9: 'metcon', // Circuitos Funcionales
  10: 'recovery', // Tapering / Activación
};

export type ProgramLevel = 'beginner' | 'intermediate' | 'pro' | 'elite';

export interface MatchedBlock {
  day_of_week: number;
  /** 0 = am, 1 = pm. El slot es POSICIONAL en todo el dominio. */
  session_index: number;
  block_id: number;
  block_title: string;
  methodology_group_id: number;
  modifiers: BlockUseModifiers | null;
}

export interface SuggestedWeekDay extends WeekDay {
  preview_label?: string;
}

export interface ComposeResult {
  days: SuggestedWeekDay[];
  matched: MatchedBlock[];
  rest_days: number[];
  notices: WeekNotice[];
  notes?: string | undefined;
}

/** Un bloque elegido + los modificadores con los que se usa. */
export interface BlockPick {
  block: ComposableBlock;
  modifiers: BlockUseModifiers | null;
}

/** Una sesión del día (am o pm) = sus bloques + su título. */
export interface SessionPick {
  picked: BlockPick[];
  focus?: string | undefined;
}

/**
 * Limpia los modificadores antes de materializarlos: tanto `default_modifiers`
 * (jsonb) como el `withLevelModifier` pueden traer claves a `null` (placeholders
 * sin valor de la biblioteca), pero `blockUseModifiersSchema` espera number/
 * string o AUSENTE — `null` lo rechaza al validar `block_modifiers`. Omitimos las
 * claves nulas/vacías/NaN en vez de propagarlas. Devuelve `null` si no queda
 * ningún modificador útil (evita objetos `{}` que disparen el modifier badge).
 */
export function sanitizeModifiers(mods: BlockUseModifiers | null): BlockUseModifiers | null {
  if (!mods) return null;
  const next: BlockUseModifiers = {};
  if (typeof mods.intensity_pct === 'number' && !Number.isNaN(mods.intensity_pct)) {
    next.intensity_pct = mods.intensity_pct;
  }
  if (typeof mods.level === 'string' && mods.level.trim() !== '') {
    next.level = mods.level;
  }
  if (typeof mods.duration_min === 'number' && !Number.isNaN(mods.duration_min)) {
    next.duration_min = mods.duration_min;
  }
  if (typeof mods.rounds === 'number' && !Number.isNaN(mods.rounds)) {
    next.rounds = mods.rounds;
  }
  return Object.keys(next).length > 0 ? next : null;
}

/** Adapta un `ComposableBlock` al shape `Block` que consume el materializador. */
function toBlock(b: ComposableBlock): Block {
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    methodology_group_id: b.methodology_group_id,
    // OJO: `blocks.format` es texto libre del importador ('zone2', 'race_sim'…),
    // NO el enum `templateFormat`. Va crudo aquí porque `Block` es el tipo del
    // dominio y lo guarda crudo; la traducción ocurre UNA vez, en
    // `templateFormatForBlock` dentro del materializador. Meterlo tal cual en un
    // `WeekDayPart` da 400 al guardar en 87 de los 99 bloques.
    format: b.format,
    source_ref: b.source_ref,
    // `needs_review` es del flujo de revisión de la biblioteca; el materializador
    // no lo usa. Solo completa el shape `Block`.
    needs_review: false,
  };
}

/**
 * Un día con N sesiones. N=1 → normal. N=2 → DOBLE SESIÓN (am + pm).
 *
 * El slot no se escribe en ningún sitio a propósito: en todo el dominio es
 * POSICIONAL (`sessions[0]`=am, `sessions[1]`=pm — ver `slotLabelForSessionIndex`),
 * así que emitir dos sesiones en orden ES la doble sesión, y el resto de la
 * cadena (serializer → slots_json → instantiate → iOS) ya la entiende sin tocar
 * nada. Una sesión sin bloques no se emite: un hueco vacío no es una sesión.
 */
export function buildDay(dow: number, sessions: SessionPick[]): { day: SuggestedWeekDay; matched: MatchedBlock[] } {
  const matched: MatchedBlock[] = [];
  const outSessions: Array<Record<string, unknown>> = [];

  sessions.forEach((s, sessionIndex) => {
    // Saneamos en el punto único de materialización: cubre el heurístico, el
    // parseo del LLM y los tests puros — `block_modifiers` nunca lleva null.
    const cleaned = s.picked.map((p) => ({
      block: p.block,
      modifiers: sanitizeModifiers(p.modifiers),
    }));
    for (const p of cleaned) {
      matched.push({
        day_of_week: dow,
        session_index: sessionIndex,
        block_id: p.block.id,
        block_title: p.block.title,
        methodology_group_id: p.block.methodology_group_id,
        modifiers: p.modifiers,
      });
    }
    // Materialización canónica (misma que la inserción manual desde el Studio):
    // verbatim en coach_note, source_block_id + block_modifiers.
    const blocks = cleaned.map((p) =>
      createPartFromLibraryBlock(toBlock(p.block), p.modifiers ?? undefined, p.block.exercises),
    );
    outSessions.push({
      kind: 'workout',
      template_id: null,
      ...(blocks.length > 0 ? { blocks } : {}),
      ...(s.focus ? { focus: s.focus } : {}),
    });
  });

  const day = weekDaySchema.parse({
    day_of_week: dow,
    sessions: outSessions,
    // El foco del DÍA es el de su primera sesión (la etiqueta que ve el coach en
    // la parrilla); cada sesión conserva el suyo.
    ...(sessions[0]?.focus ? { focus: sessions[0].focus } : {}),
  });

  const previewLabel = sessions
    .map((s) => s.picked.map((p) => p.block.title).join(' + '))
    .filter(Boolean)
    .join(' · ');
  return { day: { ...day, preview_label: previewLabel }, matched };
}

/** Un día explícitamente de descanso. */
export function restDay(dow: number): SuggestedWeekDay {
  const day = weekDaySchema.parse({ day_of_week: dow, sessions: [] });
  return { ...day, preview_label: 'Descanso' };
}

/** Un día de entreno que se quedó sin bloque válido — hueco honesto, no descanso. */
export function emptyWorkoutDay(dow: number, label: string, focus?: string): SuggestedWeekDay {
  const day = weekDaySchema.parse({
    day_of_week: dow,
    sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
    ...(focus ? { focus } : {}),
  });
  return { ...day, preview_label: label };
}

/** Etiqueta de foco corta por grupo — el coach edita después. */
export function focusHintForDay(groupId: number): string | undefined {
  switch (GROUP_KIND[groupId]) {
    case 'strength':
      return 'Fuerza';
    case 'cardio':
      return 'Aeróbico / series';
    case 'metcon':
      return 'Metcon / específico';
    case 'recovery':
      return 'Recuperación / Z2';
    default:
      return undefined;
  }
}

/** Inyecta el nivel del atleta en los modificadores si el bloque no lo trae. */
export function withLevelModifier(
  base: BlockUseModifiers | null,
  level: ProgramLevel | undefined,
): BlockUseModifiers | null {
  if (!level) return base;
  return { ...(base ?? {}), level: base?.level ?? level };
}

/**
 * Reparto por defecto cuando el coach NO pide un nº de días: 6 de entreno +
 * domingo de descanso. Es el comportamiento de siempre y se preserva tal cual.
 */
export const DEFAULT_TRAINING_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/**
 * Días de entreno de la semana según cuántos pida el coach. Canónico lunes→domingo;
 * el reparto real por atleta lo hace después el remap por disponibilidad.
 *
 * `null` = no lo pidió → `DEFAULT_TRAINING_DAYS`. Se distingue de un 7 EXPLÍCITO
 * a propósito: antes ambos caían en el mismo `case` y "7 días" devolvía 6 días,
 * así que pedir siete y recibir seis era, literalmente, no escuchar al coach.
 */
export function computeTrainingDayDistribution(days_per_week: number | null): number[] {
  if (days_per_week == null) return [...DEFAULT_TRAINING_DAYS];
  switch (days_per_week) {
    case 3:
      return [1, 3, 5];
    case 4:
      return [1, 3, 5, 6];
    case 5:
      return [1, 2, 4, 5, 6];
    case 6:
      return [1, 2, 3, 5, 6, 7];
    case 7:
      return [1, 2, 3, 4, 5, 6, 7];
    default:
      return [...DEFAULT_TRAINING_DAYS];
  }
}
