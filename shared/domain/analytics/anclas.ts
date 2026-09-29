// LAS ANCLAS — el umbral del atleta por modalidad, resuelto UNA vez, con su peldaño.
//
// POR QUÉ UN SOLO RESOLVEDOR
// --------------------------
// Hasta el 29-09-2026 cada lector buscaba el umbral a su manera: el motor de
// carga leía `athlete_zone_profiles` sin mirar la versión y el `lthr_bpm` sin el
// declarado; las zonas de FC leían el declarado pero no el test de carrera; la
// pantalla de zonas de ritmo leía el perfil. Tres lectores, tres umbrales para
// el mismo atleta, y la carga se quedaba en el 8 % del tiempo porque solo
// aceptaba un umbral MEDIDO que casi nadie tiene.
//
// Aquí se resuelve todo de una vez, por modalidad, en el ORDEN DE EVIDENCIA que
// ya decidieron las zonas (DECISIONS 2026-07-28/29 y modelo §4):
//
//   medida  >  declarada  >  estimada  >  poblacional
//
//   · pulso:     test `lthr_30min` > declarado (un toque, o el alta) > 0,88 × FC
//                máxima medida > Tanaka por edad — vía `resolveThresholdHr`, que
//                sigue siendo EL resolutor de FC (aquí solo se le pone el peldaño).
//   · ritmo:     perfil de zonas de un test (o la marca del test) > declarado (un
//                toque, o el alta) > perfil derivado del alta / VDOT de una marca
//                / split medio de un 2K-1K > nada (no hay «ritmo poblacional»).
//   · potencia:  bici: FTP de un test > declarado (un toque, o el alta) > el umbral
//                de ritmo convertido. Remo y ski: el umbral de ritmo convertido.
//
// RITMO Y VATIOS EN UN CONCEPT2 SON LA MISMA MEDIDA. El monitor calcula los
// vatios desde el split con una fórmula publicada (W = 2,80 / (s/m)³) y al revés,
// así que convertir un umbral de split a vatios NO es estimar: es cambiar de
// unidad. Por eso el umbral de potencia de remo y ski hereda el PELDAÑO del de
// ritmo, y por eso el motor de carga puede preciar un tramo de ergo por potencia
// aunque el monitor solo mandara el split.
//
// LA POBLACIONAL SE RESUELVE Y SE MARCA, PERO NO PUNTÚA: las zonas la pintan
// (nadie se queda sin zonas), la carga no la usa (`anclaCuenta`). Es el contrato
// de «se generalizan por población — marcadas, y sin puntuar».
//
// Puro y sin base de datos. El cargador (`web/lib/analytics/anclas.ts`) trae las
// filas; esto decide.

import {
  BENCH_BIKE_THRESHOLD,
  BENCH_FTP,
  BENCH_ROW_2K,
  BENCH_ROW_THRESHOLD,
  BENCH_RUN_10K,
  BENCH_RUN_1MILE,
  BENCH_RUN_5K,
  BENCH_RUN_HALF,
  BENCH_RUN_THRESHOLD,
  BENCH_SKI_1K,
  BENCH_SKI_THRESHOLD,
} from '../coach/benchmark-slugs';
import {
  HR_ANCHOR_ANCLA,
  HR_ANCHOR_LABEL,
  resolveThresholdHr,
  type HrAnchors,
} from '../methodology/hr-zones';
import { trainingPacesForVdot, vdotFromEffort } from '../running/vdot';
import { ANCLA_ETIQUETA_ES, type Ancla } from './lectura';

// ---------------------------------------------------------------------------
// VOCABULARIO
// ---------------------------------------------------------------------------

/** Las modalidades que tienen umbral de ritmo. El ergo va en s/500 m, correr en s/km. */
export const MODALIDADES_RITMO = ['run', 'row', 'ski', 'bike'] as const;
export type ModalidadRitmo = (typeof MODALIDADES_RITMO)[number];

/** Las máquinas que tienen umbral de potencia (vatios). */
export const MODALIDADES_POTENCIA = ['row', 'ski', 'bike'] as const;
export type ModalidadPotencia = (typeof MODALIDADES_POTENCIA)[number];

