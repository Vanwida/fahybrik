// ¿MEJORO EN EL ERGO? — remo, SkiErg y BikeErg, CADA MÁQUINA LA SUYA
// (docs/analiticas/modelo.md, «Detalles por familia»): el umbral es por
// máquina, y un 2000 m de remo no dice nada de un 2000 m de ski.
//
// LAS PIEZAS ESTÁNDAR DE CONCEPT2 (100 m, 500 m, 1000 m, 2000 m, 5000 m; 1′, 4′,
// 30′) salen de cada tramo de trabajo y de cada parcial del monitor
// (`erg_splits`, «dentro» del tramo): una pieza de distancia dentro de su banda
// (±10 %, la regla de la curva de correr) se lleva a la distancia exacta con
// Riegel; una de tiempo, a los metros de ese tiempo. NUNCA de la sesión entera:
// en un ergo los descansos no son tramos, y sumar cuatro 500 daría un «2000»
// sin sus pausas. Un test (2000 m de remo, 1000 m de ski…) es una pieza más.
//
// LA FILA: el Motor de la máquina (vatios al mismo pulso) si se puede comparar;
// si no, la pieza más larga con dato en los dos periodos, en ritmo por 500 m
// (por 1000 m en la bici). El cambio que cuenta es `cambio_ergo_pct` del coach.
//
// Puro y sin base de datos.

import { RIEGEL_ENDURANCE_EXPONENT, riegelTime } from '../athlete/mark-projection';
import type { CoachRunningThresholds } from '../coach/running-thresholds';
import type { HrZoneFractions } from '../methodology/hr-zones';
import { referenceBpmFromBand } from '../running/same-hr-pace';
import type { AnclasAtleta } from './anclas';
import { wattsDeSplit500 } from './anclas';
import { anclaCuenta, lecturaSinDato, type Familia, type Lectura, type Procedencia, type Unidad } from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import {
  faltaDeFamiliaVacia,
  lecturaProgreso,
  mediaPonderada,
  medidasDe,
  mejorDe,
  MINIMO_MEDIA,
  MINIMO_MEJOR,
  referenciaRecord,
  serieSemanalDe,
  type Fechada,
  type FilaProgreso,
  type SalidaFamilia,
  type Sentido,
} from './progreso';
import { recordsPorPrueba, type CandidatoRecord } from './records';
import type { VentanaResuelta } from './ventana';

export type Maquina = 'row' | 'ski' | 'bike';

export const FAMILIA_DE_MAQUINA: Record<Maquina, Familia> = { row: 'remo', ski: 'ski', bike: 'bici' };
const NOMBRE_MAQUINA: Record<Maquina, string> = { row: 'Remo', ski: 'SkiErg', bike: 'BikeErg' };

/** Un tramo de ergo ya leído, en el día local del atleta. */
export interface TramoErgo extends Fechada {
  sesion_id: string;
  maquina: Maquina;
  segundos: number;
  metros: number | null;
  /** El ritmo del monitor por 500 m, si lo mandó. */
  ritmo_s_500m: number | null;
  vatios: number | null;
  pulso: number | null;
  /** Paladas por minuto (remo, ski) o pedaladas por minuto (bici). */
  cadencia: number | null;
  trabajo: boolean;
  /** Los parciales del monitor (PM5) con tiempo y distancia: cada uno, una pieza posible. */
  parciales: ReadonlyArray<{ segundos: number; metros: number }>;
}

/** Un test de ergo (`athlete_benchmarks`): tiempo de una pieza de distancia. */
export interface MarcaErgo extends Fechada {
  maquina: Maquina;
  metros: number;
  segundos: number;
}

export interface PiezaErgo {
  clave: string;
  tipo: 'distancia' | 'tiempo';
  /** Metros (distancia) o segundos (tiempo). */
  objetivo: number;
  nombre: string;
}

