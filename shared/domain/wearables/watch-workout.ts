// WatchWorkout — el modelo NEUTRO, ya resuelto por atleta, que consume TODO
// codificador de reloj (Garmin .FIT, Suunto guide.json, Apple WorkoutKit, Wahoo
// plan.json, nuestras apps propias).
//
// POR QUÉ EXISTE
// -------------
// `RunStructure` (../prescription/run-structure.ts) es la gramática que AUTORIZA el
// coach: lleva zonas ("Z4"), RPE, inclinación y modo de recuperación. Ninguna de
// esas cosas viaja tal cual a un reloj:
//
//   · Una zona nuestra NO es la zona del reloj. Si mandamos "Z4" a un Garmin, el
//     reloj aplica LA SUYA — derivada de una FCmáx que no es la que nosotros
//     calculamos. Por eso aquí las zonas SIEMPRE van resueltas a banda ABSOLUTA
//     (ritmo en s/km, o pulso en bpm). Es la diferencia entre guiar y mentir.
//   · El RPE no lo puede vigilar ningún reloj: es percepción. No existe objetivo
//     de fabricante que lo represente.
//   · La inclinación solo es gobernable en cinta (FTMS / Wahoo grade); al aire
//     libre es una indicación, no un objetivo.
//
// LA REGLA DE HONESTIDAD (la razón de ser de este módulo)
// ------------------------------------------------------
// Lo que el reloj NO puede vigilar NO se emite como objetivo: el tramo va ABIERTO
// y el dato se conserva en el nombre del paso, que es texto para el atleta y no
// pretende ser una medición. Nunca fabricamos una banda que no hemos resuelto.
// Un tramo abierto y bien etiquetado es correcto; un objetivo inventado corrompe
// la analítica y engaña al atleta.
//
// LO QUE ESTE MODELO **NO** CUBRE, A PROPÓSITO
// -------------------------------------------
// Fuerza, EMOM y AMRAP. Ningún formato de fabricante los modela: solo saben de
// cardio por intervalos. Degradarlos a "N iteraciones de 60 s" con un nombre
// pierde las repeticiones, la carga y las rondas — el sistema dejaría de saber
// qué trabajo se hizo. Esas sesiones se ejecutan ÍNTEGRAS en nuestras apps
// (iOS / watchOS / Connect IQ / Zepp), que sí las entienden. Ver la nota de
// alcance en `buildWatchWorkout`.

import {
  flattenPhase,
  isRepeat,
  type Element,
  type Phase,
  type RunStructure,
  type Segment,
} from '../prescription/run-structure';
import type { AthleteBenchmarks } from '../methodology/zones';
import { resolveSegmentTarget, type ResolveSegmentOpts } from '../methodology/segment-resolve';

// ── Modelo neutro ────────────────────────────────────────────────────────────

/** Cómo se mide el paso. `open` = hasta que el atleta pulse (lap manual). */
export type WatchMeasure =
  | { type: 'distance'; m: number }
  | { type: 'duration'; s: number }
  | { type: 'open' };

/**
 * Objetivo VIGILABLE por un reloj, siempre en unidades absolutas. Toda banda es
 * cerrada (min/max): un objetivo puntual se expande a una banda con la tolerancia
 * de abajo, porque ningún reloj alerta bien contra un valor exacto.
 */
export type WatchTarget =
  | { type: 'pace'; fast_s_per_km: number; slow_s_per_km: number }
  | { type: 'hr'; min_bpm: number; max_bpm: number }
  | null;

/** Guía de cadencia. Secundaria: nunca desplaza al objetivo principal. */
export interface WatchCadence {
  min_spm: number;
  max_spm: number;
}

export interface WatchStep {
  kind: 'work' | 'recovery';
  measure: WatchMeasure;
  /** null = tramo abierto (sin objetivo vigilable). */
  target: WatchTarget;
  /**
   * Guía secundaria. Los formatos que solo admiten UN objetivo por paso (Apple
   * WorkoutKit, FIT) la vuelcan al nombre; Suunto sí puede emitirla aparte.
   */
  cadence?: WatchCadence;
  /**
   * Inclinación prescrita (%). Solo es gobernable en cinta; fuera es indicación.
   * Los codificadores sin control de pendiente la vuelcan al nombre.
   */
  incline_pct?: number;
  /**
   * Etiqueta para el atleta. YA lleva incorporado todo lo que el objetivo no
   * puede expresar (RPE, zona sin resolver, modo de recuperación, inclinación),
   * así que un codificador puede usarla tal cual sin re-derivar nada.
   */
  name: string;
}

