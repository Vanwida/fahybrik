// LOS CASOS DE «GARMIN · AL TERMINAR» — cada escenario como una escena del flujo.
//
// Las sesiones y los resultados son los de «Muñeca · antes y después»
// (`reloj-antes-despues/sesiones.ts` y `resultados.ts`): la misma 6 × 1000 m, la
// 479, la tirada 494, la 529 de fuerza y los circuitos 493 y 482, con las mismas
// cifras: un resumen se lee igual en los dos relojes y, si aquí algo se ve
// distinto, es el lienzo, no el dato. Solo se escriben los que la muñeca no
// tenía: la sesión libre, la recuperada y la tirada cerrada a los 24′.
//
// El cuerpo y las cifras son deterministas: el mismo escenario, la misma
// sesión, segundo a segundo, para que lo que se juzga se pueda repetir.

import type { BotonGarmin } from '../../kit-garmin';
import type { InicioSecuencia, Vuelta } from '../../kit-reloj';
import { cuerpo } from '../reloj-correr/casos';
import type { KmHecho, Resultado } from '../reloj-antes-despues/calculo';
import { SERIES_6X1000, recortada, resultado479, resultado482, resultado493, resultado494, resultado529, resultado6x1000 } from '../reloj-antes-despues/resultados';
import { ZONAS, correrLibre, sesion479Brief, sesion482, sesion493, sesion494Brief, sesion529, sesionSeisPorMil } from '../reloj-antes-despues/sesiones';
import type { AcuseEnvio, Escena } from './escena';

/** Una cara que se enseña en los cuatro tamaños a la vez (la comparación). */
export type CaraComparada = 'fin-natural' | 'fin-parcial' | 'rpe' | 'resumen-correr' | 'envio-rechazado';

export interface CasoDespues {
  escena?: Escena;
  comparar?: CaraComparada;
}

/** El envío de una sesión que sale bien: sin móvil a mano al abrirse el resumen; a los pocos segundos lo hay y sube. */
const ENVIO_BUENO: AcuseEnvio[] = [
  { en: 2400, estado: 'enviando' },
  { en: 4200, estado: 'enviado' },
];

/** Las seis series del 6 × 1000 m como vueltas del motor. */
const vueltas6x1000 = (hasta: number): Vuelta[] =>
  SERIES_6X1000.slice(0, hasta).map(([segundos, ppm, veredicto], k) => ({ n: k + 1, clase: 'serie', segundos, metros: 1000, ritmo: segundos, ppm, veredicto, eje: 'ritmo' }));

const pulsar = (boton: BotonGarmin, desde: number, veces = 1, paso = 500) => Array.from({ length: veces }, (_, k) => ({ en: desde + k * paso, boton }));

// ---------------------------------------------------------------------------
// Las sesiones que la muñeca no tenía
// ---------------------------------------------------------------------------

/** Correr libre: 5,21 km en 31:14, sin objetivo, con su vuelta por km. */
export function resultadoLibre(): Resultado {
  const s = correrLibre('calle');
  const km: KmHecho[] = [
    [372, 7, 138], [366, 4, 143], [361, -3, 146], [359, 11, 149], [354, 6, 152], [59, 2, 156],
  ].map(([segundos, desnivel, ppm], k, todos) => {
    const ultimo = k === todos.length - 1;
    const metros = ultimo ? 210 : 1000;
    return { n: k + 1, clase: 'km', segundos: segundos!, metros, ritmo: segundos! / (metros / 1000), ppm: ppm!, veredicto: null, desnivel: desnivel! };
  });
  return {
    pasos: s.plan.pasos,
    zonas: ZONAS,
    i: 0,
    final: 'natural',
    series: [],
    t: 1874,
    metros: 5210,
    ppmMedio: 147,
    ppmMax: 168,
    desnivel: km.reduce((a, k) => a + Math.max(0, k.desnivel ?? 0), 0),
    zonasS: [180, 1300, 394, 0, 0],
    km,
    fuerza: [],
    circuito: [],
    roxzoneS: null,
    rpe: null,
    guardado: 'en-reloj',
    libreS: 0,
  };
}

