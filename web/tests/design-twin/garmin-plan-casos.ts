// LOS CASOS DEL PLAN COMPACTO — las sesiones reales del doble y los demás planes
// de la muñeca, como fuente única para el examen (`kit-garmin-plan-compacto.test.ts`),
// los vectores de oro (`fixtures/garmin-plan/`) y el script que los genera
// (`web/scripts/garmin-plan-fixtures.ts`).
//
// Cada caso sale de una función que YA existe en `screens/reloj-*/planes.ts`:
// nada aquí se escribe a mano ni se inventa. Lo que el doble no tiene se lista
// en `NO_ENCONTRADAS` y no se rellena con material de fuera (las fuentes las
// marca Alex).
//
// Los datos de cabecera que solo conoce el servidor (id de asignación, deporte
// del FIT, bandas del atleta) son de PRUEBA: el deporte del FIT es ilustrativo,
// el mapa real es el arreglo A4 y lo decide la prueba T1 en un reloj.

import { sesion509, sesion479, sesion491, sesion494, sesion535, sesion538 as correr538, sesion551, sesion573, seisPorMil } from '@/components/design-twin/screens/reloj-correr/planes';
import { ejemploP11, sesion488, sesion492 as fuerza492, sesion529 as fuerza529, sesion538 as fuerza538 } from '@/components/design-twin/screens/reloj-fuerza/planes';
import { sesion493 as circuito493, sesion492 as circuito492, sesion506 as circuito506, simulacionHyrox } from '@/components/design-twin/screens/reloj-circuito/planes';
import {
  amrap15,
  bike514,
  carrera552,
  chipper506,
  emom498,
  emom572,
  ergo505,
  ergo530,
  escalera536,
  forTimeWod,
  tabata,
} from '@/components/design-twin/screens/reloj-wod/planes';
import {
  correrLibre,
  enfriamientoLibre,
  sesion482,
  sesion493 as antes493,
  sesion529 as antes529,
  sesionSeisPorMil,
} from '@/components/design-twin/screens/reloj-antes-despues/sesiones';
import { planCintaEspejo, planEstacion, planFuerza, planSeries } from '@/components/design-twin/screens/reloj-gramatica/planes';
import type { PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { hyroxDobles, pasosDeWod, pasosPorCadaValor, planDe } from './garmin-plan-sinteticos';
import { completarPlan, metaPorDefecto } from '@/components/design-twin/kit-garmin/plan-compacto/meta';
import type { BandasRitmo, MetaSesion } from '@/components/design-twin/kit-garmin/plan-compacto/tipos';

export type FamiliaCaso = 'correr' | 'fuerza' | 'circuito' | 'wod' | 'ergo' | 'libre';

export interface CasoPlan {
  /** Nombre del fichero de vectores: único. */
  clave: string;
  /** El número de la asignación real; `null` en un plan ilustrativo del kit. */
  numero: string | null;
  etiqueta: string;
  /** De qué función del doble sale. */
  fuente: string;
  familia: FamiliaCaso;
  plan: PlanSesion;
}

/** Las sesiones que pide el encargo, en su orden. */
export const NUMEROS_DEL_ENCARGO = [
  '491', '494', '573', '479', '551', '509', '511', '535', '538', '488', '529', '492',
  '498', '572', '506', '552', '542', '493', '482', '505', '530', '536', '513', '514',
] as const;

/** Las que NO existen como datos en el doble (búsqueda por número en `web/` y `docs/`, 29-09-2026), en el orden del encargo. */
export const NO_ENCONTRADAS = ['511', '542', '513'] as const;

const R = 'screens/reloj-correr/planes.ts';
const F = 'screens/reloj-fuerza/planes.ts';
const C = 'screens/reloj-circuito/planes.ts';
const W = 'screens/reloj-wod/planes.ts';
const A = 'screens/reloj-antes-despues/sesiones.ts';
const G = 'screens/reloj-gramatica/planes.ts';

const caso = (clave: string, numero: string | null, etiqueta: string, fuente: string, familia: FamiliaCaso, plan: PlanSesion): CasoPlan => ({
  clave,
  numero,
  etiqueta,
  fuente,
  familia,
  plan,
});

/** Sesiones reales (atletas 63, 64 y 65): una por número y por fuente del doble. */
export function casosReales(): CasoPlan[] {
  return [
    caso('491', '491', 'Run 50′ @Z2 · Movilidad 15′', `${R} · sesion491`, 'correr', sesion491().plan),
    caso('494', '494', 'Run 80′ @Z2, «mirar el pulso»', `${R} · sesion494`, 'correr', sesion494().plan),
    caso('573', '573', 'Tempo 3950 m @Z4', `${R} · sesion573`, 'correr', sesion573().plan),
    caso('479', '479', 'Run 5′ · 6 × (800 m @Z5 / 2′30″) · Wall Ball · Run 3′', `${R} · sesion479`, 'correr', sesion479().plan),
    caso('551', '551', 'Run 6000 m @Z2 · 6 × (20″ @RPE 7 / r 1′)', `${R} · sesion551`, 'correr', sesion551().plan),
    caso('509', '509', 'Cinta: drills · 3 × (6 × (1′ / 1′)) r 5′', `${R} · sesion509`, 'correr', sesion509().plan),
    caso('535', '535', 'Cinta: 2 × (4 × (2′ @Z4 al 1 % / 2′) / 5′)', `${R} · sesion535`, 'correr', sesion535().plan),
    caso('538-correr', '538', 'Progresivo de 8 tramos + 4 × 600 + 3 × 800', `${R} · sesion538`, 'correr', correr538().plan),
    caso('538-fuerza', '538', 'Glúteo medio + superserie de core + Run 10′', `${F} · sesion538`, 'fuerza', fuerza538()),
    caso('488', '488', 'Fuerza A + SkiErg 8 × 250 m', `${F} · sesion488`, 'fuerza', sesion488()),
    caso('529-fuerza', '529', 'Fuerza tren inferior + sled técnico', `${F} · sesion529`, 'fuerza', fuerza529()),
    caso('529-antes', '529', '529 tal como la ve «antes y después»', `${A} · sesion529`, 'fuerza', antes529().plan),
    caso('492-fuerza', '492', 'Fuerza B + Trineos (sesión entera)', `${F} · sesion492`, 'fuerza', fuerza492()),
    caso('492-circuito', '492', 'Trineos y carries (bloque)', `${C} · sesion492`, 'circuito', circuito492().plan),
    caso('498', '498', 'EMOM 12′: Bench Press y Row', `${W} · emom498`, 'wod', emom498().plan),
    caso('572', '572', 'EMOM 18:45: Row · SkiErg · Run', `${W} · emom572`, 'wod', emom572().plan),
    caso('506-circuito', '506', 'Chipper: Run + AMRAP 4′ (circuito)', `${C} · sesion506`, 'circuito', circuito506().plan),
    caso('506-wod', '506', 'Chipper: Run + AMRAP 4′ (wod)', `${W} · chipper506`, 'wod', chipper506().plan),
    caso('552', '552', 'Cursa 5K For Time', `${W} · carrera552`, 'wod', carrera552().plan),
    caso('493-circuito', '493', 'Compromised: Run 6′ + 5 × (Run 1000 + estación)', `${C} · sesion493`, 'circuito', circuito493().plan),
    caso('493-antes', '493', '493 con Roxzone como paso', `${A} · sesion493`, 'circuito', antes493().plan),
    caso('482', '482', '482: 4 rondas de Run 1000 + estación', `${A} · sesion482`, 'circuito', sesion482().plan),
    caso('505', '505', 'SkiErg 8 × 250 m @2:05/500', `${W} · ergo505(true)`, 'ergo', ergo505(true).plan),
    caso('530', '530', '3 × (SkiErg · Row · Bike) @Z2 + Run 7′', `${W} · ergo530`, 'ergo', ergo530().plan),
    caso('536', '536', 'Row en escalera 90″ → 1′ → 30″', `${W} · escalera536`, 'ergo', escalera536().plan),
    caso('514', '514', 'Assault Bike 45′ @Z1 · máx 142 ppm', `${W} · bike514`, 'ergo', bike514().plan),
  ];
}

/** Planes ilustrativos del kit (no son una asignación real) y variantes de los reales. */
export function casosOtros(): CasoPlan[] {
  return [
    caso('modelo-6x1000', null, '6 × 1000 m @3:45–3:55 · r 90″ trote', `${R} · seisPorMil`, 'correr', seisPorMil().plan),
    caso('modelo-6x1000-calle', null, 'Ídem con entorno calle en todos los pasos', `${A} · sesionSeisPorMil`, 'correr', sesionSeisPorMil().plan),
    caso('modelo-p11', null, 'Back Squat 5 × 5 · 100 kg · RIR 2 · 3-1-1 (sensor)', `${F} · ejemploP11`, 'fuerza', ejemploP11()),
    caso('modelo-amrap15', null, 'AMRAP 15′ de tres movimientos', `${W} · amrap15`, 'wod', amrap15().plan),
    caso('modelo-fortime', null, 'For Time · cap 20:00 · 3 rondas', `${W} · forTimeWod`, 'wod', forTimeWod().plan),
    caso('modelo-tabata', null, 'Tabata 8 × 20″/10″', `${W} · tabata`, 'wod', tabata().plan),
    caso('modelo-ergo-sin-pm5', null, 'SkiErg 8 × 250 m sin PM5 (lo dices tú)', `${W} · ergo505(false)`, 'ergo', ergo505(false).plan),
    caso('modelo-hyrox-completo', null, 'HYROX sim: 8 × (1 km + estación), PM5 y Roxzone', `${C} · simulacionHyrox`, 'circuito', simulacionHyrox({ pm5: true, roxzone: true, cap: 5400 }).plan),
    caso('modelo-hyrox-sin-pm5', null, 'HYROX sim sin PM5 ni Roxzone, con objetivo de RPE en la carrera', `${C} · simulacionHyrox`, 'circuito', simulacionHyrox({ pm5: false, roxzone: false, cap: null, run: [{ eje: 'rpe', min: 8, max: 8, papel: 'principal' }] }).plan),
    caso('libre-correr', null, 'Correr libre: un paso abierto con vuelta automática', `${A} · correrLibre`, 'libre', correrLibre('calle').plan),
    caso('libre-enfriamiento', null, 'Enfriamiento libre tras «Seguir»', `${A} · enfriamientoLibre`, 'libre', enfriamientoLibre('calle')),
    caso('gramatica-series', null, 'Gramática: 6 × 1000 m', `${G} · planSeries`, 'correr', planSeries().plan),
    caso('gramatica-fuerza', null, 'Gramática: A1/A2 de la 529', `${G} · planFuerza`, 'fuerza', planFuerza().plan),
    caso('gramatica-estacion', null, 'Gramática: Sled Push 50 m · 152 kg + Run', `${G} · planEstacion`, 'circuito', planEstacion().plan),
    caso('gramatica-cinta', null, 'Gramática: 535 en cinta, espejo sin enlace', `${G} · planCintaEspejo`, 'correr', planCintaEspejo().plan),
  ];
}

/**
 * Planes sintéticos que solo existen para recorrer TODAS las ramas del
 * decodificador de Monkey C (cada valor de cada tabla, cada formato de WOD, el
 * texto de los dobles). No son sesiones ni salen del doble: van a los vectores
 * de oro, no al examen de «sesiones reales».
 */
export function casosSinteticos(): CasoPlan[] {
  const S = 'tests/design-twin/garmin-plan-sinteticos.ts';
  return [
    caso('sintetico-cada-valor', null, 'Un paso por cada valor de cada tabla del formato', `${S} · pasosPorCadaValor`, 'wod', planDe(pasosPorCadaValor())),
    caso('sintetico-wod-formatos', null, 'Cada formato de WOD, con y sin opcionales', `${S} · pasosDeWod`, 'wod', planDe(pasosDeWod())),
    caso('sintetico-dobles', null, 'Tres estaciones de dobles: tuyo, de tu pareja y repartida', `${S} · hyroxDobles`, 'circuito', hyroxDobles()),
  ];
}

// ---------------------------------------------------------------------------
// La cabecera de prueba
// ---------------------------------------------------------------------------

/** Deporte y subdeporte del FIT de PRUEBA por familia: opacos para el reloj, ilustrativos aquí. */
const FIT_DE_PRUEBA: Record<FamiliaCaso, [number, number]> = {
  correr: [1, 0],
  fuerza: [10, 20],
  circuito: [10, 70],
  wod: [10, 70],
  ergo: [10, 26],
  libre: [1, 0],
};

/** Las seis zonas de ritmo de un atleta de prueba (umbral 4:00/km): del más fácil al más duro. */
const RITMO_KM_DE_PRUEBA: BandasRitmo = {
  unidad: 'km',
  procedencia: 'medida',
  zonas: [
    { rapidoS: 330, lentoS: null },
    { rapidoS: 290, lentoS: 330 },
    { rapidoS: 265, lentoS: 290 },
    { rapidoS: 240, lentoS: 265 },
    { rapidoS: 225, lentoS: 240 },
    { rapidoS: 200, lentoS: 225 },
  ],
};

/** Zonas de /500 m de un atleta de prueba (umbral 2:00/500): estimadas, sin test de ergómetro. */
const RITMO_500_DE_PRUEBA: BandasRitmo = {
  unidad: '500m',
  procedencia: 'estimada',
  zonas: [
    { rapidoS: 140, lentoS: null },
    { rapidoS: 128, lentoS: 140 },
    { rapidoS: 120, lentoS: 128 },
    { rapidoS: 113, lentoS: 120 },
    { rapidoS: 105, lentoS: 113 },
    { rapidoS: 95, lentoS: 105 },
  ],
};

/** Id de asignación de un plan ilustrativo: fuera del rango de las reales. */
const ID_ILUSTRATIVO_BASE = 900_000;
/** Id de asignación de un plan sintético: aparte de los ilustrativos. */
const ID_SINTETICO_BASE = 950_000;

/** El caso tal como se SERVIRÍA al reloj: con el método del coach en el plan (procedencia de las zonas y bandas de ritmo de prueba). */
function servido(c: CasoPlan): CasoPlan {
  const bandasRitmo = c.familia === 'ergo' || c.familia === 'circuito' ? [RITMO_KM_DE_PRUEBA, RITMO_500_DE_PRUEBA] : [RITMO_KM_DE_PRUEBA];
  return { ...c, plan: completarPlan(c.plan, { procedenciaPpm: 'estimada', bandasRitmo }) };
}

/** `idIlustrativo`: el id de asignación de un plan que no es una asignación real (`numero: null`). `c.plan` es el plan servido (`servido`). */
export function metaDeCaso(c: CasoPlan, idIlustrativo: number): MetaSesion {
  const [fitSport, fitSubSport] = FIT_DE_PRUEBA[c.familia];
  return metaPorDefecto(c.plan, { asignacionId: c.numero !== null ? Number(c.numero) : idIlustrativo, fitSport, fitSubSport });
}

/** Los casos derivados del doble (reales y del kit) con su cabecera, en orden estable: la lista del examen. */
export function todosLosCasos(): Array<{ caso: CasoPlan; meta: MetaSesion }> {
  return [...casosReales(), ...casosOtros()].map(servido).map((c, i) => ({ caso: c, meta: metaDeCaso(c, ID_ILUSTRATIVO_BASE + i) }));
}

/** Todo lo que lleva vector de oro: los casos del doble y los sintéticos. */
export function casosConVector(): Array<{ caso: CasoPlan; meta: MetaSesion }> {
  return [...todosLosCasos(), ...casosSinteticos().map(servido).map((c, i) => ({ caso: c, meta: metaDeCaso(c, ID_SINTETICO_BASE + i) }))];
}
