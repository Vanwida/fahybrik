// FORMA, FATIGA Y FRESCURA — con las ventanas del coach, la proyección hasta la
// carrera y la honestidad desglosada (docs/analiticas/modelo.md §4 y A5).
//
// NOMBRES, NO SIGLAS. Forma es la carga crónica (CTL), Fatiga la aguda (ATL),
// Frescura la diferencia (TSB). «Forma» significa solo esto en toda la app.
//
// CINCO ESTADOS DE FRESCURA, cuatro cortes del coach:
//   ≤ sobrecarga → sobrecarga · …optimo → óptimo · …mantener → mantener ·
//   …fresco → fresco · por encima → recargando.
// La PALABRA se retira cuando la cobertura de carga baja del mínimo del coach
// (defecto 90 %) o el fondo aún está arrancando; el NÚMERO se queda siempre. Y
// cuando la palabra sale, dice cuánto de la carga que la sostiene es estimada.
//
// LA PROYECCIÓN. Como la carga planificada se calcula sola desde la prescripción
// (A7), la curva sigue con el plan desde mañana hasta el día de la carrera: es
// lo que TrainingPeaks solo puede hacer si el coach escribe el TSS a mano. Los
// días del plan cuya carga no se sabe cuentan a cero Y se cuentan: la
// proyección es un suelo, y lo dice.
//
// EL ARRANQUE EN FRÍO NO SE DIBUJA: la serie diaria entra ENTERA (desde la
// primera sesión) y se dibuja solo la ventana. Con la historia completa no hay
// calentamiento artificial que recortar: la media móvil arranca cuando arrancó
// el atleta, y `checkColdStart` dice si ya asentó.
//
// Puro y sin base de datos.

import {
  computeLoadSeries,
  computeRampSeries,
  currentRamp,
  RAMP_WINDOW_DAYS,
  type LoadPoint,
} from '../training-load/banister';
import { checkColdStart } from '../training-load/load-verdict';
import type { Falta } from '../running/progress';
import { addDays, isoDateString, parseIsoDate } from '../dates';
import { anclaMasDebil, type AnclasAtleta } from './anclas';
import { anclaDeLaSerie, type DiaCarga } from './carga-tramo';
import type { DiaPlan } from './carga-plan';
import {
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Ancla,
  type Cobertura,
  type Comparacion,
  type Lectura,
  type Procedencia,
  type PuntoSerie,
  type ReferenciaSerie,
  type VeredictoLectura,
} from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import type { VentanaResuelta } from './ventana';

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

export interface EntradaForma {
  /** La serie diaria COMPLETA y contigua, de la primera sesión a hoy. Ascendente. */
  diario: readonly DiaCarga[];
  /** El plan diario desde mañana hasta el horizonte (la carrera, o nada). Ascendente. */
  plan_futuro: readonly DiaPlan[];
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  anclas: AnclasAtleta;
  /** Días desde la primera sesión hasta hoy. Null si no ha ejecutado nada. */
  dias_de_historia: number | null;
  /** La carrera objetivo, si la hay. `fecha` en el calendario del atleta. */
  carrera: { fecha: string; nombre: string } | null;
  /** Hoy, en el día local del atleta. */
  hoy: string;
}

// ---------------------------------------------------------------------------
// LA FRESCURA — cinco estados
// ---------------------------------------------------------------------------

export type EstadoFrescura = 'sobrecarga' | 'optimo' | 'mantener' | 'fresco' | 'recargando';

export const ESTADOS_FRESCURA: readonly EstadoFrescura[] = ['sobrecarga', 'optimo', 'mantener', 'fresco', 'recargando'];

/** Cómo se llama cada estado delante del atleta, y cuánto apremia. */
export const ESTADO_FRESCURA_ES: Record<EstadoFrescura, { etiqueta_es: string; tono: VeredictoLectura['tono'] }> = {
  sobrecarga: { etiqueta_es: 'Pasado de carga', tono: 'aviso' },
  optimo: { etiqueta_es: 'Construyendo', tono: 'bien' },
  mantener: { etiqueta_es: 'Manteniendo', tono: 'neutro' },
  fresco: { etiqueta_es: 'Fresco', tono: 'bien' },
  recargando: { etiqueta_es: 'Recargando', tono: 'atencion' },
};

