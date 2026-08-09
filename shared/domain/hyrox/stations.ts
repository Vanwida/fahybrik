// HYROX stations — the single source of truth for the 8 official race
// stations: their order, real exercises.slug, race-day work measure, and the
// load standard per (division, gender).
//
// WHY THIS EXISTS (DRY)
// ---------------------
// The 8 official distances used to be hand-typed independently in
// `shared/domain/coach/test-catalog.ts`'s `estaciones` test family (and
// restated again in that file's header comment). A rulebook revision meant
// hunting every copy by hand, and nothing forced them to agree. This module is
// now that owner; `test-catalog.ts` consumes it (see its `estacionMetros` /
// `estacionReps` helpers) instead of retyping numbers.
//
// NOT wired here (found during this pass, flagged rather than silently
// touched — out of scope for what was asked): `web/lib/dashboard/v2/
// hyrox-template.ts` (the race-simulation block builder) and `web/lib/
// templates/station-defaults.ts` (the editor's station pre-fill) each carry
// their OWN independent copy of these distances/loads — the former matches
// this module's numbers exactly, the latter has drifted (single load per
// station, no Open/Pro split, and its wall-ball default of 9 kg is actually
// the PRO figure sitting where an Open default is expected). Neither is
// touched by this change; wiring them to this module is a follow-up.
//
// GROUND TRUTH — este fichero NO lleva cargas, y es a propósito.
// ---------------------------------------------------------------------------
// Las DISTANCIAS/repeticiones de abajo sí tienen fuente: son el rulebook 26/27
// citado en `shared/domain/coach/test-catalog.ts`, que llegó al repo por su
// cuenta y antes que este módulo.
//
// Las CARGAS (kg de trineo, kg de farmers, kg de sandbag, kg de wall ball,
// damper de los ergos) estuvieron aquí un rato con números concretos, y se han
// retirado: venían de un documento que el usuario describió explícitamente como
// «uno que me ha hecho la IA» y que había pasado como plan de ejemplo. Un
// ejemplo sirve para ROMPER el modelo, nunca para poblarlo — y salida de un
// modelo de lenguaje no es una fuente por mucho que el propio documento cite
// webs por dentro. Un peso inventado aquí es un atleta entrenando mal.
//
// `hyroxStationLoad()` devuelve `null` para todo mientras esto siga vacío, que
// es la respuesta honesta: «no lo sabemos». La FORMA sí está modelada y
// probada (single / per_implement / sled / damper, por división y género), así
// que rellenar esto cuando llegue el rulebook oficial es escribir datos, no
// rediseñar nada.
//
// PARA RELLENARLO hace falta una fuente citable: el rulebook oficial de HYROX
// de la temporada, o el usuario diciendo el número como dato suyo. Y hace falta
// entero, no solo la mitad: masculino Y femenino, open/pro/elite, singles y
// doubles/relay, y los tramos de edad.

export const HYROX_RULEBOOK_SEASON = '26/27' as const;
//
// TODO — cells with no source yet. Never fill one with a guess or a fallback
// to the men's number; add a row only when a cited source lands.
//   - Open/Pro WOMEN loads for every loaded station (sled push/pull, farmers
//     carry, sandbag lunges, wall balls).
//   - The 'elite' division, any station, any gender.
//   - doubles / relay formats (measure AND load — may differ from singles,
//     unconfirmed either way).
//   - age-group brackets.
//   - Wall ball target height by gender — not modelled at all here (it isn't
//     a load), would belong on the exercise's technique data if ever sourced.

import type { Measure, Modality } from '../prescription/types';
import type { RaceDivision, RaceGender } from '../../schema/races';

// ── Identity ──────────────────────────────────────────────────────────────
// The 8 catalog slugs already seeded in `exercises`, verified live by
// `web/lib/athlete/station-detail.ts`'s STATION_CATALOGUE — mirrored here,
// not re-derived, so the two can never silently disagree. Don't invent a 9th
// value and don't rename an existing one (real DB rows depend on these).
export type HyroxStationSlug =
  | 'ski-erg'
  | 'hyrox-sled-push'
  | 'hyrox-sled-pull'
  | 'hyrox-burpee-broad-jump'
  | 'row'
  | 'hyrox-farmer-carry'
  | 'hyrox-sandbag-lunges'
  | 'hyrox-wall-balls';

