// ¿ENTRENO A LA INTENSIDAD QUE TOCA? — el bloque de INTENSIDAD del panel
// (docs/analiticas/modelo.md §3 fila 4): tiempo en zonas de pulso por semana y
// por familia, con las bandas del coach y su ancla, el reparto fácil/medio/duro
// frente a su objetivo, y el ritmo por zonas al correr cuando hay umbral.
//
// DE DÓNDE SALE CADA SEGUNDO. De `segment_zone_seconds` (0168): el reparto de
// CADA TRAMO, congelado al llegar el entreno con las bandas del coach y el ancla
// de ese día (el móvil latido a latido, la traza, o las muestras cruzadas por la
// ventana del tramo). Aquí no se reclasifica nada: una gráfica que cambia de
// forma sin que nadie la toque deja de ser evidencia. Las mismas filas que el
// motor de carga ya lee (`TramoHecho.zonas`), así que zonas y carga no pueden
// contar tiempos distintos del mismo tramo.
//
// LO QUE SE CUENTA Y LO QUE NO:
//   · Todas las familias entran en el tiempo por zonas: es la carga
//     cardiovascular entera, y el desglose por familia dice de dónde sale.
//   · El REPARTO (fácil/medio/duro) solo cuenta las familias del coach
//     (`polarizacion_familias`, defecto sin la fuerza ni «otro»): el pulso de una
//     serie de sentadillas no mide su intensidad, y contado inflaría el «fácil».
//   · Pliegue (qué zonas son fácil, medio y duro) y objetivo son del coach
//     (`coach_hr_method`); la holgura de la palabra y el cambio que cuenta entre
//     periodos, también (`coach_analytics_method`, 0279).
//   · La palabra del reparto se retira si el tiempo con pulso de esas familias no
//     llega al mínimo del coach (`cobertura_veredicto_min_pct`, el mismo que
//     retira la de frescura): un reparto de la mitad de las sesiones no juzga
//     las sesiones. El número se queda.
//
// EL RITMO POR ZONAS, AL CORRER. Cada tramo de carrera cae ENTERO en la zona de
// su ritmo medio (corregido por pendiente, Minetti, como la carga): con parciales
// de tramo y no series continuas, es lo que se puede afirmar sin inventar. Las
// seis bandas son las del coach (`methodology_zones`) sobre el umbral de ritmo
// del atleta con su peldaño; sin umbral, no hay zonas de ritmo y se pide.
//
// Puro y sin base de datos.

import {
  collapseToPolarization,
  hrZoneFractionsFrom,
  polarizationPct,
  polarizationTargetFrom,
  type CoachHrMethod,
  type PolarizationSplit,
} from '../coach/hr-method';
import { HR_ZONES, type HrZone, type HrZoneBand } from '../methodology/hr-zones';
import type { ResolvedZone } from '../methodology/zone-model';
import type { Falta } from '../running/progress';
import { addDays, isoDateString, parseIsoDate } from '../dates';
import { anclaMasDebil, type AnclaResuelta } from './anclas';
import type { SesionHecha, TramoHecho } from './carga-tramo';
import { lecturaRitmoCorrer } from './intensidad-ritmo';
import {
  comparacionDe,
  FAMILIA_ETIQUETA_ES,
  FAMILIAS,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Ancla,
  type Comparacion,
  type Familia,
  type Lectura,
  type Parte,
  type Procedencia,
  type PuntoSerie,
  type VeredictoLectura,
} from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import { lunesDe } from './semanas';
import type { Periodo, VentanaResuelta } from './ventana';

const GRUPO = 'intensidad' as const;
const SEGUNDOS_POR_HORA = 3600;

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

