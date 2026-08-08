// archetypes — the ARCHETYPE-FIRST vocabulary of the editor (UX pase
// docs/superpowers/plans/2026-06-24-ux-editor-arquetipos.html). A hybrid coach
// thinks in TYPES of block (a metcon, a run, a strength session…), not in the
// abstract prescription board (modality × measure × target × scheme). An
// archetype is a NAMED ENTRY POINT that FIXES those axes and seeds a valid
// `Prescription` with sensible defaults, so the coach gets a ready tailored form
// instead of empty toggles.
//
// AGNOSTIC: the 9 archetypes are the sport's session vocabulary (HYROX / hybrid),
// identical for every coach. They carry NO methodology — the phase/group is the
// coach's OPTIONAL tag, applied separately.
//
// DRY: this file invents NO schema. Every seed resolves to fields already on
// `Prescription`, produced by REUSING the editor-axes setters + the shared
// prescription-model defaults (one source of truth for "what shape does a
// run/erg/strength line default to"). The 9 archetypes collapse to 4 underlying
// FORM PATTERNS (STEADY · INTERVALS · SETS-TABLE · COMPONENTS) — true DRY.

import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import type { V2Modality } from '@/components/v2/constants';
import type { EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import {
  applyModalidad,
  modalityColorSlug,
  type AxisModalidad,
} from '@/lib/dashboard/v2/editor-axes';
import {
  defaultMeasureForModality,
  defaultTargetForModality,
} from '@/lib/programming/prescription-model';
import { createHyroxSimBlock } from '@/lib/dashboard/v2/hyrox-template';
import { createTestBlock, TEST_BLOCK_FORMAT } from '@/lib/dashboard/v2/test-template';

// ── The four underlying form patterns (9 archetypes → 4 forms) ───────────────
// STEADY      — one line: duración|distancia + zona|RPE|ritmo  (Z2 / tempo / activación / test)
// INTERVALS   — N × (distancia|tiempo work) @ ritmo|RPE + descanso  (series / intervalos)
// SETS_TABLE  — the per-set table: reps × %RM|kg × descanso × tempo  (fuerza)
// SUPERSET    — the SAME per-set table, once PER EXERCISE, plus the rotation rest:
//               the block alternates its exercises (A1→A2→A1→A2) instead of running
//               them in straight sets. That rotation is the ONLY difference from
//               SETS_TABLE (docs/DECISIONS.md 2026-08-05), so the table is reused
//               verbatim and this pattern adds exactly two things: the second
//               exercise and the descanso de la vuelta.
// COMPONENTS  — formato (For Time|AMRAP|EMOM|Rondas) + lista de componentes + cap  (WOD / metcon / circuito)
// HYROX_SIM   — the dedicated ORDERED race template: 16 fixed legs (8 runs + 8
//               stations in official order) + Open/Pro standard loads  (Simulación HYROX)
// TEST        — the dedicated light resolver form: pick a test TYPE (modality +
//               measure auto, RPE 10) whose result calculates the athlete's zones
export type FormPattern =
  | 'steady'
  | 'intervals'
  | 'sets_table'
  | 'superset'
  | 'components'
  | 'hyrox_sim'
  | 'test';

export type ArchetypeId =
  | 'steady_run'
  | 'intervals'
  | 'strength'
  | 'superset'
  | 'power_emom'
  | 'wod_metcon'
  | 'circuit_core'
  | 'hyrox_sim'
  | 'test'
  | 'activation';

export interface Archetype {
  id: ArchetypeId;
  /** Coach-facing name (sport vocabulary, Spanish). */
  name: string;
  /** Compact type label for the block chip on a flat day (e.g. "Fuerza", "WOD"). */
  shortName: string;
  /** One-line "para qué sirve" shown on the picker card. */
  purpose: string;
  /** Material Symbols icon name (no Sparkles / AI clichés). */
  icon: string;
  /** v2 modality color the archetype's icon tile carries (derived hue). */
  modalitySlug: V2Modality;
  /** Which of the 4 base forms renders for this archetype. */
  pattern: FormPattern;
  /** Honest frequency badge from Pablo's real plan ("104×", "clave", "raro"…). */
  frequency: string;
  /** template_format-style label persisted on the block (analytics-readable). */
  format: string;
  /** Default block title pre-filled when the coach picks this type. */
  defaultTitle: string;
  /**
   * Cuántos ejercicios se siembran al crear el bloque. Por defecto 1: casi todos
   * los arquetipos arrancan con uno. La superserie arranca con DOS porque un solo
   * ejercicio no es una superserie: lo que la define es que se alternan.
   */
  seedItems?: number;
  /**
   * DEFERRED this chunk (HYROX-sim template + Test "almacena ritmo" specifics).
   * The archetype is NOT a dead tile: it routes to its closest base form so it
   * still saves; the note flags what the follow-up chunk will add.
   */
  deferred?: { routesTo: ArchetypeId; note: string };
}

// Ordered by real-plan frequency (most used first), per the UX pase evidence bar.
export const ARCHETYPES: Archetype[] = [
  {
    id: 'steady_run',
    name: 'Carrera continua / Z2',
    shortName: 'Carrera',
    purpose: 'Rodaje o tempo. Duración o distancia @ zona / RPE.',
    icon: 'directions_run',
    modalitySlug: 'carrera',
    pattern: 'steady',
    frequency: '104×',
    format: 'tempo',
    defaultTitle: 'Carrera continua',
  },
  {
    id: 'intervals',
    name: 'Series / Intervalos',
    shortName: 'Series',
    purpose: 'Run o ergo. N × (distancia | tiempo) @ ritmo | RPE + descanso.',
    icon: 'repeat',
    modalitySlug: 'carrera',
    pattern: 'intervals',
    frequency: '87×',
    format: 'intervals',
    defaultTitle: 'Series',
  },
  {
    id: 'strength',
    name: 'Fuerza',
    shortName: 'Fuerza',
    purpose: 'Ejercicio + tabla de series: reps × %RM/kg × descanso × tempo.',
    icon: 'fitness_center',
    modalitySlug: 'fuerza',
    pattern: 'sets_table',
    frequency: '47×',
    format: 'strength_block',
    defaultTitle: 'Fuerza',
  },
  {
    id: 'superset',
    name: 'Superserie',
    shortName: 'Superserie',
    purpose: 'Dos o tres ejercicios que se alternan. Una serie de cada y descansas al cerrar la vuelta.',
    icon: 'swap_horiz',
    modalitySlug: 'fuerza',
    pattern: 'superset',
    frequency: 'nuevo',
    format: 'superset',
    defaultTitle: 'Superserie',
    seedItems: 2,
  },
  {
    id: 'hyrox_sim',
    name: 'Simulación HYROX',
    shortName: 'HYROX',
    purpose: 'Plantilla de carrera: 8 × 1 km + las 8 estaciones en orden + cargas Open/Pro.',
    icon: 'sports_score',
    modalitySlug: 'circuito',
    pattern: 'hyrox_sim',
    frequency: '35×',
    format: 'hyrox_sim',
    defaultTitle: 'Simulación HYROX',
  },
  {
    id: 'circuit_core',
    name: 'Circuito / Core',
    shortName: 'Circuito',
    purpose: 'Mezcla de movimientos por reps o tiempo. Carga ligera / bodyweight.',
    icon: 'grid_view',
    modalitySlug: 'circuito',
    pattern: 'components',
    frequency: '33×',
    format: 'circuit',
    defaultTitle: 'Circuito',
  },
  {
    id: 'wod_metcon',
    name: 'WOD / Metcon',
    shortName: 'WOD',
    purpose: 'For Time o AMRAP. Lista de componentes (movimiento + dosis) + cap.',
    icon: 'timer',
    modalitySlug: 'circuito',
    pattern: 'components',
    frequency: '21×',
    format: 'for_time',
    defaultTitle: 'WOD',
  },
  {
    id: 'power_emom',
    name: 'Fuerza-potencia / EMOM',
    shortName: 'EMOM',
    purpose: 'Rondas o EMOM con ventana de trabajo + %RM / bodyweight.',
    icon: 'bolt',
    modalitySlug: 'fuerza',
    pattern: 'components',
    frequency: 'raro',
    format: 'emom',
    defaultTitle: 'EMOM',
  },
  {
    id: 'test',
    name: 'Test',
    shortName: 'Test',
    purpose: 'Elige el tipo (remo/ski 2k · carrera 3′/9′/30′) @ RPE 10. Almacena ritmo → alimenta el plan.',
    icon: 'speed',
    modalitySlug: 'ergo',
    pattern: 'test',
    frequency: 'clave',
    format: TEST_BLOCK_FORMAT,
    defaultTitle: 'Test',
  },
  {
    id: 'activation',
    name: 'Activación / Tapering',
    shortName: 'Activación',
    purpose: 'Volúmenes bajos, strides, movilidad. Para descarga o pre-competición.',
    icon: 'self_improvement',
    modalitySlug: 'calentamiento',
    pattern: 'steady',
    frequency: 'ciclo',
    format: 'tempo',
    defaultTitle: 'Activación',
  },
];

export const ARCHETYPES_BY_ID: Record<ArchetypeId, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
) as Record<ArchetypeId, Archetype>;

