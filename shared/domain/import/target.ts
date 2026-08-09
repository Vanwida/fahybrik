// target — the intensity-clock micro-grammar: PACE (/km, /500m, /mile) and its
// secondary CAP. Split out of ./dose.ts, which sat at the repo's 500-line
// ceiling (main's call: "el micro-lenguaje de ritmo/pulso en su propio
// módulo"). This first commit is a PURE MOVE — byte-identical behavior, so a
// red test after it can only mean the relocation broke an import, never the
// grammar itself. New target kinds (hr_bpm, watts, calories-as-goal,
// bodyweight, time_cap, kg ranges) land in a follow-up commit.

import { type PaceCap, type PaceUnit, type Target } from '../prescription/types';

export function paceUnitFrom(raw: string): PaceUnit | null {
  if (/\/\s*500\s*m?/i.test(raw)) return 'per_500m';
  if (/\/\s*(?:mi|mile|milla)/i.test(raw)) return 'per_mile';
  if (/\/\s*km/i.test(raw)) return 'per_km';
  return null;
}

/** "15,5km/h" / "17 km/h" → seconds-per-km pace. */
export function parsePaceKmh(raw: string): { unit: PaceUnit; value_s: number } | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/\s*h/i);
  if (!m) return null;
  const kmh = parseFloat(m[1]!.replace(',', '.'));
  if (!(kmh > 0)) return null;
  return { unit: 'per_km', value_s: Math.round(3600 / kmh) };
}

/** An explicit clock pace with a unit: "3'50/km" → 230 s/km;
 *  "3'40-3'50/km" → a min/max range. Returns a pace Target or null. */
export function parsePaceClockTarget(raw: string): Target | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const range = raw.match(/(\d+)\s*'\s*(\d+)\s*''?\s*[-–]\s*(\d+)\s*'\s*(\d+)/);
  if (range) {
    const lo = parseInt(range[1]!, 10) * 60 + parseInt(range[2]!, 10);
    const hi = parseInt(range[3]!, 10) * 60 + parseInt(range[4]!, 10);
    if (lo <= hi) return { kind: 'pace', unit, min_s: lo, max_s: hi };
  }
  const point = raw.match(/(\d+)\s*'\s*(\d+)\s*(?:'')?\s*\/\s*(?:km|500|mi|milla)/i);
  if (point) {
    return { kind: 'pace', unit, value_s: parseInt(point[1]!, 10) * 60 + parseInt(point[2]!, 10) };
  }
  // TrainingPeaks colon form: "3:45 min/km" → 225 s/km; "1:54 /500m" → 114
  // s/500m. A pace clock is always m:ss (never h:mm:ss — nobody paces per hour).
  const colonPoint = raw.match(/(\d+):([0-5]?\d)\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/i);
  if (colonPoint) {
    return {
      kind: 'pace',
      unit,
      value_s: parseInt(colonPoint[1]!, 10) * 60 + parseInt(colonPoint[2]!, 10),
    };
  }
  return null;
}

/** A secondary PACE CAP: "(no más de 6'/km)" ⇒ slowest-allowed ceiling (max_s);
 *  "(no más rápido de 6'/km)" ⇒ fastest-allowed floor (min_s). Only fires when a
 *  cap PHRASE sits near a clock+unit pace. */
export function parsePaceCap(raw: string): PaceCap | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const clock = raw.match(/(\d+)\s*'\s*(?:(\d+)\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/i);
  if (!clock) return null;
  const seconds = parseInt(clock[1]!, 10) * 60 + (clock[2] ? parseInt(clock[2], 10) : 0);
  if (!(seconds > 0)) return null;
  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const faster = /no m[aá]s rapido|no bajar de|minimo|mas rapido que/.test(n);
  const slower = /no m[aá]s lento|no m[aá]s de|maximo|sin pasar de|no pasar de|no superar/.test(n);
  if (faster) return { unit, min_s: seconds };
  if (slower) return { unit, max_s: seconds };
  return null;
}
