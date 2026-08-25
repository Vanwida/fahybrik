// Diccionario de frases de carga del coach (card 130, pieza 4).
//
// «carga media», «ligera», «pesada» NO son un tipo de objetivo. Son palabras
// de ESE entrenador. Tiparlas dejaría el dato ambiguo para siempre. Se le
// pregunta UNA vez qué significan y se guardan como un patrón ya existente
// (porcentaje de competición, porcentaje de peso corporal, o kilos). La
// estación o la modalidad las aporta la línea al importar, no esta fila.
//
// Mapa vacío = no lo sé. El importador manda la línea a revisión. Nunca se
// inventa un kilo ni un porcentaje.

import type { Target } from '../prescription/types';
import type { HyroxStationSlug } from '../hyrox/stations';

export const PHRASE_MAPPING_KINDS = ['competition_percent', 'bodyweight_percent', 'kg'] as const;
export type PhraseMappingKind = (typeof PHRASE_MAPPING_KINDS)[number];

export const PHRASE_MAPPING_VALUE_MAX = 500;
export const PHRASE_MAPPING_PERCENT_MAX = 400;

export interface CoachPhraseMapping {
  phrase: string;
  phrase_key: string;
  as: PhraseMappingKind;
  value: number;
  value_max?: number;
}

export type PhraseDictionary = ReadonlyMap<string, CoachPhraseMapping>;

const DIACRITICS = /[̀-ͯ]/g;

export function phraseKeyFrom(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dictionaryFromRows(rows: readonly CoachPhraseMapping[]): PhraseDictionary {
  const map = new Map<string, CoachPhraseMapping>();
  for (const row of rows) map.set(row.phrase_key, row);
  return map;
}

export function lookupPhrase(dictionary: PhraseDictionary, raw: string): CoachPhraseMapping | null {
  return dictionary.get(phraseKeyFrom(raw)) ?? null;
}

/** Convierte el patrón guardado en un Target del modelo. La estación de
 *  competición NO se inventa: si hace falta y no viene, esto no responde. */
export function mappingToTarget(
  mapping: CoachPhraseMapping,
  station?: HyroxStationSlug,
): Target | null {
  const lo = mapping.value;
  const hi = mapping.value_max;
  if (mapping.as === 'kg') {
    if (hi !== undefined) return { kind: 'kg', min: lo, max: hi };
    return { kind: 'kg', value: lo };
  }
  if (mapping.as === 'bodyweight_percent') {
    return hi !== undefined
      ? { kind: 'relative', ref: { of: 'bodyweight' }, percent: lo, percent_max: hi }
      : { kind: 'relative', ref: { of: 'bodyweight' }, percent: lo };
  }
  if (!station) return null;
  return hi !== undefined
    ? { kind: 'relative', ref: { of: 'competition_load', station }, percent: lo, percent_max: hi }
    : { kind: 'relative', ref: { of: 'competition_load', station }, percent: lo };
}
