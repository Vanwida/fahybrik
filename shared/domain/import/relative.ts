// relative — the importer grammar for an objective written AGAINST a mark
// the athlete already has. Piece 1 owns the type. This file only READS the
// coach's words into that type. A number that is not in the text is not
// invented. A qualitative word («carga media») is never a kind: it looks up
// the coach's dictionary or the line goes to review.

import type { Target } from '../prescription/types';
import type { HyroxStationSlug } from '../hyrox/stations';
import type { ReferenceModality } from '../prescription/reference';
import {
  lookupPhrase,
  mappingToTarget,
  type PhraseDictionary,
} from '../coach/phrase-dictionary';
import { foldText } from './dose';

export type { PhraseDictionary };

export type RelativeRead =
  | { status: 'target'; target: Target }
  | { status: 'review'; reason: string }
  | { status: 'none' };

const QUALITATIVE_RE = /\bcarga\s+(media|ligera|pesada|reducida)\b/;

const STATION_CUES: ReadonlyArray<{ slug: HyroxStationSlug; re: RegExp }> = [
  { slug: 'hyrox-sled-push', re: /\bsled\s*push\b|\btrineo\s+(?:push|empuje)\b/ },
  { slug: 'hyrox-sled-pull', re: /\bsled\s*pull\b|\btrineo\s+(?:pull|tiron)\b/ },
  { slug: 'hyrox-wall-balls', re: /\bwall\s*balls?\b|\bwallballs\b/ },
  { slug: 'hyrox-farmer-carry', re: /\bfarmers?\b/ },
  { slug: 'hyrox-sandbag-lunges', re: /\bsandbag\b/ },
];

const PACE_MODALITY_CUES: ReadonlyArray<{ modality: ReferenceModality; re: RegExp }> = [
  { modality: 'row', re: /\b(row|rowing|remo)\b/ },
  { modality: 'ski', re: /\b(skierg|ski-erg|ski)\b/ },
  { modality: 'bike', re: /\b(bike|airbike|ab|bici|bicicleta)\b/ },
  { modality: 'run', re: /\b(run|carrera|correr|cinta|treadmill)\b/ },
];

const DE_MODALITY: Record<string, ReferenceModality> = {
  ski: 'ski',
  skierg: 'ski',
  row: 'row',
  remo: 'row',
  rowing: 'row',
  carrera: 'run',
  run: 'run',
  bike: 'bike',
  bici: 'bike',
};

function parseNum(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function band(lo: number, hiRaw: string | undefined): { lo: number; hi?: number } {
  if (hiRaw === undefined) return { lo };
  const hi = parseNum(hiRaw);
  return hi > lo ? { lo, hi } : { lo };
}

export function stationSlugFromLine(raw: string): HyroxStationSlug | null {
  const folded = foldText(raw);
  const hits = new Set<HyroxStationSlug>();
  for (const cue of STATION_CUES) {
    if (cue.re.test(folded)) hits.add(cue.slug);
  }
  if (hits.size === 1) return [...hits][0]!;
  return null;
}

export function paceModalityFromLine(
  raw: string,
  hint?: string,
  deClause?: string,
): ReferenceModality {
  const fromDe = deClause ? DE_MODALITY[foldText(deClause)] : undefined;
  if (fromDe) return fromDe;
  if (hint === 'run' || hint === 'row' || hint === 'ski' || hint === 'bike') return hint;
  const folded = foldText(raw);
  for (const cue of PACE_MODALITY_CUES) {
    if (cue.re.test(folded)) return cue.modality;
  }
  return 'run';
}

function needStation(station: HyroxStationSlug | undefined): RelativeRead | null {
  if (station) return null;
  return {
    status: 'review',
    reason: 'peso de competición sin estación en la línea: no se adivina cuál es',
  };
}

function competitionTarget(
  station: HyroxStationSlug | undefined,
  extra: Omit<Extract<Target, { kind: 'relative' }>, 'kind' | 'ref'>,
): RelativeRead {
  const missing = needStation(station);
  if (missing) return missing;
  return {
    status: 'target',
    target: { kind: 'relative', ref: { of: 'competition_load', station: station! }, ...extra },
  };
}

/** Reads a relative (or dictionary-translated) objective from the line. */
export function parseRelativeTarget(
  raw: string,
  ctx: {
    dictionary?: PhraseDictionary;
    station?: HyroxStationSlug | null;
    modality?: string;
  } = {},
): RelativeRead {
  const folded = foldText(raw);
  const station = ctx.station ?? stationSlugFromLine(raw) ?? undefined;

  if (
    /por\s+(encima|debajo)\s+(?:del?\s+)?peso\s+de\s+(?:competicion|carrera)/.test(folded) &&
    !/\d+(?:[.,]\d+)?\s*(?:[-–—]\s*\d+(?:[.,]\d+)?)?\s*kg\s+por\s+(encima|debajo)/.test(folded)
  ) {
    return {
      status: 'review',
      reason: '«por encima» o «por debajo» sin los kilos escritos: no se inventa el delta',
    };
  }

  const bw = folded.match(
    /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?)\s*)?%\s*(?:del?\s+)?(?:el\s+)?peso\s+corporal/,
  );
  if (bw) {
    const { lo, hi } = band(parseNum(bw[1]!), bw[2]);
    return {
      status: 'target',
      target:
        hi !== undefined
          ? { kind: 'relative', ref: { of: 'bodyweight' }, percent: lo, percent_max: hi }
          : { kind: 'relative', ref: { of: 'bodyweight' }, percent: lo },
    };
  }

  const cp = folded.match(
    /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?)\s*)?%\s*(?:del?\s+)?(?:el\s+)?peso\s+de\s+(?:competicion|carrera)/,
  );
  if (cp) {
    const { lo, hi } = band(parseNum(cp[1]!), cp[2]);
    return competitionTarget(station, hi !== undefined ? { percent: lo, percent_max: hi } : { percent: lo });
  }

  const delta = folded.match(
    /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?))?\s*kg\s+por\s+(encima|debajo)/,
  );
  if (delta) {
    const { lo, hi } = band(parseNum(delta[1]!), delta[2]);
    const sign = delta[3] === 'debajo' ? -1 : 1;
    return competitionTarget(
      station,
      hi !== undefined
        ? { delta_kg: sign * lo, delta_kg_max: sign * hi }
        : { delta_kg: sign * lo },
    );
  }

  const race = folded.match(
    /(?:@\s*)?(?:a\s+)?(?:split\s+de\s+carrera|ritmo\s+de\s+carrera|race\s*pace(?:\s+(?:hyrox|objetivo))?|ritmo\s+hyrox(?:\s+de\s+(\w+))?)/,
  );
  if (race) {
    const modality = paceModalityFromLine(raw, ctx.modality, race[1]);
    return { status: 'target', target: { kind: 'relative', ref: { of: 'race_pace', modality } } };
  }

  const threshold = /(?:@\s*)?(?:al?\s+umbral|a\s+ritmo\s+de\s+umbral|a\s+threshold)\b/.test(folded);
  if (threshold) {
    const modality = paceModalityFromLine(raw, ctx.modality);
    return { status: 'target', target: { kind: 'relative', ref: { of: 'threshold_pace', modality } } };
  }

  if (/(?:a\s+)?peso\s+de\s+(?:competicion|carrera)/.test(folded)) {
    return competitionTarget(station, {});
  }

  const qual = folded.match(QUALITATIVE_RE);
  if (qual) {
    const key = `carga ${qual[1]}`;
    const mapped = ctx.dictionary ? lookupPhrase(ctx.dictionary, key) : null;
    if (!mapped) {
      return {
        status: 'review',
        reason: `«${key}» no está en el diccionario del entrenador: se pregunta una vez, no se inventa`,
      };
    }
    const target = mappingToTarget(mapped, station);
    if (!target) {
      return {
        status: 'review',
        reason: `«${key}» apunta al peso de competición y la línea no nombra la estación`,
      };
    }
    return { status: 'target', target };
  }

  return { status: 'none' };
}