/** El estado de una frescura, con los cortes del coach. */
export function estadoFrescura(tsb: number, m: CoachAnalyticsMethod): EstadoFrescura {
  if (tsb <= m.frescura_sobrecarga_hasta) return 'sobrecarga';
  if (tsb <= m.frescura_optimo_hasta) return 'optimo';
  if (tsb <= m.frescura_mantener_hasta) return 'mantener';
  if (tsb <= m.frescura_fresco_hasta) return 'fresco';
  return 'recargando';
}

/** Las cuatro líneas de corte, en unidades reales, para dibujar las bandas. */
export function referenciasFrescura(m: CoachAnalyticsMethod): ReferenciaSerie[] {
  return [
    { code: 'sobrecarga_hasta', etiqueta_es: 'Sobrecarga', valor: m.frescura_sobrecarga_hasta },
    { code: 'optimo_hasta', etiqueta_es: 'Óptimo', valor: m.frescura_optimo_hasta },
    { code: 'mantener_hasta', etiqueta_es: 'Mantener', valor: m.frescura_mantener_hasta },
    { code: 'fresco_hasta', etiqueta_es: 'Fresco', valor: m.frescura_fresco_hasta },
  ];
}

// ---------------------------------------------------------------------------
// LA COBERTURA — lo que sostiene (o retira) la palabra
// ---------------------------------------------------------------------------

export interface CoberturaCarga {
  cobertura: Omit<Cobertura, 'falta'>;
  falta: Falta | null;
  /** La palabra puede decirse: hay historia y la cobertura llega al mínimo del coach. */
  permite_veredicto: boolean;
  /** 0-100: parte del tiempo entrenado que entra en los números. Null sin trabajo. */
  pct_preciado: number | null;
  /** 0-100: parte de la CARGA preciada que se apoya en un umbral estimado. */
  pct_estimada: number;
  /** La ancla más débil que entra en la ventana. */
  ancla: Ancla | null;
  medidos_s: number;
  declarados_s: number;
  sin_saber_s: number;
  sin_saber_con_pulso_s: number;
  sin_saber_sesiones: number;
  por_ancla: Record<Ancla, number>;
}

function sumar(dias: readonly DiaCarga[], f: (d: DiaCarga) => number): number {
  return dias.reduce((a, d) => a + f(d), 0);
}

/**
 * La cobertura de la ventana, calculada UNA vez: todas las lecturas de forma
 * salen de la misma serie y la ven igual de bien o igual de mal.
 */