/**
 * La 6 × 1000 m que se cortó a la mitad de la serie 4 (el reloj murió a los
 * 31:45): lo que el último punto guardado sabe. Nadie la terminó, se cortó.
 */
export function resultadoRecuperado(): Resultado {
  const base = resultado6x1000();
  return { ...recortada(base, 1905), i: 7, final: 'atleta', series: base.series.slice(0, 3), metros: 6420 };
}

/** La 6 × 1000 m terminada a mano en la serie 5 de 6 (con cuatro hechas): lo que sella «Terminar» tras «Guardar lo hecho». */
export function resultadoTerminado(): Resultado {
  const base = resultado6x1000();
  return { ...recortada(base, 2236), i: 9, final: 'atleta', series: base.series.slice(0, 4), metros: 7660 };
}

/** La tirada 494 (80′ a Z2, un solo paso) con sus cuatro primeros km, cerrada con BACK/LAP a los 24′. */
function tiradaCerradaA24(): Escena {
  const km = (n: number, segundos: number, ppm: number): Vuelta => ({ n, clase: 'km', segundos, metros: 1000, ritmo: segundos, ppm, veredicto: null });
  const inicio: InicioSecuencia = { i: 0, t: 1432, metros: 4890, sesionT: 1432, sesionM: 4890, vueltas: [km(1, 296, 139), km(2, 293, 141), km(3, 291, 141), km(4, 295, 143)], ppmMedio: 141 };
  return {
    sesion: sesion494Brief(),
    // Lo corrido antes de que arranque el escenario (las zonas de esos 24′), como en el resto de escenarios con la sesión avanzada.
    base: { ...recortada(resultado494(), 1435), desnivel: null },
    arranque: { en: 'vivo', inicio, sim: cuerpo({ partida: { i: 0, t: inicio.t! }, ppmDesde: 141 }) },
    // A los 3 s, BACK/LAP: cierra el único paso de la sesión, que a los 24′ de 80′ es el final natural.
    guiones: { vivo: pulsar('back', 3000) },
    envio: { acuses: ENVIO_BUENO },
  };
}

// ---------------------------------------------------------------------------
// El mapa escenario → caso
// ---------------------------------------------------------------------------

