// RECUPERACIÓN — variabilidad, pulso en reposo, sueño y lo que Garmin/Polar den
// además, convertidas en `Lectura[]` (el contrato de `./lectura`). Hoy ninguna
// se enseña en la pantalla del atleta: entran por HealthKit/Garmin/Polar y se
// pierden.
//
// SIETE LECTURAS DE 16 MÉTRICAS. Entran porque sostienen un veredicto o piden
// una acción (variabilidad, pulso en reposo, sueño), o porque el proveedor ya
// las manda listas para leer aunque hoy no haya ni una muestra en producción
// (calidad de sueño, estrés, batería corporal). `peso` entra por completitud,
// avisando de que se va a quedar corta. Fuera: `steps`, `calories_active`,
// `training_load` (marcador de duración de HealthKit, no carga real),
// `respiration`, `spo2`, `body_fat`, `hr` crudo (ninguna sostiene un veredicto)
// y `vo2max` (ya vive en la pantalla de carrera). `recovery` (el índice
// compuesto de Polar) no entra ni sale: no estaba en ninguna de las dos listas
// del encargo — ver el informe.
//
// DOS FAMILIAS DE ENTRADA. (1) `filas` — lo que cabe en una consulta masiva a
// `biometric_streams` (variabilidad, sueño, calidad de sueño, estrés, batería
// corporal, peso): cada fila es una observación, sin revisión que resolver.
// (2) `pulso_reposo_dias` — YA RESUELTO por `resting-hr.ts`
// (`loadRestingHrDays`): un valor por día local, última revisión ganadora.
// Meterlo en la consulta masiva contaría revisiones superadas como muestras
// nuevas, el bug que ese fichero existe para cerrar; no se re-bucketea desde
// `recorded_at`, el campo `on` YA es el día local correcto.
//
// EL BASAL SE REUTILIZA, NO SE REINVENTA. `variabilidad` usa `meanOverWindow`
// de `hrv-baseline.ts` sobre las muestras CRUDAS (un test ya fija que la media
// es de lecturas crudas, no de promedios diarios). `pulso_reposo` usa la MISMA
// ventana de 60 → 14 días, pero como sus días ya llegan resueltos a uno por
// día, promediar por rango de fechas locales es más simple y más robusto ante
// husos que forzar esas filas por `meanOverWindow`. Sin campo de método para
// el mínimo de noches de ESTE basal (variabilidad sí lo tiene), así que su
// referencia no lleva puerta: solo se apaga si el basal está vacío — ver el
// informe.
//
// UN DÍA LOCAL, NUNCA UTC — y el sueño tiene una trampa real: `ingest-garmin.ts`
// estampa el sueño en su INICIO (la tarde-noche ANTERIOR a que el atleta se
// despierte), mientras Polar ya manda `sleepDate` (el día de despertar). Un
// bucket por el día puro de `recorded_at` le pondría la noche de Garmin un día
// antes de donde toca. Por eso sueño y calidad de sueño usan `porDiaDeSueno`:
// todo lo que cae a partir de las 18:00 locales se atribuye al día siguiente,
// igual que `athlete-daily-readiness.ts` (`OVERNIGHT_WINDOW_START_HOUR`, misma
// hora duplicada como constante porque ese fichero no la exporta).
//
// SIN MUESTRAS → `null`, JAMÁS CERO. Lo garantiza el TIPO: `lecturaMedida`
// exige `dato`, `lecturaSinDato` lo fuerza a `null`. Puro y sin base de datos.

import type { Falta } from '../running/progress';
import type { CoachAnalyticsMethod } from './metodo';
import {
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  type Cobertura,
  type GrupoLectura,
  type Lectura,
  type Procedencia,
  type Referencia,
  type Serie,
  type Unidad,
} from './lectura';
import {
  HRV_BASELINE_FROM_DAYS,
  HRV_BASELINE_TO_DAYS,
  HRV_RECENT_DAYS,
  meanOverWindow,
  type HrvSample,
} from '../biometrics/hrv-baseline';
import {
  RESTING_HR_SHOWABLE_DAYS,
  resolveRestingHrOn,
  type RestingHrDay,
} from '../biometrics/resting-hr';
import { addDays, isoDateString, parseIsoDate, zonedDayString, zonedWallClockToUtc } from '../dates';

const GRUPO: GrupoLectura = 'recuperacion';

// ---------------------------------------------------------------------------
// ENTRADA — filas ya leídas, nada de I/O aquí
// ---------------------------------------------------------------------------

