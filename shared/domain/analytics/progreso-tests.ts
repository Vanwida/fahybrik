// ¿MEJORO EN LOS TESTS? — la evolución de cada test del coach
// (docs/analiticas/modelo.md, «Detalles por familia», tests).
//
// Un test es un resultado MEDIDO con un protocolo (`athlete_benchmarks` con
// fuente `coach_test` o `athlete_test`). Cada uno lleva su historia entera como
// serie (la evolución es la historia, no la ventana, y la procedencia lo dice),
// el número de la ventana contra el de la anterior con la regla común
// (`cambio_test_pct`), y contra el test ANTERIOR como referencia — que es lo que
// el atleta pregunta al repetir un test aunque caiga en otra ventana.
//
// Un umbral de pulso no tiene «mejor» (`benchmarkIsDirectional`): se enseña su
// evolución y no se juzga. Las marcas que son un peldaño de correr o una pieza
// de ergo (5 km, 2000 m de remo…) ya compiten en su familia como récord; aquí
// solo ofrecen récord los tests que no son un peldaño.
//
// Puro y sin base de datos.

import {
  BENCHMARK_UNIT_BPM,
  BENCHMARK_UNIT_CM,
  BENCHMARK_UNIT_KG,
  BENCHMARK_UNIT_METERS,
  BENCHMARK_UNIT_REPS,
  BENCHMARK_UNIT_SECONDS,
  BENCHMARK_UNIT_WATTS,
  benchmarkIsDirectional,
  benchmarkLabel,
  benchmarkLowerIsBetter,
} from '../coach/benchmark-slugs';
import { STRENGTH_LIFT_BY_SLUG, strengthLiftLabel } from '../strength/exercises';
import type { Familia, Lectura, Procedencia, Unidad } from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import {
  enPeriodo,
  lecturaProgreso,
  medidasDe,
  mejorDe,
  MINIMO_MEJOR,
  periodoHasta,
  serieDeIntentos,
  type Fechada,
  type Sentido,
} from './progreso';
import type { CandidatoRecord } from './records';
import type { VentanaResuelta } from './ventana';

/** Un resultado de test, en el día local del atleta. */
export interface ResultadoTest extends Fechada {
  slug: string;
  valor: number;
  /** `athlete_benchmarks.unit`. */
  unidad_bd: string;
}

/** La familia de cada test: donde vive su «¿mejoro?». Lo que no entrena una familia, `otro`. */
const FAMILIA_TEST: Readonly<Record<string, Familia>> = {
  run_1k: 'correr',
  run_1mile: 'correr',
  run_5k: 'correr',
  run_10k: 'correr',
  run_half: 'correr',
  run_marathon: 'correr',
  cooper_12min: 'correr',
  run_threshold_s_per_km: 'correr',
  row_500m: 'remo',
  row_1k: 'remo',
  row_2k: 'remo',
  row_threshold_s_per_500m: 'remo',
  ski_1k: 'ski',
  ski_threshold_s_per_500m: 'ski',
  bike_threshold_s_per_500m: 'bici',
  ftp_watts: 'bici',
  back_squat_1rm: 'fuerza',
  deadlift_1rm: 'fuerza',
  bench_press_1rm: 'fuerza',
  ohp_1rm: 'fuerza',
  clean_1rm: 'fuerza',
  snatch_1rm: 'fuerza',
  strict_pull_up_max: 'fuerza',
  push_ups_per_min: 'fuerza',
  cmj: 'fuerza',
  cmj_loaded: 'fuerza',
  hyrox_half_sim: 'wod',
};

/** Los tests que son un peldaño o una pieza: su récord lo lleva su familia. */
const TESTS_EN_FAMILIA: ReadonlySet<string> = new Set([
  'run_1k',
  'run_1mile',
  'run_5k',
  'run_10k',
  'run_half',
  'run_marathon',
  'row_500m',
  'row_1k',
  'row_2k',
  'ski_1k',
]);

/** Las carreras HYROX son de la carrera (otro bloque), no un test. */
const NO_ES_TEST: ReadonlySet<string> = new Set(['hyrox_open', 'hyrox_pro']);

export function familiaDeTest(slug: string): Familia {
  return FAMILIA_TEST[slug] ?? 'otro';
}