export function coberturaCarga(e: EntradaForma, ventana: readonly DiaCarga[]): CoberturaCarga {
  const frio = checkColdStart(e.dias_de_historia, e.metodo.ctl_days);
  const medidos_s = sumar(ventana, (d) => d.measured_seconds);
  const declarados_s = sumar(ventana, (d) => d.declared_seconds);
  const sin_saber_s = sumar(ventana, (d) => d.unknown_seconds);
  const sin_saber_con_pulso_s = sumar(ventana, (d) => d.sin_saber_con_pulso_s);
  const sin_saber_sesiones = sumar(ventana, (d) => d.unknown_sessions);
  const total = medidos_s + declarados_s + sin_saber_s;
  const por_ancla: Record<Ancla, number> = { medida: 0, declarada: 0, estimada: 0, poblacional: 0 };
  for (const d of ventana) for (const a of Object.keys(por_ancla) as Ancla[]) por_ancla[a] += d.por_ancla[a];
  const conAncla = por_ancla.medida + por_ancla.declarada + por_ancla.estimada;
  const pct_estimada = conAncla > 0 ? (por_ancla.estimada / conAncla) * 100 : 0;
  const pct_preciado = total > 0 ? ((medidos_s + declarados_s) / total) * 100 : null;

  const dias_con_dato = ventana.filter((d) => d.known_seconds + d.unknown_seconds > 0).length;
  const muestras = sumar(ventana, (d) => d.sesiones);

  // Con cero trabajo en la ventana no hay hueco: un cero es una medida.
  const llega = pct_preciado == null || pct_preciado >= e.metodo.cobertura_veredicto_min_pct;
  const permite_veredicto = frio.is_warmed_up && llega;

  // El arranque en frío manda: de nada sirve pedirle el RPE si el problema es
  // que lleva tres semanas. Luego, el hueco dice de qué es: si HABÍA pulso y no
  // un umbral que contara, lo que falta es el ancla; si no, puntuar.
  let falta: Falta | null = null;
  if (!frio.is_warmed_up) {
    falta = { por: 'historia', llevas: frio.days_of_history ?? 0, hacen: frio.ctl_window_days };
  } else if (!llega) {
    const anclaPulso = e.anclas.pulso;
    const sinAnclaUtil = anclaPulso == null || anclaPulso.ancla === 'poblacional';
    falta =
      sinAnclaUtil && sin_saber_con_pulso_s > 0
        ? { por: 'ancla' }
        : { por: 'esfuerzo', sesiones: sin_saber_sesiones };
  }

  return {
    cobertura: {
      muestras,
      dias_ventana: e.ventana.dias,
      dias_con_dato,
      pct: pctCobertura(dias_con_dato, e.ventana.dias),
    },
    falta,
    permite_veredicto,
    pct_preciado,
    pct_estimada,
    ancla: anclaDeLaSerie(ventana),
    medidos_s,
    declarados_s,
    sin_saber_s,
    sin_saber_con_pulso_s,
    sin_saber_sesiones,
    por_ancla,
  };
}

// ---------------------------------------------------------------------------
// LAS LECTURAS
// ---------------------------------------------------------------------------

const GRUPO = 'forma' as const;

function catalogo(m: CoachAnalyticsMethod) {
  return {
    forma: {
      id: 'carga.fondo',
      titulo_es: 'Forma',
      de: 'banister_ctl',
      explica_es: `Media móvil de ${m.ctl_days} días de la carga diaria: el trabajo que ya tienes encima.`,
    },
    fatiga: {
      id: 'carga.reciente',
      titulo_es: 'Fatiga',
      de: 'banister_atl',
      explica_es: `Media móvil de ${m.atl_days} días: el cansancio que aún arrastras.`,
    },
    frescura: {
      id: 'carga.frescura',
      titulo_es: 'Frescura',
      de: 'banister_tsb',
      explica_es: 'La forma menos la fatiga. En positivo llegas descansado; en negativo, cargado.',
    },
    subida: {
      id: 'carga.subida',
      titulo_es: 'Ritmo de subida',
      de: 'banister_ramp',
      explica_es: 'Cuánto ha crecido tu forma en la última semana. Sube el listón, no lo que ya hiciste.',
    },
    cobertura: {
      id: 'carga.cobertura',
      titulo_es: 'Cuánto de esto se ha medido',
      de: 'cobertura_carga',
      explica_es: 'Del tiempo que entrenaste en la ventana, cuánto entra en los números y con qué umbral.',
    },
    proyeccion: {
      id: 'carga.proyeccion',
      titulo_es: 'Frescura el día de la carrera',
      de: 'banister_proyeccion_plan',
      explica_es: 'La curva de forma seguida con lo que tienes planificado hasta el día de la carrera.',
    },
  } as const;
}

function procedenciaDe(l: { de: string; explica_es: string }, cob: CoberturaCarga, sufijo?: string): Procedencia {
  const estimada = cob.pct_estimada > 0 ? ` Un ${Math.round(cob.pct_estimada)} % de la carga se apoya en un umbral estimado.` : '';
  return {
    de: l.de,
    explica_es: `${l.explica_es}${sufijo ?? ''}${estimada}`,
    medida: cob.medidos_s > cob.declarados_s,
    ancla: cob.ancla,
    proveedor: null,
  };
}

