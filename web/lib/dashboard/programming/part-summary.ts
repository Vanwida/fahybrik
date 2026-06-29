import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type {
  WeekDayPart,
  WeekDayPartConfig,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import { legacyItemToPrescription, prescriptionToText } from '@fahybrid/shared/domain/prescription';

function minutes(seconds: number | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function configLine(format: TemplateFormat, config: WeekDayPartConfig | undefined): string {
  const c = config ?? {};
  const parts: string[] = [];

  switch (format) {
    case 'amrap': {
      const cap = minutes(c.time_cap_seconds);
      if (cap) parts.push(cap);
      break;
    }
    case 'emom': {
      if (c.emom_interval_seconds) parts.push(`c/${c.emom_interval_seconds}s`);
      const cap = minutes(c.time_cap_seconds);
      if (cap) parts.push(cap);
      if (c.rounds) parts.push(`${c.rounds} rondas`);
      break;
    }
    case 'circuit': {
      if (c.rounds) parts.push(`${c.rounds} rondas`);
      if (c.stations) parts.push(`${c.stations} estaciones`);
      break;
    }
    case 'for_time': {
      const cap = minutes(c.time_cap_seconds);
      if (cap) parts.push(`cap ${cap}`);
      break;
    }
    case 'intervals': {
      if (c.rounds) parts.push(`${c.rounds}×`);
      if (c.work_seconds) parts.push(`${c.work_seconds}s on`);
      if (c.rest_seconds != null) parts.push(`${c.rest_seconds}s off`);
      break;
    }
    case 'strength_block': {
      if (c.rounds) parts.push(`${c.rounds} series`);
      if (c.rest_seconds) parts.push(`${c.rest_seconds}s descanso`);
      break;
    }
    case 'hyrox_sim': {
      if (c.stations) parts.push(`${c.stations} estaciones`);
      if (c.rounds && c.rounds > 1) parts.push(`${c.rounds} rondas`);
      break;
    }
    default:
      break;
  }

  return parts.join(' · ');
}

/**
 * Short label for the block's FORMAT chip (the timing/structure type, e.g.
 * "AMRAP", "EMOM", "Intervalo", "Series", "Z2"). This is distinct from the
 * methodology group: format = how the block is structured in time; group = its
 * pedagogical purpose. Kept terse + athletic for the dense week view.
 */
const FORMAT_CHIP_LABEL: Record<TemplateFormat, string> = {
  // Canonical formats (shared workout-format catalog).
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  death_by: 'Death By',
  intervals: 'Intervalo',
  steady: 'Continuo',
  chipper: 'Chipper',
  ladder: 'Escalera',
  rounds: 'Rondas',
  hyrox_sim: 'Simulación',
  sets: 'Series',
  warmup: 'Calentamiento',
  cooldown: 'Vuelta a la calma',
  // Legacy DB-only members (normalized to canonical on read).
  strength_block: 'Series',
  tempo: 'Continuo',
  circuit: 'Circuito',
  test: 'Test',
};

export function formatChipLabel(format: TemplateFormat): string {
  return FORMAT_CHIP_LABEL[format] ?? format.replace(/_/g, ' ');
}

export function partSummary(part: WeekDayPart): string {
  const config = configLine(part.format, part.config_json);
  // Bloque de biblioteca: prescripción verbatim (sin ejercicios sueltos). El
  // hint de ejercicios no aplica — mostramos "Biblioteca" + la config.
  if (part.source_block_id != null) {
    return config ? `Biblioteca · ${config}` : 'Biblioteca';
  }
  const count = part.items.length;
  const exerciseHint = count === 0 ? 'Sin ejercicios' : count === 1 ? '1 ejercicio' : `${count} ejercicios`;
  if (config) return `${config} · ${exerciseHint}`;
  return exerciseHint;
}

/**
 * Compact one-line prescription summary for an exercise row in the week view.
 * Prefers the STRUCTURED `prescription_json` (rendered via prescriptionToText —
 * the same dosage string Pablo wrote, e.g. "6/6/4/4/3 @ 75-85%, rest 2'30\"").
 * Falls back to deriving a prescription from legacy `params_json` + `notes`, and
 * finally to the scalar `itemParamsLine` if nothing structured is available.
 */
export function itemSummaryLine(item: WeekDayPartItem): string {
  if (item.prescription_json) {
    const text = prescriptionToText(item.prescription_json).trim();
    if (text) return text;
  }
  const derived = prescriptionToText(
    legacyItemToPrescription({ params_json: item.params_json, notes: item.notes }),
  ).trim();
  if (derived) return derived;
  return itemParamsLine(item.params_json);
}

export function itemParamsLine(params: Record<string, unknown> | undefined): string {
  const p = params ?? {};
  const parts: string[] = [];
  if (typeof p.sets === 'number') parts.push(`${p.sets}×`);
  if (typeof p.reps === 'number') parts.push(`${p.reps} reps`);
  if (typeof p.distance_meters === 'number') parts.push(`${p.distance_meters} m`);
  if (typeof p.duration_seconds === 'number') parts.push(`${p.duration_seconds}s`);
  if (typeof p.load_pct === 'number') parts.push(`${p.load_pct}%`);
  if (typeof p.rpe === 'number') parts.push(`RPE ${p.rpe}`);
  return parts.join(' · ') || '—';
}
