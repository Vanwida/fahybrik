// LOS CASOS DE «PLAN» SIN COACH — el tier libre (FreePlanView).
//
// Cuatro estados de la misma pantalla: sin nada medido (lo primero que ve todo el
// mundo), con carreras importadas (el retrato completo), en frío y el mínimo del
// mínimo (sin objetivo, sin VO₂ y con el catálogo de marcas caído). Sin coach NO hay chat, comunicados, revisión ni tests: la única pieza que
// habla de un coach es la de conversión, y va la última, sin nombre.
//
// Atletas inventados (CONTRATO-UI §7).

import type { CasoLibre, LecturaLibre, MarcaLibre } from './contrato-libre';
import { d, semana } from './sesiones';

const HOY = '2026-10-01';
const LUNES = '2026-09-28';

const COMO_CALLE = 'Calle o cinta, la app lo mide sola';
const COMO_REMO = 'Con el remo conectado, la app lo mide sola';
const COMO_SKI = 'Con el ski conectado, la app lo mide sola';

const marca = (
  slug: string,
  etiqueta: string,
  como: string,
  dura: string,
  desbloquea: string,
  valor: string | null = null,
  cuando: string | null = null,
): MarcaLibre => ({ slug, etiqueta, como: `${como} · ${dura}`, dura, desbloquea, valor, cuando });

const UNLOCK_RITMOS = 'Mídelo y afinamos los ritmos de tu semana';

const UN_KM = (valor: string | null = null, cuando: string | null = null) =>
  marca('run_1k', '1 km', COMO_CALLE, 'te lleva ~4-5 min', UNLOCK_RITMOS, valor, cuando);
const REMO_500 = () => marca('row_500m', 'Remo 500 m', COMO_REMO, 'te lleva ~3 min', 'Mídelo y tu semana gana la sesión de remo');
const SKI_1000 = () => marca('ski_1k', 'Ski 1.000 m', COMO_SKI, 'te lleva ~5 min', 'Mídelo y tu semana gana la sesión de ski');
const CINCO_KM = () => marca('run_5k', '5 km', COMO_CALLE, 'te lleva ~25 min', UNLOCK_RITMOS);

/** La semana propia del atleta libre: solo lo que montó él. */
const SEMANA_VACIA = () => semana(LUNES, HOY, [[], [], [], [], [], [], []]);
const SEMANA_PROPIA = () =>
  semana(LUNES, HOY, [
    [d('libre-rodaje', 'hecha', { libre: true })],
    [],
    [d('libre-rodaje', 'pendiente', { libre: true })],
    [],
    [d('libre-rodaje', 'pendiente', { libre: true })],
    [],
    [],
  ]);

const BASE: LecturaLibre = {
  cargando: false,
  hoyIso: HOY,
  carrera: { tipo: 'sin-objetivo' },
  vo2: null,
  carrerasImportadas: 0,
  evidencia: null,
  semanaBloqueada: null,
  marcas: { medidas: [], faltan: [], arranque: [], falloCatalogo: false },
  puedeImportar: true,
  semana: null,
};

const caso = (id: string, titulo: string, mira: string, pisa: Partial<LecturaLibre>): CasoLibre => ({
  tipo: 'libre',
  id,
  titulo,
  mira,
  lectura: { ...BASE, ...pisa },
});

