// LA CARGA ÚNICA — cada tramo hecho recibe una carga en unidades TSS, con su
// peldaño y su ancla (docs/analiticas/modelo.md §4).
//
// POR QUÉ POR TRAMO
// -----------------
// Una sesión híbrida no es una cosa: un simulacro HYROX son ocho carreras y ocho
// estaciones; un martes son veinte minutos de series y cuarenta de barra. Preciar
// todo a una media untaría el ritmo medido de las carreras sobre el trineo, o el
// RPE de la barra sobre las series. Cada tramo se precia con SU mejor evidencia y
// la sesión es la suma. Así fuerza, ergo, carrera y estaciones caben en una sola
// curva de forma y se pueden desglosar por familia.
//
// LA ESCALERA, y su orden es MÉTODO del coach (`fuentes_<modalidad>`):
//
//   potencia  vatios contra el umbral de potencia DE ESA MÁQUINA. En un Concept2
//             el split y los vatios son la misma medida (W = 2,8/(s/m)³), así
//             que un tramo con split y sin vatios también entra por aquí — y con
//             la potencia, no con el ritmo lineal: la potencia crece con el cubo
//             de la velocidad, y preciar un 1:45 contra un umbral de 2:00 como
//             «1,14» cuando en vatios es «1,49» era subestimar cada serie dura.
//   ritmo     correr, contra el ritmo umbral (rTSS). Con desnivel, el ritmo se
//             corrige por el coste energético de la pendiente (Minetti 2002)
//             antes de compararlo: 5:00/km al 3 % cuesta lo que 4:16 en llano.
//   pulso     tiempo por zona contra el umbral de pulso (hrTSS): si el tramo
//             tiene sus segundos por zona congelados, cada zona precia a la
//             intensidad media de su banda (las bandas del coach); si solo tiene
//             pulso medio, ese pulso contra el umbral. Cualquier modalidad.
//   esfuerzo  el RPE del tramo (de sus series, o 10 − RIR) o de la sesión, por
//             la curva sRPE → intensidad. En fuerza, multiplicado por el
//             coeficiente del coach.
//   nada      la carga de ese tramo NO SE SABE: cuenta contra la cobertura,
//             jamás como cero.
//
// LAS ANCLAS cuentan si son medida, declarada o estimada, cada parte marcada con
// la suya; la poblacional no cuenta (`anclaCuenta`). Un tramo con pulso y solo un
// umbral de la edad cae al esfuerzo, y si tampoco hay esfuerzo, no se sabe — y
// además se apunta que HABÍA pulso: es el hueco que un umbral declarado de un
// toque cerraría, y la pantalla tiene que poder pedirlo.
//
// Puro y sin base de datos. El cargador trae los tramos con lo que midieron.

import { anclaCuenta, type Ancla, type Familia } from './lectura';
import { anclaMasDebil, wattsDeSplit500, type AnclasAtleta } from './anclas';
import { claveFuentesDe, type CoachAnalyticsMethod, type FuenteCarga, type ModalidadCarga } from './metodo';
import { intensityFromRpe } from '../training-load/tss';
import { HR_ZONES, type HrZone, type HrZoneFractions } from '../methodology/hr-zones';
import type { ZoneSecondsByZone } from '../methodology/time-in-zone';

export type Peldano = FuenteCarga;

// ---------------------------------------------------------------------------
// ENTRADA — lo que se midió en cada tramo
// ---------------------------------------------------------------------------

export interface ZonasCongeladas {
  por_zona: ZoneSecondsByZone;
  /** Segundos del tramo que no se pudieron repartir (sin pulso). */
  sin_pulso_s: number;
  /** El peldaño del umbral con el que se congelaron. Null = se congelaron sin ancla (todo en sin_pulso). */
  ancla: Ancla | null;
}