export const HYROX_STATION_COUNT = 8 as const;

// ── Load ──────────────────────────────────────────────────────────────────
// A station's load is not one number — it's one of four different physical
// things, and flattening them to a scalar would misrepresent the station:
//   - single         one implement, its own weight (sandbag, wall ball).
//   - per_implement  TWO implements, each this weight (farmers carry: the
//                    athlete carries 2×24 kg — `implements` says how many,
//                    `kg` is EACH one's weight; never pre-multiplied).
//   - sled           the TOTAL mass pushed/pulled (sled body + added plates
//                    combined into the single number the rulebook quotes).
//   - damper         an erg's resistance dial — not a mass at all.
export type HyroxStationLoad =
  | { kind: 'single'; kg: number }
  | { kind: 'per_implement'; kg: number; implements: number }
  | { kind: 'sled'; kg: number }
  | { kind: 'damper'; setting: number };

// One (division, gender) load fact. `gender: 'any'` marks a load the source
// states ONCE per division with no gender split — today only the erg damper
// (a resistance-curve setting, not a body-relative load). It answers for
// whichever gender is queried because the source itself never split it, which
// is a different (honest) thing from assuming men's number covers women's.
interface HyroxLoadEntry {
  division: RaceDivision;
  gender: RaceGender | 'any';
  load: HyroxStationLoad;
}

// ── Station ───────────────────────────────────────────────────────────────
export interface HyroxStation {
  /** Official race order, 1..8 (SkiErg first, Wall Balls last). */
  order: number;
  /** The real `exercises.slug` — resolve with this, never a display string. */
  slug: HyroxStationSlug;
  /** Canonical brand-form display name. English on purpose: HYROX station
   *  names are used as-is by Spanish-speaking coaches too — there is no house
   *  translation ("Sled Push", not "Empuje de trineo"). */
  label: string;
  /** Intrinsic to the exercise (locked — migration 0053), never a free
   *  choice by whatever tests or programs the station. */
  modality: Modality;
  /** The race-day work: distance in meters, or wall balls' fixed rep count.
   *  Division/gender-INVARIANT — the rulebook varies how LOADED a station is,
   *  never how MUCH work it is. */
  measure: Measure;
  /** Lowercased, accent-stripped free-text forms this station is known by
   *  (import text, coach shorthand) — matched by `resolveHyroxStationByToken`
   *  after the same normalization. */
  aliases: readonly string[];
  /** Per (division, gender) load facts. Entirely ABSENT for a bodyweight
   *  station (Burpee Broad Jump) — there is no load axis to be missing FROM,
   *  which is a different thing than a cell with no source (see
   *  `hyroxStationLoad`). */
  loads?: readonly HyroxLoadEntry[];
}