/** Una fila de `biometric_streams` para las métricas que caben en la consulta
 *  masiva (todo salvo pulso en reposo, ver cabecera). */
export interface FilaBiometrica {
  metric_type: string;
  recorded_at: Date;
  value_numeric: number;
  source: string;
}

export interface EntradaRecuperacion {
  filas: readonly FilaBiometrica[];
  pulso_reposo_dias: readonly RestingHrDay[];
  /** Día local del atleta hasta el que se lee (YYYY-MM-DD), inclusive. */
  hasta: string;
  /**
   * Días de la ventana que se ENSEÑA (serie + cobertura). El basal de
   * variabilidad y la referencia de pulso en reposo miran hasta
   * `HRV_BASELINE_FROM_DAYS` atrás con independencia de este número — el
   * cable ya se encarga de traer suficientes filas para eso.
   */
  dias: number;
  /** `athletes.timezone` (con su defecto ya resuelto por el cable). */
  timezone: string;
  metodo: CoachAnalyticsMethod;
}

// ---------------------------------------------------------------------------
// HELPERS COMUNES
// ---------------------------------------------------------------------------

type Muestra = { at: Date; value: number; source: string };

function muestrasDe(filas: readonly FilaBiometrica[], metric: string): Muestra[] {
  return filas
    .filter((f) => f.metric_type === metric)
    .map((f) => ({ at: f.recorded_at, value: f.value_numeric, source: f.source }));
}