/** Un bloque repetido. `iterations: 1` = secuencia normal, sin repetición. */
export interface WatchBlock {
  steps: WatchStep[];
  iterations: number;
}

export interface WatchWorkout {
  /** Nombre visible en el reloj. */
  name: string;
  sport: 'running';
  warmup?: WatchStep;
  blocks: WatchBlock[];
  cooldown?: WatchStep;
}

// ── Constantes con nombre ────────────────────────────────────────────────────

/** Tolerancia al expandir un ritmo puntual a banda (s/km a cada lado). */
const PACE_POINT_TOLERANCE_S = 5;
/** Tolerancia al expandir un pulso puntual a banda (bpm a cada lado). */
const HR_POINT_TOLERANCE_BPM = 5;
/** Tolerancia al expandir una cadencia puntual a banda (spm a cada lado). */
const CADENCE_POINT_TOLERANCE_SPM = 3;
/** Tope de caracteres del nombre de paso: el más restrictivo de los fabricantes. */
const STEP_NAME_MAX = 40;

// ── Formateo (compartido por el nombre de todos los pasos) ───────────────────

function formatPace(s: number): string {
  const total = Math.round(s);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatDistance(m: number): string {
  return m >= 1000 && m % 1000 === 0 ? `${m / 1000} km` : `${m} m`;
}

function formatDuration(s: number): string {
  if (s % 60 === 0) return `${s / 60}'`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return mins > 0 ? `${mins}'${String(secs).padStart(2, '0')}''` : `${secs}''`;
}

function measureLabel(measure: WatchMeasure): string {
  switch (measure.type) {
    case 'distance':
      return formatDistance(measure.m);
    case 'duration':
      return formatDuration(measure.s);
    case 'open':
      return 'libre';
  }
}

/** Recorta al tope del fabricante más restrictivo sin partir a mitad de palabra. */
function clampName(raw: string): string {
  const name = raw.trim();
  if (name.length <= STEP_NAME_MAX) return name;
  const cut = name.slice(0, STEP_NAME_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > STEP_NAME_MAX / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

// ── Conversión de objetivo ───────────────────────────────────────────────────

/**
 * Convierte el objetivo YA resuelto del segmento en un objetivo vigilable.
 * Devuelve además las notas que el objetivo no puede expresar y que por tanto
 * deben acabar en el nombre del paso.
 *
 * `fast`/`slow` en ritmo: "fast" es el ritmo MÁS RÁPIDO (menos segundos). Un
 * min_s/max_s de la prescripción son segundos, así que min_s = el más rápido.
 */
function toWatchTarget(
  segment: Segment,
  benchmarks: AthleteBenchmarks,
  opts: ResolveSegmentOpts,
): { target: WatchTarget; notes: string[] } {
  const notes: string[] = [];
  const resolved = resolveSegmentTarget(segment.target, benchmarks, opts);

  if (!resolved) {
    // Sin objetivo, o una zona que NO se pudo resolver por falta de benchmark del
    // atleta. En el segundo caso conservamos la etiqueta de zona en el nombre: el
    // atleta sabe a qué apuntaba el coach y el reloj no finge vigilar nada.
    if (segment.target?.type === 'pace_zone') notes.push(`Z${segment.target.zone}`);
    if (segment.target?.type === 'hr_zone') notes.push(`FC Z${segment.target.zone}`);
    return { target: null, notes };
  }

  const t = resolved.target;

  if (t.kind === 'pace') {
    const fast = t.min_s ?? (t.value_s !== undefined ? t.value_s - PACE_POINT_TOLERANCE_S : undefined);
    const slow = t.max_s ?? (t.value_s !== undefined ? t.value_s + PACE_POINT_TOLERANCE_S : undefined);
    if (fast === undefined || slow === undefined) return { target: null, notes };
    return { target: { type: 'pace', fast_s_per_km: fast, slow_s_per_km: slow }, notes };
  }

  if (t.kind === 'hr_bpm') {
    const min = t.min ?? (t.value !== undefined ? t.value - HR_POINT_TOLERANCE_BPM : undefined);
    const max = t.max ?? (t.value !== undefined ? t.value + HR_POINT_TOLERANCE_BPM : undefined);
    if (min === undefined || max === undefined) return { target: null, notes };
    return { target: { type: 'hr', min_bpm: Math.round(min), max_bpm: Math.round(max) }, notes };
  }

  if (t.kind === 'rpe') {
    // Ningún reloj vigila percepción. Tramo ABIERTO + el RPE en el nombre.
    const band =
      t.min !== undefined && t.max !== undefined && t.min !== t.max
        ? `${t.min}-${t.max}`
        : String(t.value ?? t.min ?? t.max);
    notes.push(`RPE ${band}`);
    return { target: null, notes };
  }

  // Cualquier otro kind (hr_zone sin resolver a bpm, watts, calories…) no aplica
  // a un tramo de carrera: se deja abierto en vez de inventar una equivalencia.
  return { target: null, notes };
}

function toWatchCadence(segment: Segment): WatchCadence | undefined {
  if (segment.cadence_spm === undefined) return undefined;
  return {
    min_spm: segment.cadence_spm - CADENCE_POINT_TOLERANCE_SPM,
    max_spm: segment.cadence_spm + CADENCE_POINT_TOLERANCE_SPM,
  };
}

// ── Segmento → paso ──────────────────────────────────────────────────────────

const RECOVERY_MODE_LABEL: Record<NonNullable<Segment['recovery_mode']>, string> = {
  trote: 'trote',
  caminar: 'andando',
  parado: 'parado',
};

function toWatchStep(
  segment: Segment,
  benchmarks: AthleteBenchmarks,
  opts: ResolveSegmentOpts,
): WatchStep {
  const { target, notes } = toWatchTarget(segment, benchmarks, opts);
  const cadence = toWatchCadence(segment);

  const parts: string[] = [measureLabel(toWatchMeasure(segment))];

  if (segment.kind === 'recovery') {
    parts.push(segment.recovery_mode ? RECOVERY_MODE_LABEL[segment.recovery_mode] : 'rec');
  }
  if (target?.type === 'pace') {
    parts.push(
      target.fast_s_per_km === target.slow_s_per_km
        ? `${formatPace(target.fast_s_per_km)}/km`
        : `${formatPace(target.fast_s_per_km)}-${formatPace(target.slow_s_per_km)}/km`,
    );
  }
  if (target?.type === 'hr') parts.push(`${target.min_bpm}-${target.max_bpm} ppm`);
  parts.push(...notes);
  if (segment.incline_pct !== undefined) parts.push(`${segment.incline_pct}%`);
  if (cadence) parts.push(`${segment.cadence_spm} spm`);

  const step: WatchStep = {
    kind: segment.kind,
    measure: toWatchMeasure(segment),
    target,
    name: clampName(parts.join(' · ')),
  };
  if (cadence) step.cadence = cadence;
  if (segment.incline_pct !== undefined) step.incline_pct = segment.incline_pct;
  return step;
}

function toWatchMeasure(segment: Segment): WatchMeasure {
  return segment.measure.type === 'distance'
    ? { type: 'distance', m: segment.measure.m }
    : { type: 'duration', s: segment.measure.s };
}

// ── Fases → bloques ──────────────────────────────────────────────────────────

/**
 * Un `Element` del árbol se convierte en bloques. Un `Repeat` anidado se APLANA
 * al bloque exterior multiplicando iteraciones no es correcto (3×(4×400) ≠ 12×400
 * cuando el interior lleva su propia recuperación distinta), así que un Repeat de
 * segundo nivel se expande a sus pasos repetidos dentro del bloque exterior. Los
 * cuatro formatos de fabricante soportan UN nivel de repetición, no dos.
 */
function elementsToBlocks(
  elements: Element[],
  benchmarks: AthleteBenchmarks,
  opts: ResolveSegmentOpts,
): WatchBlock[] {
  const blocks: WatchBlock[] = [];
  let loose: WatchStep[] = [];

  const flushLoose = () => {
    if (loose.length > 0) {
      blocks.push({ steps: loose, iterations: 1 });
      loose = [];
    }
  };

  for (const el of elements) {
    if (isRepeat(el)) {
      flushLoose();
      // Los hijos se aplanan (un Repeat interior emite sus pasos `times` veces);
      // la repetición EXTERIOR se conserva como iteraciones del bloque.
      const steps: WatchStep[] = [];
      const walk = (inner: Element[]) => {
        for (const child of inner) {
          if (isRepeat(child)) {
            for (let i = 0; i < child.times; i++) walk(child.elements);
          } else {
            steps.push(toWatchStep(child, benchmarks, opts));
          }
        }
      };
      walk(el.elements);
      blocks.push({ steps, iterations: el.times });
    } else {
      loose.push(toWatchStep(el, benchmarks, opts));
    }
  }
  flushLoose();
  return blocks;
}

/** Fase de un solo tramo → un paso (calentamiento / vuelta a la calma). */
function phaseToSingleStep(
  phase: Phase | undefined,
  benchmarks: AthleteBenchmarks,
  opts: ResolveSegmentOpts,
): WatchStep | undefined {
  if (!phase) return undefined;
  const segments = flattenPhase(phase);
  const first = segments[0];
  if (!first) return undefined;
  // Un calentamiento con varios tramos no cabe en el `warmup` de un solo paso de
  // WorkoutKit/FIT: se colapsa al PRIMERO y el resto entra como bloque normal
  // (ver buildWatchWorkout). Aquí solo devolvemos el primero.
  return toWatchStep(first, benchmarks, opts);
}

export interface BuildWatchWorkoutOpts extends ResolveSegmentOpts {
  /** Nombre visible en el reloj (normalmente el título de la sesión). */
  name: string;
}

/**
 * Construye el entreno neutro a partir de la estructura del coach y los benchmarks
 * del atleta.
 *
 * ALCANCE: solo carrera. Una sesión de fuerza / EMOM / AMRAP NO debe pasar por
 * aquí — no existe estructura de fabricante que la represente sin perder las
 * repeticiones, la carga o las rondas. Esas se ejecutan en nuestras apps.
 *
 * El calentamiento y la vuelta a la calma se emiten como paso único (es lo que
 * admiten WorkoutKit y FIT). Si el calentamiento del coach tiene VARIOS tramos,
 * el primero va como warmup y los demás se anteponen como bloque, de modo que no
 * se pierde ni un tramo.
 */
export function buildWatchWorkout(
  structure: RunStructure,
  benchmarks: AthleteBenchmarks,
  opts: BuildWatchWorkoutOpts,
): WatchWorkout {
  const { name, ...resolveOpts } = opts;

  const warmupPhase = structure.find((p) => p.role === 'warmup');
  const mainPhase = structure.find((p) => p.role === 'main');
  const cooldownPhase = structure.find((p) => p.role === 'cooldown');

  const blocks: WatchBlock[] = [];

  // Calentamiento: primer tramo como `warmup`; los restantes, como bloque previo
  // al principal para no perderlos.
  const warmupSegments = warmupPhase ? flattenPhase(warmupPhase) : [];
  const warmup = phaseToSingleStep(warmupPhase, benchmarks, resolveOpts);
  if (warmupSegments.length > 1) {
    blocks.push({
      steps: warmupSegments.slice(1).map((s) => toWatchStep(s, benchmarks, resolveOpts)),
      iterations: 1,
    });
  }

  if (mainPhase) {
    blocks.push(...elementsToBlocks(mainPhase.elements, benchmarks, resolveOpts));
  }

  // Vuelta a la calma: mismo criterio, pero los tramos EXTRA van antes del último.
  const cooldownSegments = cooldownPhase ? flattenPhase(cooldownPhase) : [];
  if (cooldownSegments.length > 1) {
    blocks.push({
      steps: cooldownSegments.slice(0, -1).map((s) => toWatchStep(s, benchmarks, resolveOpts)),
      iterations: 1,
    });
  }
  const lastCooldown = cooldownSegments[cooldownSegments.length - 1];
  const cooldown = lastCooldown ? toWatchStep(lastCooldown, benchmarks, resolveOpts) : undefined;

  const workout: WatchWorkout = { name: clampName(name), sport: 'running', blocks };
  if (warmup) workout.warmup = warmup;
  if (cooldown) workout.cooldown = cooldown;
  return workout;
}

/** Total de pasos ya expandidos (para límites de tamaño de los fabricantes). */
export function countWatchSteps(w: WatchWorkout): number {
  const inBlocks = w.blocks.reduce((acc, b) => acc + b.steps.length * b.iterations, 0);
  return inBlocks + (w.warmup ? 1 : 0) + (w.cooldown ? 1 : 0);
}