export interface EntradaIntensidad {
  /** Las sesiones hechas (las del motor de carga), cada una en su día local. */
  sesiones: readonly SesionHecha[];
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  /** El método de FC del coach: pliegue de las zonas en tres bandas y el reparto que persigue. */
  hr: CoachHrMethod;
  /** El umbral de pulso vigente, con su peldaño, y sus cinco bandas en ppm (para decirlas). */
  pulso: { ancla: AnclaResuelta | null; bandas: readonly HrZoneBand[] | null };
  /** Las seis zonas de ritmo del coach resueltas sobre el umbral de correr. Null sin umbral. */
  ritmo_correr: { ancla: AnclaResuelta; zonas: readonly ResolvedZone[] } | null;
}

// ---------------------------------------------------------------------------
// LA ACUMULACIÓN — segundos por zona, sin pulso y de tramo
// ---------------------------------------------------------------------------

interface Acumulado {
  por_zona: Record<HrZone, number>;
  /** Segundos de tramo que no se pudieron repartir (sin pulso, o sin ancla). */
  sin_pulso: number;
  /** Segundos de tramo, repartidos o no. */
  tramo_s: number;
  /** Tramos con al menos un segundo clasificado. */
  tramos_con_zonas: number;
  anclas: Set<Ancla>;
  /** Días (locales) con algún segundo clasificado. */
  dias: Set<string>;
  /** Hubo pulso (pulso medio del tramo) en algún tramo. */
  hubo_pulso: boolean;
}

function vacio(): Acumulado {
  return { por_zona: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sin_pulso: 0, tramo_s: 0, tramos_con_zonas: 0, anclas: new Set(), dias: new Set(), hubo_pulso: false };
}

function clasificados(a: Acumulado): number {
  return HR_ZONES.reduce((s, z) => s + a.por_zona[z], 0);
}

function sumarTramo(a: Acumulado, t: TramoHecho, dia: string): void {
  a.tramo_s += Math.max(0, t.segundos);
  if (t.pulso_medio != null && t.pulso_medio > 0) a.hubo_pulso = true;
  if (!t.zonas) {
    a.sin_pulso += Math.max(0, t.segundos);
    return;
  }
  let enZonas = 0;
  for (const z of HR_ZONES) {
    const s = Math.max(0, t.zonas.por_zona[z] ?? 0);
    a.por_zona[z] += s;
    enZonas += s;
  }
  a.sin_pulso += Math.max(0, t.zonas.sin_pulso_s);
  if (enZonas > 0) {
    a.tramos_con_zonas += 1;
    a.dias.add(dia);
    if (t.zonas.ancla != null) a.anclas.add(t.zonas.ancla);
    a.hubo_pulso = true;
  }
}

interface Agregado {
  /** Sesiones de la ventana, con tramos o sin ellos. */
  sesiones: number;
  total: Acumulado;
  /** Por familia: todas las que aparecen. */
  familia: Map<Familia, Acumulado>;
  /** Solo las familias del reparto del coach. */
  reparto: Acumulado;
  /** Por semana (lunes ISO): todas las familias y solo las del reparto. */
  semanas: Map<string, { total: Acumulado; reparto: Acumulado }>;
}

function agregar(sesiones: readonly SesionHecha[], p: Pick<Periodo, 'desde' | 'hasta'>, familiasReparto: ReadonlySet<Familia>): Agregado {
  const ag: Agregado = { sesiones: 0, total: vacio(), familia: new Map(), reparto: vacio(), semanas: new Map() };
  for (const s of sesiones) {
    if (s.dia < p.desde || s.dia > p.hasta) continue;
    ag.sesiones += 1;
    const lunes = lunesDe(s.dia);
    let sem = ag.semanas.get(lunes);
    if (!sem) {
      sem = { total: vacio(), reparto: vacio() };
      ag.semanas.set(lunes, sem);
    }
    for (const t of s.tramos) {
      sumarTramo(ag.total, t, s.dia);
      sumarTramo(sem.total, t, s.dia);
      let f = ag.familia.get(t.familia);
      if (!f) {
        f = vacio();
        ag.familia.set(t.familia, f);
      }
      sumarTramo(f, t, s.dia);
      if (familiasReparto.has(t.familia)) {
        sumarTramo(ag.reparto, t, s.dia);
        sumarTramo(sem.reparto, t, s.dia);
      }
    }
  }
  return ag;
}

