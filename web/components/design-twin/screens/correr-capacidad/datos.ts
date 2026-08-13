// CAPACIDAD — umbral y zonas, velocidad crítica, récords y lo que te da hoy.
//
// NADA DE ESTO SE HA TECLEADO A CIEGAS: cada bloque corre el MISMO motor que
// correría el servidor, sobre una curva de esfuerzos inventada.
//
//   · Umbral + zonas → `resolveZonesForAthlete` (shared/domain/methodology/
//     zone-model.ts), el resolutor de bandas de 6 zonas por offset que también
//     aplica `resolveTarget` al prescribir. No hay una segunda tabla de zonas
//     para el doble.
//   · Velocidad crítica + D' → `ajustarVelocidadCritica` (shared/domain/
//     analytics/capacidad.ts), el ajuste real de Monod-Scherrer con sus ocho
//     puertas. El escenario «sin-ancla» dispara la puerta 2 (pocos esfuerzos)
//     de verdad, no un `ok: false` escrito a mano.
//   · El predictor → `paceForRaceDistance` (shared/domain/running/vdot.ts), el
//     MISMO Daniels-Gilbert que ya usa la proyección de HYROX. El VDOT de hoy y
//     el de «hace 4 semanas» salen de dos esfuerzos de 5 km reales con
//     `vdotFromEffort`, nunca de un número puesto a mano.
//
// EL CATÁLOGO DE RÉCORDS ES EL REAL — `MARKS` (shared/domain/athlete/marks.ts),
// filtrado a los seis de correr. NO hay «1 milla»: el catálogo cerrado
// (docs/DECISIONS.md, 13-ago) es 1 km + Cooper 12 min + 5 km (medidos por la
// app, calle y cinta por separado) y 10 km + media + maratón (registrados).
// Solo tres marcas llevan cinta — las que `measured_by === 'run'` — el resto
// son carreras reales y no se «registra» un maratón en cinta.
//
// UN HUECO HONESTO: la procedencia del test de umbral («Del test · hace N
// días») necesita una fecha que `loadPaceThreshold` (web/lib/athlete/
// analytics/running-progress.ts) hoy NO selecciona de `athlete_zone_profiles`
// (solo trae `threshold_s, zones_json, source, needs_review`). La fila tiene
// que tener un `created_at` — si no, no se pudo ordenar `version desc` — así
// que esta pantalla asume que se añade a esa query. `procedenciaHaceDias` vive
// aparte de `UmbralRitmo` por eso: no es parte del contrato de hoy.

