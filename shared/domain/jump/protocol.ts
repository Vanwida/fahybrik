// Protocolo v1 del perfil de salto y cómo se decide la captura.
//
// El test SOLO existe si el coach lo programa (restore-defaults lo deja en su
// catálogo, week_offset null: no aterriza en semana 1). El atleta no se lo
// auto-asigna desde Marcas.

import type { StoreResultSpec } from '../../schema/test-battery';
import { BENCH_CMJ, BENCH_CMJ_LOADED } from '../coach/benchmark-slugs';
import { DEFAULT_JUMP_METHOD } from './method';

export const CMJ_PROFILE_SLUG = 'cmj_profile';

export type JumpCaptureMode = 'jump_video' | 'session';

export function isJumpVideoCapture(specs: readonly { measure: string }[]): boolean {
  return specs.some((s) => s.measure === 'height');
}

export function captureModeForSpecs(specs: readonly { measure: string }[]): JumpCaptureMode {
  return isJumpVideoCapture(specs) ? 'jump_video' : 'session';
}

export const CMJ_PROFILE_RESULTS: readonly StoreResultSpec[] = [
  { slug: BENCH_CMJ, unit: 'cm', measure: 'height', derives: 'none', label: 'CMJ' },
  {
    slug: BENCH_CMJ_LOADED,
    unit: 'cm',
    measure: 'height',
    derives: 'none',
    label: 'CMJ con carga',
    optional: true,
  },
];

/** Texto que viaja en `protocol` (backup). El atleta lee el briefing estructurado. */
export const CMJ_PROFILE_PROTOCOL = [
  'Esto no es un entreno: es una medición. Máxima intención en la subida, también con carga.',
  `Prepara un trípode o un apoyo estable — el teléfono no se sujeta con la mano — y ${DEFAULT_JUMP_METHOD.default_load.kind === 'kg' ? `${DEFAULT_JUMP_METHOD.default_load.kg} kg` : 'la carga que te indique tu coach'}.`,
  `${DEFAULT_JUMP_METHOD.attempts} saltos con las manos en la cadera. ${DEFAULT_JUMP_METHOD.attempts} más con la carga. ${DEFAULT_JUMP_METHOD.rest_s} s entre intentos.`,
  'Cuerpo entero en el cuadro. Misma postura al salir y al aterrizar. Los dos pies a la vez.',
].join(' ');