/**
 * Lo que un atleta (o su coach) puede DECLARAR de un toque. Una clave por
 * umbral, en su unidad natural: pulso en ppm, correr en s/km, ergos en s/500 m,
 * la bici además en vatios (su FTP). Es el vocabulario de la tabla
 * `athlete_declared_thresholds` (0277) y del endpoint.
 */
export const CLAVES_DECLARACION = [
  'lthr_bpm',
  'run_s_per_km',
  'row_s_per_500m',
  'ski_s_per_500m',
  'bike_s_per_500m',
  'bike_watts',
] as const;
export type ClaveDeclaracion = (typeof CLAVES_DECLARACION)[number];

/** Límites de lo declarable: fuera de esto no es un umbral, es una errata. */
export const LIMITES_DECLARACION: Record<ClaveDeclaracion, { min: number; max: number; unidad: string }> = {
  lthr_bpm: { min: 100, max: 220, unidad: 'ppm' },
  run_s_per_km: { min: 150, max: 600, unidad: 's/km' },
  row_s_per_500m: { min: 75, max: 240, unidad: 's/500 m' },
  ski_s_per_500m: { min: 75, max: 240, unidad: 's/500 m' },
  bike_s_per_500m: { min: 40, max: 180, unidad: 's/500 m' },
  bike_watts: { min: 50, max: 600, unidad: 'W' },
};

export const DECLARADO_POR = ['athlete', 'coach'] as const;
export type DeclaradoPor = (typeof DECLARADO_POR)[number];

// ---------------------------------------------------------------------------
// ENTRADA — filas ya leídas
// ---------------------------------------------------------------------------

/** La versión VIGENTE del perfil de zonas de una modalidad (`athlete_zone_profiles`, la mayor versión). */
export interface PerfilZonasFila {
  modality: ModalidadRitmo;
  threshold_s: number;
  /** `coach_test` | `athlete_test` | `onboarding_auto` (0066/0070). */
  source: string;
  needs_review: boolean;
  recorded_at_iso: string;
}

/** Una declaración de un toque (`athlete_declared_thresholds`), la más reciente por clave. */
export interface DeclaracionFila {
  kind: ClaveDeclaracion;
  value: number;
  declared_by: DeclaradoPor;
  declared_at_iso: string;
}

/** Una marca (`athlete_benchmarks`) de las que anclan algo: umbrales, contrarrelojes, FTP. */
export interface MarcaFila {
  exercise_slug: string;
  value: number;
  /** `coach_test` | `athlete_test` | `registered` | `onboarding` | `unknown` (0139). */
  source: string;
  recorded_at_iso: string;
}

export interface EntradaAnclas {
  /**
   * Las entradas del resolutor de FC, tal como las lee `loadHrAnchors`, más la
   * fecha de cada umbral para poder decir «desde cuándo». El declarado ya llega
   * resuelto (el más reciente entre el alta y la declaración de un toque).
   */
  pulso: HrAnchors & { lthr_desde_iso: string | null; lthr_declarado_desde_iso: string | null };
  perfiles: readonly PerfilZonasFila[];
  declaraciones: readonly DeclaracionFila[];
  marcas: readonly MarcaFila[];
}

// ---------------------------------------------------------------------------
// SALIDA
// ---------------------------------------------------------------------------

export interface AnclaResuelta {
  valor: number;
  ancla: Ancla;
  /** Clave estable de la fuente (`perfil_test`, `declarada_coach`, `vdot_run_5k`…). Auditoría. */
  fuente: string;
  /** Cómo se explica al atleta. */
  explica_es: string;
  /** Desde cuándo vale. Null cuando la fuente no tiene fecha (la edad). */
  desde_iso: string | null;
}

export interface AnclasAtleta {
  /** Umbral de pulso, en ppm. */
  pulso: AnclaResuelta | null;
  /** Umbral de ritmo por modalidad: s/km en correr, s/500 m en remo, ski y bici. */
  ritmo: Record<ModalidadRitmo, AnclaResuelta | null>;
  /** Umbral de potencia por máquina, en vatios. */
  potencia: Record<ModalidadPotencia, AnclaResuelta | null>;
}

