// Maps a plan session's `format`/title into a V2Modality so its card carries the
// correct modality left-border color (the categorical training-modality axis).
// The plan loader returns a `format` (template.format) + a title; neither is a
// clean modality enum, so we infer heuristically. Used only for the COLOR signal
// — every card also carries the real text, so a miss degrades to neutral, never
// misinforms. Single source for both the Plan and Histórico tabs.

import type { V2Modality } from '@/components/v2/constants';

const FORMAT_MAP: Record<string, V2Modality> = {
  amrap: 'circuito',
  emom: 'circuito',
  for_time: 'circuito',
  intervals: 'circuito',
  rounds: 'circuito',
  strength: 'fuerza',
  running: 'carrera',
  row: 'ergo',
  ergo: 'ergo',
  warmup: 'calentamiento',
  mobility: 'calentamiento',
};

const TITLE_HINTS: Array<[RegExp, V2Modality]> = [
  [/calent|movil|warm|estir/i, 'calentamiento'],
  [/remo|row|ski|bike|ergo|asalto|airbike/i, 'ergo'],
  [/fuerza|squat|sentadilla|peso muerto|press|strength|gym/i, 'fuerza'],
  [/corr|run|tirada|series|km|rodaje|carrera/i, 'carrera'],
  [/amrap|emom|metcon|wod|circuito|hyrox|for time/i, 'circuito'],
];

/** Best-effort modality for a plan session. Defaults to circuito (the most
 *  common HYROX conditioning block) when nothing matches. */
export function sessionModality(input: {
  format?: string | null;
  title?: string | null;
}): V2Modality {
  const fmt = input.format?.toLowerCase().replace(/[\s-]+/g, '_') ?? '';
  if (fmt && FORMAT_MAP[fmt]) return FORMAT_MAP[fmt];
  const title = input.title ?? '';
  for (const [re, mod] of TITLE_HINTS) if (re.test(title)) return mod;
  return 'circuito';
}
