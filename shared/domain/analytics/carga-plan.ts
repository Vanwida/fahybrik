// LA CARGA PLANIFICADA — lo que una sesión PRESCRITA va a costar, calculado solo
// desde su prescripción tipada (docs/analiticas/modelo.md, A7 y §4).
//
// TrainingPeaks necesita que el coach escriba el TSS planificado a mano. Aquí
// los entrenos están tipados, así que se calcula: duración escrita × intensidad
// objetivo, línea a línea, con la MISMA escalera que precia lo hecho:
//
//   · ritmo (s/km)       contra el ritmo umbral del atleta        → rTSS
//   · ritmo (s/500 m)    convertido a vatios, contra su umbral    → potencia
//   · vatios             contra el umbral de potencia de la máquina
//   · zona (1-5, 6→5)    la intensidad media de la banda del coach (fracción del
//                        umbral): no depende de ningún número del atleta
//   · pulso (ppm)        contra el umbral de pulso
//   · RPE / RIR          por la curva sRPE (10 − RIR)
//
// Sin intensidad prescrita (%RM, kilos, peso corporal, calorías, un tope de
// tiempo) la carga de esa línea NO SE SABE. Sin reloj escrito (`prescriptionDuration`
// lo dice: un «for time», series por repeticiones sin tempo) tampoco. No se
// inventa ni la duración ni la intensidad: el hueco viaja contado.
//
// Puro y sin base de datos.

