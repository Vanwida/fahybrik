// LOS PLANES PROPIOS DE «GARMIN · CORRER» — solo lo que la muñeca no tiene.
//
// Las sesiones reales (491, 494, 573, 479, 551, 509, 535, 538) y la 6 × 1000 m
// del modelo NO se copian: se importan de `reloj-correr/planes.ts`. Aquí vive
// únicamente la sesión de pista, que en la muñeca no era un escenario: un
// tempo continuo en la pista de atletismo, donde lo que el atleta mira es la
// vuelta de 400 m.
//
// Es ILUSTRATIVA, como la 6 × 1000 del modelo: no es de ningún atleta. El
// ritmo (4:05–4:15) es el de Z4 del atleta de prueba (`RITMO_ZONA` de
// `reloj-correr/casos.ts`), para que el cuerpo simulado la corra sin inventar
// otro. Los 400 m de la vuelta son `PasoBase.vueltaAutoM`, dato del plan (el
// coach de otra pista pondría 250 o 500): no hay ningún 400 en el reloj.
//
// Qué NO hacer: escribir aquí un número que sea método (holguras, preaviso):
// vienen de `REGLAS_AVISO_DEFECTO`, como en toda sesión.

import { REGLAS_AVISO_DEFECTO, type PasoBase } from '../../kit-reloj';
import { ZONAS, type PlanCorrer } from '../reloj-correr/planes';

/** La vuelta de una pista de atletismo, m. Dato del plan (`vueltaAutoM`), no del reloj. */
export const VUELTA_PISTA_M = 400;

/** 4:05–4:15 /km (min = el más rápido, como manda el modelo), en s/km. */
const RITMO_TEMPO_PISTA = { min: 245, max: 255 } as const;

/** Tempo de 4000 m a ritmo, en pista: 10 vueltas, cada una con su tarjeta. */
export function sesionPista(): PlanCorrer {
  const tempo: PasoBase = {
    id: 'pista-tempo',
    clase: 'tempo',
    rol: 'trabajo',
    fase: 'principal',
    medida: { tipo: 'distancia', prescrito: 4000, mide: 'gps' },
    objetivos: [{ eje: 'ritmo', min: RITMO_TEMPO_PISTA.min, max: RITMO_TEMPO_PISTA.max, papel: 'principal' }],
    entorno: 'pista',
    vueltaAutoM: VUELTA_PISTA_M,
    cierre: 'medida',
    bloque: 0,
  };
  return {
    plan: { pasos: [tempo], zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO },
    control: 'siguiente',
    estructura: (i) => [{ fase: 'principal', trabajo: tempo, estado: i > 0 ? 'hecho' : 'ahora' }],
  };
}
