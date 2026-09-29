// ¿MEJORO EN FUERZA? — la fila de fuerza y su detalle (docs/analiticas/modelo.md,
// «Detalles por familia», fuerza), con la regla común de `./progreso`.
//
// EL 1RM ESTIMADO, CON LA FÓRMULA DEL COACH (arregla P18)
// ------------------------------------------------------
// La fórmula es `coach_methodology.one_rm_estimation` — la misma con la que se
// guardan sus tests de fuerza —, no Epley fijo. Y solo de series de hasta
// `fuerza_1rm_reps_max` reps (método, defecto 10): por encima, las fórmulas se
// separan y lo que miden ya es resistencia. El RIR no entra: pasar reps + RIR a
// %1RM es una tabla del coach (RPE/%RM) que todavía no tiene editor, y aquí no
// se cablea (DECISIONS 29-09, «Mapear %RM + reps a esfuerzo… es método»).
//
// EL PESO CORPORAL: un ejercicio del catálogo a peso corporal que el atleta
// nunca ha cargado progresa en REPS por serie. Una serie cargada sin kilos
// apuntados no es peso corporal: no progresa nada (cuenta en el volumen).
//
// LA FILA: el 1RM estimado del levantamiento principal — el que más series
// tiene en la ventana, entre los que se pueden comparar con la anterior.
//
// Puro y sin base de datos.

import { estimateOneRm, setVolumeKg, type OneRmMethod } from '../strength';
import { lecturaMedida, lecturaSinDato, pctCobertura, type Lectura, type Parte, type Reparto } from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import {
  enPeriodo,
  faltaDeFamiliaVacia,
  lecturaProgreso,
  medidasDe,
  mejorDe,
  MINIMO_MEJOR,
  referenciaRecord,
  serieSemanalDe,
  type Fechada,
  type FilaProgreso,
  type SalidaFamilia,
} from './progreso';
import { recordsPorPrueba, type CandidatoRecord } from './records';
import type { VentanaResuelta } from './ventana';

/** Una serie de fuerza hecha, en el día local del atleta. */
export interface SerieFuerza extends Fechada {
  sesion_id: string;
  ejercicio_id: string;
  /** El nombre que ve el atleta (el del coach si lo renombró). */
  ejercicio: string;
  /** `exercises.movement_pattern`. */
  patron: string | null;
  /** El ejercicio es a peso corporal en el catálogo (`esPesoCorporal`). */
  peso_corporal: boolean;
  reps: number | null;
  kg: number | null;
  /** done | scaled | skipped. */
  estado: string;
}

/** Los implementos que sostienen el cuerpo sin añadir carga. Mecanismo: la lectura del catálogo. */
const IMPLEMENTOS_PESO_CORPORAL: ReadonlySet<string> = new Set(['bodyweight', 'pull_up_bar', 'parallel_bars']);

/**
 * Los que AÑADEN carga. Un ejercicio que los lista (unas dominadas con lastre:
 * `bodyweight, dip_belt, plate`; unas zancadas: `bodyweight, dumbbell`) se puede
 * hacer cargado, así que una serie sin kilos apuntados no dice que fuera a peso
 * corporal: no progresa en reps.
 */
const IMPLEMENTOS_DE_CARGA: ReadonlySet<string> = new Set([
  'barbell',
  'dumbbell',
  'kettlebell',
  'plate',
  'dip_belt',
  'sandbag',
  'sled',
  'wall_ball',
  'atlas_stone',
  'cable',
  'cable_or_band',
]);

/** ¿El ejercicio es a peso corporal según su equipo en el catálogo (y no admite carga)? */
export function esPesoCorporal(equipment: readonly string[] | null | undefined): boolean {
  const eq = equipment ?? [];
  return eq.some((e) => IMPLEMENTOS_PESO_CORPORAL.has(e)) && !eq.some((e) => IMPLEMENTOS_DE_CARGA.has(e));
}

/** Las repeticiones de la tabla de mejores: fuerza (1-5), hipertrofia (8-12), resistencia (15-20). */
export const REPS_TABLA: readonly number[] = [1, 2, 3, 5, 8, 10, 12, 15, 20];