export function getArchetype(id: ArchetypeId): Archetype {
  return ARCHETYPES_BY_ID[id];
}

// ── Seeding a valid Prescription for a fresh block of a chosen archetype ──────
// Each archetype maps to (modalidad axis, scheme) + the prescription-model
// defaults. We seed by REUSING applyModalidad (so defaults come from the shared
// prescription-model, never duplicated here) then reshaping to the archetype's
// scheme. The result is a VALID Prescription the existing serializer persists,
// prescriptionToText renders, and PrescriptionFields (advanced hatch) overrides.

/** The coach-axis modality each archetype starts on (drives the seed defaults). */
const ARCHETYPE_AXIS: Record<ArchetypeId, AxisModalidad> = {
  steady_run: 'carrera',
  intervals: 'carrera',
  strength: 'fuerza',
  superset: 'fuerza',
  power_emom: 'circuito',
  wod_metcon: 'circuito',
  circuit_core: 'circuito',
  hyrox_sim: 'circuito',
  // Test defaults to ergo (the default test type is Remo 2k); createTestBlock owns
  // the real seed, so this axis is only the picker-tile hue fallback.
  test: 'ergo',
  activation: 'carrera',
};

/** The scheme each archetype's seed lands on (drives which fields are meaningful). */
const ARCHETYPE_SCHEME: Record<ArchetypeId, Prescription['scheme']> = {
  steady_run: 'steady',
  intervals: 'intervals',
  strength: 'sets',
  superset: 'superset',
  power_emom: 'emom',
  wod_metcon: 'for_time',
  circuit_core: 'rounds',
  hyrox_sim: 'for_time',
  test: 'steady',
  activation: 'steady',
};