const STRIP_RES: readonly RegExp[] = [
  /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?)\s*)?%\s*(?:del?\s+)?(?:el\s+)?peso\s+corporal/gi,
  /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?)\s*)?%\s*(?:del?\s+)?(?:el\s+)?peso\s+de\s+(?:competicion|carrera)/gi,
  /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?))?\s*kg\s+por\s+(encima|debajo)(?:\s+(?:del?\s+)?peso\s+de\s+(?:competicion|carrera))?/gi,
  /(?:@\s*)?(?:a\s+)?(?:split\s+de\s+carrera|ritmo\s+de\s+carrera|race\s*pace(?:\s+(?:hyrox|objetivo))?|ritmo\s+hyrox(?:\s+de\s+\w+)?)/gi,
  /(?:@\s*)?(?:al?\s+umbral|a\s+ritmo\s+de\s+umbral|a\s+threshold)\b/gi,
  /(?:a\s+)?peso\s+de\s+(?:competicion|carrera)/gi,
  /\bcarga\s+(?:media|ligera|pesada|reducida)\b/gi,
  /por\s+(?:encima|debajo)\s+(?:del?\s+)?peso\s+de\s+(?:competicion|carrera)/gi,
];

/** Removes every phrase this module can read so other detectors (HYROX-as-WOD,
 *  a leftover kg range) do not see them as something else. */
export function stripRelativePhrases(raw: string): string {
  let out = raw;
  for (const re of STRIP_RES) out = out.replace(re, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

function isReplaceableLoad(t: Target | undefined): boolean {
  return t === undefined || t.kind === 'percent_rm' || t.kind === 'kg';
}

function assignRelative(p: { target?: Target; sets?: Array<{ target?: Target }> }, t: Target): void {
  if (p.sets?.length && p.sets.some((s) => s.target !== undefined)) {
    p.sets = p.sets.map((s) => (isReplaceableLoad(s.target) ? { ...s, target: t } : s));
    if (isReplaceableLoad(p.target)) p.target = t;
    return;
  }
  p.target = t;
}

/** Apply a relative read onto a prescription already typed for its dose.
 *  Replaces a kg/%1RM that was the SAME phrase misread, never a zone or RPE. */
export function absorbRelativeTarget<P extends { target?: Target; sets?: Array<{ target?: Target }>; modality?: string }>(
  prescription: P,
  raw: string,
  token: string,
  dictionary?: PhraseDictionary,
): P | { review: string } {
  const ctx: {
    dictionary?: PhraseDictionary;
    station?: HyroxStationSlug | null;
    modality?: string;
  } = {};
  if (dictionary) ctx.dictionary = dictionary;
  const station = stationSlugFromLine(`${token} ${raw}`);
  if (station) ctx.station = station;
  if (prescription.modality) ctx.modality = prescription.modality;
  const read = parseRelativeTarget(raw, ctx);
  if (read.status === 'none') return prescription;
  if (read.status === 'review') return { review: read.reason };
  const next: P = { ...prescription };
  if (prescription.sets) next.sets = prescription.sets.map((s) => ({ ...s }));
  assignRelative(next, read.target);
  return next;
}
