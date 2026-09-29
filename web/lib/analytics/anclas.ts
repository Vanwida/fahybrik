import 'server-only';

// LAS ANCLAS DEL ATLETA, LEÍDAS — el cable del resolvedor único
// (`shared/domain/analytics/anclas.ts`).
//
// Aquí solo se traen filas: el umbral de pulso con sus dos rungs y sus fechas,
// la versión VIGENTE de cada perfil de zonas, la declaración más reciente por
// clave y las marcas que anclan algo. Decide el resolvedor puro, y decide igual
// para la carga, para las zonas de FC (`loadHrAnchors` lee el pulso DESDE AQUÍ)
// y para la pantalla de umbrales.
//
// EL ATLETA VIENE VERIFICADO. Cada consulta filtra por `athlete_id`, y ese id
// solo puede venir de `AtletaVerificado`: la sesión firmada del atleta o un
// guard que comprobó que el atleta es del coach (`verificarAtletaDelCoach`).
// Es lo que hace honesto el `// tenancy: verified-owner` de cada consulta.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  BENCH_BIKE_THRESHOLD,
  BENCH_FTP,
  BENCH_LTHR,
  BENCH_ROW_2K,
  BENCH_ROW_THRESHOLD,
  BENCH_RUN_10K,
  BENCH_RUN_1MILE,
  BENCH_RUN_5K,
  BENCH_RUN_HALF,
  BENCH_RUN_THRESHOLD,
  BENCH_SKI_1K,
  BENCH_SKI_THRESHOLD,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  resolverAnclas,
  type AnclasAtleta,
  type ClaveDeclaracion,
  type DeclaracionFila,
  type DeclaradoPor,
  type EntradaAnclas,
  type MarcaFila,
  type ModalidadRitmo,
  type PerfilZonasFila,
} from '@fahybrid/shared/domain/analytics/anclas';
import type { HrAnchors } from '@fahybrid/shared/domain/methodology/hr-zones';
import type { AtletaVerificado } from './atleta-verificado';

/** `athlete_benchmarks.source` values that mean "a test produced this". */
const FUENTES_TEST = ['athlete_test', 'coach_test'] as const;

const TABLA_DECLARACIONES = 'athlete_declared_thresholds';

/** Milliseconds in an average year, leap years amortised. */
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Whole years from an ISO `YYYY-MM-DD` birth date. Null when absent/unparseable. */
export function ageYearsFrom(dob: string | null): number | null {
  if (!dob) return null;
  const then = Date.parse(dob);
  if (Number.isNaN(then)) return null;
  const years = Math.floor((Date.now() - then) / MS_PER_YEAR);
  return years > 0 && years < 120 ? years : null;
}

export type FilasPulso = HrAnchors & { lthr_desde_iso: string | null; lthr_declarado_desde_iso: string | null };

type FilaPulso = {
  max_hr_bpm: number | null;
  dob: string | null;
  lthr_bpm: number | null;
  lthr_desde: string | null;
  lthr_alta_bpm: number | null;
  lthr_alta_desde: string | null;
};

/**
 * Las entradas del resolutor de FC. Los dos rungs se leen POR SEPARADO y los
 * ordena el resolutor, no la fecha: un test siempre gana a una declaración,
 * aunque sea más antiguo. El declarado es el más reciente entre lo que dijo al
 * entrar (`athlete_benchmarks`, source ≠ test) y lo declarado de un toque.
 */