export interface TramoHecho {
  /** `segment_executions.id`, para que el detalle de sesión enseñe el precio de CADA tramo. El motor no lo lee. */
  id?: string | null;
  /** Duración del tramo. 0 cuando no se registró: su tiempo cae en el resto de la sesión. */
  segundos: number;
  /** Vocabulario de tramos: run | row | ski | bike | strength | other. */
  modalidad: ModalidadCarga;
  familia: Familia;
  potencia_w: number | null;
  /** Ritmo medio: s/km al correr, s/500 m en remo, ski y bici. */
  ritmo_s: number | null;
  /** Pendiente media del tramo (%, con signo). Null = no se sabe (se trata como llano). */
  pendiente_pct: number | null;
  pulso_medio: number | null;
  zonas: ZonasCongeladas | null;
  /** RPE 1-10 del tramo (media de sus series, o 10 − RIR). Null si no lo puntuó. */
  esfuerzo: number | null;
}

export interface SesionHecha {
  id: string;
  /** Día LOCAL del atleta (YYYY-MM-DD). */
  dia: string;
  /** Duración total. Los tramos rara vez la suman: el resto es real (calentar, descansos, ir al rack). */
  segundos: number;
  /** RPE de la sesión, 1-10. */
  rpe: number | null;
  /** Pulso medio de toda la sesión (0154), para el resto que ningún tramo cubre. */
  pulso_medio: number | null;
  tramos: readonly TramoHecho[];
}

export interface EntradaCargaTramo {
  anclas: AnclasAtleta;
  metodo: CoachAnalyticsMethod;
  /** Las bandas de FC del coach, como fracción del umbral: la intensidad media de cada zona sale de aquí. */
  fracciones_hr: HrZoneFractions;
}

// ---------------------------------------------------------------------------
// SALIDA
// ---------------------------------------------------------------------------

/** Un trozo de tiempo preciado: cuántos segundos, cuánta carga, por qué peldaño y con qué ancla. */
export interface ParteCarga {
  segundos: number;
  tss: number;
  peldano: Peldano;
  /** Null = el peldaño no depende de un umbral del atleta (esfuerzo). */
  ancla: Ancla | null;
}

export interface PrecioTramo {
  segundos: number;
  familia: Familia;
  partes: ParteCarga[];
  /** Segundos del tramo que ningún peldaño pudo preciar. */
  sin_saber_s: number;
  /** De esos, cuántos TENÍAN pulso y les faltó un umbral que contara. */
  sin_saber_con_pulso_s: number;
}

export interface PrecioSesion {
  id: string;
  dia: string;
  segundos: number;
  /** Null solo cuando NADA se pudo preciar. Una sesión de duración cero cuesta 0. */
  tss: number | null;
  partes: ParteCarga[];
  por_familia: Partial<Record<Familia, { tss: number; segundos: number; sin_saber_s: number }>>;
  sin_saber_s: number;
  sin_saber_con_pulso_s: number;
  /** Tramos (o el resto de la sesión) que quedaron sin preciar. Lo que el coach puede pedir. */
  sin_saber_tramos: number;
  /** El precio de cada tramo (orden de `tramos`), EL MISMO que entra en la suma; null sin tiempo que preciar. */
  tramos: Array<PrecioTramo | null>;
  /** El precio del resto que ningún tramo cubre. Null sin resto. */
  resto: PrecioTramo | null;
}

const SEGUNDOS_POR_HORA = 3600;

/** TSS de un trozo: una hora en umbral (IF 1,0) son 100. Todos los peldaños pasan por aquí. */
export function tssDe(segundos: number, intensidad: number): number {
  return Math.max(0, (segundos / SEGUNDOS_POR_HORA) * intensidad * intensidad * 100);
}