/** Las piezas estándar de Concept2, de la más corta a la más larga. Mecanismo: son las del monitor. */
export const PIEZAS_ERGO: readonly PiezaErgo[] = [
  { clave: '100', tipo: 'distancia', objetivo: 100, nombre: '100 m' },
  { clave: '500', tipo: 'distancia', objetivo: 500, nombre: '500 m' },
  { clave: '1000', tipo: 'distancia', objetivo: 1000, nombre: '1000 m' },
  { clave: '2000', tipo: 'distancia', objetivo: 2000, nombre: '2000 m' },
  { clave: '5000', tipo: 'distancia', objetivo: 5000, nombre: '5000 m' },
  { clave: '60s', tipo: 'tiempo', objetivo: 60, nombre: '1′' },
  { clave: '240s', tipo: 'tiempo', objetivo: 240, nombre: '4′' },
  { clave: '1800s', tipo: 'tiempo', objetivo: 1800, nombre: '30′' },
];

/** Media banda de una pieza (la misma regla ±10 % de la curva de correr). */
const BANDA = 0.1;

/** Los metros que cubriría en `objetivo` segundos quien hizo `metros` en `segundos` (Riegel, al revés). */
function metrosEnTiempo(metros: number, segundos: number, objetivo: number): number {
  return metros * (objetivo / segundos) ** (1 / RIEGEL_ENDURANCE_EXPONENT);
}