/** Cómo se llama cada patrón de movimiento del catálogo delante del atleta. */
const PATRON_ETIQUETA_ES: Readonly<Record<string, string>> = {
  squat: 'Sentadilla',
  hinge: 'Bisagra de cadera',
  lunge: 'Zancada',
  horizontal_push: 'Empuje horizontal',
  vertical_push: 'Empuje vertical',
  horizontal_pull: 'Tirón horizontal',
  vertical_pull: 'Tirón vertical',
  olympic: 'Olímpicos',
  carry: 'Acarreo',
  hold: 'Isométrico',
  rotation: 'Rotación',
  jump: 'Saltos',
  other: 'Otros',
};

export function etiquetaPatron(p: string | null): string {
  if (p == null) return 'Sin patrón';
  return PATRON_ETIQUETA_ES[p] ?? p.replace(/_/g, ' ');
}

export interface EntradaFuerza {
  ventana: VentanaResuelta;
  series: readonly SerieFuerza[];
  formula: OneRmMethod;
  metodo: CoachAnalyticsMethod;
  sin_historia: boolean;
}

const hecha = (s: SerieFuerza) => s.estado !== 'skipped' && s.reps != null && s.reps > 0;

interface ObsE1rm extends Fechada {
  e1rm: number;
}
interface ObsReps extends Fechada {
  reps: number;
}

const maxE1rm = (xs: readonly ObsE1rm[]) => {
  const v = mejorDe(xs.map((x) => x.e1rm), 'mayor');
  return v == null ? null : Math.round(v * 10) / 10;
};
const maxReps = (xs: readonly ObsReps[]) => mejorDe(xs.map((x) => x.reps), 'mayor');