/** Los puntos de una serie de Banister dentro de la ventana. */
function puntosEn(serie: readonly LoadPoint[], desde: string, hasta: string, campo: 'ctl' | 'atl' | 'tsb'): PuntoSerie[] {
  return serie.filter((p) => p.date >= desde && p.date <= hasta).map((p) => ({ t: p.date, v: p[campo] }));
}

/** El valor de la serie el último día del periodo anterior (para comparar). */
function valorAlFinal(serie: readonly LoadPoint[], hasta: string, campo: 'ctl' | 'atl' | 'tsb'): number | null {
  let ultimo: LoadPoint | null = null;
  for (const p of serie) if (p.date <= hasta) ultimo = p;
  return ultimo ? ultimo[campo] : null;
}

/** Cuántos días de proyección como mucho: una temporada. Mecanismo, no método. */
export const PROYECCION_MAX_DIAS = 365;

export interface Proyeccion {
  /** Días proyectados (mañana → carrera), en orden. */
  puntos: LoadPoint[];
  /** La frescura el día de la carrera. */
  tsb_carrera: number;
  ctl_carrera: number;
  sesiones_plan: number;
  items_sin_saber: number;
  dias: number;
}

/**
 * Sigue la curva con el plan: desde el estado de hoy, un día tras otro con la
 * carga planificada (lo que no se sabe cuenta cero, y se cuenta). Null cuando no
 * hay carrera, la carrera ya pasó o queda a más de una temporada.
 */
export function proyectarHastaCarrera(e: EntradaForma, serie: readonly LoadPoint[]): Proyeccion | null {
  if (!e.carrera) return null;
  const hoy = parseIsoDate(e.hoy);
  const carrera = parseIsoDate(e.carrera.fecha);
  const dias = Math.round((carrera.getTime() - hoy.getTime()) / 86_400_000);
  if (dias <= 0 || dias > PROYECCION_MAX_DIAS) return null;

  const ultimo = serie[serie.length - 1];
  let ctl = ultimo?.ctl ?? 0;
  let atl = ultimo?.atl ?? 0;
  const planPorDia = new Map(e.plan_futuro.map((d) => [d.date, d]));
  const puntos: LoadPoint[] = [];
  let sesiones_plan = 0;
  let items_sin_saber = 0;
  for (let i = 1; i <= dias; i++) {
    const date = isoDateString(addDays(hoy, i));
    const plan = planPorDia.get(date);
    const tss = plan?.tss ?? 0;
    sesiones_plan += plan?.sesiones ?? 0;
    items_sin_saber += plan?.sin_saber ?? 0;
    const tsb = ctl - atl;
    ctl = ctl + (tss - ctl) / e.metodo.ctl_days;
    atl = atl + (tss - atl) / e.metodo.atl_days;
    puntos.push({ date, tss, ctl, atl, tsb });
  }
  const ultimoDia = puntos[puntos.length - 1]!;
  return { puntos, tsb_carrera: ultimoDia.tsb, ctl_carrera: ultimoDia.ctl, sesiones_plan, items_sin_saber, dias };
}