// Activación defaults to a low, easy effort (RPE 3) — the one place the archetype
// overrides the modality's natural target with its own sensible default.
const ACTIVATION_TARGET: Prescription['target'] = { kind: 'rpe', value: 3 };

// Descanso por defecto al CERRAR una vuelta de superserie (A1 → A2 → descanso).
// Semilla editable en el formulario, nunca una regla: es el mismo valor que un
// coach pone de oficio entre series de fuerza submáxima.
const SUPERSET_ROTATION_REST_S = 90;

// Semilla del Circuito (docs/DECISIONS.md, 2026-08-07): rondas + pacing a nivel
// de BLOQUE, editable desde ComponentsForm. 3 rondas / por tarea (sin reloj) es
// el patrón HYROX real más frecuente del audit — nunca se inventa un `work_seconds`
// sin que el coach elija «por reloj» primero.
const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = { rounds: 3, pacing: { kind: 'por_tarea' } };

/**
 * Build a valid starting Prescription for a fresh block of the chosen archetype.
 * Reuses applyModalidad (shared prescription-model defaults) then lands on the
 * archetype's scheme — no duplicated seeding rules.
 */
export function seedArchetype(id: ArchetypeId): Prescription {
  const axis = ARCHETYPE_AXIS[id];
  const scheme = ARCHETYPE_SCHEME[id];

  // Start from the modality's natural shape (defaults from prescription-model).
  const base = applyModalidad({ scheme: 'sets', modality: 'other' }, axis);

  if (scheme === 'sets') {
    // Strength keeps the seeded per-set table from applyModalidad as-is.
    return base;
  }

  if (scheme === 'superset') {
    // La MISMA tabla de series que la fuerza (su pareja): lo único que cambia es
    // que el bloque rota sus ejercicios. El descanso sube a nivel de bloque porque
    // es el de la VUELTA (A1 → A2 → descanso), así que el que trae la semilla de
    // fuerza por serie se retira: dos descansos con significados distintos en la
    // misma tarjeta es justo lo que confunde al coach.
    const sets = (base.sets ?? []).map((set) => {
      const next = { ...set };
      delete next.rest_s;
      return next;
    });
    return { ...base, scheme: 'superset', sets, rest_s: SUPERSET_ROTATION_REST_S };
  }

  const modality: Modality = base.modality ?? 'other';
  const measure = defaultMeasureForModality(modality);
  const target =
    id === 'activation' ? ACTIVATION_TARGET : defaultTargetForModality(modality);

  // Conditioning schemes: carry the modality target + a representative measure.
  const next: Prescription = { scheme, modality };
  if (target) next.target = target;

  switch (scheme) {
    case 'steady':
      // Z2 / tempo / activación / test — one continuous block. Default to DURATION
      // (a 30' rodaje reads cleanest); the modality's duration default seeds it,
      // else a sensible 30'. The coach flips to distance in the form if needed
      // (which rebuilds the measure cleanly — no orphan field here).
      next.total_s = measure.kind === 'duration' ? measure.seconds : 1800;
      break;
    case 'intervals':
      // N × (distance|duration work) @ pace|rpe + rest.
      next.rounds = 6;
      next.rest_s = 120;
      if (measure.kind === 'duration') next.work_s = measure.seconds;
      else next.sets = [{ measure }];
      break;
    case 'emom':
      // Fuerza-potencia / EMOM — work window + rounds + a representative component.
      next.rounds = 10;
      next.work_s = 60;
      next.sets = [{ measure: { kind: 'reps', value: 5 } }];
      break;
    case 'for_time':
      // WOD / metcon / sim — N rounds For Time + a time cap.
      next.rounds = 3;
      next.total_s = 1080; // 18' cap
      next.sets = [{ measure: { kind: 'reps', value: 15 } }];
      break;
    case 'rounds':
      // Circuito / core — N rounds, components by reps|time. `rounds`/`rest_s`
      // YA NO se siembran aquí: viven en `EditorBlock.circuit` (DEFAULT_CIRCUIT_CONFIG,
      // createBlockFromArchetype abajo), no duplicados en la prescripción de la
      // estación — ese doblado era el bug real de `applyHead`. Esta rama solo
      // sirve a `circuit_core` (el único archetype con scheme 'rounds'), así que
      // el retiro no afecta a ningún otro.
      next.sets = [{ measure: { kind: 'reps', value: 12 } }];
      break;
    default:
      break;
  }

  return next;
}