/** La unidad de un test en el contrato, desde la de la base (y el slug, para los umbrales de ritmo). */
export function unidadDeTest(slug: string, unidad_bd: string): Unidad | null {
  if (slug === 'run_threshold_s_per_km') return 's_km';
  if (slug.endsWith('_threshold_s_per_500m')) return 's_500m';
  switch (unidad_bd) {
    case BENCHMARK_UNIT_SECONDS:
      return 'segundos';
    case BENCHMARK_UNIT_KG:
      return 'kg';
    case BENCHMARK_UNIT_REPS:
      return 'reps';
    case BENCHMARK_UNIT_METERS:
      return 'metros';
    case BENCHMARK_UNIT_BPM:
      return 'bpm';
    case BENCHMARK_UNIT_WATTS:
      return 'watts';
    case BENCHMARK_UNIT_CM:
      return 'cm';
    default:
      return null;
  }
}

export function tituloDeTest(slug: string): string {
  return STRENGTH_LIFT_BY_SLUG.has(slug) ? `${strengthLiftLabel(slug)} · 1RM (test)` : benchmarkLabel(slug);
}

export interface EntradaTests {
  ventana: VentanaResuelta;
  resultados: readonly ResultadoTest[];
  metodo: CoachAnalyticsMethod;
}

export interface SalidaTests {
  /** Una lectura por test (`test.<slug>`), con su familia. */
  lecturas: Lectura[];
  /** Récords de los tests que no son un peldaño ni una pieza de su familia. */
  candidatos: CandidatoRecord[];
}

const PROCEDENCIA_TEST: Procedencia = {
  de: 'test_coach',
  explica_es: 'Medido en un test. La serie es toda su historia; la ventana decide qué se compara.',
  medida: true,
  ancla: null,
  proveedor: null,
};

export function progresoTests(e: EntradaTests): SalidaTests {
  const { ventana } = e;
  const porSlug = new Map<string, ResultadoTest[]>();
  for (const r of e.resultados) {
    if (NO_ES_TEST.has(r.slug) || !Number.isFinite(r.valor) || r.valor <= 0) continue;
    porSlug.set(r.slug, [...(porSlug.get(r.slug) ?? []), r]);
  }
  const lecturas: Lectura[] = [];
  const candidatos: CandidatoRecord[] = [];
  for (const slug of [...porSlug.keys()].sort()) {
    const xs = [...porSlug.get(slug)!].sort((a, b) => a.dia.localeCompare(b.dia));
    const unidad = unidadDeTest(slug, xs[0]!.unidad_bd);
    if (unidad == null) continue;
    const dirigido = benchmarkIsDirectional(slug);
    const sentido: Sentido = benchmarkLowerIsBetter(xs[0]!.unidad_bd) ? 'menor' : 'mayor';
    const familia = familiaDeTest(slug);
    const titulo = tituloDeTest(slug);
    const mejor = (ys: readonly ResultadoTest[]) => mejorDe(ys.map((y) => y.valor), sentido);
    const medidas = medidasDe(xs, ventana, mejor);

    // El test anterior al que se enseña: «contra tu último test», caiga donde caiga.
    const shown = medidas.actual ?? medidas.ultima;
    let referencia = null;
    if (shown) {
      const periodo = medidas.actual ? ventana : periodoHasta(shown.ultimo, ventana.dias);
      const delDato = enPeriodo(xs, periodo).find((x) => x.valor === shown.valor);
      const previo = delDato ? [...xs].reverse().find((x) => x.dia < delDato.dia) : undefined;
      if (previo) referencia = { valor: previo.valor, delta: shown.valor - previo.valor, de: 'test_anterior' };
    }

    lecturas.push(
      lecturaProgreso({
        id: `test.${slug}`,
        grupo: 'progreso',
        familia,
        titulo_es: titulo,
        unidad,
        sentido: dirigido ? sentido : null,
        umbral: { unidad: 'pct', cambio_minimo: dirigido ? e.metodo.cambio_test_pct : null },
        medidas,
        minimo: MINIMO_MEJOR,
        ventana,
        serie: serieDeIntentos(xs, unidad, mejor),
        referencia,
        procedencia: dirigido
          ? PROCEDENCIA_TEST
          : { ...PROCEDENCIA_TEST, explica_es: 'Medido en un test. Es un ancla de tus zonas, no un rendimiento: se enseña, no se juzga.' },
        falta_sin_dato: { por: 'ocasion' },
      }),
    );
    if (dirigido && !TESTS_EN_FAMILIA.has(slug)) {
      for (const x of xs) {
        candidatos.push({ prueba: `test.${slug}`, familia, titulo_es: titulo, valor: x.valor, unidad, sentido, dia: x.dia, procedencia: PROCEDENCIA_TEST });
      }
    }
  }
  return { lecturas, candidatos };
}