function promedio(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function redondearEntero(n: number): number {
  return Math.round(n);
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ventana que se ENSEÑA: `dias` días locales terminando en `hasta`, inclusive.
 *  `dias <= 0` es una ventana vacía (ver test), nunca una división por cero. */
interface VentanaDia {
  desde: string;
  hasta: string;
  dias: number;
}

function ventanaDe(hasta: string, dias: number): VentanaDia {
  const n = Number.isFinite(dias) ? Math.max(0, Math.trunc(dias)) : 0;
  const desde = n > 0 ? isoDateString(addDays(parseIsoDate(hasta), -(n - 1))) : hasta;
  return { desde, hasta, dias: n };
}

function diasDeLaVentana(v: VentanaDia): string[] {
  const out: string[] = [];
  if (v.dias <= 0) return out;
  let d = parseIsoDate(v.desde);
  const fin = parseIsoDate(v.hasta);
  while (d.getTime() <= fin.getTime()) {
    out.push(isoDateString(d));
    d = addDays(d, 1);
  }
  return out;
}

/** Bucket simple: el día local de `recorded_at`, sin más. Correcto para todo
 *  lo que no sea sueño (variabilidad, estrés, batería corporal, peso: son
 *  medidas de un instante o agregados YA diarios, no arrastran la ambigüedad
 *  de «¿a qué noche pertenece esto?»). */
function porDiaSimple(muestras: readonly Muestra[], tz: string): Map<string, Muestra[]> {
  const m = new Map<string, Muestra[]>();
  for (const s of muestras) {
    const dia = zonedDayString(s.at, tz);
    const arr = m.get(dia);
    if (arr) arr.push(s);
    else m.set(dia, [s]);
  }
  return m;
}

/** Hora local a partir de la cual una marca de sueño es «anoche empezando»,
 *  no «esta mañana»: Garmin estampa el sueño en su INICIO. Mismo corte que
 *  `OVERNIGHT_WINDOW_START_HOUR` en `athlete-daily-readiness.ts`. */
const HORA_CORTE_NOCHE = 18;

/** Bucket de sueño: atribuye cada muestra al día en que el atleta se
 *  DESPIERTA, no al día en que `recorded_at` cae. Ver cabecera del fichero. */
function porDiaDeSueno(muestras: readonly Muestra[], tz: string): Map<string, Muestra[]> {
  const m = new Map<string, Muestra[]>();
  for (const s of muestras) {
    const diaNatural = zonedDayString(s.at, tz);
    const corteNoche = zonedWallClockToUtc(parseIsoDate(diaNatural), tz, { hours: HORA_CORTE_NOCHE });
    const dia =
      s.at.getTime() >= corteNoche.getTime() ? isoDateString(addDays(parseIsoDate(diaNatural), 1)) : diaNatural;
    const arr = m.get(dia);
    if (arr) arr.push(s);
    else m.set(dia, [s]);
  }
  return m;
}

interface SerieYCobertura {
  serie: Serie;
  cobertura: Omit<Cobertura, 'falta'>;
  /** El último día CON dato dentro de la ventana enseñada — la base del
   *  «número de portada» de las cinco lecturas que no tienen mecánica propia. */
  ultimoValor: { valor: number; fuente: string | null } | null;
}

/** Recorre la ventana enseñada día a día: construye la serie (huecos = null,
 *  nunca cero ni interpolado), la cobertura real (muestras/días/pct de ESA
 *  ventana, no de todo lo que el cable haya traído) y el último valor
 *  disponible, todo en una sola pasada para que los tres no puedan discrepar. */
function construirSerieYCobertura(
  porDia: ReadonlyMap<string, readonly Muestra[]>,
  v: VentanaDia,
  unidad: Unidad,
  redondeo: (n: number) => number,
): SerieYCobertura {
  const dias = diasDeLaVentana(v);
  const puntos: Serie['puntos'] = [];
  let muestras = 0;
  let diasConDato = 0;
  let ultimo: { valor: number; fuente: string | null } | null = null;

  for (const dia of dias) {
    const del = porDia.get(dia);
    if (del) {
      diasConDato += 1;
      muestras += del.length;
      const valor = redondeo(promedio(del.map((m) => m.value)));
      puntos.push({ t: dia, v: valor });
      const masReciente = del.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
      ultimo = { valor, fuente: masReciente.source || null };
    } else {
      puntos.push({ t: dia, v: null });
    }
  }

  return {
    serie: { unidad, paso: 'dia', puntos },
    cobertura: {
      muestras,
      dias_ventana: v.dias,
      dias_con_dato: diasConDato,
      pct: pctCobertura(diasConDato, v.dias),
    },
    ultimoValor: ultimo,
  };
}

/** Cuántos días LOCALES distintos entre `desde` y `hasta` (ambos inclusive)
 *  tienen al menos una muestra — las «noches» de la puerta de variabilidad.
 *  Cuenta días, no filas: diez lecturas en un mismo día son una noche, no diez. */
function diasConMuestraEnRango(muestras: readonly Muestra[], tz: string, desde: string, hasta: string): number {
  const dias = new Set<string>();
  for (const m of muestras) {
    const dia = zonedDayString(m.at, tz);
    if (dia >= desde && dia <= hasta) dias.add(dia);
  }
  return dias.size;
}

// ---------------------------------------------------------------------------
// VARIABILIDAD — la única con puerta de historia sobre su propio basal
// ---------------------------------------------------------------------------

function lecturaVariabilidad(e: EntradaRecuperacion): Lectura {
  const id = 'recuperacion.variabilidad';
  const titulo_es = 'Variabilidad';
  const explica_es = 'Media de tu variabilidad (HRV) de los últimos 7 días, frente a tu media habitual de hace 60 a 14 días.';

  const muestras = muestrasDe(e.filas, 'hrv');
  const v = ventanaDe(e.hasta, e.dias);
  const { serie, cobertura } = construirSerieYCobertura(porDiaSimple(muestras, e.timezone), v, 'ms', redondearEntero);

  // Rango de días LOCALES de cada ventana — el mismo tamaño que usa el basal
  // de HRV (60 → 14 atrás) y la reciente (7), expresado en fechas para poder
  // contar «noches» sin pelearse con husos horarios.
  const recDesde = isoDateString(addDays(parseIsoDate(e.hasta), -(HRV_RECENT_DAYS - 1)));
  const basDesde = isoDateString(addDays(parseIsoDate(e.hasta), -(HRV_BASELINE_FROM_DAYS - 1)));
  const basHasta = isoDateString(addDays(parseIsoDate(e.hasta), -HRV_BASELINE_TO_DAYS));

  const nochesRecientes = diasConMuestraEnRango(muestras, e.timezone, recDesde, e.hasta);
  const nochesBasal = diasConMuestraEnRango(muestras, e.timezone, basDesde, basHasta);

  const procedenciaSinDato: Procedencia = {
    de: 'basal_hrv_60_14d',
    explica_es,
    medida: false,
    proveedor: null,
  };

  // LAS DOS PUERTAS, Y CUÁL VA PRIMERO — importa más de lo que parece.
  //
  // «Historia» significa «le falta TIEMPO», y por eso se le dibuja un plazo. Ese
  // plazo solo tiene sentido si esperando se cumple. Si el reloj dejó de enviar
  // hace un mes, esperar no acerca nada: el contador se queda clavado en «0 de
  // 3» para siempre y le promete algo que no va a llegar.
  //
  // Así que lo RECIENTE manda primero, y hace de prueba de vida del aparato: sin
  // noches recientes no es que le falte historia, es que nadie está midiendo.
  // Pasada esa puerta el aparato demostró que envía, y entonces un basal corto sí
  // es cuestión de tiempo — y ese plazo sí avanza solo.
  //
  // (Verificado contra producción: un atleta con 820 muestras y 31 noches, todas
  // de hace más de un mes, salía «te faltan 3 noches» en vez de «conecta tu
  // reloj».)
  if (nochesRecientes < e.metodo.hrv_min_nights_recent) {
    return lecturaSinDato({
      id,
      grupo: GRUPO,
      titulo_es,
      falta: { por: 'dispositivo' },
      cobertura,
      procedencia: procedenciaSinDato,
    });
  }
  // PUERTA NUEVA: hoy `hrvDeltaMs` da un delta con una sola muestra de basal,
  // que es un basal que se mueve con cada noche nueva — y entonces el delta mide
  // el basal, no al atleta.
  if (nochesBasal < e.metodo.hrv_min_nights_baseline) {
    return lecturaSinDato({
      id,
      grupo: GRUPO,
      titulo_es,
      falta: { por: 'historia', llevas: nochesBasal, hacen: e.metodo.hrv_min_nights_baseline },
      cobertura,
      procedencia: procedenciaSinDato,
    });
  }

  // Instantes exactos de las dos ventanas para `meanOverWindow`: el basal se
  // REUTILIZA (no se reimplementa), sobre las muestras crudas — un test ya fija
  // que la media es de lecturas crudas, no de promedios diarios.
  const finDeHasta = zonedWallClockToUtc(parseIsoDate(e.hasta), e.timezone, { days: 1, hours: 0 });
  const unDiaMs = 86_400_000;
  const recFrom = new Date(finDeHasta.getTime() - HRV_RECENT_DAYS * unDiaMs);
  const recTo = new Date(finDeHasta.getTime() + 1);
  const basFrom = new Date(finDeHasta.getTime() - HRV_BASELINE_FROM_DAYS * unDiaMs);
  const basTo = new Date(finDeHasta.getTime() - HRV_BASELINE_TO_DAYS * unDiaMs);

  const hrvSamples: HrvSample[] = muestras.map((m) => ({ at: m.at, value: m.value }));
  const recentMean = meanOverWindow(hrvSamples, recFrom, recTo);
  const baselineMean = meanOverWindow(hrvSamples, basFrom, basTo);

  // Cinturón y tirantes: las puertas de arriba ya garantizan noches en las dos
  // ventanas, así que esto no debería alcanzarse nunca — pero `meanOverWindow`
  // devuelve `number | null` y el tipo no lo sabe.
  if (recentMean == null || baselineMean == null) {
    return lecturaSinDato({
      id,
      grupo: GRUPO,
      titulo_es,
      // Mismo criterio que la puerta de arriba: sin media reciente el aparato no
      // está midiendo, y eso no se arregla esperando.
      falta: recentMean == null
        ? { por: 'dispositivo' }
        : { por: 'historia', llevas: nochesBasal, hacen: e.metodo.hrv_min_nights_baseline },
      cobertura,
      procedencia: procedenciaSinDato,
    });
  }

  const valor = redondearEntero(recentMean);
  const referenciaValor = redondearEntero(baselineMean);
  const fuente = muestras
    .filter((m) => m.at.getTime() >= recFrom.getTime() && m.at.getTime() < recTo.getTime())
    .reduce((a: Muestra | null, b) => (a == null || b.at.getTime() > a.at.getTime() ? b : a), null);

  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: {
      valor,
      unidad: 'ms',
      // `delta` resta los DOS NÚMEROS YA REDONDEADOS que se enseñan, no la
      // resta cruda: si se redondeasen por separado, delta podría no cuadrar
      // con dato.valor − referencia.valor (Referencia lo exige exacto).
      referencia: { valor: referenciaValor, delta: valor - referenciaValor, de: 'basal_60_14d' },
    },
    serie,
    cobertura,
    procedencia: { de: 'basal_hrv_60_14d', explica_es, medida: true, proveedor: fuente?.source || null },
  });
}

