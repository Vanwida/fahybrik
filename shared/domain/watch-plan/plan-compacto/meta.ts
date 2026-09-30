// LA CABECERA POR DEFECTO — lo que el servidor rellena al servir una sesión.
//
// Esto es el PROTOTIPO del constructor de servidor (`shared/domain/watch-plan/`,
// arreglo A1 del modelo): dado un plan del kit y los datos que solo el
// servidor conoce (id de asignación, deporte del FIT, bandas del atleta),
// hace dos cosas. `completarPlan` pone EN EL PLAN lo que el coach no tocó:
// sus valores por defecto de método (vocabulario, palabras del RPE, rangos de
// anotación, método del resumen), la procedencia de las zonas y las bandas de
// ritmo. `metaPorDefecto` rellena la cabecera. El reloj nunca ve un defecto:
// recibe el valor efectivo.
//
// Lo que se deriva de los pasos usa las funciones del kit (`duracionEstimada`),
// no una copia. Nada derivado en español viaja: la línea del brief la compone
// el reloj de los grupos (`PasoBase.grupo`).
//
// La huella (`huellaDePlan`) es FNV-1a de 32 bits sobre el plan canónico con
// las claves ordenadas, recortada a 31 bits. Es una implementación de
// referencia: al reloj le da igual cómo se calcule, solo la devuelve con el
// resultado para decir con qué versión del plan se hizo la sesión.
//
// QUÉ NO HACER: no meter aquí el mapa modalidad → deporte del FIT (es un dato
// del servidor, arreglo A4, y lo decide la prueba T1 en un reloj real).

import type { Entorno } from '../paso';
import { vocabularioDe, metodoDe, nombreDeClase, type Vocabulario } from '../metodo';
import { duracionEstimada } from '../duracion';
import type { PlanSesion } from '../plan';
import { canonico } from './canonico';
import { MAX_NUM, type Procedencia } from './formato';
import type { BandasRitmo, MetaSesion } from './tipos';

/** FNV-1a de 32 bits: desplazamiento y primo de la especificación. */
const FNV_DESPLAZAMIENTO = 0x811c9dc5;
const FNV_PRIMO = 0x01000193;

function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${estable((valor as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

/** La huella de una versión del plan: 31 bits, estable entre ejecuciones. */
export function huellaDePlan(plan: PlanSesion): number {
  let h = FNV_DESPLAZAMIENTO;
  for (const c of estable(canonico(plan))) {
    h = Math.imul(h ^ c.charCodeAt(0), FNV_PRIMO) >>> 0;
  }
  return h & MAX_NUM;
}

/** Los datos que solo el servidor conoce. Todo lo demás se deriva del plan. */
export interface DatosServidor {
  asignacionId: number;
  fitSport: number;
  fitSubSport: number;
  procedenciaPpm?: Procedencia;
  bandasRitmo?: BandasRitmo[];
  entorno?: Entorno | null;
}

/** El vocabulario efectivo del coach: el suyo donde lo cambió y sus defectos en el resto, recortado a las clases que usa la sesión. */
export function vocabularioPorDefecto(plan: PlanSesion): Vocabulario {
  const v = vocabularioDe(plan);
  const clases: Vocabulario['clases'] = {};
  for (const p of plan.pasos) clases[p.clase] = nombreDeClase(plan, p.clase);
  return { ...v, clases };
}

/** El entorno de la sesión si todos los pasos que lo dicen dicen el mismo; si no, `null`. */
function entornoComun(plan: PlanSesion): Entorno | null {
  const distintos = new Set(plan.pasos.map((p) => p.entorno).filter((e): e is Entorno => e !== undefined));
  return distintos.size === 1 ? [...distintos][0]! : null;
}

/**
 * El plan tal como se SIRVE al reloj: con el vocabulario, el método, la
 * procedencia de las zonas y las bandas de ritmo EFECTIVOS. Lo que el coach ya
 * puso en el plan se respeta; lo que no, se rellena con su valor por defecto.
 */
export function completarPlan(plan: PlanSesion, d: Pick<DatosServidor, 'procedenciaPpm' | 'bandasRitmo'> = {}): PlanSesion {
  const completo: PlanSesion = {
    ...plan,
    zonas: plan.zonas ? { ...plan.zonas, procedencia: plan.zonas.procedencia ?? d.procedenciaPpm ?? 'estimada' } : null,
    vocabulario: vocabularioPorDefecto(plan),
    metodo: metodoDe(plan),
  };
  const bandas = plan.bandasRitmo ?? d.bandasRitmo;
  if (bandas && bandas.length > 0) completo.bandasRitmo = bandas;
  return completo;
}

/** La cabecera de la sesión: lo que es de la sesión y no del plan. */
export function metaPorDefecto(plan: PlanSesion, d: DatosServidor): MetaSesion {
  return {
    asignacionId: d.asignacionId,
    huella: huellaDePlan(plan),
    fitSport: d.fitSport,
    fitSubSport: d.fitSubSport,
    entorno: d.entorno !== undefined ? d.entorno : entornoComun(plan),
    duracionEstS: Math.round(plan.pasos.reduce((suma, p) => suma + duracionEstimada(p), 0)),
  };
}
