// Rest scope + active rest readers for the importer (card 128 · hueco 2).
// Only the scopes that already have a stored field. Entre bloques / vueltas
// are recognized so we do not stuff them into `rest_s`.
//
// Admission of a CONSUMED rest line is the old `asGroupRest` gate, word for
// word: parseRest must succeed, and the line is either a pure rest or a rest
// cue whose leftover (after the old strip) is empty. A hungrier leftover or
// a clock-without-cue ("5' entre bloques", "2' de descanso …") used to eat
// lines the corpus already counted as work.
//
// Forms parseRest does not admit ("2' de descanso activo en Air bike") are
// annotated and EMITTED (consume: false) so the typed field lands without
// dropping coverage.

import { foldText, isPureRest, parseClockSeconds, parseRest, parseZoneTarget } from './dose';
import type { ActiveRest } from '../prescription/rest';
import type { Modality } from '../prescription/types';

export type StoredRestScope = 'sets' | 'rounds' | 'stations';

export interface GroupRest {
  seconds: number;
  /** Undefined = unscoped rest, the `rest_s` of today. */
  scope?: StoredRestScope;
  /** True when the line names bloques/vueltas and nothing we store. */
  unstored_scope?: boolean;
  active_rest?: ActiveRest;
  /**
   * True (default): swallow the line, same as the old asGroupRest.
   * False: apply the annotation to siblings and still emit the line.
   */
  consume: boolean;
}

const REST_CUE_RE = /\b(descanso|rest|recuperacion|recovery)\b/;
const SCOPE_RE = /entre\s+(series|rondas|estaciones|vueltas|bloques)|cada\s+estacion/i;

/** Leftover strip of the old asGroupRest. Do not widen the consume path. */
const OLD_REST_STRIP_RE =
  /\b(descanso|rest|recuperacion|recovery|entre|rondas?|series|activo|parado|soltando|en|ab|air|bike|bici|de)\b/g;

/** Extra words only for the annotate-and-emit path. */
const EXTRA_REST_STRIP_RE =
  /\b(descanso|rest|recuperacion|recovery|entre|rondas?|series|estaciones?|vueltas?|bloques?|cada|estacion|activo|parado|soltando|en|ab|air|bike|bici|de|zona|andando|caminando)\b/g;

export function parseStoredRestScope(line: string): StoredRestScope | undefined {
  const t = foldText(line);
  if (/entre\s+estaciones|cada\s+estacion/.test(t)) return 'stations';
  if (/entre\s+rondas/.test(t)) return 'rounds';
  if (/entre\s+series/.test(t)) return 'sets';
  return undefined;
}

/** «2' de descanso …» — parseRest exige la señal pegada al reloj («2' rest»). */
function clockThenRestCue(line: string): number | undefined {
  const t = foldText(line);
  const m = t.match(/(\d+\s*'\s*\d+\s*''|\d+\s*'{1,2})\s*(?:de\s+)?(?:descanso|rest|parado)\b/i);
  if (!m) return undefined;
  return parseClockSeconds(m[1]!);
}

function leftoverOld(line: string): string {
  return foldText(line)
    .replace(/\d+\s*'\s*\d+\s*''/g, ' ')
    .replace(/\d+\s*'{1,2}/g, ' ')
    .replace(/\d+\s*:\s*[0-5]?\d(?:\s*:\s*[0-5]?\d)?/g, ' ')
    .replace(/\d+\s*(?:horas?|min(?:utos?)?|segundos?|seg\.?|s)\b/g, ' ')
    .replace(OLD_REST_STRIP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function leftoverExtra(line: string): string {
  return foldText(line)
    .replace(/[,.;:·]/g, ' ')
    .replace(/\d+\s*'\s*\d+\s*''/g, ' ')
    .replace(/\d+\s*'{1,2}/g, ' ')
    .replace(/\d+\s*:\s*[0-5]?\d(?:\s*:\s*[0-5]?\d)?/g, ' ')
    .replace(/\d+\s*(?:horas?|min(?:utos?)?|segundos?|seg\.?|s)\b/g, ' ')
    .replace(/\b(?:zona|z)\s*\d+\b/g, ' ')
    .replace(EXTRA_REST_STRIP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseActiveRest(line: string, seconds: number): ActiveRest | undefined {
  const t = foldText(line);
  if (/\bparado\b/.test(t) && !/descanso\s+activo|soltando/.test(t)) return undefined;

  let modality: Modality | undefined;
  if (/\b(?:ab|air\s*bike|assault\s*bike|bici|bike)\b/.test(t)) modality = 'bike';
  else if (/\b(?:remo|row|rower)\b/.test(t)) modality = 'row';
  else if (/\bski/.test(t)) modality = 'ski';
  else if (/\b(?:andando|caminando|walking|trote|soltando)\b/.test(t)) modality = 'run';

  const zone = parseZoneTarget(line);
  const named =
    /descanso\s+activo|soltando|vuelta\s+caminando/.test(t) || modality !== undefined || zone !== undefined;
  if (!named) return undefined;

  const ar: ActiveRest = { measure: { kind: 'duration', seconds } };
  if (modality) ar.modality = modality;
  if (zone) ar.target = zone;
  return ar;
}

function annotate(line: string, seconds: number): Omit<GroupRest, 'consume'> {
  const scope = parseStoredRestScope(line);
  const unstored = /entre\s+(?:bloques|vueltas)/.test(foldText(line)) && scope === undefined;
  const active_rest = parseActiveRest(line, seconds);
  return {
    seconds,
    ...(scope ? { scope } : {}),
    ...(unstored ? { unstored_scope: true } : {}),
    ...(active_rest ? { active_rest } : {}),
  };
}

export function asScopedGroupRest(line: string): GroupRest | undefined {
  const rest = parseRest(line);
  const hasCue = REST_CUE_RE.test(foldText(line));
  if (rest !== undefined && (isPureRest(line) || (hasCue && leftoverOld(line) === ''))) {
    return { ...annotate(line, rest), consume: true };
  }

  const extra = clockThenRestCue(line);
  if (extra === undefined) return undefined;
  const hasScope = SCOPE_RE.test(line);
  if (!hasCue && !hasScope) return undefined;
  if (leftoverExtra(line) !== '') return undefined;
  return { ...annotate(line, extra), consume: false };
}