import {
  flattenSegments,
  prescriptionDuration,
  prescriptionTarget,
  setSeconds,
  setTarget,
  WORKOUT_FORMATS,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '../prescription';
import type { RunStructure } from '../prescription/run-structure';
import type { PrescriptionRole } from '../prescription/completeness';
import { HR_ZONES, type HrZone, type HrZoneFractions } from '../methodology/hr-zones';
import { intensityFromRpe } from '../training-load/tss';
import { anclaCuenta, type Ancla, type Familia } from './lectura';
import { wattsDeSplit500, type AnclasAtleta, type ModalidadPotencia } from './anclas';
import { intensidadDeZona, tssDe, type Peldano } from './carga-tramo';
import type { ModalidadCarga } from './metodo';

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

export interface ItemPlan {
  prescripcion: Prescription | null;
  /** La modalidad del EJERCICIO (0053) o, si no hay, la de la prescripción. */
  modalidad: string | null;
  familia: Familia;
  rol: PrescriptionRole;
}

export interface SesionPlan {
  id: string;
  /** Día LOCAL del atleta (YYYY-MM-DD). */
  dia: string;
  items: readonly ItemPlan[];
}

export interface EntradaCargaPlan {
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
}

// ---------------------------------------------------------------------------
// SALIDA
// ---------------------------------------------------------------------------

export type MotivoSinSaber = 'sin_duracion' | 'sin_intensidad' | 'sin_prescripcion';

export interface PrecioPlanItem {
  familia: Familia;
  /** Segundos escritos. Null cuando la prescripción no cierra el reloj. */
  segundos: number | null;
  /** Carga planificada. Null cuando no se sabe (`motivo` dice por qué). */
  tss: number | null;
  peldano: Peldano | 'zona' | null;
  ancla: Ancla | null;
  motivo: MotivoSinSaber | null;
}

export interface PrecioPlanSesion {
  id: string;
  dia: string;
  items: PrecioPlanItem[];
  /** Suma de lo que se sabe. Un suelo cuando `items_sin_saber` > 0. */
  tss_conocido: number;
  segundos_conocidos: number;
  items_sin_saber: number;
  /** Algún ítem PRINCIPAL sin saber: la sesión entera es «al menos». */
  principal_sin_saber: boolean;
  por_familia: Partial<Record<Familia, { tss: number; segundos: number; sin_saber: number }>>;
}

const MAQUINAS: ReadonlySet<string> = new Set(['row', 'ski', 'bike']);

function util(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

/** El punto medio de un objetivo con rango; el valor si es un punto. */
function medio(value: number | undefined, min: number | undefined, max: number | undefined): number | null {
  if (value != null) return value;
  if (min != null && max != null) return (min + max) / 2;
  return min ?? max ?? null;
}

type Intensidad = { if: number; peldano: Peldano | 'zona'; ancla: Ancla | null };

/** La zona 6 de ritmo se resuelve con la banda de Z5 de pulso (`HR_ZONE_Z6_FALLBACK`, zones.ts). */
function zonaHr(n: number): HrZone | null {
  const z = Math.round(n);
  if (z >= 6) return 5;
  return (HR_ZONES as readonly number[]).includes(z) ? (z as HrZone) : null;
}

/** La intensidad objetivo de una línea, con la escalera de anclas. Null = sin intensidad. */
export function intensidadObjetivo(t: Target | undefined, modalidad: string | null, e: EntradaCargaPlan): Intensidad | null {
  if (!t) return null;
  switch (t.kind) {
    case 'pace': {
      const ritmo = medio(t.value_s, t.min_s, t.max_s);
      if (!util(ritmo)) return null;
      if (t.unit === 'per_500m') {
        if (!MAQUINAS.has(modalidad ?? '')) return null;
        const umbral = e.anclas.potencia[modalidad as ModalidadPotencia];
        const watts = wattsDeSplit500(ritmo);
        if (!umbral || !anclaCuenta(umbral.ancla) || !util(watts)) return null;
        return { if: watts / umbral.valor, peldano: 'potencia', ancla: umbral.ancla };
      }
      const umbral = e.anclas.ritmo.run;
      if (!umbral || !anclaCuenta(umbral.ancla)) return null;
      const porKm = t.unit === 'per_mile' ? ritmo / 1.609344 : ritmo;
      return { if: umbral.valor / porKm, peldano: 'ritmo', ancla: umbral.ancla };
    }
    case 'watts': {
      const w = medio(t.value, t.min, t.max);
      if (!util(w) || !MAQUINAS.has(modalidad ?? '')) return null;
      const umbral = e.anclas.potencia[modalidad as ModalidadPotencia];
      if (!umbral || !anclaCuenta(umbral.ancla)) return null;
      return { if: w / umbral.valor, peldano: 'potencia', ancla: umbral.ancla };
    }
    case 'hr_zone': {
      const lo = t.value ?? t.min;
      const hi = t.value ?? t.max ?? t.min;
      if (lo == null || hi == null) return null;
      const zLo = zonaHr(lo);
      const zHi = zonaHr(hi);
      if (zLo == null || zHi == null) return null;
      // Un rango de zonas (Z2-Z3) se precia a la media de sus centros.
      const f = (intensidadDeZona(zLo, e.fracciones_hr) + intensidadDeZona(zHi, e.fracciones_hr)) / 2;
      return { if: f, peldano: 'zona', ancla: null };
    }
    case 'hr_bpm': {
      const bpm = medio(t.value, t.min, t.max);
      const umbral = e.anclas.pulso;
      if (!util(bpm) || !umbral || !anclaCuenta(umbral.ancla)) return null;
      return { if: bpm / umbral.valor, peldano: 'pulso', ancla: umbral.ancla };
    }
    case 'rpe': {
      const rpe = medio(t.value, t.min, t.max);
      const i = rpe == null ? null : intensityFromRpe(rpe);
      return i == null ? null : { if: i, peldano: 'esfuerzo', ancla: null };
    }
    case 'rir': {
      const rir = medio(t.value, t.min, t.max);
      const i = rir == null ? null : intensityFromRpe(10 - rir);
      return i == null ? null : { if: i, peldano: 'esfuerzo', ancla: null };
    }
    default:
      // percent_rm · kg · bodyweight · relative · calories · time_cap: dicen
      // cuánto o contra qué, no cómo de duro en la escala de la carga.
      return null;
  }
}

/** Metros que cubre una unidad de ritmo. */
const METROS_POR_UNIDAD = { per_km: 1000, per_500m: 500, per_mile: 1609.344 } as const;

/**
 * Una estructura de carrera (#61), tramo a tramo: cada uno con su intensidad y
 * su reloj. Un tramo por distancia en zona de ritmo cierra el reloj con el
 * umbral del atleta (ritmo de la zona = umbral / intensidad): es SU plan, y
 * usar su umbral para estimar cuánto tarda no inventa nada que el plan no diga.
 */
function precioEstructura(
  estructura: RunStructure,
  e: EntradaCargaPlan,
): { segundos: number; tss: number; peldano: Peldano | 'zona'; ancla: Ancla | null } | { motivo: MotivoSinSaber } {
  let segundos = 0;
  let tss = 0;
  let peldano: Peldano | 'zona' | null = null;
  const anclas: Array<Ancla | null> = [];
  for (const seg of flattenSegments(estructura)) {
    const objetivo = seg.target;
    // UNA RECUPERACIÓN SIN OBJETIVO cuenta su reloj (si lo escribe) y cero
    // carga: es descanso, y el suelo no la inventa. Sin reloj escrito tampoco
    // cuenta tiempo (el suelo omite lo que no se sabe, nunca lo rellena).
    if (seg.kind === 'recovery' && objetivo == null) {
      if (seg.measure.type === 'duration') segundos += seg.measure.s;
      continue;
    }
    let intensidad: Intensidad | null = null;
    if (objetivo?.type === 'pace') {
      const t: Target = { kind: 'pace', unit: 'per_km' };
      if (objetivo.value_s !== undefined) t.value_s = objetivo.value_s;
      if (objetivo.min_s !== undefined) t.min_s = objetivo.min_s;
      if (objetivo.max_s !== undefined) t.max_s = objetivo.max_s;
      intensidad = intensidadObjetivo(t, 'run', e);
    } else if (objetivo?.type === 'rpe') {
      const t: Target = { kind: 'rpe' };
      if (objetivo.value !== undefined) t.value = objetivo.value;
      if (objetivo.min !== undefined) t.min = objetivo.min;
      if (objetivo.max !== undefined) t.max = objetivo.max;
      intensidad = intensidadObjetivo(t, 'run', e);
    } else if (objetivo?.type === 'pace_zone' || objetivo?.type === 'hr_zone') {
      intensidad = intensidadObjetivo({ kind: 'hr_zone', value: objetivo.zone }, 'run', e);
    }
    if (!intensidad) return { motivo: 'sin_intensidad' };

    let s: number | null = null;
    if (seg.measure.type === 'duration') s = seg.measure.s;
    else {
      const umbral = e.anclas.ritmo.run;
      // metros ÷ velocidad; la velocidad sale del umbral y de la intensidad
      // (ritmo = umbral / IF), que es exactamente lo que el plan le pide.
      if (umbral && anclaCuenta(umbral.ancla) && intensidad.if > 0) {
        const ritmo = umbral.valor / intensidad.if;
        s = (seg.measure.m / METROS_POR_UNIDAD.per_km) * ritmo;
      }
    }
    if (s == null) return { motivo: 'sin_duracion' };
    segundos += s;
    tss += tssDe(s, intensidad.if);
    peldano = peldano ?? intensidad.peldano;
    anclas.push(intensidad.ancla);
  }
  if (segundos <= 0) return { motivo: 'sin_duracion' };
  return { segundos, tss, peldano: peldano ?? 'zona', ancla: masDebil(anclas) };
}

const PESO: Record<Ancla, number> = { medida: 0, declarada: 1, estimada: 2, poblacional: 3 };
function masDebil(anclas: ReadonlyArray<Ancla | null>): Ancla | null {
  let peor: Ancla | null = null;
  for (const a of anclas) if (a != null && (peor == null || PESO[a] > PESO[peor])) peor = a;
  return peor;
}

/** La carga planificada de UNA línea. */
export function cargaPlanificadaDeItem(item: ItemPlan, e: EntradaCargaPlan): PrecioPlanItem {
  const p = item.prescripcion;
  const base = { familia: item.familia, segundos: null, tss: null, peldano: null, ancla: null };
  if (!p) return { ...base, motivo: 'sin_prescripcion' };

  if (p.structure) {
    const r = precioEstructura(p.structure, e);
    if ('motivo' in r) return { ...base, motivo: r.motivo };
    return { familia: item.familia, segundos: r.segundos, tss: r.tss, peldano: r.peldano, ancla: r.ancla, motivo: null };
  }

  const duracion = prescriptionDuration(p);
  if (!duracion.known) return { ...base, motivo: 'sin_duracion' };

  const modalidad = item.modalidad ?? p.modality ?? null;
  const objetivoBloque = prescriptionTarget(p);
  const sets = (p.sets ?? []).filter((s: PrescriptionSet) => !s.is_approach);
  const rondas = p.rounds != null && p.rounds > 0 ? p.rounds : 1;

  // EL DESCANSO NO SE PRECIA. Solo el TRABAJO escrito lleva intensidad; el
  // descanso cuenta como reloj y cero carga. Preciarlo a la intensidad del
  // trabajo inflaría cada serie, y a otra intensidad sería inventarla: la carga
  // planificada es un SUELO, como la duración (`prescriptionDuration`).

  // 1 · Ventana declarada (amrap, steady): trabajo continuo a la intensidad del bloque.
  const meta = WORKOUT_FORMATS[p.scheme];
  if (meta?.score !== 'time' && meta?.score !== 'rounds_survived' && p.total_s != null && p.total_s > 0 && sets.length === 0) {
    const i = intensidadObjetivo(objetivoBloque, modalidad, e);
    if (!i) return { ...base, motivo: 'sin_intensidad' };
    return { familia: item.familia, segundos: duracion.seconds, tss: tssDe(p.total_s, i.if), peldano: i.peldano, ancla: i.ancla, motivo: null };
  }

  // 2 · Ciclo × rondas con ventana de trabajo (emom, intervals, tabata): el trabajo, a la del bloque.
  if (p.work_s != null && p.work_s > 0 && sets.length === 0) {
    const i = intensidadObjetivo(objetivoBloque, modalidad, e);
    if (!i) return { ...base, motivo: 'sin_intensidad' };
    return { familia: item.familia, segundos: duracion.seconds, tss: tssDe(p.work_s * rondas, i.if), peldano: i.peldano, ancla: i.ancla, motivo: null };
  }

  // 3 · Series con reloj escrito: cada una a SU intensidad (o la del bloque), × rondas.
  if (sets.length === 0) return { ...base, motivo: 'sin_duracion' };
  let tss = 0;
  let trabajo = 0;
  const anclas: Array<Ancla | null> = [];
  let peldano: Peldano | 'zona' | null = null;
  for (const s of sets) {
    const seg = setSeconds(s, p);
    if (seg == null) return { ...base, motivo: 'sin_duracion' };
    const i = intensidadObjetivo(setTarget(s) ?? objetivoBloque, modalidad, e);
    if (!i) return { ...base, motivo: 'sin_intensidad' };
    tss += tssDe(seg, i.if) * rondas;
    trabajo += seg * rondas;
    anclas.push(i.ancla);
    peldano = peldano ?? i.peldano;
  }
  if (trabajo <= 0) return { ...base, motivo: 'sin_duracion' };
  return { familia: item.familia, segundos: duracion.seconds, tss, peldano, ancla: masDebil(anclas), motivo: null };
}

/** La carga planificada de una sesión: la suma de lo que se sabe, con el hueco contado. */
export function cargaPlanificadaDeSesion(s: SesionPlan, e: EntradaCargaPlan): PrecioPlanSesion {
  const items = s.items.map((it) => cargaPlanificadaDeItem(it, e));
  const por_familia: PrecioPlanSesion['por_familia'] = {};
  let tss_conocido = 0;
  let segundos_conocidos = 0;
  let items_sin_saber = 0;
  let principal_sin_saber = false;
  items.forEach((it, i) => {
    const f = por_familia[it.familia] ?? { tss: 0, segundos: 0, sin_saber: 0 };
    if (it.tss != null && it.segundos != null) {
      tss_conocido += it.tss;
      segundos_conocidos += it.segundos;
      f.tss += it.tss;
      f.segundos += it.segundos;
    } else {
      items_sin_saber += 1;
      f.sin_saber += 1;
      if (s.items[i]!.rol === 'principal') principal_sin_saber = true;
    }
    por_familia[it.familia] = f;
  });
  return { id: s.id, dia: s.dia, items, tss_conocido, segundos_conocidos, items_sin_saber, principal_sin_saber, por_familia };
}

/** Un día del plan: la suma de sus sesiones. */
export interface DiaPlan {
  date: string;
  /** Sesiones planificadas ese día (0 = descanso o nada asignado). */
  sesiones: number;
  /** Carga planificada conocida. Un suelo cuando `sin_saber` > 0. */
  tss: number;
  segundos: number;
  /** Ítems del día cuya carga no se sabe. */
  sin_saber: number;
  por_familia: Partial<Record<Familia, { tss: number; segundos: number; sin_saber: number }>>;
}

export function diaPlanVacio(date: string): DiaPlan {
  return { date, sesiones: 0, tss: 0, segundos: 0, sin_saber: 0, por_familia: {} };
}

/** La serie diaria contigua del plan sobre `dias`. Un día sin sesión es cero real. */
export function serieDiariaPlan(sesiones: readonly PrecioPlanSesion[], dias: readonly string[]): DiaPlan[] {
  const porDia = new Map<string, DiaPlan>();
  for (const d of dias) porDia.set(d, diaPlanVacio(d));
  for (const s of sesiones) {
    const dia = porDia.get(s.dia);
    if (!dia) continue;
    dia.sesiones += 1;
    dia.tss += s.tss_conocido;
    dia.segundos += s.segundos_conocidos;
    dia.sin_saber += s.items_sin_saber;
    for (const [familia, f] of Object.entries(s.por_familia) as Array<[Familia, { tss: number; segundos: number; sin_saber: number }]>) {
      const d = dia.por_familia[familia] ?? { tss: 0, segundos: 0, sin_saber: 0 };
      d.tss += f.tss;
      d.segundos += f.segundos;
      d.sin_saber += f.sin_saber;
      dia.por_familia[familia] = d;
    }
  }
  return dias.map((d) => porDia.get(d)!);
}

/** La modalidad de carga de una línea del plan, desde la del ejercicio o la prescripción. */
export function modalidadCargaDe(modalidad: string | null): ModalidadCarga {
  switch (modalidad) {
    case 'run':
    case 'row':
    case 'ski':
    case 'bike':
    case 'strength':
      return modalidad;
    default:
      return 'other';
  }
}