/** Los lunes de las semanas que toca la ventana, en orden. */
function lunesDeLaVentana(v: Pick<Periodo, 'desde' | 'hasta'>): string[] {
  const out: string[] = [];
  let d = parseIsoDate(lunesDe(v.desde));
  const fin = parseIsoDate(lunesDe(v.hasta));
  while (d.getTime() <= fin.getTime()) {
    out.push(isoDateString(d));
    d = addDays(d, 7);
  }
  return out;
}

const horas = (s: number) => s / SEGUNDOS_POR_HORA;

// ---------------------------------------------------------------------------
// POR QUÉ NO HAY ZONAS (una vez, para todas las lecturas del bloque)
// ---------------------------------------------------------------------------

/**
 * Sin sesiones en la ventana falta TIEMPO; con sesiones y pulso pero sin un
 * segundo repartido falta el ANCLA (las zonas se congelaron sin umbral); sin
 * pulso en ningún tramo falta el SENSOR.
 */
function faltaDeZonas(ag: Agregado, a: Acumulado, v: VentanaResuelta): Falta {
  if (ag.sesiones === 0) return { por: 'historia', llevas: 0, hacen: v.dias };
  if (a.hubo_pulso) return { por: 'ancla' };
  return { por: 'sensor' };
}

function coberturaDe(a: Acumulado, v: VentanaResuelta) {
  return { muestras: a.tramos_con_zonas, dias_ventana: v.dias, dias_con_dato: a.dias.size, pct: pctCobertura(a.dias.size, v.dias) };
}

/** La parte del tiempo de tramo que tiene pulso repartido, 0-100. Null sin tramos. */
function pctConPulso(a: Acumulado): number | null {
  const total = clasificados(a) + a.sin_pulso;
  return total > 0 ? Math.min(100, (clasificados(a) / total) * 100) : null;
}

/** La procedencia de un número hecho de segundos por zona congelados. */
function procedenciaZonas(a: Acumulado, e: EntradaIntensidad, explica: string): Procedencia {
  const pct = pctConPulso(a);
  const cobertura = pct != null && pct < 100 ? ` Un ${Math.round(100 - pct)} % del tiempo de tus tramos no tiene pulso.` : '';
  const ancla = anclaMasDebil([...a.anclas]);
  const vigente = e.pulso.ancla;
  const umbral = vigente ? ` Tu umbral de pulso hoy: ${Math.round(vigente.valor)} ppm (${vigente.explica_es.toLowerCase()}).` : '';
  return { de: 'segundos_por_zona', explica_es: `${explica}${umbral}${cobertura}`, medida: true, ancla, proveedor: null };
}

function comparacionHoras(valor_h: number, anterior: Acumulado | null, v: VentanaResuelta, campo: (a: Acumulado) => number, m: CoachAnalyticsMethod): Comparacion | null {
  if (!v.anterior || !anterior) return null;
  return comparacionDe({
    valor: valor_h,
    anterior: horas(campo(anterior)),
    unidad: 'pct',
    periodo: { desde: v.anterior.desde, hasta: v.anterior.hasta },
    cambio_minimo: m.cambio_horas_pct,
  });
}

// ---------------------------------------------------------------------------
// LAS CINCO ZONAS, SEMANA A SEMANA
// ---------------------------------------------------------------------------

function textoBanda(z: HrZone, e: EntradaIntensidad): string {
  const b = e.pulso.bandas?.find((x) => x.zone === z);
  const f = hrZoneFractionsFrom(e.hr)[z];
  const pct = z === 1 ? `hasta el ${Math.round(f.hi * 100)} %` : `del ${Math.round(f.lo * 100)} al ${Math.round(f.hi * 100)} %`;
  const ppm = b ? (b.min_bpm == null ? ` (hasta ${b.max_bpm} ppm)` : ` (${b.min_bpm}–${b.max_bpm} ppm)`) : '';
  return `Z${z}: ${pct} de tu umbral${ppm}.`;
}