// ---------------------------------------------------------------------------
// CONCEPT2 — vatios y split son la misma medida
// ---------------------------------------------------------------------------

/** La constante publicada por Concept2: W = 2,80 / (segundos por metro)³. */
const CONCEPT2_K = 2.8;
const METROS_POR_SPLIT = 500;

/** Vatios equivalentes a un split de 500 m. Null si el split no es un número positivo. */
export function wattsDeSplit500(split_s: number | null | undefined): number | null {
  if (split_s == null || !Number.isFinite(split_s) || split_s <= 0) return null;
  const sPorMetro = split_s / METROS_POR_SPLIT;
  return CONCEPT2_K / sPorMetro ** 3;
}

/** Split de 500 m equivalente a unos vatios. Null si los vatios no son positivos. */
export function split500DeWatts(watts: number | null | undefined): number | null {
  if (watts == null || !Number.isFinite(watts) || watts <= 0) return null;
  return METROS_POR_SPLIT * Math.cbrt(CONCEPT2_K / watts);
}

// ---------------------------------------------------------------------------
// EL RESOLVEDOR
// ---------------------------------------------------------------------------

const FUENTES_TEST: ReadonlySet<string> = new Set(['coach_test', 'athlete_test']);

const SLUG_UMBRAL: Record<ModalidadRitmo, string> = {
  run: BENCH_RUN_THRESHOLD,
  row: BENCH_ROW_THRESHOLD,
  ski: BENCH_SKI_THRESHOLD,
  bike: BENCH_BIKE_THRESHOLD,
};

const CLAVE_RITMO: Record<ModalidadRitmo, ClaveDeclaracion> = {
  run: 'run_s_per_km',
  row: 'row_s_per_500m',
  ski: 'ski_s_per_500m',
  bike: 'bike_s_per_500m',
};

/** Contrarrelojes de carrera de las que sale un VDOT (Daniels). Metros por slug. */
const CONTRARRELOJ_RUN_M: Record<string, number> = {
  [BENCH_RUN_5K]: 5000,
  [BENCH_RUN_10K]: 10000,
  [BENCH_RUN_HALF]: 21097.5,
  [BENCH_RUN_1MILE]: 1609.344,
};