export const CASOS_LIBRE: CasoLibre[] = [
  caso(
    'libre-sin-nada',
    '⑲ Marc · sin coach, sin nada medido',
    'EL TIER LIBRE en su caso mínimo: primero lo que le DAMOS (el VO₂ máx de su reloj, que existe) y luego lo que le PEDIMOS: traer su historial de HYROX en un toque o medirse las tres de arranque. Nada de coach: ni chat, ni «tu entrenador…». Sin nada que vender antes de tener un diagnóstico. La acción es la primera marca.',
    {
      carrera: {
        tipo: 'fijada',
        carrera: {
          nombre: 'HYROX Barcelona',
          dias: 68,
          categoria: 'Individual · Open · Hombres',
          objetivo: '1:15:00',
          comparacion: null,
          faltan: ['1 km', 'Remo 500 m', 'Ski 1.000 m'],
        },
      },
      vo2: { etiqueta: 'VO₂ máx', valor: '52,3', unidad: 'ml/kg/min' },
      marcas: {
        medidas: [],
        arranque: [UN_KM(), REMO_500(), SKI_1000()],
        faltan: [UN_KM(), REMO_500(), SKI_1000(), CINCO_KM()],
        falloCatalogo: false,
      },
      puedeImportar: true,
      semana: SEMANA_VACIA(),
    },
  ),

  caso(
    'libre-con-carreras',
    '⑳ Roc · sin coach, con tres carreras importadas',
    'El retrato con evidencia: primero lo que sus carreras YA demuestran (el tiempo de la pareja dicho como tal, los 8 km como un suelo y las transiciones, que sí son suyas), después su objetivo contra su realidad («ya fuiste más rápido que eso»), la semana que esos números compran (dos sesiones a la vista, el resto desenfocado pero REAL), sus marcas y, al final, la conversión. Nada de estaciones atribuidas en dobles.',
    {
      carrera: {
        tipo: 'fijada',
        carrera: {
          nombre: 'HYROX Valencia',
          dias: 34,
          categoria: 'Dobles · Pro · Hombres',
          objetivo: '1:08:00',
          comparacion: {
            tipo: 'mejor',
            deltaS: 218,
            mejor: { tiempoS: 3862, lugar: 'Berlín', cuando: 'may 2025', categoria: 'dobles pro', equipo: true },
          },
          faltan: [],
        },
      },
      vo2: { etiqueta: 'VO₂ máx', valor: '54,2', unidad: 'ml/kg/min' },
      carrerasImportadas: 3,
      puedeImportar: false,
      evidencia: {
        carreras: 3,
        mejorTiempo: { tiempoS: 3862, lugar: 'Berlín', cuando: 'may 2025', categoria: 'dobles pro', equipo: true },
        mejor8km: { ritmoSKm: 252, totalS: 2016, lugar: 'Berlín', suelo: true },
        ultimo8km: { ritmoSKm: 258, totalS: 2064, lugar: 'Málaga', suelo: true },
        transiciones: { segundos: 331, lugar: 'Berlín' },
        tendencia: null,
      },
      semanaBloqueada: {
        visibles: 2,
        base: 'Calculado con tus 8 km de Berlín',
        sesiones: [
          { dia: 'LUN', titulo: 'Series de 1 km', detalle: '5 x 1 km a 4:05/km, 2:00 de recuperación' },
          { dia: 'MIÉ', titulo: 'Fuerza: sentadilla', detalle: '4 x 6 con 105 kg (75% de tu máximo), RIR 2' },
          { dia: 'JUE', titulo: 'Correr con estaciones', detalle: '4 rondas: 1 km a 4:40/km + 25 wall balls + 20 burpees con salto' },
          { dia: 'VIE', titulo: 'Remo por series', detalle: '6 x 500 m a 1:52 /500, 1:30 de recuperación' },
          { dia: 'SÁB', titulo: 'Rodaje largo', detalle: '60 min a 5:15/km' },
        ],
      },
      marcas: {
        medidas: [UN_KM('3:38', 'hace 3 semanas')],
        arranque: [UN_KM('3:38', 'hace 3 semanas'), REMO_500(), SKI_1000()],
        faltan: [REMO_500(), SKI_1000(), CINCO_KM()],
        falloCatalogo: false,
      },
      semana: SEMANA_PROPIA(),
    },
  ),

  caso(
    'libre-cargando',
    '㉑ Sin coach · arranque en frío',
    'Todavía no sabemos si hay evidencia o no: un esqueleto con la forma final, jamás «sin datos» un instante para luego cambiar a «con carreras». Una sola espera honesta.',
    { cargando: true },
  ),

  caso(
    'libre-sin-nada-y-sin-red',
    '㉒ Marc · sin coach, sin nada y sin red',
    'EL MÍNIMO DEL MÍNIMO: sin carrera objetivo, sin VO₂ del reloj, sin carreras y con el catálogo de marcas caído. Cada hueco lleva su salida: ponla (la carrera), tráelo (el historial), reintenta (las marcas). La acción sigue siendo programar un entreno, que no depende de nada de eso. Sin coach, ni una pieza de coach.',
    {
      carrera: { tipo: 'sin-objetivo' },
      marcas: { medidas: [], arranque: [], faltan: [], falloCatalogo: true },
      puedeImportar: true,
      semana: SEMANA_VACIA(),
    },
  ),
];

export function casoLibre(id: string): CasoLibre {
  const c = CASOS_LIBRE.find((x) => x.id === id);
  if (!c) throw new Error(`Caso libre desconocido: ${id}`);
  return c;
}

// ── MATRIZ ───────────────────────────────────────────────────────────────────
//  Sujeto        sin evidencia ⑲㉒ · con evidencia ⑳ · cargando ㉑
//  Tu carrera    fijada ⑲⑳ · comparación ⑳ · sin comparación (solo en tests) · sin objetivo ㉒
//  Lo que sabemos VO₂ ⑲⑳ · sin VO₂ (no se pinta)
//  Semana bloqueada ⑳ · sin semana (no se pinta: menos de dos sesiones personalizables)
//  Marcas        medidas ⑳ · sin medir ⑲ · catálogo caído ㉒ (con reintento)
//  Semana propia vacía ⑲ · con sesiones ⑳
