// De un plan de sesión a lo que viaja por el cable: cabecera + blob base64.
//
// Une el resultado del constructor (`buildGarminPlan`) con el códec compacto
// (shared/domain/watch-plan/plan-compacto) y pone los datos que solo el servidor
// conoce: el deporte del FIT (dato del servidor, arreglo A4 del modelo), la
// huella y los límites de tamaño. PURO: sin base de datos.
//
// Los límites (6 KB y 200 pasos) los pone el reloj, no este módulo; una sesión
// que los pase NO se parte, se marca `demasiado_grande` y el reloj dice «Esta
// sesión va en la app».

import type { Entorno } from '@fahybrid/shared/domain/watch-plan';
import {
  ErrorPlanCompacto,
  MAX_PASOS,
  PRESUPUESTO_BYTES,
  aBase64,
  codificarSesion,
  completarPlan,
  metaPorDefecto,
} from '@fahybrid/shared/domain/watch-plan/plan-compacto';
import type { MotivoNoSoportada, ResultadoPlanGarmin } from './garmin-plan';

/** Perfil FIT: sport `running`. */
const FIT_SPORT_RUNNING = 1;
/** Perfil FIT: sub_sport genérico, cinta y pista. La calle va como genérico. */
const FIT_SUBSPORT_POR_ENTORNO: Record<Entorno, number> = { calle: 0, cinta: 1, pista: 4 };

export type MotivoSesion = MotivoNoSoportada | 'demasiado_grande' | 'no_codificable';

/** Una sesión en la respuesta del endpoint: `id` y `huella` FUERA del blob para no bajar lo que el reloj ya tiene. */
export interface SesionPlanGarmin {
  asignacion_id: number;
  fecha: string;
  /** Huella del plan (31 bits); `null` si la sesión no lleva plan. */
  huella: number | null;
  soportada: boolean;
  motivo?: MotivoSesion;
  /** El plan compacto en base64; ausente si `soportada` es false. */
  plan?: string;
}

const noSoportada = (asignacion_id: number, fecha: string, motivo: MotivoSesion): SesionPlanGarmin => ({
  asignacion_id,
  fecha,
  huella: null,
  soportada: false,
  motivo,
});

/** Codifica una sesión ya construida, o dice por qué el reloj no puede llevarla. */
export function sesionGarmin(asignacion_id: number, fecha: string, resultado: ResultadoPlanGarmin): SesionPlanGarmin {
  if (!resultado.soportada) return noSoportada(asignacion_id, fecha, resultado.motivo);
  const plan = completarPlan(resultado.plan);
  if (plan.pasos.length > MAX_PASOS) return noSoportada(asignacion_id, fecha, 'demasiado_grande');
  try {
    const meta = metaPorDefecto(plan, {
      asignacionId: asignacion_id,
      fitSport: FIT_SPORT_RUNNING,
      fitSubSport: FIT_SUBSPORT_POR_ENTORNO[resultado.entorno],
      entorno: resultado.entorno,
    });
    const bytes = codificarSesion(plan, meta);
    if (bytes.length > PRESUPUESTO_BYTES) return noSoportada(asignacion_id, fecha, 'demasiado_grande');
    return { asignacion_id, fecha, huella: meta.huella, soportada: true, plan: aBase64(bytes) };
  } catch (e) {
    // Un valor que el cable no admite (id fuera de 31 bits, cifra no entera): esa sesión va en la app, la semana entera no cae.
    if (e instanceof ErrorPlanCompacto) return noSoportada(asignacion_id, fecha, 'no_codificable');
    throw e;
  }
}
