// Qué modalidad enseña la tarjeta de una sesión del plan: el color Y el rótulo.
//
// La modalidad la trae la sesión ya resuelta desde sus ejercicios (PlanSession
// .modality — mig 0053, la modalidad es intrínseca al ejercicio). Este módulo
// solo la viste: color del eje v2 + rótulo que lee el coach.
//
// La heurística por `templates.format` / título que había aquí NO era un detalle
// de color: su rótulo se pinta como TEXTO en la tarjeta de hoy, así que un
// fartlek de carrera (format `intervals`) se leía «Circuito». Sigue existiendo,
// pero como ÚLTIMO recurso — solo para sesiones sin ejercicios que leer.

import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import type { SessionModality } from '@/lib/dashboard/v2/editor-axes';

/** Rótulo de una sesión que combina varias modalidades (simulación HYROX, etc.). */
const MIXTA_LABEL = 'Mixta';

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

/** Último recurso: adivinar por formato/título cuando la sesión no tiene
 *  ejercicios de los que leer la modalidad. Por defecto circuito (el
 *  acondicionamiento más común en HYROX). */
function guessModality(input: { format?: string | null; title?: string | null }): V2Modality {
  const fmt = input.format?.toLowerCase().replace(/[\s-]+/g, '_') ?? '';
  if (fmt && FORMAT_MAP[fmt]) return FORMAT_MAP[fmt];
  const title = input.title ?? '';
  for (const [re, mod] of TITLE_HINTS) if (re.test(title)) return mod;
  return 'circuito';
}

export interface SessionModalityView {
  /** Eje de color v2. null en las mixtas: ningún color las representa. */
  slug: V2Modality | null;
  /** Rótulo para el coach («Carrera», «Ergómetro», «Mixta»…). */
  label: string;
}

/** Color del eje para un slug — neutro cuando ningún color representa la sesión
 *  (mixta). Una sola fuente para el borde, el punto y la barrita. */
export function modalityColor(slug: V2Modality | null): string {
  return slug ? `var(${MODALITY_META[slug].colorVar})` : 'var(--v2-border-strong)';
}

/** Color + rótulo de una sesión del plan. */
export function sessionModalityView(input: {
  modality?: SessionModality | null;
  format?: string | null;
  title?: string | null;
}): SessionModalityView {
  if (input.modality === 'mixta') return { slug: null, label: MIXTA_LABEL };
  const slug = input.modality ?? guessModality(input);
  return { slug, label: MODALITY_META[slug].label };
}