/** The v2 modality color slug a seeded/edited archetype prescription resolves to. */
export function archetypeColorSlug(id: ArchetypeId, p?: Prescription): V2Modality {
  if (p?.modality) return modalityColorSlug(p.modality);
  return getArchetype(id).modalitySlug;
}

// ── Re-deriving the pattern for a RELOADED block (no client archetype_id) ────
// A block loaded from the DB carries a `format` (templateFormat) + items but not
// the client-only archetype_id. We map format → the most representative archetype
// so the tailored form still renders on reload. `format` is the stored,
// authoritative classifier (the first item's scheme only hints).
const FORMAT_TO_ARCHETYPE: Record<string, ArchetypeId> = {
  tempo: 'steady_run',
  intervals: 'intervals',
  strength_block: 'strength',
  // Sin esta entrada, una superserie recargada (o importada de una foto) caía a
  // "sin arquetipo" y perdía su formulario: el formato existía en el catálogo pero
  // no tenía dónde editarse.
  superset: 'superset',
  emom: 'power_emom',
  for_time: 'wod_metcon',
  amrap: 'wod_metcon',
  circuit: 'circuit_core',
  hyrox_sim: 'hyrox_sim',
  test: 'test',
};

/** Best-effort archetype for a reloaded block from its format (null = unknown). */
export function archetypeForFormat(format: string | null | undefined): Archetype | null {
  if (!format) return null;
  const id = FORMAT_TO_ARCHETYPE[format];
  return id ? getArchetype(id) : null;
}