import {
  ajustarVelocidadCritica,
  type AjusteCapacidad,
  type EsfuerzoMaximal,
} from '@fahybrid/shared/domain/analytics/capacidad';
import { DEFAULT_COACH_ANALYTICS_METHOD } from '@fahybrid/shared/domain/analytics/metodo';
import { resolveZonesForAthlete } from '@fahybrid/shared/domain/methodology/zone-model';
import { STANDARD_ZONES_PER_KM } from '@fahybrid/shared/domain/methodology/zones';
import { paceForRaceDistance, vdotFromEffort } from '@fahybrid/shared/domain/running/vdot';
import { salidaDe } from '@fahybrid/shared/domain/running/progress';
import { MARKS, type MarkSpec } from '@fahybrid/shared/domain/athlete/marks';
import {
  BENCH_COOPER_12MIN,
  BENCH_RUN_10K,
  BENCH_RUN_1K,
  BENCH_RUN_5K,
  BENCH_RUN_HALF,
  BENCH_RUN_MARATHON,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import type { Esfuerzo, UmbralRitmo, ZonaRitmo } from '@fahybrid/shared/domain/running/progress';

// ---------------------------------------------------------------------------
// EL CATÁLOGO — filtrado del real, nunca reescrito
// ---------------------------------------------------------------------------

/** Los seis de correr, en el orden del catálogo: 1 km, Cooper, 5 km — medidos
 *  por la app — y 10 km, media, maratón — registrados. */
export const CATALOGO_RUNNING: MarkSpec[] = MARKS.filter((m) => m.group === 'run' || m.group === 'race');

/** El botón único de esta pantalla, sacado del mismo sitio que ya lo pinta en
 *  `analiticas-correr`: cero grafías nuevas para el mismo texto. */
export const CTA_TEST_ZONAS = salidaDe({ por: 'ancla' })!;

// ---------------------------------------------------------------------------
// LOS TIPOS DE ESTA PANTALLA
// ---------------------------------------------------------------------------

export interface ResultadoMarca {
  /** Segundos para las cinco contrarreloj; metros para el Cooper. */
  valor: number;
  haceDias: number;
}

export interface RegistroMarca {
  spec: MarkSpec;
  aire: ResultadoMarca | null;
  /** Solo aplica cuando `spec.measured_by === 'run'`: 10 km/media/maratón son
   *  carreras reales y no tienen variante de cinta. */
  cinta: ResultadoMarca | null;
}

export interface DistanciaPredicha {
  metros: number;
  etiqueta: string;
  segundos: number;
  /** Nulo cuando no hay VDOT de hace un mes contra el que comparar. */
  segundosHace4Semanas: number | null;
}

export interface CapacidadAtleta {
  umbral: UmbralRitmo | null;
  /** Ver el hueco de arriba: la fecha del test, no parte de `UmbralRitmo`. */
  procedenciaHaceDias: number | null;
  zonas: ZonaRitmo[];
  cs: AjusteCapacidad;
  registros: RegistroMarca[];
  curvaHoy: Esfuerzo[];
  curvaAntes: Esfuerzo[];
  /** Nulo = no hay VDOT de qué partir (ver §7, honestidad del dato). */
  prediccion: DistanciaPredicha[] | null;
}

// ---------------------------------------------------------------------------
// HELPERS — todos corren el motor real, ninguno inventa un resultado
// ---------------------------------------------------------------------------

const specDe = (slug: string): MarkSpec => {
  const spec = CATALOGO_RUNNING.find((m) => m.slug === slug);
  if (!spec) throw new Error(`marca desconocida en el catálogo: ${slug}`);
  return spec;
};

function registro(slug: string, aire: ResultadoMarca | null, cinta: ResultadoMarca | null = null): RegistroMarca {
  return { spec: specDe(slug), aire, cinta };
}

const esfuerzoMax = (metros: number, segundos: number): EsfuerzoMaximal => ({ distancia_m: metros, duracion_s: segundos });

function zonasDesdeUmbral(threshold_s: number): ZonaRitmo[] {
  // `.slice()` porque el resolutor pide `CoachZone[]` mutable — el mismo gesto
  // que hace `bandForZone` en zones.ts al pasarle el catálogo estándar.
  return resolveZonesForAthlete({ modality: 'run', threshold_s, pace_unit: 'per_km' }, STANDARD_ZONES_PER_KM.slice());
}

function ajusteCS(esfuerzos: EsfuerzoMaximal[], umbralVelocidadMs: number | null): AjusteCapacidad {
  return ajustarVelocidadCritica(
    esfuerzos,
    DEFAULT_COACH_ANALYTICS_METHOD,
    umbralVelocidadMs != null ? { velocidad_m_s: umbralVelocidadMs } : null,
  );
}

const DISTANCIAS_PREDICCION: readonly { metros: number; etiqueta: string }[] = [
  { metros: 5000, etiqueta: '5 km' },
  { metros: 10000, etiqueta: '10 km' },
  { metros: 21097, etiqueta: 'Media maratón' },
  { metros: 42195, etiqueta: 'Maratón' },
];

/** Tiempo total a una distancia, desde un VDOT — `paceForRaceDistance` da el
 *  ritmo por km; aquí se multiplica por la distancia real, nunca al revés. */
function tiempoPara(vdot: number, metros: number): number | null {
  const ritmo = paceForRaceDistance(vdot, metros);
  return ritmo != null ? Math.round(ritmo * (metros / 1000)) : null;
}

function predecir(vdotHoy: number, vdotHace4Semanas: number | null): DistanciaPredicha[] {
  return DISTANCIAS_PREDICCION.map(({ metros, etiqueta }) => ({
    metros,
    etiqueta,
    segundos: tiempoPara(vdotHoy, metros) ?? 0,
    segundosHace4Semanas: vdotHace4Semanas != null ? tiempoPara(vdotHace4Semanas, metros) : null,
  }));
}

// El mismo helper de `analiticas-correr/datos.ts`: DISTANCIAS fijas, curva de
// duraciones alineada por índice.
const DISTANCIAS_CURVA = [400, 800, 1000, 1600, 3000, 5000, 10000];
const curva = (segundos: number[]): Esfuerzo[] => DISTANCIAS_CURVA.map((metros, i) => ({ metros, segundos: segundos[i]! }));

// ---------------------------------------------------------------------------
// ① COMPLETO — umbral de test, seis récords calle + tres cinta, predictor con
// tendencia, curva con mejora. El caso de un atleta con siete-ocho semanas de
// datos limpios detrás.
// ---------------------------------------------------------------------------

// El 5 km real del que sale TODO el predictor: 19:12 hoy, 19:52 hace un mes.
// Si cambias estos dos números, el predictor entero se recalcula solo.
const VDOT_HOY_COMPLETO = vdotFromEffort({ distance_meters: 5000, duration_seconds: 1152 })!; // 19:12
const VDOT_HACE4_COMPLETO = vdotFromEffort({ distance_meters: 5000, duration_seconds: 1192 })!; // 19:52

const UMBRAL_S_KM_COMPLETO = 240; // 4:00/km — ≈ 5K (230,4 s/km) + 10 s/km, la regla de vdot.ts

const COMPLETO: CapacidadAtleta = {
  umbral: {
    ritmo_s_km: UMBRAL_S_KM_COMPLETO,
    vdot: VDOT_HOY_COMPLETO,
    vdot_desde: 'Carrera 5 km',
    origen: 'athlete_test',
    sin_revisar: false,
  },
  procedenciaHaceDias: 18,
  zonas: zonasDesdeUmbral(UMBRAL_S_KM_COMPLETO),
  cs: ajusteCS(
    [esfuerzoMax(800, 152), esfuerzoMax(1000, 196), esfuerzoMax(1600, 330), esfuerzoMax(3000, 660)],
    1000 / UMBRAL_S_KM_COMPLETO,
  ),
  registros: [
    registro(BENCH_RUN_1K, { valor: 206, haceDias: 18 }, { valor: 212, haceDias: 95 }), // 3:26 / 3:32
    registro(BENCH_COOPER_12MIN, { valor: 2840, haceDias: 70 }, { valor: 2790, haceDias: 150 }),
    registro(BENCH_RUN_5K, { valor: 1152, haceDias: 9 }, { valor: 1188, haceDias: 110 }), // 19:12 / 19:48
    registro(BENCH_RUN_10K, { valor: 2430, haceDias: 60 }), // 40:30
    registro(BENCH_RUN_HALF, { valor: 5530, haceDias: 200 }), // 1:32:10
    registro(BENCH_RUN_MARATHON, { valor: 12240, haceDias: 300 }), // 3:24:00
  ],
  curvaHoy: curva([70, 152, 196, 330, 660, 1152, 2445]),
  curvaAntes: curva([72, 157, 202, 341, 684, 1194, 2532]),
  prediccion: predecir(VDOT_HOY_COMPLETO, VDOT_HACE4_COMPLETO),
};

// ---------------------------------------------------------------------------
// ② SIN-ANCLA — el umbral que hay es el que puso el alta, sin confirmar
// (`origen: 'onboarding_auto'`, `sin_revisar: true`): las zonas SÍ se dibujan
// —el resolutor no distingue una estimación de un test, solo cambia de dónde
// sale el número que entra— pero se declaran estimadas. Cero marcas
// registradas todavía: ni velocidad crítica (`pocos_esfuerzos`, disparado de
// verdad por una lista vacía) ni predictor (no hay VDOT del que partir).
// ---------------------------------------------------------------------------

const UMBRAL_S_KM_ESTIMADO = 260; // 4:20/km — lo que declaró al darse de alta

const SIN_ANCLA: CapacidadAtleta = {
  umbral: {
    ritmo_s_km: UMBRAL_S_KM_ESTIMADO,
    vdot: null,
    vdot_desde: null,
    origen: 'onboarding_auto',
    sin_revisar: true,
  },
  procedenciaHaceDias: null,
  zonas: zonasDesdeUmbral(UMBRAL_S_KM_ESTIMADO),
  cs: ajusteCS([], null),
  registros: [],
  curvaHoy: [],
  curvaAntes: [],
  prediccion: null,
};

// ---------------------------------------------------------------------------
// ③ RECIÉN-BATIDO — el mismo atleta de ①, con un 5 km fresco de esta semana:
// el predictor entero se recalcula desde ESE VDOT y mejora contra el de ①,
// que ahora hace de línea de base «hace 4 semanas».
// ---------------------------------------------------------------------------

const VDOT_HOY_RECIENTE = vdotFromEffort({ distance_meters: 5000, duration_seconds: 1127 })!; // 18:47, hace 3 días
const UMBRAL_S_KM_RECIENTE = 235; // 3:55/km — el umbral aprieta con la forma nueva

const RECIEN_BATIDO: CapacidadAtleta = {
  umbral: {
    ritmo_s_km: UMBRAL_S_KM_RECIENTE,
    vdot: VDOT_HOY_RECIENTE,
    vdot_desde: 'Carrera 5 km',
    origen: 'athlete_test',
    sin_revisar: false,
  },
  procedenciaHaceDias: 3,
  zonas: zonasDesdeUmbral(UMBRAL_S_KM_RECIENTE),
  cs: ajusteCS(
    [esfuerzoMax(800, 150), esfuerzoMax(1000, 193), esfuerzoMax(1600, 325), esfuerzoMax(3000, 650)],
    1000 / UMBRAL_S_KM_RECIENTE,
  ),
  registros: [
    registro(BENCH_RUN_1K, { valor: 206, haceDias: 18 }, { valor: 212, haceDias: 95 }),
    registro(BENCH_COOPER_12MIN, { valor: 2840, haceDias: 70 }, { valor: 2790, haceDias: 150 }),
    // El récord fresco: esta semana, y se marca.
    registro(BENCH_RUN_5K, { valor: 1127, haceDias: 3 }, { valor: 1188, haceDias: 110 }), // 18:47
    registro(BENCH_RUN_10K, { valor: 2430, haceDias: 60 }),
    registro(BENCH_RUN_HALF, { valor: 5530, haceDias: 200 }),
    registro(BENCH_RUN_MARATHON, { valor: 12240, haceDias: 300 }),
  ],
  curvaHoy: curva([69, 150, 193, 325, 650, 1127, 2410]),
  curvaAntes: curva([70, 152, 196, 330, 660, 1152, 2445]),
  // La línea de base es el VDOT de ① — el mismo atleta, cuatro semanas antes.
  prediccion: predecir(VDOT_HOY_RECIENTE, VDOT_HOY_COMPLETO),
};

export const ESCENAS: Record<string, CapacidadAtleta> = {
  completo: COMPLETO,
  'sin-ancla': SIN_ANCLA,
  'recien-batido': RECIEN_BATIDO,
};

/** Dentro de 30 días — el mismo corte que ★ usa en el resto de la app. */
export function esRecord(haceDias: number): boolean {
  return haceDias <= 30;
}