function lecturasZonas(e: EntradaIntensidad, ag: Agregado, antes: Agregado | null): Lectura[] {
  const { ventana: v, metodo: m } = e;
  const total = clasificados(ag.total);
  const cobertura = coberturaDe(ag.total, v);
  const semanas = lunesDeLaVentana(v);

  return HR_ZONES.map((z) => {
    const id = `intensidad.z${z}`;
    const titulo_es = `Z${z}`;
    const explica = `Horas en Z${z} cada semana, de los segundos por zona de cada tramo con las bandas de tu coach. ${textoBanda(z, e)}`;
    const procedencia = procedenciaZonas(ag.total, e, explica);
    if (total <= 0) {
      return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta: faltaDeZonas(ag, ag.total, v), cobertura, procedencia: { ...procedencia, medida: false } });
    }
    const valor = horas(ag.total.por_zona[z]);
    // Una semana sin nada clasificado es un HUECO; una con pulso pero nada en esta zona, un cero real.
    const puntos: PuntoSerie[] = semanas.map((lunes) => {
      const s = ag.semanas.get(lunes)?.total;
      return { t: lunes, v: s && clasificados(s) > 0 ? horas(s.por_zona[z]) : null };
    });
    return lecturaMedida({
      id,
      grupo: GRUPO,
      titulo_es,
      dato: { valor, unidad: 'horas', referencia: null },
      comparacion: comparacionHoras(valor, antes?.total ?? null, v, (a) => a.por_zona[z], m),
      serie: serieDe({ unidad: 'horas', paso: 'semana', puntos }),
      cobertura,
      procedencia,
    });
  });
}

/** El tiempo con pulso de un acumulado, repartido en las cinco zonas. */
function lecturaTiempoEnZonas(args: {
  id: string;
  titulo_es: string;
  familia: Familia | null;
  a: Acumulado;
  antes: Acumulado | null;
  ag: Agregado;
  e: EntradaIntensidad;
  explica: string;
}): Lectura {
  const { a, e, id, titulo_es, familia } = args;
  const total = clasificados(a);
  const cobertura = coberturaDe(a, e.ventana);
  const procedencia = procedenciaZonas(a, e, args.explica);
  if (total <= 0) {
    return lecturaSinDato({ id, grupo: GRUPO, familia, titulo_es, falta: faltaDeZonas(args.ag, a, e.ventana), cobertura, procedencia: { ...procedencia, medida: false } });
  }
  const valor = horas(total);
  return lecturaMedida({
    id,
    grupo: GRUPO,
    familia,
    titulo_es,
    dato: { valor, unidad: 'horas', referencia: null },
    comparacion: comparacionHoras(valor, args.antes, e.ventana, clasificados, e.metodo),
    reparto: {
      unidad: 'horas',
      total: valor,
      partes: HR_ZONES.map((z) => ({ code: `z${z}`, etiqueta_es: `Z${z}`, valor: horas(a.por_zona[z]), pct: (a.por_zona[z] / total) * 100 })),
    },
    cobertura,
    procedencia,
  });
}

// ---------------------------------------------------------------------------
// EL REPARTO — fácil, medio y duro frente al objetivo del coach
// ---------------------------------------------------------------------------

type Banda = 'facil' | 'medio' | 'duro';

function zonasDeBanda(b: Banda, hr: CoachHrMethod): HrZone[] {
  return HR_ZONES.filter((z) =>
    b === 'facil' ? z <= hr.polarization_low_max_zone : b === 'medio' ? z > hr.polarization_low_max_zone && z <= hr.polarization_mid_max_zone : z > hr.polarization_mid_max_zone,
  );
}