function esNumeroUtil(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** La más reciente de una lista, por su fecha ISO. */
function masReciente<T extends { recorded_at_iso: string }>(filas: readonly T[]): T | null {
  let mejor: T | null = null;
  for (const f of filas) {
    if (mejor == null || f.recorded_at_iso > mejor.recorded_at_iso) mejor = f;
  }
  return mejor;
}

function declaracionDe(e: EntradaAnclas, kind: ClaveDeclaracion): DeclaracionFila | null {
  let mejor: DeclaracionFila | null = null;
  for (const d of e.declaraciones) {
    if (d.kind !== kind || !esNumeroUtil(d.value)) continue;
    if (mejor == null || d.declared_at_iso > mejor.declared_at_iso) mejor = d;
  }
  return mejor;
}

function marcaDe(e: EntradaAnclas, slug: string, fuentes: (s: string) => boolean): MarcaFila | null {
  return masReciente(e.marcas.filter((m) => m.exercise_slug === slug && esNumeroUtil(m.value) && fuentes(m.source)));
}

function deDeclaracion(d: DeclaracionFila): AnclaResuelta {
  return {
    valor: d.value,
    ancla: 'declarada',
    fuente: d.declared_by === 'coach' ? 'declarada_coach' : 'declarada_atleta',
    explica_es: d.declared_by === 'coach' ? 'El que puso tu coach' : ANCLA_ETIQUETA_ES.declarada,
    desde_iso: d.declared_at_iso,
  };
}

function resolverPulso(e: EntradaAnclas): AnclaResuelta | null {
  const r = resolveThresholdHr(e.pulso);
  if (r == null) return null;
  const ancla = HR_ANCHOR_ANCLA[r.source];
  if (r.source === 'lthr_declared') {
    // El declarado que ganó puede ser el toque (atleta o coach) o lo dicho al
    // entrar: el cable ya eligió el más reciente y nos dejó su fecha, así que
    // la declaración con esa misma fecha es la que manda.
    const toque = declaracionDe(e, 'lthr_bpm');
    if (toque && toque.declared_at_iso === e.pulso.lthr_declarado_desde_iso && toque.value === r.lthr_bpm) {
      return deDeclaracion(toque);
    }
    return {
      valor: r.lthr_bpm,
      ancla,
      fuente: 'onboarding',
      explica_es: 'El que nos diste al entrar',
      desde_iso: e.pulso.lthr_declarado_desde_iso,
    };
  }
  const desde = r.source === 'lthr_measured' ? e.pulso.lthr_desde_iso : null;
  return { valor: r.lthr_bpm, ancla, fuente: r.source, explica_es: HR_ANCHOR_LABEL[r.source], desde_iso: desde };
}

/** El umbral de ritmo de una modalidad, peldaño a peldaño. */
function resolverRitmo(e: EntradaAnclas, m: ModalidadRitmo): AnclaResuelta | null {
  const perfiles = e.perfiles.filter((p) => p.modality === m && esNumeroUtil(p.threshold_s));

  // 1 · MEDIDA: el perfil de un test que nadie ha puesto en revisión, o la marca del test.
  const perfilTest = masReciente(perfiles.filter((p) => FUENTES_TEST.has(p.source) && !p.needs_review));
  if (perfilTest) {
    return {
      valor: perfilTest.threshold_s,
      ancla: 'medida',
      fuente: 'perfil_test',
      explica_es: ANCLA_ETIQUETA_ES.medida,
      desde_iso: perfilTest.recorded_at_iso,
    };
  }
  const marcaTest = marcaDe(e, SLUG_UMBRAL[m], (s) => FUENTES_TEST.has(s));
  if (marcaTest) {
    return {
      valor: marcaTest.value,
      ancla: 'medida',
      fuente: 'marca_test',
      explica_es: ANCLA_ETIQUETA_ES.medida,
      desde_iso: marcaTest.recorded_at_iso,
    };
  }

  // 2 · DECLARADA: un toque (la más reciente), o lo que dijo al entrar.
  const declarada = declaracionDe(e, CLAVE_RITMO[m]);
  const alta = marcaDe(e, SLUG_UMBRAL[m], (s) => s === 'onboarding');
  if (declarada && (!alta || declarada.declared_at_iso >= alta.recorded_at_iso)) return deDeclaracion(declarada);
  if (alta) {
    return {
      valor: alta.value,
      ancla: 'declarada',
      fuente: 'onboarding',
      explica_es: 'El que nos diste al entrar',
      desde_iso: alta.recorded_at_iso,
    };
  }

  // 3 · ESTIMADA: el perfil derivado del alta, o una contrarreloj suya.
  const perfilAuto = masReciente(perfiles.filter((p) => p.source === 'onboarding_auto'));
  if (perfilAuto) {
    return {
      valor: perfilAuto.threshold_s,
      ancla: 'estimada',
      fuente: 'perfil_onboarding_auto',
      explica_es: 'Estimado de las marcas que nos diste al entrar',
      desde_iso: perfilAuto.recorded_at_iso,
    };
  }
  return estimarDeContrarreloj(e, m);
}

/**
 * Un umbral ESTIMADO desde una contrarreloj real: correr por el VDOT de Daniels
 * (el ritmo de umbral de la tabla), remo y ski por el split medio del 2K / 1K
 * (un esfuerzo de ~7'/~4' va algo por encima del umbral: es un proxy, y se
 * marca). La bici no tiene contrarreloj de la que estimar.
 */
function estimarDeContrarreloj(e: EntradaAnclas, m: ModalidadRitmo): AnclaResuelta | null {
  if (m === 'run') {
    const candidatas = e.marcas.filter(
      (x) => CONTRARRELOJ_RUN_M[x.exercise_slug] != null && esNumeroUtil(x.value) && x.source !== 'unknown',
    );
    const marca = masReciente(candidatas);
    if (!marca) return null;
    const vdot = vdotFromEffort({ distance_meters: CONTRARRELOJ_RUN_M[marca.exercise_slug]!, duration_seconds: marca.value });
    const paces = trainingPacesForVdot(vdot);
    if (!paces) return null;
    return {
      valor: paces.threshold_s_per_km,
      ancla: 'estimada',
      fuente: `vdot_${marca.exercise_slug}`,
      explica_es: 'Estimado desde una marca tuya (VDOT)',
      desde_iso: marca.recorded_at_iso,
    };
  }
  if (m === 'row' || m === 'ski') {
    const slug = m === 'row' ? BENCH_ROW_2K : BENCH_SKI_1K;
    const divisor = m === 'row' ? 4 : 2;
    const marca = marcaDe(e, slug, (s) => s !== 'unknown');
    if (!marca) return null;
    return {
      valor: marca.value / divisor,
      ancla: 'estimada',
      fuente: `split_${slug}`,
      explica_es: m === 'row' ? 'Estimado desde tu 2000 m' : 'Estimado desde tu 1000 m',
      desde_iso: marca.recorded_at_iso,
    };
  }
  return null;
}

/** El umbral de ritmo de una máquina, convertido a vatios con el MISMO peldaño. */
function potenciaDesdeRitmo(ritmo: AnclaResuelta | null): AnclaResuelta | null {
  if (!ritmo) return null;
  const watts = wattsDeSplit500(ritmo.valor);
  if (watts == null) return null;
  return { ...ritmo, valor: watts, fuente: `${ritmo.fuente}→watts` };
}

function resolverPotenciaBici(e: EntradaAnclas, ritmoBici: AnclaResuelta | null): AnclaResuelta | null {
  const ftpTest = marcaDe(e, BENCH_FTP, (s) => FUENTES_TEST.has(s));
  if (ftpTest) {
    return {
      valor: ftpTest.value,
      ancla: 'medida',
      fuente: 'ftp_test',
      explica_es: ANCLA_ETIQUETA_ES.medida,
      desde_iso: ftpTest.recorded_at_iso,
    };
  }
  const declarada = declaracionDe(e, 'bike_watts');
  const alta = marcaDe(e, BENCH_FTP, (s) => s === 'onboarding' || s === 'registered');
  if (declarada && (!alta || declarada.declared_at_iso >= alta.recorded_at_iso)) return deDeclaracion(declarada);
  if (alta) {
    return {
      valor: alta.value,
      ancla: 'declarada',
      fuente: 'onboarding',
      explica_es: 'El que nos diste al entrar',
      desde_iso: alta.recorded_at_iso,
    };
  }
  return potenciaDesdeRitmo(ritmoBici);
}

/** Todas las anclas del atleta, de una vez. */
export function resolverAnclas(e: EntradaAnclas): AnclasAtleta {
  const ritmo: Record<ModalidadRitmo, AnclaResuelta | null> = {
    run: resolverRitmo(e, 'run'),
    row: resolverRitmo(e, 'row'),
    ski: resolverRitmo(e, 'ski'),
    bike: resolverRitmo(e, 'bike'),
  };
  return {
    pulso: resolverPulso(e),
    ritmo,
    potencia: {
      row: potenciaDesdeRitmo(ritmo.row),
      ski: potenciaDesdeRitmo(ritmo.ski),
      bike: resolverPotenciaBici(e, ritmo.bike),
    },
  };
}

/** Anclas vacías: el atleta sin un solo número. Para los tests y el vacío honesto. */
export function anclasVacias(): AnclasAtleta {
  return {
    pulso: null,
    ritmo: { run: null, row: null, ski: null, bike: null },
    potencia: { row: null, ski: null, bike: null },
  };
}

/**
 * La más DÉBIL de varias anclas (la que manda en la procedencia de un número que
 * mezcla varias). `null` (sin dependencia de umbral) no pesa: un número hecho
 * de RPE y de un umbral medido lleva `medida`.
 */
const PESO_ANCLA: Record<Ancla, number> = { medida: 0, declarada: 1, estimada: 2, poblacional: 3 };

export function anclaMasDebil(anclas: ReadonlyArray<Ancla | null>): Ancla | null {
  let peor: Ancla | null = null;
  for (const a of anclas) {
    if (a == null) continue;
    if (peor == null || PESO_ANCLA[a] > PESO_ANCLA[peor]) peor = a;
  }
  return peor;
}
