// Rest scopes that already live in DB + iOS but were outside the shared
// prescription type (card 128 · hueco 2).
//
// Five scopes appear in the cycle. Two heights already exist (`rest_s` on
// the line and on the set). Two more were stored as circuit config / iOS
// keys and never entered this type:
//   rest_between_rounds_s     ← iOS `restBetweenRoundsS`, DB `rest_between_rounds_seconds`
//   rest_between_stations_s   ← DB/iOS `rest_between_stations_seconds`
//
// Entre bloques and entre vueltas have no stored field. They stay out.
// Do not invent a sixth scope.
//
// Active rest is rest that is also work: a measure, and a modality or
// target only when the coach wrote one. Not a silent `rest_s`. Not a
// fake working set. Not an invented "easy" load.

import type { Measure, Modality, Target } from './types';

export interface ActiveRest {
  measure: Measure;
  modality?: Modality;
  target?: Target;
}

export type RestAliasInput = {
  rest_between_rounds_s?: number;
  rest_between_rounds_seconds?: number;
  restBetweenRoundsS?: number;
  rest_between_stations_s?: number;
  rest_between_stations_seconds?: number;
};

/** Canonical names, lifting the DB and iOS aliases that already travel. */
export function liftRestAliases(raw: RestAliasInput): {
  rest_between_rounds_s?: number;
  rest_between_stations_s?: number;
} {
  const rounds =
    raw.rest_between_rounds_s ?? raw.rest_between_rounds_seconds ?? raw.restBetweenRoundsS;
  const stations = raw.rest_between_stations_s ?? raw.rest_between_stations_seconds;
  return {
    ...(typeof rounds === 'number' ? { rest_between_rounds_s: rounds } : {}),
    ...(typeof stations === 'number' ? { rest_between_stations_s: stations } : {}),
  };
}

export function stripRestAliases<T extends RestAliasInput>(raw: T): T {
  const out = { ...raw };
  delete out.rest_between_rounds_seconds;
  delete out.restBetweenRoundsS;
  delete out.rest_between_stations_seconds;
  return out;
}
