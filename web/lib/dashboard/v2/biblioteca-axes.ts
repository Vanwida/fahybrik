// v2 · BIBLIOTECA — client-safe filter axes. TODOS los ejes de filtro de la
// Biblioteca viven aquí, como dato: los dos comunes (POR MODALIDAD / POR OBJETIVO),
// el de ESTADO (sólo Bloques) y el de CONTENIDO (sólo Ejercicios). Cada peldaño de
// la escalera tiene los suyos y no se prestan: un ejercicio no se "tipa" y un bloque
// no tiene vídeo. Un eje esparcido por sus componentes es un eje que nadie encuentra
// al añadir el siguiente. This module is free of any
// server-only dependency (no DB, no `server-only`), so client components can import
// the runtime constants without dragging the postgres driver into the browser bundle.
// The server loader (`biblioteca-data.ts`) re-exports these so there is still a single
// import surface for callers that also need the data loader.

import type { V2Modality } from '@/components/v2/constants';

// The library has TWO orthogonal filter axes (spec SCREEN 4 left rail):
//   · POR MODALIDAD — the training-modality color axis (Todas/Carrera/Ergómetro/
//     Fuerza/Circuito/Mixta). "Mixta" = formats that combine modalities (HYROX
//     sim, conditioning) where no single modality dominates.
//   · POR OBJETIVO — the training goal (Base·Z2 / Umbral / VO₂ / Fuerza máx).
// Both are CLOSED sets so a chip can never render an unknown key.

export type V2LibModalityFilter = V2Modality | 'mixta';
export type V2LibObjective = 'base_z2' | 'umbral' | 'vo2' | 'fuerza_max';

export const LIB_MODALITY_FILTERS: ReadonlyArray<{ id: 'todas' | V2LibModalityFilter; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'carrera', label: 'Carrera' },
  { id: 'ergo', label: 'Ergómetro' },
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'circuito', label: 'Circuito' },
  { id: 'mixta', label: 'Mixta' },
];

export const LIB_OBJECTIVES: ReadonlyArray<{ id: V2LibObjective; label: string }> = [
  { id: 'base_z2', label: 'Base · Z2' },
  { id: 'umbral', label: 'Umbral' },
  { id: 'vo2', label: 'VO₂' },
  { id: 'fuerza_max', label: 'Fuerza máx' },
];

// ── Tercer eje, SOLO para Bloques: el estado (¿lo puede ejecutar el atleta?) ──
// No es una preferencia de vista: es trabajo pendiente del coach. Un bloque sin
// dosis pasa el editor pero el gate le bloqueará el Confirmar cada vez que lo use
// — el sitio de arreglarlo es la fuente (el bloque), una vez, no cada uso.
export type V2LibReadiness = 'sin_tipar' | 'sin_dosis' | 'listo';

export const LIB_READINESS: ReadonlyArray<{ id: V2LibReadiness; label: string }> = [
  { id: 'sin_dosis', label: 'Sin dosis' },
  { id: 'sin_tipar', label: 'Sin tipar' },
  { id: 'listo', label: 'Listos' },
];

// ── Eje de CONTENIDO, SOLO para Ejercicios ──────────────────────────────────
// NO es el eje de estado de arriba y no se mezcla con él: un movimiento no se
// "tipa" ni lleva dosis (eso es de un bloque). Lo que le puede faltar a un
// ejercicio es OTRA cosa — lo que el atleta se encuentra al abrirlo:
//   · el VÍDEO, que es lo que MIRA para copiar la técnica, y
//   · el TEXTO (claves y/o descripción), que es lo que LEE.
// Ese es el inventario completo del contenido que un coach autora sobre un
// movimiento (los cuatro campos forkeables de la mig 0132 menos el nombre, que
// nunca falta porque es NOT NULL).

/** Las tres piezas de contenido, en el orden en que se editan y se marcan. */
export const EXERCISE_CONTENT_SLOTS = [
  { id: 'cues', label: 'claves', icon: 'format_list_bulleted' },
  { id: 'description', label: 'descripción', icon: 'notes' },
  { id: 'video', label: 'vídeo', icon: 'play_circle' },
] as const;

export type ExerciseContentSlot = (typeof EXERCISE_CONTENT_SLOTS)[number]['id'];

/**
 * Los huecos por los que se puede filtrar. Son PREDICADOS, no una partición:
 * "sin nada" es el subconjunto de los otros dos, así que sus cuentas se solapan
 * a propósito y no suman el total. Van de lo más común a lo más grave.
 */
export type V2LibExerciseGap = 'sin_video' | 'sin_texto' | 'sin_nada';

export const LIB_EXERCISE_GAPS: ReadonlyArray<{ id: V2LibExerciseGap; label: string }> = [
  { id: 'sin_video', label: 'Sin vídeo' },
  { id: 'sin_texto', label: 'Sin explicación' },
  { id: 'sin_nada', label: 'Sin nada' },
];

/**
 * Lo mínimo que hace falta para juzgar el contenido de un ejercicio: los campos
 * YA FUSIONADOS (`coalesce(override, base)`), que son los que verá el atleta. Se
 * pide la forma y no la fila entera para que esto siga valiendo igual para
 * `CoachExerciseRow` (Biblioteca) y para `CatalogRow` (ExercisePicker).
 */
export interface ExerciseContent {
  video_url: string | null;
  cues: string | null;
  description: string | null;
}

const filled = (v: string | null | undefined): boolean => (v ?? '').trim() !== '';

/** Qué lleva puesto, casilla por casilla. */
export function exerciseContentSlots(ex: ExerciseContent): Record<ExerciseContentSlot, boolean> {
  return { cues: filled(ex.cues), description: filled(ex.description), video: filled(ex.video_url) };
}

// Un predicado por hueco. Como Record y no como `switch`: si el eje gana un valor,
// deja de compilar hasta que alguien diga qué significa.
const GAP_TEST: Record<V2LibExerciseGap, (has: { video: boolean; texto: boolean }) => boolean> = {
  sin_video: (h) => !h.video,
  sin_texto: (h) => !h.texto,
  sin_nada: (h) => !h.video && !h.texto,
};

export function exerciseHasGap(ex: ExerciseContent, gap: V2LibExerciseGap): boolean {
  const slots = exerciseContentSlots(ex);
  return GAP_TEST[gap]({ video: slots.video, texto: slots.cues || slots.description });
}

/**
 * El contenido dicho en palabras, para quien no ve los iconos de la fila. La
 * señal visual nunca es la única: los iconos van `aria-hidden` y esto va al lado.
 */
export function exerciseContentSummary(ex: ExerciseContent): string {
  const slots = exerciseContentSlots(ex);
  const tiene = EXERCISE_CONTENT_SLOTS.filter((s) => slots[s.id]).map((s) => s.label);
  if (tiene.length === 0) return 'Sin contenido.';
  if (tiene.length === 1) return `Con ${tiene[0]}.`;
  return `Con ${tiene.slice(0, -1).join(', ')} y ${tiene[tiene.length - 1]}.`;
}