/** La fila, el detalle y los candidatos a récord de fuerza. */
export function progresoFuerza(e: EntradaFuerza): SalidaFamilia {
  const { ventana, metodo, formula } = e;
  const repsMax = metodo.fuerza_1rm_reps_max;
  const umbral = { unidad: 'pct' as const, cambio_minimo: metodo.cambio_fuerza_pct };
  const vacia = faltaDeFamiliaVacia(e.sin_historia, ventana);
  const series = e.series.filter(hecha);

  // Los ejercicios, en el orden de siempre: más series en la ventana primero.
  const porEjercicio = new Map<string, SerieFuerza[]>();
  for (const s of series) {
    const l = porEjercicio.get(s.ejercicio_id) ?? [];
    l.push(s);
    porEjercicio.set(s.ejercicio_id, l);
  }
  const enVentana = (l: readonly SerieFuerza[]) => enPeriodo(l, ventana).length;
  const enAnterior = (l: readonly SerieFuerza[]) => (ventana.anterior ? enPeriodo(l, ventana.anterior).length : 0);
  const ejercicios = [...porEjercicio.entries()].sort(
    ([, a], [, b]) => enVentana(b) - enVentana(a) || enAnterior(b) - enAnterior(a) || a[0]!.ejercicio.localeCompare(b[0]!.ejercicio),
  );

  const candidatos: CandidatoRecord[] = [];
  const filasE1rm: FilaProgreso[] = [];
  const filasReps: FilaProgreso[] = [];
  const tablas: Lectura[] = [];
  const procE1rm = {
    de: `e1rm_${formula.toLowerCase()}`,
    explica_es: `Estimado con la fórmula de ${formula} (la de tu coach) de tu mejor serie de hasta ${repsMax} reps.`,
    medida: false,
    ancla: null,
    proveedor: null,
  };

  for (const [id, lista] of ejercicios) {
    const nombre = lista[0]!.ejercicio;
    const cargadas = lista.filter((s) => s.kg != null && s.kg > 0);
    if (cargadas.length > 0) {
      const obs: ObsE1rm[] = cargadas
        .filter((s) => (s.reps ?? 0) <= repsMax)
        .map((s) => ({ dia: s.dia, e1rm: estimateOneRm(s.kg!, s.reps!, formula) }));
      for (const o of obs) {
        candidatos.push({ prueba: `fuerza.e1rm.${id}`, familia: 'fuerza', titulo_es: `${nombre} · 1RM estimado`, valor: o.e1rm, unidad: 'kg', sentido: 'mayor', dia: o.dia, procedencia: procE1rm });
      }
      if (obs.length > 0) {
        filasE1rm.push({
          id: `fuerza.e1rm.${id}`,
          grupo: 'progreso',
          familia: 'fuerza',
          titulo_es: `${nombre} · 1RM estimado`,
          unidad: 'kg',
          sentido: 'mayor',
          umbral,
          medidas: medidasDe(obs, ventana, maxE1rm),
          minimo: MINIMO_MEJOR,
          ventana,
          serie: serieSemanalDe(obs, ventana, 'kg', maxE1rm),
          procedencia: procE1rm,
          falta_sin_dato: vacia,
        });
      }
      tablas.push(lecturaTablaReps(id, nombre, cargadas, ventana));
    } else if (lista.some((s) => s.peso_corporal)) {
      const obs: ObsReps[] = lista.map((s) => ({ dia: s.dia, reps: s.reps! }));
      const proc = { de: 'mejor_serie_reps', explica_es: 'Tus reps en la mejor serie del periodo, a peso corporal.', medida: true, ancla: null, proveedor: null };
      for (const o of obs) {
        candidatos.push({ prueba: `fuerza.reps.${id}`, familia: 'fuerza', titulo_es: `${nombre} · mejor serie`, valor: o.reps, unidad: 'reps', sentido: 'mayor', dia: o.dia, procedencia: proc });
      }
      filasReps.push({
        id: `fuerza.reps.${id}`,
        grupo: 'progreso',
        familia: 'fuerza',
        titulo_es: `${nombre} · mejor serie`,
        unidad: 'reps',
        sentido: 'mayor',
        umbral,
        medidas: medidasDe(obs, ventana, maxReps),
        minimo: MINIMO_MEJOR,
        ventana,
        serie: serieSemanalDe(obs, ventana, 'reps', maxReps),
        procedencia: proc,
        falta_sin_dato: vacia,
      });
    }
  }

  // Cada ejercicio con su récord de siempre como referencia.
  const records = recordsPorPrueba(candidatos);
  const conRecord = (f: FilaProgreso): FilaProgreso => ({ ...f, referencia: referenciaRecord(f.medidas, records.get(f.id)?.record.valor ?? null) });

  // LA FILA: el principal — primero el que se puede comparar, si no el que
  // tiene número, si no el de dato más reciente. Cargado antes que peso corporal.
  const comparable = (f: FilaProgreso) =>
    f.medidas.actual != null && f.medidas.anterior != null && f.medidas.actual.muestras >= f.minimo && f.medidas.anterior.muestras >= f.minimo;
  const todas = [...filasE1rm, ...filasReps];
  const recientes = [...todas].sort((a, b) => (b.medidas.ultima?.ultimo ?? '').localeCompare(a.medidas.ultima?.ultimo ?? ''));
  const elegida = todas.find(comparable) ?? todas.find((f) => f.medidas.actual != null) ?? recientes.find((f) => f.medidas.ultima != null);
  const fila = elegida
    ? lecturaProgreso({ ...conRecord(elegida), id: 'progreso.fuerza', titulo_es: `Fuerza · ${elegida.titulo_es}` })
    : lecturaSinDato({
        id: 'progreso.fuerza',
        grupo: 'progreso',
        familia: 'fuerza',
        titulo_es: 'Fuerza',
        falta: vacia,
        cobertura: { dias_ventana: ventana.dias },
        procedencia: { de: 'progreso_fuerza', explica_es: 'El 1RM estimado de tu levantamiento principal, o tus reps a peso corporal.', medida: false, ancla: null, proveedor: null },
      });

  const detalle: Lectura[] = [
    fila,
    ...filasE1rm.map((f) => lecturaProgreso(conRecord(f))),
    ...filasReps.map((f) => lecturaProgreso(conRecord(f))),
    ...tablas,
    ...lecturasVolumen(series, e),
  ];
  return { fila, detalle, candidatos };
}

/**
 * Lo más pesado que ha movido para cada número de reps — una serie de 5 cuenta
 * también para 3 (quien hace 100 × 5 ha hecho 100 × 3) —, de siempre.
 */
