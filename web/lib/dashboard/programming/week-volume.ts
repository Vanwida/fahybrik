// Volumen PLANIFICADO de una semana (y de un día), derivado de la prescripción
// tipada — un hecho de la receta, no una previsión (informe D §2.7 y §5.10; la
// prohibición de 2026-08-12 es para la pantalla del ATLETA).
//
// Honesto por construcción:
//   · el tiempo es el que la prescripción ESCRIBE (`sessionDuration`, que ya
//     suelo-redondea y nunca inventa ritmos); un entreno sin reloj escrito
//     (fuerza por repeticiones, un «for time») cuenta como abierto y la semana
//     se lee «≥ X» — jamás se rellena con un número por defecto;
//   · el volumen por modalidad es lo que se puede SUMAR sin suponer: series de
//     trabajo de fuerza, metros y minutos de carrera y de ergómetro.

import {
  sessionDuration,
  setMeasure,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import type { WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { modalityForGroup } from '@/lib/dashboard/v2/planes-model';
import { itemPrescription } from './progress-ops';

export interface Volume {
  /** Entrenos con contenido. */
  sessions: number;
  /** Minutos que la prescripción escribe (suelo). */
  minutes: number;
  /** Entrenos cuyo reloj no está escrito entero: la semana dura «al menos» `minutes`. */
  open_sessions: number;
  strength_sets: number;
  run_m: number;
  run_s: number;
  erg_m: number;
  erg_s: number;
}

export const emptyVolume = (): Volume => ({
  sessions: 0,
  minutes: 0,
  open_sessions: 0,
  strength_sets: 0,
  run_m: 0,
  run_s: 0,
  erg_m: 0,
  erg_s: 0,
});

const ERG = new Set<Modality>(['row', 'ski', 'bike']);

function blockFallbackModality(block: WeekDayPart): Modality | undefined {
  const m = modalityForGroup(block.methodology_group_id);
  if (m === 'fuerza') return 'strength';
  if (m === 'carrera') return 'run';
  if (m === 'ergo') return 'row';
  return undefined;
}

function addWork(v: Volume, p: Prescription, modality: Modality | undefined) {
  const sets = (p.sets ?? []).filter((s) => !s.is_approach);
  const repeat = sets.length === 1 && (p.rounds ?? 1) > 1 ? p.rounds! : 1;
  if (modality === 'strength') {
    v.strength_sets += sets.length > 0 ? sets.length * repeat : (p.rounds ?? 0);
    return;
  }
  const isRun = modality === 'run';
  const isErg = modality !== undefined && ERG.has(modality);
  if (!isRun && !isErg) return;
  let meters = 0;
  let seconds = 0;
  for (const s of sets) {
    const m = setMeasure(s);
    if (m?.kind === 'distance') meters += m.meters * repeat;
    if (m?.kind === 'duration') seconds += m.seconds * repeat;
  }
  if (sets.length === 0 && p.total_s && p.scheme === 'steady') seconds += p.total_s;
  if (isRun) {
    v.run_m += meters;
    v.run_s += seconds;
  } else {
    v.erg_m += meters;
    v.erg_s += seconds;
  }
}

export function dayVolume(day: WeekDay): Volume {
  const v = emptyVolume();
  for (const session of day.sessions) {
    if (session.kind !== 'workout' || (session.blocks ?? []).length === 0) continue;
    v.sessions += 1;
    const items: { prescription: Prescription | null; role: 'principal' | 'calentamiento' | 'vuelta' }[] = [];
    for (const block of session.blocks ?? []) {
      const role = block.group ?? 'principal';
      for (const item of block.items ?? []) {
        const p = itemPrescription(item);
        items.push({ prescription: p, role });
        addWork(v, p, p.modality ?? blockFallbackModality(block));
      }
    }
    const d = sessionDuration(items);
    if (d.known) {
      v.minutes += d.minutes;
      // Principal escrito pero algún accesorio no: el número ya es un suelo.
      if (d.basis === 'floor') v.open_sessions += 1;
    } else {
      v.minutes += d.timed_minutes;
      v.open_sessions += 1;
    }
  }
  return v;
}

export function sumVolumes(list: Volume[]): Volume {
  return list.reduce(
    (acc, v) => ({
      sessions: acc.sessions + v.sessions,
      minutes: acc.minutes + v.minutes,
      open_sessions: acc.open_sessions + v.open_sessions,
      strength_sets: acc.strength_sets + v.strength_sets,
      run_m: acc.run_m + v.run_m,
      run_s: acc.run_s + v.run_s,
      erg_m: acc.erg_m + v.erg_m,
      erg_s: acc.erg_s + v.erg_s,
    }),
    emptyVolume(),
  );
}

export function weekVolume(days: WeekDay[]): Volume {
  return sumVolumes(days.map(dayVolume));
}

// ── Texto ────────────────────────────────────────────────────────────────────

/** «5 h 10», «45 min». */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

function formatKm(m: number): string {
  const km = m / 1000;
  return `${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km`.replace('.', ',');
}

/** Tiempo planificado: «≥ 3 h 10» si algún entreno no escribe su reloj; null si nada. */
export function volumeTimeLabel(v: Volume): string | null {
  if (v.sessions === 0) return null;
  if (v.minutes === 0) return null;
  return `${v.open_sessions > 0 ? '≥ ' : ''}${formatMinutes(v.minutes)}`;
}

/** Piezas por modalidad, en el orden en que un coach las lee. */
export function volumeParts(v: Volume): Array<{ key: 'fuerza' | 'carrera' | 'ergo'; label: string }> {
  const out: Array<{ key: 'fuerza' | 'carrera' | 'ergo'; label: string }> = [];
  if (v.strength_sets > 0) out.push({ key: 'fuerza', label: `${v.strength_sets} series` });
  const run = [v.run_m > 0 ? formatKm(v.run_m) : null, v.run_s > 0 ? formatMinutes(Math.round(v.run_s / 60)) : null].filter(Boolean);
  if (run.length) out.push({ key: 'carrera', label: run.join(' + ') });
  const erg = [v.erg_m > 0 ? formatKm(v.erg_m) : null, v.erg_s > 0 ? formatMinutes(Math.round(v.erg_s / 60)) : null].filter(Boolean);
  if (erg.length) out.push({ key: 'ergo', label: erg.join(' + ') });
  return out;
}