function util(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

// ---------------------------------------------------------------------------
// PENDIENTE — el coste energético de correr en cuesta (Minetti et al., 2002)
// ---------------------------------------------------------------------------

/** Coste energético de correr (J/kg/m) a pendiente `g` (fracción, +0,03 = 3 % de subida). */
function costeMinetti(g: number): number {
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}

/**
 * Más allá de esto el ritmo deja de preciarse por pendiente: la fórmula está
 * validada hasta ±45 %, pero por encima del 15 % se camina y el GPS ya no
 * distingue la cuesta del ruido. Mecanismo, no método: describe la física y
 * los aparatos, no cómo entrena nadie.
 */
export const PENDIENTE_MAX_RITMO_PCT = 15;

/**
 * El ritmo EQUIVALENTE EN LLANO de un ritmo corrido en cuesta. Subir cuesta más
 * por metro, así que el mismo ritmo cuesta lo que uno más rápido en llano; una
 * bajada suave, lo contrario. Sin pendiente conocida se devuelve tal cual (no se
 * inventa una cuesta). Null cuando la pendiente supera el tope.
 */
export function ritmoEquivalenteLlano(ritmo_s: number, pendiente_pct: number | null): number | null {
  if (pendiente_pct == null || !Number.isFinite(pendiente_pct)) return ritmo_s;
  if (Math.abs(pendiente_pct) > PENDIENTE_MAX_RITMO_PCT) return null;
  const g = pendiente_pct / 100;
  return ritmo_s * (costeMinetti(0) / costeMinetti(g));
}

// ---------------------------------------------------------------------------
// LOS PELDAÑOS
// ---------------------------------------------------------------------------

type Intensidad = { if: number; ancla: Ancla | null };

const MAQUINAS: ReadonlySet<ModalidadCarga> = new Set(['row', 'ski', 'bike']);

function porPotencia(t: TramoHecho, e: EntradaCargaTramo): Intensidad | null {
  if (!MAQUINAS.has(t.modalidad)) return null;
  const umbral = e.anclas.potencia[t.modalidad as 'row' | 'ski' | 'bike'];
  if (!umbral || !anclaCuenta(umbral.ancla) || !util(umbral.valor)) return null;
  const watts = util(t.potencia_w) ? t.potencia_w : wattsDeSplit500(t.ritmo_s);
  if (!util(watts)) return null;
  return { if: watts / umbral.valor, ancla: umbral.ancla };
}

function porRitmo(t: TramoHecho, e: EntradaCargaTramo): Intensidad | null {
  if (t.modalidad !== 'run') return null;
  const umbral = e.anclas.ritmo.run;
  if (!umbral || !anclaCuenta(umbral.ancla) || !util(umbral.valor)) return null;
  if (!util(t.ritmo_s)) return null;
  const llano = ritmoEquivalenteLlano(t.ritmo_s, t.pendiente_pct);
  if (!util(llano)) return null;
  return { if: umbral.valor / llano, ancla: umbral.ancla };
}

/** La intensidad media de cada zona: el centro de su banda, como fracción del umbral. */
export function intensidadDeZona(zona: HrZone, fracciones: HrZoneFractions): number {
  const f = fracciones[zona];
  return (f.lo + f.hi) / 2;
}

/**
 * El pulso precia de dos maneras, y la primera es la buena: con los segundos por
 * zona congelados (cada zona a su intensidad, que es lo que hace que unas series
 * no se lean como su media tibia), o con el pulso medio contra el umbral.
 * Devuelve las partes preciadas y los segundos que se quedan sin pulso.
 */
function porPulso(
  t: TramoHecho,
  segundos: number,
  e: EntradaCargaTramo,
): { partes: ParteCarga[]; resto_s: number } | null {
  if (t.zonas && t.zonas.ancla != null && anclaCuenta(t.zonas.ancla)) {
    const partes: ParteCarga[] = [];
    let clasificados = 0;
    for (const z of HR_ZONES) {
      const s = t.zonas.por_zona[z] ?? 0;
      if (s <= 0) continue;
      clasificados += s;
      partes.push({ segundos: s, tss: tssDe(s, intensidadDeZona(z, e.fracciones_hr)), peldano: 'pulso', ancla: t.zonas.ancla });
    }
    if (clasificados > 0) {
      // Los segundos por zona se congelaron sobre la ventana del tramo; si el
      // tramo declara menos segundos que los clasificados, manda lo clasificado
      // (el reparto es medida) y el resto es cero, nunca negativo.
      return { partes, resto_s: Math.max(0, segundos - clasificados) };
    }
  }
  const umbral = e.anclas.pulso;
  if (!umbral || !anclaCuenta(umbral.ancla) || !util(umbral.valor)) return null;
  if (!util(t.pulso_medio)) return null;
  return { partes: [{ segundos, tss: tssDe(segundos, t.pulso_medio / umbral.valor), peldano: 'pulso', ancla: umbral.ancla }], resto_s: 0 };
}

function porEsfuerzo(rpe: number | null, segundos: number, modalidad: ModalidadCarga, e: EntradaCargaTramo): ParteCarga | null {
  if (rpe == null) return null;
  const intensidad = intensityFromRpe(rpe);
  if (intensidad == null) return null;
  const coef = modalidad === 'strength' ? e.metodo.fuerza_coeficiente : 1;
  return { segundos, tss: tssDe(segundos, intensidad) * coef, peldano: 'esfuerzo', ancla: null };
}

/**
 * El tramo tenía pulso que NO se pudo usar por falta de un umbral que cuente:
 * un pulso medio con el ancla ausente o poblacional, o unas zonas congeladas
 * con un ancla poblacional. Es el hueco que cierra un umbral declarado de un
 * toque, y por eso se cuenta aparte. Un hueco por SEGUNDOS SIN PULSO (el resto
 * de un reparto congelado) no es esto: ahí no hay umbral que lo arregle.
 */
function pulsoSinAncla(t: TramoHecho, e: EntradaCargaTramo): boolean {
  const anclaPulso = e.anclas.pulso;
  const anclaUtil = anclaPulso != null && anclaCuenta(anclaPulso.ancla) && util(anclaPulso.valor);
  if (util(t.pulso_medio) && !anclaUtil) return true;
  if (t.zonas && !anclaCuenta(t.zonas.ancla) && HR_ZONES.some((z) => (t.zonas!.por_zona[z] ?? 0) > 0)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// EL TRAMO
// ---------------------------------------------------------------------------

/**
 * Un tramo, por la escalera del coach para su modalidad. Gana el primer peldaño
 * con dato y ancla; el pulso puede preciar una parte y dejar el resto al
 * siguiente peldaño (los segundos sin pulso de un reparto congelado).
 *
 * `rpe_sesion` es el RPE de la sesión entera: el esfuerzo del tramo, si lo hay,
 * manda; si no, el de la sesión precia el tramo — que es lo que hacía el motor
 * viejo con la sesión entera, así que nadie pierde cobertura por partir en tramos.
 */
export function preciarTramo(t: TramoHecho, rpe_sesion: number | null, e: EntradaCargaTramo): PrecioTramo {
  const segundos = Number.isFinite(t.segundos) ? Math.max(0, t.segundos) : 0;
  const vacio: PrecioTramo = { segundos, familia: t.familia, partes: [], sin_saber_s: segundos, sin_saber_con_pulso_s: 0 };
  if (segundos <= 0) return { ...vacio, sin_saber_s: 0 };

  const orden = e.metodo[claveFuentesDe(t.modalidad)];
  const partes: ParteCarga[] = [];
  let pendientes = segundos;
  const esfuerzo = t.esfuerzo ?? rpe_sesion;

  for (const peldano of orden) {
    if (pendientes <= 0) break;
    switch (peldano) {
      case 'potencia': {
        const i = porPotencia(t, e);
        if (i) {
          partes.push({ segundos: pendientes, tss: tssDe(pendientes, i.if), peldano, ancla: i.ancla });
          pendientes = 0;
        }
        break;
      }
      case 'ritmo': {
        const i = porRitmo(t, e);
        if (i) {
          partes.push({ segundos: pendientes, tss: tssDe(pendientes, i.if), peldano, ancla: i.ancla });
          pendientes = 0;
        }
        break;
      }
      case 'pulso': {
        const r = porPulso(t, pendientes, e);
        if (r) {
          partes.push(...r.partes);
          pendientes = r.resto_s;
        }
        break;
      }
      case 'esfuerzo': {
        const p = porEsfuerzo(esfuerzo, pendientes, t.modalidad, e);
        if (p) {
          partes.push(p);
          pendientes = 0;
        }
        break;
      }
    }
  }

  return {
    segundos,
    familia: t.familia,
    partes,
    sin_saber_s: pendientes,
    sin_saber_con_pulso_s: pendientes > 0 && pulsoSinAncla(t, e) ? pendientes : 0,
  };
}

// ---------------------------------------------------------------------------
// LA SESIÓN
// ---------------------------------------------------------------------------

/**
 * La sesión es la suma de sus tramos más EL RESTO — el tiempo que ningún tramo
 * cubre (calentar, descansar, ir al rack), que es real y se precia con lo que la
 * sesión sabe de sí misma: su pulso medio contra el umbral, o su RPE. Sin nada,
 * ese resto no se sabe. Ningún segundo se pierde: los tres totales (preciado
 * por peldaño, sin saber) suman la duración de la sesión.
 */
export function preciarSesion(s: SesionHecha, e: EntradaCargaTramo): PrecioSesion {
  const total = Number.isFinite(s.segundos) ? Math.max(0, s.segundos) : 0;
  const partes: ParteCarga[] = [];
  const por_familia: PrecioSesion['por_familia'] = {};
  let sin_saber_s = 0;
  let sin_saber_con_pulso_s = 0;
  let sin_saber_tramos = 0;
  let cubiertos = 0;

  const acumula = (familia: Familia, tss: number, segundos: number, sin_saber: number) => {
    const f = por_familia[familia] ?? { tss: 0, segundos: 0, sin_saber_s: 0 };
    f.tss += tss;
    f.segundos += segundos;
    f.sin_saber_s += sin_saber;
    por_familia[familia] = f;
  };

  const tramos: Array<PrecioTramo | null> = [];
  let restoPrecio: PrecioTramo | null = null;
  for (const t of s.tramos) {
    // Un tramo no puede reclamar más tiempo del que le queda a la sesión.
    const usable = Math.min(Math.max(0, t.segundos), Math.max(0, total - cubiertos));
    if (usable <= 0) {
      tramos.push(null);
      continue;
    }
    const precio = preciarTramo({ ...t, segundos: usable }, s.rpe, e);
    tramos.push(precio);
    cubiertos += usable;
    partes.push(...precio.partes);
    sin_saber_s += precio.sin_saber_s;
    sin_saber_con_pulso_s += precio.sin_saber_con_pulso_s;
    if (precio.sin_saber_s > 0) sin_saber_tramos += 1;
    acumula(t.familia, precio.partes.reduce((a, p) => a + p.tss, 0), usable, precio.sin_saber_s);
  }

  const resto = Math.max(0, total - cubiertos);
  if (resto > 0) {
    // El resto no tiene modalidad: se precia por pulso o esfuerzo, en el orden
    // que el coach da a «el resto» (sin potencia ni ritmo, que aquí no existen).
    const restoTramo: TramoHecho = {
      segundos: resto,
      modalidad: 'other',
      familia: 'otro',
      potencia_w: null,
      ritmo_s: null,
      pendiente_pct: null,
      pulso_medio: s.pulso_medio,
      zonas: null,
      esfuerzo: null,
    };
    const precio = preciarTramo(restoTramo, s.rpe, e);
    restoPrecio = precio;
    partes.push(...precio.partes);
    sin_saber_s += precio.sin_saber_s;
    sin_saber_con_pulso_s += precio.sin_saber_con_pulso_s;
    if (precio.sin_saber_s > 0) sin_saber_tramos += 1;
    acumula('otro', precio.partes.reduce((a, p) => a + p.tss, 0), resto, precio.sin_saber_s);
  }

  const preciados = partes.reduce((a, p) => a + p.segundos, 0);
  const tss = total <= 0 ? 0 : preciados > 0 ? partes.reduce((a, p) => a + p.tss, 0) : null;

  return { id: s.id, dia: s.dia, segundos: total, tss, partes, por_familia, sin_saber_s, sin_saber_con_pulso_s, sin_saber_tramos, tramos, resto: restoPrecio };
}

// ---------------------------------------------------------------------------
// EL DÍA — la entrada de Banister, con su honestidad desglosada
// ---------------------------------------------------------------------------

/**
 * Un día de carga. Lleva los campos de `DailyTss` (para que `computeLoadSeries`,
 * `summarizeLoad` y `readLoadCoverage` sigan valiendo tal cual) y además el
 * desglose por ancla, por peldaño y por familia que el panel enseña.
 *
 *   known_seconds    = preciados por cualquier peldaño
 *   measured_seconds = preciados por un aparato (potencia, ritmo, pulso)
 *   declared_seconds = preciados por el esfuerzo del atleta
 *   unknown_seconds  = sin saber
 */
export interface DiaCarga {
  date: string;
  tss: number;
  known_seconds: number;
  unknown_seconds: number;
  unknown_sessions: number;
  measured_seconds: number;
  declared_seconds: number;
  sesiones: number;
  /** Segundos preciados contra un umbral de cada peldaño (el esfuerzo no lleva ancla y no está aquí). */
  por_ancla: Record<Ancla, number>;
  por_peldano: Record<Peldano, number>;
  por_familia: Partial<Record<Familia, { tss: number; segundos: number; sin_saber_s: number }>>;
  /** Segundos sin saber que TENÍAN pulso: el hueco que cierra un umbral. */
  sin_saber_con_pulso_s: number;
}

export function diaVacio(date: string): DiaCarga {
  return {
    date,
    tss: 0,
    known_seconds: 0,
    unknown_seconds: 0,
    unknown_sessions: 0,
    measured_seconds: 0,
    declared_seconds: 0,
    sesiones: 0,
    por_ancla: { medida: 0, declarada: 0, estimada: 0, poblacional: 0 },
    por_peldano: { potencia: 0, ritmo: 0, pulso: 0, esfuerzo: 0 },
    por_familia: {},
    sin_saber_con_pulso_s: 0,
  };
}

/** Suma una sesión preciada a su día. */
export function sumarSesionAlDia(dia: DiaCarga, s: PrecioSesion): void {
  dia.sesiones += 1;
  if (s.tss != null) dia.tss += s.tss;
  for (const p of s.partes) {
    dia.known_seconds += p.segundos;
    dia.por_peldano[p.peldano] += p.segundos;
    if (p.peldano === 'esfuerzo') dia.declared_seconds += p.segundos;
    else dia.measured_seconds += p.segundos;
    if (p.ancla != null) dia.por_ancla[p.ancla] += p.segundos;
  }
  dia.unknown_seconds += s.sin_saber_s;
  dia.sin_saber_con_pulso_s += s.sin_saber_con_pulso_s;
  if (s.sin_saber_s > 0) dia.unknown_sessions += 1;
  for (const [familia, f] of Object.entries(s.por_familia) as Array<[Familia, { tss: number; segundos: number; sin_saber_s: number }]>) {
    const d = dia.por_familia[familia] ?? { tss: 0, segundos: 0, sin_saber_s: 0 };
    d.tss += f.tss;
    d.segundos += f.segundos;
    d.sin_saber_s += f.sin_saber_s;
    dia.por_familia[familia] = d;
  }
}

/**
 * La serie diaria CONTIGUA de `desde` a `hasta` (días locales, ambos incluidos):
 * un día sin sesión es un cero real (la media móvil tiene que decaer), no un
 * hueco. Sesiones fuera del tramo se ignoran.
 */
export function serieDiaria(
  sesiones: readonly PrecioSesion[],
  dias: readonly string[],
): DiaCarga[] {
  const porDia = new Map<string, DiaCarga>();
  for (const d of dias) porDia.set(d, diaVacio(d));
  for (const s of sesiones) {
    const dia = porDia.get(s.dia);
    if (dia) sumarSesionAlDia(dia, s);
  }
  return dias.map((d) => porDia.get(d)!);
}

/** El ancla más débil que entra en una serie de días (la que manda en la procedencia). */
export function anclaDeLaSerie(dias: readonly DiaCarga[]): Ancla | null {
  const presentes: Ancla[] = [];
  for (const a of ['medida', 'declarada', 'estimada', 'poblacional'] as const) {
    if (dias.some((d) => d.por_ancla[a] > 0)) presentes.push(a);
  }
  return anclaMasDebil(presentes);
}