function lecturaTablaReps(id: string, nombre: string, cargadas: readonly SerieFuerza[], ventana: VentanaResuelta): Lectura {
  const partes: Parte[] = [];
  for (const r of REPS_TABLA) {
    const kg = mejorDe(cargadas.filter((s) => (s.reps ?? 0) >= r).map((s) => s.kg!), 'mayor');
    if (kg != null) partes.push({ code: String(r), etiqueta_es: r === 1 ? '1 rep' : `${r} reps`, valor: kg, pct: null });
  }
  const maxKg = mejorDe(cargadas.map((s) => s.kg!), 'mayor') ?? 0;
  const dias = new Set(enPeriodo(cargadas, ventana).map((s) => s.dia)).size;
  return lecturaMedida({
    id: `fuerza.rm.${id}`,
    grupo: 'progreso',
    familia: 'fuerza',
    titulo_es: `${nombre} · mejores por reps`,
    dato: { valor: maxKg, unidad: 'kg', referencia: null },
    reparto: { unidad: 'kg', total: maxKg, partes },
    cobertura: { muestras: cargadas.length, dias_ventana: ventana.dias, dias_con_dato: dias, pct: pctCobertura(dias, ventana.dias) },
    procedencia: {
      de: 'mejores_por_reps',
      explica_es: 'Lo más pesado que has movido para cada número de repeticiones, de siempre (una serie de 5 cuenta también para 3). Levantado, no estimado.',
      medida: true,
      ancla: null,
      proveedor: null,
    },
  });
}

interface ObsVolumen extends Fechada {
  patron: string;
  kg: number;
}

/** Series y tonelaje por patrón de movimiento: el total con su reparto, y cada patrón con su semana. */
function lecturasVolumen(series: readonly SerieFuerza[], e: EntradaFuerza): Lectura[] {
  const { ventana } = e;
  const obs: ObsVolumen[] = series.map((s) => ({ dia: s.dia, patron: s.patron ?? 'sin_patron', kg: setVolumeKg({ reps: s.reps, kg: s.kg, status: s.estado }) }));
  const cuenta = (xs: readonly ObsVolumen[]) => xs.length;
  const tonelaje = (xs: readonly ObsVolumen[]) => Math.round(xs.reduce((a, x) => a + x.kg, 0));
  const patrones = [...new Set(obs.map((o) => o.patron))].sort();
  const repartoDe = (agregar: (xs: readonly ObsVolumen[]) => number, unidad: 'series' | 'kg'): Reparto => {
    const actuales = enPeriodo(obs, ventana);
    const total = agregar(actuales);
    const partes = patrones
      .map((p) => {
        const v = agregar(actuales.filter((o) => o.patron === p));
        return { code: p, etiqueta_es: etiquetaPatron(p === 'sin_patron' ? null : p), valor: v, pct: total > 0 ? (v / total) * 100 : null };
      })
      .filter((x) => x.valor > 0);
    return { unidad, total, partes };
  };
  const proc = (explica_es: string) => ({ de: 'volumen_fuerza', explica_es, medida: true, ancla: null, proveedor: null });
  const total = (id: string, titulo: string, unidad: 'series' | 'kg', agregar: (xs: readonly ObsVolumen[]) => number, explica: string, xs: readonly ObsVolumen[], reparto: Reparto | null) =>
    lecturaProgreso({
      id,
      grupo: 'progreso',
      familia: 'fuerza',
      titulo_es: titulo,
      unidad,
      sentido: null,
      umbral: { unidad: 'pct', cambio_minimo: null },
      medidas: medidasDe(xs, ventana, agregar),
      minimo: MINIMO_MEJOR,
      ventana,
      serie: serieSemanalDe(xs, ventana, unidad, agregar),
      reparto,
      procedencia: proc(explica),
      falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, ventana),
    });

  const out: Lectura[] = [
    total('fuerza.series', 'Series', 'series', cuenta, 'Las series hechas de cada periodo, repartidas por patrón de movimiento.', obs, repartoDe(cuenta, 'series')),
    total('fuerza.tonelaje', 'Tonelaje', 'kg', tonelaje, 'Carga × reps de cada serie hecha; a peso corporal suma reps, no kilos.', obs, repartoDe(tonelaje, 'kg')),
  ];
  for (const p of patrones) {
    const xs = obs.filter((o) => o.patron === p);
    const etiqueta = etiquetaPatron(p === 'sin_patron' ? null : p);
    out.push(total(`fuerza.patron.${p}.series`, `${etiqueta} · series`, 'series', cuenta, `Las series de ${etiqueta.toLowerCase()} de cada semana.`, xs, null));
    out.push(total(`fuerza.patron.${p}.tonelaje`, `${etiqueta} · tonelaje`, 'kg', tonelaje, `El tonelaje de ${etiqueta.toLowerCase()} de cada semana.`, xs, null));
  }
  return out;
}