/** El valor de un esfuerzo en una pieza (segundos o metros), o null si no es de esa pieza. */
export function valorEnPieza(metros: number, segundos: number, p: PiezaErgo): number | null {
  if (!Number.isFinite(metros) || metros <= 0 || !Number.isFinite(segundos) || segundos <= 0) return null;
  if (p.tipo === 'distancia') {
    if (Math.abs(metros - p.objetivo) > p.objetivo * BANDA) return null;
    const t = riegelTime(segundos, metros, p.objetivo);
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  if (Math.abs(segundos - p.objetivo) > p.objetivo * BANDA) return null;
  const d = metrosEnTiempo(metros, segundos, p.objetivo);
  return Number.isFinite(d) && d > 0 ? d : null;
}

const sentidoDePieza = (p: PiezaErgo): Sentido => (p.tipo === 'distancia' ? 'menor' : 'mayor');
const unidadDePieza = (p: PiezaErgo): Unidad => (p.tipo === 'distancia' ? 'segundos' : 'metros');

interface EsfuerzoPieza extends Fechada {
  pieza: PiezaErgo;
  valor: number;
  alcance: 'tramo' | 'parcial' | 'test';
}

function metrosDe(t: TramoErgo): number | null {
  if (t.metros != null && t.metros > 0) return t.metros;
  if (t.ritmo_s_500m != null && t.ritmo_s_500m > 0 && t.segundos > 0) return (t.segundos * 500) / t.ritmo_s_500m;
  return null;
}

function esfuerzosPiezas(tramos: readonly TramoErgo[], marcas: readonly MarcaErgo[]): EsfuerzoPieza[] {
  const out: EsfuerzoPieza[] = [];
  const ofrecer = (metros: number, segundos: number, dia: string, alcance: EsfuerzoPieza['alcance']) => {
    for (const p of PIEZAS_ERGO) {
      const v = valorEnPieza(metros, segundos, p);
      if (v != null) out.push({ dia, pieza: p, valor: v, alcance });
    }
  };
  for (const t of tramos) {
    if (!t.trabajo) continue;
    const m = metrosDe(t);
    if (m != null) ofrecer(m, t.segundos, t.dia, 'tramo');
    for (const s of t.parciales) ofrecer(s.metros, s.segundos, t.dia, 'parcial');
  }
  for (const m of marcas) ofrecer(m.metros, m.segundos, m.dia, 'test');
  return out;
}

const PROCEDENCIA_PIEZA: Record<EsfuerzoPieza['alcance'], Procedencia> = {
  tramo: { de: 'pieza_ergo_tramo', explica_es: 'Un tramo de ese largo, llevado a la pieza exacta (Riegel).', medida: true, ancla: null, proveedor: null },
  parcial: { de: 'pieza_ergo_parcial', explica_es: 'Un parcial del monitor dentro de una sesión, llevado a la pieza exacta.', medida: true, ancla: null, proveedor: null },
  test: { de: 'marca_test', explica_es: 'Medido en un test.', medida: true, ancla: null, proveedor: null },
};

export interface EntradaErgo {
  maquina: Maquina;
  ventana: VentanaResuelta;
  /** Solo los tramos de ESTA máquina. */
  tramos: readonly TramoErgo[];
  marcas: readonly MarcaErgo[];
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  umbrales: CoachRunningThresholds;
  metodo: CoachAnalyticsMethod;
  sin_historia: boolean;
}

interface ObsMotorErgo extends Fechada {
  vatios: number;
  segundos: number;
}

function pulsoDeReferencia(e: EntradaErgo): number | null {
  const u = e.anclas.pulso;
  if (!u || !anclaCuenta(u.ancla)) return null;
  const f = e.fracciones_hr[e.umbrales.same_hr_reference_zone as 1 | 2 | 3 | 4 | 5];
  if (!f) return null;
  return referenceBpmFromBand({ min_bpm: Math.round(u.valor * f.lo), max_bpm: Math.round(u.valor * f.hi) });
}

/**
 * Vatios al mismo pulso: los tramos con pulso dentro de la banda del coach
 * alrededor de la referencia, y al menos `same_hr_min_distance_m` metros (el
 * pulso medio va por detrás del esfuerzo al empezar), corregidos en proporción
 * (a más pulso por los mismos vatios, peor motor). Remo y ski sacan los vatios
 * del ritmo si el monitor no los mandó (en un Concept2 son la misma medida); la
 * bici, solo de los del monitor.
 */
function obsMotorErgo(e: EntradaErgo, ref: number): ObsMotorErgo[] {
  const out: ObsMotorErgo[] = [];
  for (const t of e.tramos) {
    if (!t.trabajo || t.pulso == null || t.pulso <= 0 || t.segundos <= 0) continue;
    if (Math.abs(t.pulso - ref) > e.umbrales.same_hr_tolerance_bpm) continue;
    const m = metrosDe(t);
    if (m == null || m < e.umbrales.same_hr_min_distance_m) continue;
    const w = t.vatios != null && t.vatios > 0 ? t.vatios : e.maquina === 'bike' ? null : wattsDeSplit500(t.ritmo_s_500m ?? (t.segundos * 500) / m);
    if (w == null || !(w > 0)) continue;
    out.push({ dia: t.dia, vatios: w * (ref / t.pulso), segundos: t.segundos });
  }
  return out;
}

const motorErgo = (xs: readonly ObsMotorErgo[]) => {
  const v = mediaPonderada(xs.map((x) => ({ valor: x.vatios, peso: x.segundos })));
  return v == null ? null : Math.round(v);
};

/** Ritmo de una pieza, por 500 m (por 1000 m en la bici). */
function ritmoDePieza(p: PiezaErgo, valor: number, maquina: Maquina): number {
  const por = maquina === 'bike' ? 1000 : 500;
  return p.tipo === 'distancia' ? (valor / p.objetivo) * por : (p.objetivo / valor) * por;
}

/** La fila, el detalle y los candidatos a récord de UNA máquina. */
export function progresoErgo(e: EntradaErgo): SalidaFamilia {
  const familia = FAMILIA_DE_MAQUINA[e.maquina];
  const nombre = NOMBRE_MAQUINA[e.maquina];
  const unidadRitmo: Unidad = e.maquina === 'bike' ? 's_1000m' : 's_500m';
  const vacia = faltaDeFamiliaVacia(e.sin_historia, e.ventana);
  const umbralPct = { unidad: 'pct' as const, cambio_minimo: e.metodo.cambio_ergo_pct };

  const piezas = esfuerzosPiezas(e.tramos, e.marcas);
  const candidatos: CandidatoRecord[] = piezas.map((x) => ({
    prueba: `${familia}.${x.pieza.clave}`,
    familia,
    titulo_es: `${nombre} · ${x.pieza.nombre}`,
    valor: x.valor,
    unidad: unidadDePieza(x.pieza),
    sentido: sentidoDePieza(x.pieza),
    dia: x.dia,
    procedencia: PROCEDENCIA_PIEZA[x.alcance],
  }));
  const records = recordsPorPrueba(candidatos);

  const filaPieza = (p: PiezaErgo, id: string, comoRitmo: boolean): FilaProgreso => {
    const lista = piezas.filter((x) => x.pieza.clave === p.clave);
    const sentido = sentidoDePieza(p);
    const agregar = (xs: readonly EsfuerzoPieza[]) => {
      const v = mejorDe(xs.map((x) => x.valor), sentido);
      return v == null ? null : comoRitmo ? Math.round(ritmoDePieza(p, v, e.maquina) * 10) / 10 : Math.round(v * 10) / 10;
    };
    const medidas = medidasDe(lista, e.ventana, agregar);
    const record = records.get(`${familia}.${p.clave}`)?.record.valor ?? null;
    return {
      id,
      grupo: 'progreso',
      familia,
      titulo_es: comoRitmo ? `${nombre} · Mejor ${p.nombre}` : `Mejor ${p.nombre}`,
      unidad: comoRitmo ? unidadRitmo : unidadDePieza(p),
      sentido: comoRitmo ? 'menor' : sentido,
      umbral: umbralPct,
      medidas,
      minimo: MINIMO_MEJOR,
      ventana: e.ventana,
      serie: serieSemanalDe(lista, e.ventana, comoRitmo ? unidadRitmo : unidadDePieza(p), agregar),
      referencia: comoRitmo ? null : referenciaRecord(medidas, record != null ? Math.round(record * 10) / 10 : null),
      procedencia: {
        de: `pieza_ergo_${p.clave}`,
        explica_es: `Tu mejor ${p.nombre} de ${nombre} de cada periodo: un tramo o un parcial del monitor de ese largo, o un test.`,
        medida: true,
        ancla: null,
        proveedor: null,
      },
      falta_sin_dato: vacia,
    };
  };

  const ref = pulsoDeReferencia(e);
  const obsMotor = ref != null ? obsMotorErgo(e, ref) : [];
  const filaMotor = (id: string, titulo: string): FilaProgreso => ({
    id,
    grupo: 'progreso',
    familia,
    titulo_es: titulo,
    unidad: 'watts',
    sentido: 'mayor',
    umbral: umbralPct,
    medidas: medidasDe(obsMotor, e.ventana, motorErgo),
    minimo: MINIMO_MEDIA,
    ventana: e.ventana,
    serie: serieSemanalDe(obsMotor, e.ventana, 'watts', motorErgo),
    procedencia: {
      de: 'vatios_al_pulso',
      explica_es:
        ref != null
          ? `Tus vatios corregidos a ${ref} ppm (el centro de tu zona ${e.umbrales.same_hr_reference_zone}), en tramos de al menos ${e.umbrales.same_hr_min_distance_m} m.`
          : 'Tus vatios a un mismo pulso: la forma de la máquina, sin el esfuerzo del día.',
      medida: true,
      ancla: e.anclas.pulso?.ancla ?? null,
      proveedor: null,
    },
    falta_sin_dato:
      e.tramos.length > 0 && !e.tramos.some((t) => t.pulso != null) ? { por: 'sensor' } : e.tramos.length > 0 && ref == null ? { por: 'ancla' } : vacia,
  });

  // LA FILA: Motor si se puede comparar; si no, la pieza más larga comparable;
  // si no, lo primero con número o con dato viejo.
  const idFila = `progreso.${familia}`;
  const candidatas: FilaProgreso[] = [];
  if (ref != null) candidatas.push(filaMotor(idFila, `${nombre} · Motor`));
  const porLargo = [...PIEZAS_ERGO].sort((a, b) => duracionTipica(b) - duracionTipica(a));
  for (const p of porLargo) if (piezas.some((x) => x.pieza.clave === p.clave)) candidatas.push(filaPieza(p, idFila, true));
  const comparable = (f: FilaProgreso) =>
    f.medidas.actual != null && f.medidas.anterior != null && f.medidas.actual.muestras >= f.minimo && f.medidas.anterior.muestras >= f.minimo;
  const elegida = candidatas.find(comparable) ?? candidatas.find((f) => f.medidas.actual != null) ?? candidatas.find((f) => f.medidas.ultima != null);
  const procedenciaVacia: Procedencia = { de: `progreso_${familia}`, explica_es: `Tus vatios a un mismo pulso o tus mejores piezas de ${nombre}.`, medida: true, ancla: null, proveedor: null };
  const fila = elegida
    ? lecturaProgreso(elegida)
    : lecturaSinDato({ id: idFila, grupo: 'progreso', familia, titulo_es: nombre, falta: vacia, cobertura: { dias_ventana: e.ventana.dias }, procedencia: procedenciaVacia });

  const detalle: Lectura[] = [fila, lecturaProgreso(filaMotor(`${familia}.motor`, 'Motor'))];
  for (const p of PIEZAS_ERGO) detalle.push(lecturaProgreso(filaPieza(p, `${familia}.mejor.${p.clave}`, false)));
  detalle.push(lecturaVolumen(e, familia, nombre), lecturaCadencia(e, familia));
  return { fila, detalle, candidatos };
}

/** Cuánto dura una pieza, para ordenarlas de la más larga a la más corta (un 5000 m ≈ 20′). */
function duracionTipica(p: PiezaErgo): number {
  return p.tipo === 'tiempo' ? p.objetivo : p.objetivo * 0.24;
}

function lecturaVolumen(e: EntradaErgo, familia: Familia, nombre: string): Lectura {
  const obs = e.tramos.map((t) => ({ dia: t.dia, metros: metrosDe(t) })).filter((x): x is { dia: string; metros: number } => x.metros != null);
  const agregar = (xs: readonly { metros: number }[]) => Math.round(xs.reduce((a, x) => a + x.metros, 0));
  return lecturaProgreso({
    id: `${familia}.volumen`,
    grupo: 'progreso',
    familia,
    titulo_es: 'Metros',
    unidad: 'metros',
    sentido: null,
    umbral: { unidad: 'pct', cambio_minimo: null },
    medidas: medidasDe(obs, e.ventana, agregar),
    minimo: MINIMO_MEJOR,
    ventana: e.ventana,
    serie: serieSemanalDe(obs, e.ventana, 'metros', agregar),
    procedencia: { de: 'volumen_ergo', explica_es: `Los metros de ${nombre} de cada periodo, recuperaciones incluidas: lo que hizo la máquina.`, medida: true, ancla: null, proveedor: null },
    falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, e.ventana),
  });
}