// ── Data ──────────────────────────────────────────────────────────────────
export const HYROX_STATIONS: readonly HyroxStation[] = [
  {
    order: 1,
    slug: 'ski-erg',
    label: 'SkiErg',
    modality: 'ski',
    measure: { kind: 'distance', meters: 1000 },
    aliases: ['ski', 'skierg', 'ski erg', 'skierg 1000m', 'skierg 1km'],
    loads: [],
  },
  {
    order: 2,
    slug: 'hyrox-sled-push',
    label: 'Sled Push',
    modality: 'functional',
    measure: { kind: 'distance', meters: 50 }, // 4 × 12.5 m lengths
    aliases: ['sled push', 'hyrox sled push', 'sled push 50m'],
    loads: [],
  },
  {
    order: 3,
    slug: 'hyrox-sled-pull',
    label: 'Sled Pull',
    modality: 'functional',
    measure: { kind: 'distance', meters: 50 }, // 4 × 12.5 m lengths
    aliases: ['sled pull', 'hyrox sled pull', 'sled pull 50m'],
    loads: [],
  },
  {
    order: 4,
    slug: 'hyrox-burpee-broad-jump',
    label: 'Burpee Broad Jump',
    modality: 'functional',
    measure: { kind: 'distance', meters: 80 },
    aliases: [
      'burpee broad jump',
      'burpee broad jumps',
      'burpees broad jump',
      'burpee bj',
      'bbj',
      'burpee broad jump 80m',
    ],
    // No `loads`: bodyweight movement, nothing to load.
  },
  {
    order: 5,
    slug: 'row',
    label: 'Row',
    modality: 'row',
    measure: { kind: 'distance', meters: 1000 },
    aliases: ['row', 'rowing', 'remo', 'row 1km', 'row 1000m', 'rowing 1km'],
    loads: [],
  },
  {
    order: 6,
    slug: 'hyrox-farmer-carry',
    label: 'Farmers Carry',
    modality: 'functional',
    measure: { kind: 'distance', meters: 200 },
    aliases: ['farmers carry', 'farmer carry', 'farmers', 'farmer', 'farmers carry 200m'],
    loads: [],
  },
  {
    order: 7,
    slug: 'hyrox-sandbag-lunges',
    label: 'Sandbag Lunges',
    modality: 'functional',
    measure: { kind: 'distance', meters: 100 },
    aliases: ['sandbag lunges', 'sandbag lunge', 'lunges', 'sb lunge', 'sandbag lunges 100m'],
    loads: [],
  },
  {
    order: 8,
    slug: 'hyrox-wall-balls',
    label: 'Wall Balls',
    modality: 'functional',
    measure: { kind: 'reps', value: 100 },
    aliases: ['wall balls', 'wall ball', 'wallballs', 'wb', 'wall balls 100'],
    loads: [],
  },
];

// ── Resolution ────────────────────────────────────────────────────────────

/** Exact match against the real catalog slug. Case-sensitive (slugs are
 *  always lowercase-kebab already) — for raw import text, use
 *  `resolveHyroxStationByToken` instead. */
export function resolveHyroxStationBySlug(slug: string): HyroxStation | null {
  return HYROX_STATIONS.find((s) => s.slug === slug) ?? null;
}

// Combining diacritical marks (U+0300–U+036F) — removed after NFD decomposition.
// Same pattern as `lib/import/exercise-resolve.ts`'s DIACRITICS.
const DIACRITICS = /[̀-ͯ]/g;

// Lowercase, strip accents, split "SledPush" → "Sled Push", collapse
// hyphens/underscores/whitespace to single spaces. The SAME normalization
// runs on the query and on every label/alias it's compared against, so
// neither side can silently drift out of sync with the other.
function normalizeToken(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tolerant free-text resolution: case/accent/spacing-insensitive, matches
 *  the canonical label or a known alias ("sled push", "SledPush", "WB",
 *  "Burpee BJ", "Lunges", "Farmers", …). Null for anything that isn't one of
 *  the 8 — a typo must never silently land on the wrong station. */
export function resolveHyroxStationByToken(token: string): HyroxStation | null {
  const norm = normalizeToken(token);
  if (!norm) return null;
  for (const station of HYROX_STATIONS) {
    if (normalizeToken(station.label) === norm) return station;
    if (station.aliases.some((a) => normalizeToken(a) === norm)) return station;
  }
  return null;
}

/** Convenience for a caller that doesn't know whether it's holding a real
 *  slug or raw text (e.g. the import grammar): tries the exact slug first,
 *  then falls back to tolerant token matching. */
export function resolveHyroxStation(input: string): HyroxStation | null {
  return resolveHyroxStationBySlug(input) ?? resolveHyroxStationByToken(input);
}

// ── Load lookup ───────────────────────────────────────────────────────────

/**
 * The load standard for a station at (division, gender) — or `null` when
 * there's no source for that exact cell. NEVER falls back to another
 * division or gender: an absent cell means "we don't know", not "assume
 * men's" — a made-up weight is an athlete training against the wrong number.
 */
export function hyroxStationLoad(
  slug: HyroxStationSlug,
  division: RaceDivision,
  gender: RaceGender,
): HyroxStationLoad | null {
  const station = resolveHyroxStationBySlug(slug);
  if (!station?.loads) return null;
  const hit = station.loads.find(
    (l) => l.division === division && (l.gender === gender || l.gender === 'any'),
  );
  return hit ? hit.load : null;
}