// ---------------------------------------------------------------------------
// PULSO EN REPOSO — el dato llega ya resuelto; solo se le añade el basal
// ---------------------------------------------------------------------------

function lecturaPulsoReposo(e: EntradaRecuperacion): Lectura {
  const id = 'recuperacion.pulso_reposo';
  const titulo_es = 'Pulso en reposo';
  const explica_es = 'Tu pulso en reposo de hoy (o el último disponible), frente a tu media habitual de hace 60 a 14 días.';

  const v = ventanaDe(e.hasta, e.dias);
  // Cada día YA es una muestra única (última revisión ganadora) — bucket
  // trivial por `on`, sin volver a pasar por `recorded_at`.
  const porDia = new Map<string, Muestra[]>(
    e.pulso_reposo_dias.map((d) => [d.on, [{ at: d.recorded_at, value: d.bpm, source: '' }]]),
  );
  const { serie, cobertura } = construirSerieYCobertura(porDia, v, 'bpm', redondearEntero);

  const resuelto = resolveRestingHrOn(e.pulso_reposo_dias, e.hasta, { max_age_days: RESTING_HR_SHOWABLE_DAYS });

  const basDesde = isoDateString(addDays(parseIsoDate(e.hasta), -(HRV_BASELINE_FROM_DAYS - 1)));
  const basHasta = isoDateString(addDays(parseIsoDate(e.hasta), -HRV_BASELINE_TO_DAYS));
  const basal = e.pulso_reposo_dias.filter((d) => d.on >= basDesde && d.on <= basHasta);
  const basalMean = basal.length > 0 ? promedio(basal.map((d) => d.bpm)) : null;

  if (resuelto == null) {
    return lecturaSinDato({
      id,
      grupo: GRUPO,
      titulo_es,
      falta: { por: 'dispositivo' },
      cobertura,
      procedencia: { de: 'resting_hr_dia_local', explica_es, medida: false, proveedor: null },
    });
  }

  const valor = redondearEntero(resuelto.bpm);
  let referencia: Referencia | null = null;
  if (basalMean != null) {
    const referenciaValor = redondearEntero(basalMean);
    referencia = { valor: referenciaValor, delta: valor - referenciaValor, de: 'basal_60_14d' };
  }

  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: { valor, unidad: 'bpm', referencia },
    serie,
    cobertura,
    // `medida` es floja cuando lo que se enseña no es la lectura DE HOY (el
    // resolvedor está enseñando la más reciente dentro de la ventana
    // mostrable): la fuente es floja, no el número en sí.
    procedencia: { de: 'resting_hr_dia_local', explica_es, medida: resuelto.is_for_day, proveedor: null },
  });
}