function lecturaCadencia(e: EntradaErgo, familia: Familia): Lectura {
  const obs = e.tramos
    .filter((t) => t.trabajo && t.cadencia != null && t.cadencia > 0 && t.segundos > 0)
    .map((t) => ({ dia: t.dia, cadencia: t.cadencia!, segundos: t.segundos }));
  const agregar = (xs: readonly { cadencia: number; segundos: number }[]) => {
    const v = mediaPonderada(xs.map((x) => ({ valor: x.cadencia, peso: x.segundos })));
    return v == null ? null : Math.round(v * 10) / 10;
  };
  const unidad: Unidad = e.maquina === 'bike' ? 'rpm' : 'spm';
  return lecturaProgreso({
    id: `${familia}.cadencia`,
    grupo: 'progreso',
    familia,
    titulo_es: e.maquina === 'bike' ? 'Cadencia' : 'Paladas por minuto',
    unidad,
    sentido: null,
    umbral: { unidad, cambio_minimo: null },
    medidas: medidasDe(obs, e.ventana, agregar),
    minimo: MINIMO_MEJOR,
    ventana: e.ventana,
    serie: serieSemanalDe(obs, e.ventana, unidad, agregar),
    procedencia: { de: 'cadencia_ergo', explica_es: 'La media del periodo en tus tramos de trabajo, ponderada por tiempo. Técnica: no es mejor ni peor por sí sola.', medida: true, ancla: null, proveedor: null },
    falta_sin_dato: { por: 'ocasion' },
  });
}