function etiquetaBanda(b: Banda, hr: CoachHrMethod): string {
  const nombre = { facil: 'Fácil', medio: 'Medio', duro: 'Duro' }[b];
  const zs = zonasDeBanda(b, hr);
  if (zs.length === 0) return nombre;
  return zs.length === 1 ? `${nombre} (Z${zs[0]})` : `${nombre} (Z${zs[0]}–Z${zs[zs.length - 1]})`;
}

const VEREDICTO_REPARTO: Record<'en_reparto' | 'demasiado_suave' | 'zona_media' | 'demasiado_duro', Pick<VeredictoLectura, 'etiqueta_es' | 'tono'>> = {
  en_reparto: { etiqueta_es: 'En tu reparto', tono: 'bien' },
  demasiado_suave: { etiqueta_es: 'Demasiado suave', tono: 'atencion' },
  zona_media: { etiqueta_es: 'Mucha zona media', tono: 'atencion' },
  demasiado_duro: { etiqueta_es: 'Demasiado duro', tono: 'atencion' },
};

/**
 * La palabra del reparto: si ninguna banda se pasa de su objetivo más la
 * holgura del coach, está en su reparto; si no, la banda que MÁS se pasa le
 * pone nombre. Solo el exceso cuenta: que el duro se quede corto es lo mismo
 * que que el fácil se pase, y se dice una vez, por la banda que sobra.
 */
export function veredictoReparto(pct: PolarizationSplit, objetivo: PolarizationSplit, tolerancia: number): VeredictoLectura {
  const excesos: Array<[Banda, number]> = [
    ['facil', pct.low - objetivo.low],
    ['medio', pct.mid - objetivo.mid],
    ['duro', pct.high - objetivo.high],
  ];
  let peor: [Banda, number] | null = null;
  for (const x of excesos) if (x[1] > tolerancia && (peor == null || x[1] > peor[1])) peor = x;
  const code = peor == null ? 'en_reparto' : peor[0] === 'facil' ? 'demasiado_suave' : peor[0] === 'medio' ? 'zona_media' : 'demasiado_duro';
  const frase_es =
    peor == null ? null : `${Math.round(peor[1])} puntos más de ${peor[0] === 'facil' ? 'trabajo fácil' : peor[0] === 'medio' ? 'zona media' : 'trabajo duro'} de lo que pide tu coach.`;
  return { code, ...VEREDICTO_REPARTO[code], frase_es };
}

function splitHoras(a: Acumulado, hr: CoachHrMethod): PolarizationSplit {
  return collapseToPolarization(a.por_zona, hr);
}

