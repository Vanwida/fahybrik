// LOS PLANES QUE LA MUÑECA NO TENÍA — dos, y se dice por qué existen.
//
//   tempoCinta       ILUSTRATIVO: un tempo de 20′ a 4:15–4:25 al 1 % en cinta.
//                    No hay ninguna sesión asignada con un tempo en cinta a
//                    ritmo; la 535 (real, `sesion535`) es a zona y por series.
//                    Sirve para enseñar las DOS caras de la cinta (§4 del
//                    modelo): conectada (manda su ritmo) y «lo dices tú».
//   libreSeisPorMil  El MISMO 6 × 1000 m a 3:45–3:55 · r 90″ trote que el caso
//                    ilustrativo del modelo (`seisPorMil`), montado por el
//                    atleta en el constructor de entrenos libres: sin bloques
//                    del coach ni cue. Un libre y uno del coach son el mismo
//                    objeto (I1): el vivo no sabe de dónde vino.
//
// Las sesiones reales (491, 494, 538, 551, 535 y el caso del modelo) se
// reutilizan tal cual de `screens/reloj-correr/planes.ts`.

import { REGLAS_AVISO_DEFECTO, type Medida, type Objetivo, type PasoBase, type PlanSesion } from '../../kit-reloj';
import { ZONAS } from '../reloj-correr/planes';

let seq = 0;
const id = (p: string) => `correr-${p}-${++seq}`;

const porTiempo = (s: number): Medida => ({ tipo: 'tiempo', prescrito: s, mide: 'reloj' });
const porMetros = (m: number): Medida => ({ tipo: 'distancia', prescrito: m, mide: 'gps' });
const ritmo = (min: number, max: number): Objetivo => ({ eje: 'ritmo', min, max, papel: 'principal' });
const inclinacion = (pct: number): Objetivo => ({ eje: 'inclinacion', min: pct, max: pct, papel: 'secundario' });

type Parcial = Omit<PasoBase, 'id' | 'cierre' | 'objetivos'> & { objetivos?: Objetivo[]; cierre?: PasoBase['cierre'] };
const paso = (p: Parcial): PasoBase => ({ id: id(p.clase), cierre: 'medida', objetivos: [], ...p });
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

/** Calentamiento 10′ · tempo 20′ a 4:15–4:25 al 1 % · vuelta a la calma 5′, todo en cinta. Ilustrativo. */
export function tempoCinta(): PlanSesion {
  return plan([
    paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(600), entorno: 'cinta', bloque: 0 }),
    paso({ clase: 'tempo', rol: 'trabajo', fase: 'principal', medida: porTiempo(1200), objetivos: [ritmo(255, 265), inclinacion(1)], entorno: 'cinta', bloque: 1 }),
    paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(300), entorno: 'cinta', bloque: 2 }),
  ]);
}

/** El índice del paso del tempo en `tempoCinta`. */
export const TEMPO_CINTA_I = 1;

/**
 * El 6 × 1000 m del atleta, montado en el constructor libre: calentamiento 15′,
 * las seis series con su trote de 90″ y 10′ de vuelta a la calma. Los mismos
 * pasos que `seisPorMil`; solo cambia quién los escribió.
 */
export function libreSeisPorMil(): PlanSesion {
  const pasos: PasoBase[] = [paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(900) })];
  for (let k = 1; k <= 6; k++) {
    pasos.push(paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porMetros(1000), objetivos: [ritmo(225, 235)], posicion: { serie: { n: k, de: 6 } } }));
    if (k < 6) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(90), modoRecupera: 'trote' }));
  }
  pasos.push(paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(600) }));
  return plan(pasos);
}