// ---------------------------------------------------------------------------
// LAS CINCO SIN MECÁNICA PROPIA — un mismo motor, siete líneas de configuración
// ---------------------------------------------------------------------------

interface ConfigLecturaSimple {
  id: string;
  titulo_es: string;
  metric: string;
  unidad: Unidad;
  redondeo: (n: number) => number;
  /** Se aplica ANTES de bucketear (p. ej. sleep_duration llega en segundos). */
  transformar?: (crudo: number) => number;
  bucket: 'simple' | 'sueno';
  de: string;
  explica_es: string;
  falta_sin_dato: Falta;
  referencia?: (valor: number, e: EntradaRecuperacion) => Referencia | null;
}

function lecturaSimple(e: EntradaRecuperacion, cfg: ConfigLecturaSimple): Lectura {
  const v = ventanaDe(e.hasta, e.dias);
  let muestras = muestrasDe(e.filas, cfg.metric);
  if (cfg.transformar) {
    const t = cfg.transformar;
    muestras = muestras.map((m) => ({ ...m, value: t(m.value) }));
  }
  const porDia = (cfg.bucket === 'sueno' ? porDiaDeSueno : porDiaSimple)(muestras, e.timezone);
  const { serie, cobertura, ultimoValor } = construirSerieYCobertura(porDia, v, cfg.unidad, cfg.redondeo);

  const procedencia: Procedencia = {
    de: cfg.de,
    explica_es: cfg.explica_es,
    medida: ultimoValor != null,
    proveedor: ultimoValor?.fuente ?? null,
  };

  if (ultimoValor == null) {
    return lecturaSinDato({
      id: cfg.id,
      grupo: GRUPO,
      titulo_es: cfg.titulo_es,
      falta: cfg.falta_sin_dato,
      cobertura,
      procedencia,
    });
  }

  return lecturaMedida({
    id: cfg.id,
    grupo: GRUPO,
    titulo_es: cfg.titulo_es,
    dato: {
      valor: ultimoValor.valor,
      unidad: cfg.unidad,
      referencia: cfg.referencia ? cfg.referencia(ultimoValor.valor, e) : null,
    },
    serie,
    cobertura,
    procedencia,
  });
}