/** The form pattern for a block: explicit archetype_id wins, else derive from format. */
export function patternForBlock(
  archetypeId: ArchetypeId | undefined,
  format: string | null | undefined,
): FormPattern | null {
  if (archetypeId) return getArchetype(archetypeId).pattern;
  return archetypeForFormat(format)?.pattern ?? null;
}

// ── Block factory — picking an archetype builds a ready, pre-seeded block ─────
// The coach picks a TYPE → this produces an EditorBlock already shaped for that
// archetype's tailored form: the right format, a default title, and an item
// (single-item patterns) or one starter component (components pattern) carrying
// the seeded valid Prescription. No empty toggles — a ready form.
// `group` is OPTIONAL: the agnostic microciclo day editor creates blocks WITHOUT a
// section (a flat, coach-named list). The session LIBRARY editor still passes one
// so its rail can section by it. Omitted → the block carries no `group`.
export function createBlockFromArchetype(
  id: ArchetypeId,
  group?: StructureGroup,
): EditorBlock {
  // Simulación HYROX has a dedicated, ordered race template (16 pre-seeded legs
  // with real exercise_ids + standard loads) — not the generic single-item seed.
  if (id === 'hyrox_sim') return createHyroxSimBlock(group);
  // Test has a dedicated factory: the prescription IS the test spec (modality +
  // measure + amount from the test type), seeded at the default test type.
  if (id === 'test') return createTestBlock(group);

  const archetype = getArchetype(id);
  const now = Date.now();

  // `seedItems` ejercicios (1 salvo la superserie, que nace con dos). Se llama a
  // seedArchetype UNA VEZ POR ITEM a propósito: devuelve un objeto nuevo cada vez,
  // así dos ejercicios del mismo bloque nunca comparten la misma prescripción por
  // referencia (editar uno cambiaría el otro).
  const items: EditorItem[] = Array.from({ length: archetype.seedItems ?? 1 }, (_, i) => ({
    uid: `arch-item-${now}-${i}`,
    exercise_id: null,
    exercise_name: '',
    prescription: seedArchetype(id),
  }));

  return {
    uid: `arch-${id}-${now}`,
    title: archetype.defaultTitle,
    format: archetype.format,
    archetype_id: id,
    ...(group ? { group } : {}),
    // Circuito nace con una config de bloque válida (rounds + pacing son
    // obligatorios en el schema) — el resto de archetypes no necesitan una
    // porque su estructura vive en la Prescription sembrada arriba.
    ...(id === 'circuit_core' ? { circuit: DEFAULT_CIRCUIT_CONFIG } : {}),
    items,
  };
}