const CASOS: Record<string, () => CasoDespues> = {
  'final-natural': () => {
    const s = sesionSeisPorMil();
    // Los últimos 10 s de la vuelta a la calma: el motor cierra el último paso y suena «sesión hecha».
    const inicio: InicioSecuencia = { i: s.plan.pasos.length - 1, t: 590, sesionT: 3308, sesionM: 11598, vueltas: vueltas6x1000(6), ppmMedio: 152 };
    return { escena: { sesion: s, base: resultado6x1000(), arranque: { en: 'vivo', inicio, sim: cuerpo({ partida: { i: inicio.i, t: 590 } }) }, envio: { acuses: ENVIO_BUENO } } };
  },
  'final-parcial': () => {
    const s = sesionSeisPorMil();
    const inicio: InicioSecuencia = { i: 9, t: 70, metros: 300, sesionT: 2236, sesionM: 7660, vueltas: vueltas6x1000(4), ppmMedio: 150 };
    return {
      escena: {
        sesion: s,
        base: recortada(resultado6x1000(), 2236),
        arranque: { en: 'vivo', inicio, sim: cuerpo({ partida: { i: 9, t: 70 }, ppmDesde: 150 }) },
        inicialVivo: { controles: true },
        // Controles → Pausa, Saltar paso, Cambiar entorno, TERMINAR (↓↓↓), START, y «Guardar lo hecho» (START).
        guiones: { vivo: [...pulsar('down', 1200, 3), ...pulsar('start', 3000), ...pulsar('start', 4300)] },
        envio: { acuses: ENVIO_BUENO },
      },
    };
  },
  'final-libre': () => ({ escena: { sesion: correrLibre('calle'), arranque: { en: 'fin', r: resultadoLibre() }, envio: { acuses: ENVIO_BUENO } } }),
  'seguir-quieto': () => ({
    escena: {
      sesion: sesionSeisPorMil(),
      // Trota 6 s tras «Seguir» y se para: sin GPS que avance, nada se mueve.
      arranque: { en: 'seguir', r: resultado6x1000(), sim: cuerpo({ ppmDesde: 150, ritmo: (_p, _i, t) => (t < 6 ? 400 : null) }) },
      compresion: 50,
      envio: { acuses: ENVIO_BUENO },
    },
  }),
  recuperada: () => ({ escena: { sesion: sesionSeisPorMil(), arranque: { en: 'fin', r: resultadoRecuperado(), natural: false, recuperada: true }, envio: { acuses: ENVIO_BUENO } } }),
  'hueco-tirada': () => ({ escena: tiradaCerradaA24() }),
  rpe: () => ({ escena: { sesion: sesionSeisPorMil(), arranque: { en: 'rpe', r: resultado6x1000() }, guiones: { rpe: pulsar('up', 1200, 7, 330) }, envio: { acuses: ENVIO_BUENO } } }),
  'rpe-omitido': () => ({
    escena: {
      sesion: sesionSeisPorMil(),
      arranque: { en: 'rpe', r: resultado6x1000() },
      // Salta el RPE (BACK) y, ya en el resumen, UP salta a la última página: «Sin RPE».
      guiones: { rpe: pulsar('back', 1500), resumen: pulsar('up', 1200) },
      envio: { acuses: ENVIO_BUENO },
    },
  }),
  'resumen-479': () => ({ escena: { sesion: sesion479Brief(), arranque: { en: 'resumen', r: { ...resultado479(), rpe: 8 } }, envio: { acuses: ENVIO_BUENO } } }),
  'resumen-494': () => ({ escena: { sesion: sesion494Brief(), arranque: { en: 'resumen', r: { ...resultado494(), rpe: 5 } }, envio: { acuses: ENVIO_BUENO } } }),
  'resumen-529': () => ({ escena: { sesion: sesion529(), arranque: { en: 'resumen', r: { ...resultado529(), rpe: 7 } }, envio: { acuses: ENVIO_BUENO } } }),
  'resumen-493': () => ({ escena: { sesion: sesion493(), arranque: { en: 'resumen', r: { ...resultado493(), rpe: 9 } }, envio: { acuses: ENVIO_BUENO } } }),
  'resumen-482': () => ({ escena: { sesion: sesion482(), arranque: { en: 'resumen', r: { ...resultado482(), rpe: 8 } }, envio: { acuses: ENVIO_BUENO } } }),
  envio: () => ({
    escena: {
      sesion: sesionSeisPorMil(),
      arranque: { en: 'resumen', r: { ...resultado6x1000(), rpe: 7 } },
      envio: { inicial: 'en-reloj', acuses: [{ en: 2500, estado: 'enviando' }, { en: 5000, estado: 'enviado' }] },
      inicialResumen: { pagina: 99 },
    },
  }),
  reintentando: () => ({
    escena: {
      sesion: sesionSeisPorMil(),
      arranque: { en: 'resumen', r: { ...resultado6x1000(), rpe: 7 } },
      envio: {
        inicial: 'en-reloj',
        acuses: [
          { en: 2000, estado: 'enviando' },
          { en: 4000, estado: 'reintentando' },
          { en: 11000, estado: 'enviando' },
          { en: 12500, estado: 'enviado' },
        ],
      },
      inicialResumen: { pagina: 99 },
    },
  }),
  rechazado: () => ({
    escena: {
      sesion: sesion479Brief(),
      arranque: { en: 'resumen', r: { ...resultado479(), rpe: 8 } },
      envio: { inicial: 'enviando', acuses: [{ en: 1500, estado: 'rechazado' }] },
      inicialResumen: { pagina: 99 },
    },
  }),
  'tamanos-completada': () => ({ comparar: 'fin-natural' }),
  'tamanos-parcial': () => ({ comparar: 'fin-parcial' }),
  'tamanos-rpe': () => ({ comparar: 'rpe' }),
  'tamanos-resumen': () => ({ comparar: 'resumen-correr' }),
  'tamanos-rechazo': () => ({ comparar: 'envio-rechazado' }),
};

/** Los escenarios que tienen caso (los tests los cruzan con la lista de la pantalla). */
export const IDS_DE_CASOS: readonly string[] = Object.keys(CASOS);

export function casoDespues(id: string): CasoDespues {
  return (CASOS[id] ?? CASOS['final-natural']!)();
}
