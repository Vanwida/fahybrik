/**
 * Nombres LITERALES del macrociclo de 12 semanas (card 128 · hueco 4).
 *
 * 209 movimientos en el ciclo. 112 ya existían. 35 existen con otro nombre
 * (solo alias). 34 faltaban: la 0205 dio de alta 29 (una fila = un movimiento,
 * no una manera) y esta pieza añade hollow-rocks. El salto al cajón a una
 * pierna NO es fila nueva: el box jump ya existe.
 *
 * Las claves son tal como las escribió el coach. Sin raya. Sin inventar kilos.
 */

export type CycleNameCase = {
  term: string;
  slug: string;
  kind: 'exists' | 'alias' | 'alta';
};

/** Los 35 que solo necesitan alias, con el nombre del ciclo. */
export const CYCLE_ALIAS_ONLY: CycleNameCase[] = [
  { term: 'Air bike', slug: 'assault-bike', kind: 'alias' },
  { term: 'Dominada neutra', slug: 'pull-up', kind: 'alias' },
  { term: 'Peso muerto unilateral con DB', slug: 'single-leg-rdl', kind: 'alias' },
  { term: 'Sandbag walking lunge', slug: 'hyrox-sandbag-lunges', kind: 'alias' },
  { term: 'Band face pull', slug: 'face-pull', kind: 'alias' },
  { term: 'Paloff press', slug: 'pallof-press', kind: 'alias' },
  { term: 'Hands release push up', slug: 'push-up', kind: 'alias' },
  { term: 'Side bridge', slug: 'side-plank', kind: 'alias' },
  { term: 'Rodillas al pecho estrictas colgado', slug: 'hanging-knee-raise', kind: 'alias' },
  { term: 'Press militar arrodillado con mancuernas', slug: 'overhead-press', kind: 'alias' },
  { term: "KB marching farmer's walk", slug: 'hyrox-farmer-carry', kind: 'alias' },
  { term: 'KTB farmer hold', slug: 'hyrox-farmer-carry', kind: 'alias' },
  { term: 'Bodyweight walking lunge', slug: 'walking-lunge', kind: 'alias' },
  { term: 'Hip thrust bodyweight', slug: 'hip-thrust', kind: 'alias' },
  { term: 'KB goblet squat', slug: 'goblet-squat', kind: 'alias' },
  { term: 'Subida a cajon con 2KB', slug: 'box-step-up', kind: 'alias' },
  { term: '10+10 Step up al cajon', slug: 'box-step-up', kind: 'alias' },
  { term: 'Ab wheel de rodillas', slug: 'ab-wheel', kind: 'alias' },
  { term: 'Remo invertido con barra', slug: 'inverted-row', kind: 'alias' },
  { term: 'Remo bajo con barra, sin tocar el suelo entre reps', slug: 'barbell-row', kind: 'alias' },
  { term: 'Drop jump bajo desde banco', slug: 'depth-jump', kind: 'alias' },
  { term: 'Salto horizontal a dos piernas', slug: 'broad-jump', kind: 'alias' },
  { term: 'Alternate hang DB snatch', slug: 'dumbbell-snatch', kind: 'alias' },
  { term: 'Sit up wall ball shoot', slug: 'w6-sit-up-shoot', kind: 'alias' },
  { term: 'Wall acceleration - triple', slug: 'run-technique-drills', kind: 'alias' },
  { term: 'Skip uni', slug: 'run-technique-drills', kind: 'alias' },
  { term: 'andando', slug: 'walk', kind: 'alias' },
  { term: 'easy run', slug: 'run', kind: 'alias' },
  { term: 'Concept 2', slug: 'row', kind: 'alias' },
  { term: 'Lanzamiento de balon medicinal overhead', slug: 'medicine-ball-throw', kind: 'alias' },
  { term: 'Plancha con manos en fitball', slug: 'plank', kind: 'alias' },
  { term: 'Movilidad cadera 90-90 to lunge', slug: 'hip-90-90-stretch', kind: 'alias' },
  { term: 'Press banca agarre cerrado', slug: 'bench-press', kind: 'alias' },
  { term: 'Devil press unilateral', slug: 'devil-press', kind: 'alias' },
  { term: 'Burpees con salto', slug: 'hyrox-burpee-broad-jump', kind: 'alias' },
];

/** Redacciones del ciclo que resuelven a una fila que ya existía por nombre. */
export const CYCLE_EXISTING: CycleNameCase[] = [
  { term: 'Cat cow', slug: 'cat-cow', kind: 'exists' },
  { term: 'Dead bug', slug: 'w23-dead-bug', kind: 'exists' },
  { term: 'Bird dog', slug: 'bird-dog', kind: 'exists' },
  { term: 'Box jump', slug: 'box-jump', kind: 'exists' },
  { term: 'Wall balls', slug: 'hyrox-wall-balls', kind: 'exists' },
  { term: 'Farmer carry', slug: 'hyrox-farmer-carry', kind: 'exists' },
  { term: 'Sled push a peso de competicion', slug: 'hyrox-sled-push', kind: 'exists' },
  { term: 'Toes to bar', slug: 'toes-to-bar', kind: 'exists' },
  { term: 'Hollow hold', slug: 'hollow-hold', kind: 'exists' },
  { term: 'Puente de glúteo unilateral', slug: 'single-leg-glute-bridge', kind: 'exists' },
];

/** La alta que quedaba después de la 0205. */
export const CYCLE_ALTAS: CycleNameCase[] = [
  { term: 'Hollow rocks', slug: 'hollow-rocks', kind: 'alta' },
];

/** Maneras de aterrizar el box jump: alias, nunca fila nueva. */
export const BOX_JUMP_LANDING_ALIASES: CycleNameCase[] = [
  { term: 'Box jump unilateral aterrizando a una pierna', slug: 'box-jump', kind: 'alias' },
  { term: 'Salto a cajon bajo aterrizando a una pierna', slug: 'box-jump', kind: 'alias' },
];

export const CYCLE_RESOLVE_CASES: CycleNameCase[] = [
  ...CYCLE_ALIAS_ONLY,
  ...CYCLE_EXISTING,
  ...CYCLE_ALTAS,
  ...BOX_JUMP_LANDING_ALIASES,
];

export const FORBIDDEN_NEW_SLUGS = [
  'single-leg-box-jump',
  'box-jump-unilateral',
  'single-leg-box-jump-landing',
] as const;

export const CYCLE_ALIAS_ONLY_COUNT = 35;
export const CYCLE_ALTAS_THIS_PR = 1;
export const CYCLE_ALTAS_ALREADY_IN_0205 = 29;