const CFG_SUENO: ConfigLecturaSimple = {
  id: 'recuperacion.sueno',
  titulo_es: 'Sueño',
  metric: 'sleep_duration',
  unidad: 'horas',
  redondeo: redondear1,
  transformar: (segundos) => segundos / 3600,
  bucket: 'sueno',
  de: 'sleep_duration_dia_local',
  explica_es: 'Horas dormidas la última noche con dato, atribuidas al día en que te despertaste.',
  falta_sin_dato: { por: 'dispositivo' },
  referencia: (valor, e) => {
    const objetivo = e.metodo.sleep_target_hours;
    return { valor: objetivo, delta: redondear1(valor - objetivo), de: 'objetivo_sueno' };
  },
};

// Garmin y Polar estampan `sleep_score` con el MISMO `recorded_at` que
// `sleep_duration` (misma fila de origen), así que se atribuye al día de
// despertar con el mismo bucket. La unidad varía por proveedor (Garmin manda
// `pct`, Polar manda `score`) pero la escala es la misma 0-100 en las dos: no
// hay conversión que hacer, solo dejar de filtrar por `unit` y declarar quién
// la mandó en `procedencia.proveedor` (lo hace `lecturaSimple` para las siete).
const CFG_SUENO_CALIDAD: ConfigLecturaSimple = {
  id: 'recuperacion.sueno_calidad',
  titulo_es: 'Calidad del sueño',
  metric: 'sleep_score',
  unidad: 'puntos',
  redondeo: redondearEntero,
  bucket: 'sueno',
  de: 'sleep_score_normalizado',
  explica_es: 'Puntuación de sueño de tu reloj (Garmin o Polar), sobre 100.',
  falta_sin_dato: { por: 'dispositivo' },
};

/** Las tres lecturas restantes comparten forma exacta (bucket simple, sin
 *  referencia, sin dato = dispositivo ausente): solo cambian id/título/métrica
 *  /unidad/redondeo/explicación. Una fábrica en vez de tres literales casi
 *  idénticos donde un campo copiado mal pasaría el typecheck sin avisar. */
function cfgSimple(args: {
  id: string;
  titulo_es: string;
  metric: string;
  unidad: Unidad;
  redondeo: (n: number) => number;
  de: string;
  explica_es: string;
}): ConfigLecturaSimple {
  return { ...args, bucket: 'simple', falta_sin_dato: { por: 'dispositivo' } };
}

const CFG_ESTRES = cfgSimple({
  id: 'recuperacion.estres',
  titulo_es: 'Estrés',
  metric: 'stress',
  unidad: 'puntos',
  redondeo: redondearEntero,
  de: 'stress_garmin_dia',
  explica_es: 'Nivel medio de estrés que registra tu Garmin, sobre 100.',
});

const CFG_BATERIA_CORPORAL = cfgSimple({
  id: 'recuperacion.bateria_corporal',
  titulo_es: 'Batería corporal',
  metric: 'body_battery',
  unidad: 'puntos',
  redondeo: redondearEntero,
  de: 'body_battery_garmin_dia',
  explica_es: 'Batería corporal de tu Garmin, sobre 100.',
});

const CFG_PESO = cfgSimple({
  id: 'recuperacion.peso',
  titulo_es: 'Peso',
  metric: 'weight',
  unidad: 'kg',
  redondeo: redondear1,
  de: 'weight_ultimo_dia',
  explica_es: 'Tu último peso registrado, desde tu reloj o báscula conectada.',
});

// ---------------------------------------------------------------------------
// EL ENSAMBLADOR
// ---------------------------------------------------------------------------

/** Las siete lecturas de recuperación, en el orden en que se enseñan: de más
 *  completa (variabilidad, con puerta propia) a más corta de muestras (peso). */
export function lecturasRecuperacion(e: EntradaRecuperacion): Lectura[] {
  return [
    lecturaVariabilidad(e),
    lecturaPulsoReposo(e),
    lecturaSimple(e, CFG_SUENO),
    lecturaSimple(e, CFG_SUENO_CALIDAD),
    lecturaSimple(e, CFG_ESTRES),
    lecturaSimple(e, CFG_BATERIA_CORPORAL),
    lecturaSimple(e, CFG_PESO),
  ];
}