/** Las seis lecturas de forma. */
export function lecturasForma(e: EntradaForma): Lectura[] {
  const m = e.metodo;
  const cat = catalogo(m);
  const serie = computeLoadSeries(e.diario, { ctl_tau: m.ctl_days, atl_tau: m.atl_days });
  const ventana = e.diario.filter((d) => d.date >= e.ventana.desde && d.date <= e.ventana.hasta);
  const cob = coberturaCarga(e, ventana);
  const ultimo = serie[serie.length - 1];
  const referencias = referenciasFrescura(m);

  // Sin una sola sesión no hay un fondo que valga cero: no hay fondo. Se mira la
  // historia y no solo la serie, porque el cargador rellena los días de la
  // ventana con ceros aunque el atleta no haya ejecutado nunca nada.
  if (ultimo == null || e.dias_de_historia == null) {
    const falta: Falta = { por: 'historia', llevas: 0, hacen: m.ctl_days };
    const sinDato = (l: { id: string; titulo_es: string; de: string; explica_es: string }) =>
      lecturaSinDato({ id: l.id, grupo: GRUPO, titulo_es: l.titulo_es, falta, cobertura: cob.cobertura, procedencia: procedenciaDe(l, cob) });
    return [
      sinDato(cat.forma),
      sinDato(cat.fatiga),
      sinDato(cat.frescura),
      sinDato(cat.subida),
      sinDato(cat.cobertura),
      e.carrera
        ? sinDato(cat.proyeccion)
        : lecturaSinDato({ ...cat.proyeccion, grupo: GRUPO, falta: { por: 'objetivo' }, cobertura: cob.cobertura, procedencia: procedenciaDe(cat.proyeccion, cob) }),
    ];
  }

  const proyeccion = proyectarHastaCarrera(e, serie);
  const planPuntos = (campo: 'ctl' | 'atl' | 'tsb'): PuntoSerie[] | null =>
    proyeccion ? proyeccion.puntos.map((p) => ({ t: p.date, v: p[campo] })) : null;
  const comparar = (valor: number, campo: 'ctl' | 'atl' | 'tsb', cambio: number): Comparacion | null =>
    e.ventana.anterior
      ? comparacionDe({
          valor,
          anterior: valorAlFinal(serie, e.ventana.anterior.hasta, campo),
          unidad: 'tss',
          periodo: { desde: e.ventana.anterior.desde, hasta: e.ventana.anterior.hasta },
          cambio_minimo: cambio,
        })
      : null;
  const cobertura = { ...cob.cobertura, falta: cob.falta };

  const estado = estadoFrescura(ultimo.tsb, m);
  const veredictoFrescura: VeredictoLectura | null = cob.permite_veredicto
    ? {
        code: estado,
        etiqueta_es: ESTADO_FRESCURA_ES[estado].etiqueta_es,
        frase_es: cob.pct_estimada > 0 ? `Un ${Math.round(cob.pct_estimada)} % de esta carga sale de un umbral estimado.` : null,
        tono: ESTADO_FRESCURA_ES[estado].tono,
      }
    : null;

  const lecturas: Lectura[] = [
    lecturaMedida({
      id: cat.forma.id,
      grupo: GRUPO,
      titulo_es: cat.forma.titulo_es,
      dato: { valor: ultimo.ctl, unidad: 'tss', referencia: null },
      comparacion: comparar(ultimo.ctl, 'ctl', m.cambio_forma_tss),
      serie: serieDe({ unidad: 'tss', paso: 'dia', puntos: puntosEn(serie, e.ventana.desde, e.ventana.hasta, 'ctl'), plan: planPuntos('ctl') }),
      cobertura,
      procedencia: procedenciaDe(cat.forma, cob),
    }),
    lecturaMedida({
      id: cat.fatiga.id,
      grupo: GRUPO,
      titulo_es: cat.fatiga.titulo_es,
      dato: { valor: ultimo.atl, unidad: 'tss', referencia: null },
      comparacion: comparar(ultimo.atl, 'atl', m.cambio_forma_tss),
      serie: serieDe({ unidad: 'tss', paso: 'dia', puntos: puntosEn(serie, e.ventana.desde, e.ventana.hasta, 'atl'), plan: planPuntos('atl') }),
      cobertura,
      procedencia: procedenciaDe(cat.fatiga, cob),
    }),
    lecturaMedida({
      id: cat.frescura.id,
      grupo: GRUPO,
      titulo_es: cat.frescura.titulo_es,
      // La frescura se lee contra CERO: por encima llega descansado, por debajo
      // cargado. Servir la referencia evita que cada cliente invente su corte.
      dato: { valor: ultimo.tsb, unidad: 'tss', referencia: { valor: 0, delta: ultimo.tsb, de: 'equilibrio' } },
      comparacion: comparar(ultimo.tsb, 'tsb', m.cambio_frescura_tss),
      serie: serieDe({ unidad: 'tss', paso: 'dia', puntos: puntosEn(serie, e.ventana.desde, e.ventana.hasta, 'tsb'), plan: planPuntos('tsb'), referencias }),
      veredicto: veredictoFrescura,
      cobertura,
      procedencia: procedenciaDe(cat.frescura, cob),
    }),
  ];

  // EL RITMO DE SUBIDA NO SE INVENTA A CERO. Un cero es «no ha subido», y a
  // quien lleva cinco días no le ha dado tiempo ni a subir ni a no subir.
  const rampas = computeRampSeries(serie);
  const rampa = currentRamp(serie);
  lecturas.push(
    rampa == null
      ? lecturaSinDato({
          id: cat.subida.id,
          grupo: GRUPO,
          titulo_es: cat.subida.titulo_es,
          falta: { por: 'historia', llevas: serie.length, hacen: RAMP_WINDOW_DAYS + 1 },
          cobertura: cob.cobertura,
          procedencia: procedenciaDe(cat.subida, cob),
        })
      : lecturaMedida({
          id: cat.subida.id,
          grupo: GRUPO,
          titulo_es: cat.subida.titulo_es,
          dato: {
            valor: rampa,
            unidad: 'tss_semana',
            referencia: { valor: m.ramp_alert_tss_per_week, delta: rampa - m.ramp_alert_tss_per_week, de: 'aviso_del_coach' },
          },
          serie: serieDe({
            unidad: 'tss_semana',
            paso: 'dia',
            puntos: rampas.filter((p) => p.date >= e.ventana.desde && p.date <= e.ventana.hasta).map((p) => ({ t: p.date, v: p.ramp })),
            referencias: [{ code: 'aviso', etiqueta_es: 'Aviso', valor: m.ramp_alert_tss_per_week }],
          }),
          veredicto: cob.permite_veredicto
            ? rampa >= m.ramp_alert_tss_per_week
              ? { code: 'sube_rapido', etiqueta_es: 'Subiendo rápido', frase_es: null, tono: 'aviso' }
              : rampa <= -m.ramp_alert_tss_per_week
                ? { code: 'baja', etiqueta_es: 'Bajando', frase_es: null, tono: 'neutro' }
                : { code: 'sostenida', etiqueta_es: 'Subida sostenible', frase_es: null, tono: 'bien' }
            : null,
          cobertura,
          procedencia: procedenciaDe(cat.subida, cob),
        }),
  );

  // LA LECTURA QUE SOSTIENE A LAS DEMÁS: cuánto del tiempo entrenado entra en
  // los números, y contra qué umbral. Sin ella, las de arriba son afirmaciones
  // sobre un TROZO del entrenamiento presentadas como si fueran sobre todo él.
  const total = cob.medidos_s + cob.declarados_s + cob.sin_saber_s;
  const parte = (v: number) => (total > 0 ? (v / total) * 100 : null);
  lecturas.push(
    total <= 0
      ? lecturaSinDato({
          id: cat.cobertura.id,
          grupo: GRUPO,
          titulo_es: cat.cobertura.titulo_es,
          falta: { por: 'historia', llevas: e.dias_de_historia ?? 0, hacen: e.ventana.dias },
          cobertura: cob.cobertura,
          procedencia: { ...procedenciaDe(cat.cobertura, cob), medida: true },
        })
      : lecturaMedida({
          id: cat.cobertura.id,
          grupo: GRUPO,
          titulo_es: cat.cobertura.titulo_es,
          dato: {
            valor: cob.pct_preciado ?? 0,
            unidad: 'pct',
            referencia: { valor: m.cobertura_veredicto_min_pct, delta: (cob.pct_preciado ?? 0) - m.cobertura_veredicto_min_pct, de: 'minimo_del_coach' },
          },
          reparto: {
            unidad: 'segundos',
            total,
            partes: [
              { code: 'medida', etiqueta_es: 'Contra un umbral medido', valor: cob.por_ancla.medida, pct: parte(cob.por_ancla.medida) },
              { code: 'declarada', etiqueta_es: 'Contra un umbral que nos diste', valor: cob.por_ancla.declarada, pct: parte(cob.por_ancla.declarada) },
              { code: 'estimada', etiqueta_es: 'Contra un umbral estimado', valor: cob.por_ancla.estimada, pct: parte(cob.por_ancla.estimada) },
              { code: 'esfuerzo', etiqueta_es: 'Por tu esfuerzo', valor: cob.declarados_s, pct: parte(cob.declarados_s) },
              { code: 'sin_saber', etiqueta_es: 'Sin medir ni puntuar', valor: cob.sin_saber_s, pct: parte(cob.sin_saber_s) },
            ],
          },
          cobertura: { ...cob.cobertura, muestras: cob.sin_saber_sesiones, falta: cob.falta },
          procedencia: { ...procedenciaDe(cat.cobertura, cob), medida: true },
        }),
  );

  // LA PROYECCIÓN hasta la carrera.
  if (!e.carrera) {
    lecturas.push(
      lecturaSinDato({ ...cat.proyeccion, grupo: GRUPO, falta: { por: 'objetivo' }, cobertura: cob.cobertura, procedencia: procedenciaDe(cat.proyeccion, cob) }),
    );
  } else if (!proyeccion) {
    // La carrera ya pasó o queda a más de una temporada: no hay qué proyectar.
    lecturas.push(
      lecturaSinDato({ ...cat.proyeccion, grupo: GRUPO, falta: { por: 'ocasion' }, cobertura: cob.cobertura, procedencia: procedenciaDe(cat.proyeccion, cob) }),
    );
  } else {
    const estadoCarrera = estadoFrescura(proyeccion.tsb_carrera, m);
    const conPlan = proyeccion.sesiones_plan > 0;
    const planCubre = conPlan && proyeccion.items_sin_saber === 0;
    const sufijo =
      proyeccion.items_sin_saber > 0
        ? ` ${proyeccion.items_sin_saber} ${proyeccion.items_sin_saber === 1 ? 'línea del plan no dice' : 'líneas del plan no dicen'} cuánto cuestan: cuentan cero, así que esto es un suelo.`
        : conPlan
          ? ''
          : ' No hay entrenos planificados hasta la carrera: es la curva si no entrenaras.';
    lecturas.push(
      lecturaMedida({
        id: cat.proyeccion.id,
        grupo: GRUPO,
        titulo_es: cat.proyeccion.titulo_es,
        dato: { valor: proyeccion.tsb_carrera, unidad: 'tss', referencia: { valor: 0, delta: proyeccion.tsb_carrera, de: 'equilibrio' } },
        serie: serieDe({ unidad: 'tss', paso: 'dia', puntos: [], plan: proyeccion.puntos.map((p) => ({ t: p.date, v: p.tsb })), referencias }),
        veredicto:
          cob.permite_veredicto && planCubre
            ? { code: estadoCarrera, etiqueta_es: ESTADO_FRESCURA_ES[estadoCarrera].etiqueta_es, frase_es: null, tono: ESTADO_FRESCURA_ES[estadoCarrera].tono }
            : null,
        cobertura: {
          muestras: proyeccion.sesiones_plan,
          dias_ventana: proyeccion.dias,
          dias_con_dato: e.plan_futuro.filter((d) => d.sesiones > 0 && d.date > e.hoy && d.date <= e.carrera!.fecha).length,
          pct: pctCobertura(e.plan_futuro.filter((d) => d.sesiones > 0 && d.date > e.hoy && d.date <= e.carrera!.fecha).length, proyeccion.dias),
          falta: cob.falta ?? (conPlan ? null : { por: 'plan' }),
        },
        procedencia: procedenciaDe(cat.proyeccion, cob, sufijo),
      }),
    );
  }

  return lecturas;
}

/** La ancla más débil de todo lo que entra en un panel (para el resumen). */
export function anclaDelPanel(anclas: AnclasAtleta): Ancla | null {
  return anclaMasDebil([
    anclas.pulso?.ancla ?? null,
    anclas.ritmo.run?.ancla ?? null,
    anclas.ritmo.row?.ancla ?? null,
    anclas.ritmo.ski?.ancla ?? null,
    anclas.ritmo.bike?.ancla ?? null,
  ]);
}
