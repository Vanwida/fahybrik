// TRES SESIONES MÁS PARA EL EXAMEN — 511, 513 y 542 (asignaciones reales de los
// atletas 64 y 65, leídas de la base en SOLO LECTURA el 30-09).
//
//   511 · Fartlek 3′/3′ en cinta: drills 8′ · 10′ @Z2 · 2 × (3 × (3′ @Z4 / 3′ @Z2 trote) / 3′ @Z1 trote) · 8′ @Z2
//         (plantilla 716, atleta 64; «Todo seguido sin bajarse de la cinta, 1 % de inclinación»)
//   513 · Zona 2 sin impacto: SkiErg 2 × 2′ · Assault Bike 3 × 15′ · Row 2 × 2′, todo @Z2
//         (plantilla 718, atleta 64; los tres ergómetros por orden de posición)
//   542 · HYROX half-sim: 4 corridas de 500 m + 4 estaciones (plantilla 747, atleta 65, test de calibración)
//
// Qué NO dice la base, y aquí no se inventa:
//   · 542 no trae los nombres de las 4 estaciones, ni sus distancias, ni cargas:
//     solo «4 estaciones + 4 corridas de 500 m, a ritmo de carrera». Cada estación
//     es un paso sin nombre, abierto, que cierra el atleta.
//   · 511 lleva en su calentamiento una lista de 7 drills en texto libre que no
//     cabe en un `cue` (120): se queda fuera, con su nombre de catálogo.
//   · 513 no dice descansos entre series ni cuánto dura la «alternativa»: no se ponen.

import { REGLAS_AVISO_DEFECTO, type Medida, type Objetivo, type PasoBase, type PlanSesion, type ZonasCoach } from '../../kit-reloj';
import { carrera, circuito, type Circuito } from '../reloj-circuito/planes';

/** Las zonas de pulso del atleta: las mismas 5 zonas que el resto de planes del doble. */
const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

const porTiempo = (s: number, mide: Medida['mide'] = 'reloj'): Medida => ({ tipo: 'tiempo', prescrito: s, mide });
/** Una zona de pulso (`hr_zone` del coach): la escala es DATO, no se adivina. */
const zonaPpm = (z: number, avisa?: Objetivo['avisa']): Objetivo => ({ eje: 'zona', min: z, max: z, papel: 'principal', escala: 'ppm', avisa });
const inclinacion = (pct: number): Objetivo => ({ eje: 'inclinacion', min: pct, max: pct, papel: 'secundario' });

let cuenta = 0;
const paso = (p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase => ({ id: `n-${++cuenta}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p });
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

// Constantes de la plantilla 716 (dato del coach, no del kit).
const TANDAS_511 = 2;
const SERIES_POR_TANDA_511 = 3;
const TRABAJO_511_S = 180;
const RECUPERA_511_S = 180;
const ENTRE_TANDAS_511_S = 180;
const CALENTA_511_S = 600;
const VUELTA_511_S = 480;
const DRILLS_511_S = 480;
const INCLINACION_511_PCT = 1;
const CUE_511 = 'Todo seguido sin bajarse de la cinta, 1% de inclinacion.';

/** 511 · Fartlek 3′/3′ en cinta al 1 %. */
export function sesion511(): PlanSesion {
  const cinta = { entorno: 'cinta' as const };
  const pasos: PasoBase[] = [
    paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', nombre: 'Run Technique Drills', medida: porTiempo(DRILLS_511_S), bloque: 0 }),
    paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(CALENTA_511_S), objetivos: [zonaPpm(2, 'solo-arriba')], cue: CUE_511, ...cinta, bloque: 1 }),
  ];
  for (let t = 1; t <= TANDAS_511; t++) {
    for (let k = 1; k <= SERIES_POR_TANDA_511; k++) {
      pasos.push(paso({ clase: 'fartlek', rol: 'trabajo', medida: porTiempo(TRABAJO_511_S), objetivos: [zonaPpm(4), inclinacion(INCLINACION_511_PCT)], posicion: { tanda: { n: t, de: TANDAS_511 }, serie: { n: k, de: SERIES_POR_TANDA_511 } }, ...cinta, bloque: 1 }));
      pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', medida: porTiempo(RECUPERA_511_S), modoRecupera: 'trote', objetivos: [zonaPpm(2, 'solo-arriba')], ...cinta, bloque: 1 }));
    }
    pasos.push(paso({ clase: 'descanso-tandas', rol: 'recuperacion', medida: porTiempo(ENTRE_TANDAS_511_S), modoRecupera: 'trote', objetivos: [zonaPpm(1, 'solo-arriba')], ...cinta, bloque: 1 }));
  }
  pasos.push(paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(VUELTA_511_S), objetivos: [zonaPpm(2, 'solo-arriba')], ...cinta, bloque: 1 }));
  return plan(pasos);
}

// Constantes de la plantilla 718.
const ZONA_513 = 2;
const CUE_BICI_513 = 'AB o Concept 2';
const CUE_REMO_513 = "Alternativa: 75-85' de bici en Zona 2";

/** 513 · Zona 2 sin impacto: tres ergómetros a Z2, cada uno en series de tiempo. */
export function sesion513(): PlanSesion {
  const ergos: Array<{ nombre: string; maquina: NonNullable<PasoBase['maquina']>; series: number; s: number; mide: Medida['mide']; cue?: string }> = [
    { nombre: 'SkiErg', maquina: { tipo: 'ski' }, series: 2, s: 120, mide: 'ergo' },
    { nombre: 'Assault Bike', maquina: { tipo: 'bici' }, series: 3, s: 900, mide: 'reloj', cue: CUE_BICI_513 },
    { nombre: 'Row', maquina: { tipo: 'remo' }, series: 2, s: 120, mide: 'ergo', cue: CUE_REMO_513 },
  ];
  const pasos = ergos.flatMap((e) =>
    Array.from({ length: e.series }, (_, k) =>
      paso({ clase: 'ergo', rol: 'trabajo', nombre: e.nombre, maquina: e.maquina, medida: porTiempo(e.s, e.mide), objetivos: [zonaPpm(ZONA_513)], posicion: { serie: { n: k + 1, de: e.series } }, ...(e.cue && k === 0 ? { cue: e.cue } : {}), bloque: 0 }),
    ),
  );
  return plan(pasos);
}

// Constantes de la plantilla 747 (dato del coach: «4 estaciones + 4 corridas de 500 m»).
const RONDAS_542 = 4;
const CORRIDA_542_M = 500;

/** 542 · HYROX half-sim: 4 × (Run 500 m + estación). Las estaciones no vienen nombradas en la base. */
export function sesion542(): Circuito {
  const pasos: PasoBase[] = [];
  for (let r = 1; r <= RONDAS_542; r++) {
    const ronda = { n: r, de: RONDAS_542 };
    pasos.push(carrera(CORRIDA_542_M, { ronda }, [], 0));
    pasos.push(paso({ clase: 'estacion', rol: 'trabajo', medida: { tipo: 'abierta', prescrito: null, mide: 'atleta' }, cierre: 'atleta', posicion: { ronda, estacion: { n: r, de: RONDAS_542 } }, bloque: 0 }));
  }
  return circuito(pasos, { formato: 'hyrox', inicio: 0, cap: null, roxzone: false });
}