export async function loadFilasPulso(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<FilasPulso> {
  // tenancy: verified-owner
  const rows = await client<FilaPulso[]>`
    select
      a.max_hr_bpm,
      to_char(a.dob, 'YYYY-MM-DD') as dob,
      (
        select b.value::int
        from athlete_benchmarks b
        where b.athlete_id = a.id and b.exercise_slug = ${BENCH_LTHR}
          and b.source = any(${FUENTES_TEST as unknown as string[]})
        order by b.recorded_at desc limit 1
      ) as lthr_bpm,
      (
        select to_char(b.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        from athlete_benchmarks b
        where b.athlete_id = a.id and b.exercise_slug = ${BENCH_LTHR}
          and b.source = any(${FUENTES_TEST as unknown as string[]})
        order by b.recorded_at desc limit 1
      ) as lthr_desde,
      (
        select b.value::int
        from athlete_benchmarks b
        where b.athlete_id = a.id and b.exercise_slug = ${BENCH_LTHR}
          and (b.source is null or b.source <> all(${FUENTES_TEST as unknown as string[]}))
        order by b.recorded_at desc limit 1
      ) as lthr_alta_bpm,
      (
        select to_char(b.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        from athlete_benchmarks b
        where b.athlete_id = a.id and b.exercise_slug = ${BENCH_LTHR}
          and (b.source is null or b.source <> all(${FUENTES_TEST as unknown as string[]}))
        order by b.recorded_at desc limit 1
      ) as lthr_alta_desde
    from athletes a
    where a.id = ${atleta.athlete_id}
    limit 1
  `;
  const row = rows[0];
  const declaraciones = await loadDeclaraciones(atleta, client);
  const declarada = declaraciones.find((d) => d.kind === 'lthr_bpm') ?? null;

  // El declarado más reciente entre el alta y el toque.
  let declarado: { bpm: number; desde: string | null } | null = null;
  if (row?.lthr_alta_bpm != null) declarado = { bpm: row.lthr_alta_bpm, desde: row.lthr_alta_desde };
  if (declarada && (!declarado || !declarado.desde || declarada.declared_at_iso >= declarado.desde)) {
    declarado = { bpm: declarada.value, desde: declarada.declared_at_iso };
  }

  return {
    lthr_bpm: row?.lthr_bpm ?? null,
    lthr_declared_bpm: declarado?.bpm ?? null,
    max_hr_bpm: row?.max_hr_bpm ?? null,
    age_years: ageYearsFrom(row?.dob ?? null),
    lthr_desde_iso: row?.lthr_desde ?? null,
    lthr_declarado_desde_iso: declarado?.desde ?? null,
  };
}

/** La declaración más reciente por clave. Vacío en un entorno sin la tabla (0277). */
export async function loadDeclaraciones(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<DeclaracionFila[]> {
  try {
    // tenancy: verified-owner
    const rows = await client<Array<{ kind: string; value: number; declared_by: string; declared_at: string }>>`
      select distinct on (kind)
        kind,
        value::float as value,
        declared_by,
        to_char(declared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as declared_at
      from athlete_declared_thresholds
      where athlete_id = ${atleta.athlete_id}
      order by kind, declared_at desc, id desc
    `;
    return rows.map((r) => ({
      kind: r.kind as ClaveDeclaracion,
      value: r.value,
      declared_by: r.declared_by as DeclaradoPor,
      declared_at_iso: r.declared_at,
    }));
  } catch (err) {
    if (isPgMissingRelation(err, TABLA_DECLARACIONES)) return [];
    throw err;
  }
}

/** La versión VIGENTE del perfil de zonas de cada modalidad. */
async function loadPerfiles(atleta: AtletaVerificado, client: Sql): Promise<PerfilZonasFila[]> {
  // tenancy: verified-owner
  const rows = await client<Array<{ modality: string; threshold_s: number; source: string; needs_review: boolean; recorded_at: string }>>`
    select distinct on (modality)
      modality,
      threshold_s::float as threshold_s,
      source,
      needs_review,
      to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as recorded_at
    from athlete_zone_profiles
    where athlete_id = ${atleta.athlete_id}
    order by modality, version desc
  `;
  return rows
    .filter((r) => ['run', 'row', 'ski', 'bike'].includes(r.modality))
    .map((r) => ({
      modality: r.modality as ModalidadRitmo,
      threshold_s: r.threshold_s,
      source: r.source,
      needs_review: r.needs_review === true,
      recorded_at_iso: r.recorded_at,
    }));
}

const SLUGS_QUE_ANCLAN = [
  BENCH_RUN_THRESHOLD,
  BENCH_ROW_THRESHOLD,
  BENCH_SKI_THRESHOLD,
  BENCH_BIKE_THRESHOLD,
  BENCH_FTP,
  BENCH_RUN_5K,
  BENCH_RUN_10K,
  BENCH_RUN_HALF,
  BENCH_RUN_1MILE,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
];

/** Las marcas que anclan un umbral: los umbrales, el FTP y las contrarrelojes. */
async function loadMarcas(atleta: AtletaVerificado, client: Sql): Promise<MarcaFila[]> {
  // tenancy: verified-owner
  const rows = await client<Array<{ exercise_slug: string; value: number; source: string; recorded_at: string }>>`
    select
      exercise_slug,
      value::float as value,
      source,
      to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as recorded_at
    from athlete_benchmarks
    where athlete_id = ${atleta.athlete_id}
      and exercise_slug = any(${SLUGS_QUE_ANCLAN})
    order by recorded_at desc
  `;
  return rows.map((r) => ({ exercise_slug: r.exercise_slug, value: r.value, source: r.source, recorded_at_iso: r.recorded_at }));
}

/** Todas las filas que el resolvedor necesita, en paralelo. */
export async function loadEntradaAnclas(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<EntradaAnclas> {
  const [pulso, perfiles, declaraciones, marcas] = await Promise.all([
    loadFilasPulso(atleta, client),
    loadPerfiles(atleta, client),
    loadDeclaraciones(atleta, client),
    loadMarcas(atleta, client),
  ]);
  return { pulso, perfiles, declaraciones, marcas };
}

/** Las anclas del atleta, resueltas. La entrada única de carga, zonas y umbrales. */
export async function loadAnclasAtleta(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<AnclasAtleta> {
  return resolverAnclas(await loadEntradaAnclas(atleta, client));
}