function lecturaReparto(e: EntradaIntensidad, ag: Agregado, antes: Agregado | null): Lectura {
  const { ventana: v, metodo: m, hr } = e;
  const id = 'intensidad.polarizacion';
  const titulo_es = 'Reparto de intensidad';
  const familiasTxt = m.polarizacion_familias.map((f) => FAMILIA_ETIQUETA_ES[f].toLowerCase()).join(', ');
  const objetivo = polarizationTargetFrom(hr);
  const explica = `De tu tiempo con pulso en ${familiasTxt}, cuánto fue fácil, medio y duro según tu coach, frente a su objetivo (${objetivo.low}/${objetivo.mid}/${objetivo.high}).`;
  const cobertura = coberturaDe(ag.reparto, v);
  const procedencia = procedenciaZonas(ag.reparto, e, explica);

  const split = splitHoras(ag.reparto, hr);
  const pct = polarizationPct(split);
  if (pct == null) {
    return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta: faltaDeZonas(ag, ag.reparto, v), cobertura, procedencia: { ...procedencia, medida: false } });
  }

  const puntos: PuntoSerie[] = lunesDeLaVentana(v).map((lunes) => {
    const s = ag.semanas.get(lunes)?.reparto;
    const p = s ? polarizationPct(splitHoras(s, hr)) : null;
    return { t: lunes, v: p?.low ?? null };
  });
  const pctAntes = antes ? polarizationPct(splitHoras(antes.reparto, hr)) : null;
  const comparacion = v.anterior
    ? comparacionDe({ valor: pct.low, anterior: pctAntes?.low ?? null, unidad: 'pp', periodo: { desde: v.anterior.desde, hasta: v.anterior.hasta }, cambio_minimo: m.cambio_polarizacion_pts })
    : null;

  // La palabra, solo si el pulso cubre lo bastante de ese trabajo.
  const conPulso = pctConPulso(ag.reparto);
  const llega = conPulso != null && conPulso >= m.cobertura_veredicto_min_pct;
  const total = split.low + split.mid + split.high;
  const partes: Parte[] = (['facil', 'medio', 'duro'] as const).map((b) => {
    const s = b === 'facil' ? split.low : b === 'medio' ? split.mid : split.high;
    return { code: b, etiqueta_es: etiquetaBanda(b, hr), valor: horas(s), pct: total > 0 ? (b === 'facil' ? pct.low : b === 'medio' ? pct.mid : pct.high) : null };
  });

  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: { valor: pct.low, unidad: 'pct', referencia: { valor: objetivo.low, delta: pct.low - objetivo.low, de: 'objetivo_coach' } },
    comparacion,
    serie: serieDe({ unidad: 'pct', paso: 'semana', puntos, referencias: [{ code: 'objetivo', etiqueta_es: 'Objetivo de tu coach', valor: objetivo.low }] }),
    reparto: { unidad: 'horas', total: horas(total), partes },
    veredicto: llega ? veredictoReparto(pct, objetivo, m.polarizacion_tolerancia_pts) : null,
    cobertura: { ...cobertura, falta: llega ? null : { por: 'sensor' } },
    procedencia,
  });
}

// ---------------------------------------------------------------------------
// POR FAMILIA — de dónde sale la intensidad
// ---------------------------------------------------------------------------

function lecturasPorFamilia(e: EntradaIntensidad, ag: Agregado, antes: Agregado | null): Lectura[] {
  const out: Lectura[] = [];
  for (const f of FAMILIAS) {
    const a = ag.familia.get(f);
    if (!a || clasificados(a) <= 0) continue;
    out.push(
      lecturaTiempoEnZonas({
        id: `intensidad.zonas.${f}`,
        titulo_es: FAMILIA_ETIQUETA_ES[f],
        familia: f,
        a,
        // Una familia que el periodo anterior no tocó cuenta allí cero, no «sin comparar».
        antes: antes ? (antes.familia.get(f) ?? vacio()) : null,
        ag,
        e,
        explica: `Tu tiempo con pulso en ${FAMILIA_ETIQUETA_ES[f].toLowerCase()}, repartido en las cinco zonas de tu coach.`,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// EL BLOQUE
// ---------------------------------------------------------------------------

/** Las lecturas del bloque: el tiempo en zonas, cada zona por semana, el reparto, cada familia y el ritmo al correr. */
export function lecturasIntensidad(e: EntradaIntensidad): Lectura[] {
  const familias = new Set<Familia>(e.metodo.polarizacion_familias);
  const ag = agregar(e.sesiones, e.ventana, familias);
  const antes = e.ventana.anterior ? agregar(e.sesiones, e.ventana.anterior, familias) : null;
  return [
    lecturaTiempoEnZonas({
      id: 'intensidad.zonas',
      titulo_es: 'Tiempo en zonas',
      familia: null,
      a: ag.total,
      antes: antes?.total ?? null,
      ag,
      e,
      explica: 'Tu tiempo con pulso en la ventana, repartido en las cinco zonas de tu coach.',
    }),
    ...lecturasZonas(e, ag, antes),
    lecturaReparto(e, ag, antes),
    ...lecturasPorFamilia(e, ag, antes),
    lecturaRitmoCorrer(e),
  ];
}
