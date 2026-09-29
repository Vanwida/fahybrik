// ¿MEJORO CORRIENDO? — la fila de correr y su detalle (docs/analiticas/modelo.md
// §3, «Detalles por familia», correr), con la regla común de `./progreso`.
//
// LA FILA: la mejor señal que el atleta tenga, con la escalera que ya decidió
// la pantalla de carrera (`running/progress.ts`), pero juzgada como todas las
// familias — la ventana contra la anterior, en s/km, con el umbral del coach:
//   1. Motor — su ritmo al mismo pulso (aísla la forma del esfuerzo);
//   2. el mejor esfuerzo del peldaño más largo con dato en los dos periodos;
//   3. el ritmo medio del tipo de sesión que más repite.
// Gana el primero que se puede COMPARAR; si ninguno, el primero con número.
//
// EL DETALLE: el Motor, los mejores de 400 m a la media, el ritmo por tipo de
// sesión, el umbral de ritmo con su ancla, el VDOT de su mejor esfuerzo, la
// velocidad crítica y el depósito (`ajustarVelocidadCritica`, con su puerta) y
// el desacople de sus esfuerzos sostenidos.
//
// Puro y sin base de datos.

import type { CoachRunningThresholds } from '../coach/running-thresholds';
import type { HrZoneFractions } from '../methodology/hr-zones';
import { rechazoSameHr, referenceBpmFromBand, ritmoAlPulso, type SameHrObservation, type SameHrOptions } from '../running/same-hr-pace';
import { vdotFromEffort } from '../running/vdot';
import type { AnclasAtleta } from './anclas';
import { ajustarVelocidadCritica, lecturasCapacidad, type EsfuerzoMaximal } from './capacidad';
import { anclaCuenta, lecturaMedida, lecturaSinDato, type Lectura, type Procedencia } from './lectura';
import {
  clavePeldano,
  contextoDelPeldano,
  esfuerzosCorrer,
  mejorTiempo,
  nombrePeldano,
  PELDANOS_VENTANA,
  candidatosRecordCorrer,
  type EsfuerzoCorrer,
  type MarcaCarrera,
  type TramoCorrer,
  type TrazaDistancia,
} from './mejores-correr';
import type { CoachAnalyticsMethod } from './metodo';
import {
  comparacionCon,
  enPeriodo,
  faltaDeFamiliaVacia,
  lecturaProgreso,
  mediaPonderada,
  medianaDe,
  medidasDe,
  MINIMO_MEDIA,
  MINIMO_MEJOR,
  referenciaRecord,
  serieSemanalDe,
  veredictoDeCambio,
  type FilaProgreso,
  type Fechada,
  type SalidaFamilia,
  type UmbralCambio,
} from './progreso';
import { recordsPorPrueba, type CandidatoRecord } from './records';
import { lunesDe } from './semanas';
import type { VentanaResuelta } from './ventana';

export interface DesacopleSesion extends Fechada {
  pct: number;
}

export interface EntradaCorrer {
  ventana: VentanaResuelta;
  tramos: readonly TramoCorrer[];
  trazas: readonly TrazaDistancia[];
  marcas: readonly MarcaCarrera[];
  desacoples: readonly DesacopleSesion[];
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  umbrales: CoachRunningThresholds;
  metodo: CoachAnalyticsMethod;
  /** Semanas de historia del atleta (la puerta `min_weeks_to_judge` del coach). */
  semanas_historia: number | null;
  /** El atleta aún no ha ejecutado nada: la falta es de tiempo, no de ocasión. */
  sin_historia: boolean;
}

const GRUPO = 'progreso' as const;
const S_POR_KM = (metros: number) => (v: number) => v / (metros / 1000);

// ---------------------------------------------------------------------------
// EL MOTOR — ritmo al mismo pulso
// ---------------------------------------------------------------------------

interface ObsMotor extends Fechada {
  o: SameHrObservation;
}

function pulsoDeReferencia(e: EntradaCorrer): number | null {
  const umbral = e.anclas.pulso;
  if (!umbral || !anclaCuenta(umbral.ancla)) return null;
  const f = e.fracciones_hr[e.umbrales.same_hr_reference_zone as 1 | 2 | 3 | 4 | 5];
  if (!f) return null;
  return referenceBpmFromBand({ min_bpm: Math.round(umbral.valor * f.lo), max_bpm: Math.round(umbral.valor * f.hi) });
}

function ritmoDe(t: TramoCorrer): number | null {
  if (t.ritmo_s_km != null && t.ritmo_s_km > 0) return t.ritmo_s_km;
  if (t.metros != null && t.metros > 0 && t.segundos > 0) return t.segundos / (t.metros / 1000);
  return null;
}

function obsMotor(e: EntradaCorrer, ref: number): ObsMotor[] {
  const opts: SameHrOptions = {
    reference_bpm: ref,
    tolerance_bpm: e.umbrales.same_hr_tolerance_bpm,
    min_distance_m: e.umbrales.same_hr_min_distance_m,
    gradient_retires_pace_pct: e.umbrales.gradient_retires_pace_pct,
  };
  const out: ObsMotor[] = [];
  for (const t of e.tramos) {
    const ritmo = ritmoDe(t);
    if (!t.trabajo || t.pulso == null || ritmo == null || t.metros == null) continue;
    const o: SameHrObservation = {
      week_start: lunesDe(t.dia),
      avg_hr: t.pulso,
      pace_s_per_km: ritmo,
      distance_m: t.metros,
      gradient_pct: t.pendiente_pct,
      effort: t.esfuerzo,
    };
    if (rechazoSameHr(o, opts) == null) out.push({ dia: t.dia, o });
  }
  return out;
}

const motorDe = (ref: number) => (obs: readonly ObsMotor[]) => {
  const v = mediaPonderada(obs.map((x) => ({ valor: ritmoAlPulso(x.o, ref), peso: x.o.distance_m })));
  return v == null ? null : Math.round(v);
};

// ---------------------------------------------------------------------------
// LAS PIEZAS DE LA FILA
// ---------------------------------------------------------------------------

function umbralCorrer(e: EntradaCorrer, aUnidad?: (v: number) => number): UmbralCambio {
  return { unidad: 's_km', cambio_minimo: e.umbrales.meaningful_gain_s_per_km, aUnidad };
}

/** La puerta del coach: sin sus semanas mínimas de historia, la palabra no sale. */
function puertaCorrer(e: EntradaCorrer) {
  const llevas = e.semanas_historia ?? 0;
  const hacen = e.umbrales.min_weeks_to_judge;
  return llevas < hacen ? ({ por: 'historia', llevas, hacen } as const) : null;
}

function filaMotor(e: EntradaCorrer, id: string, titulo: string): FilaProgreso | null {
  const ref = pulsoDeReferencia(e);
  if (ref == null) return null;
  const obs = obsMotor(e, ref);
  const agregar = motorDe(ref);
  return {
    id,
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: titulo,
    unidad: 's_km',
    sentido: 'menor',
    umbral: umbralCorrer(e),
    medidas: medidasDe(obs, e.ventana, agregar),
    minimo: MINIMO_MEDIA,
    ventana: e.ventana,
    serie: serieSemanalDe(obs, e.ventana, 's_km', agregar),
    procedencia: {
      de: 'motor_al_pulso',
      explica_es: `Tu ritmo corregido a ${ref} ppm (el centro de tu zona ${e.umbrales.same_hr_reference_zone}), en tramos de al menos ${e.umbrales.same_hr_min_distance_m} m sin cuesta ni fatiga.`,
      medida: true,
      ancla: e.anclas.pulso?.ancla ?? null,
      proveedor: null,
    },
    falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, e.ventana),
    puerta: puertaCorrer(e),
  };
}

/** Por qué no hay Motor cuando no lo hay: sin pulso, la banda; sin ancla, el test. */
function faltaMotor(e: EntradaCorrer) {
  const conPulso = e.tramos.some((t) => t.pulso != null);
  if (e.tramos.length > 0 && !conPulso) return { por: 'sensor' } as const;
  if (conPulso && pulsoDeReferencia(e) == null) return { por: 'ancla' } as const;
  return faltaDeFamiliaVacia(e.sin_historia, e.ventana);
}

function esfuerzosDelPeldano(esf: readonly EsfuerzoCorrer[], metros: number, e: EntradaCorrer) {
  const ctx = contextoDelPeldano(esf, metros, e.ventana);
  return ctx == null ? [] : esf.filter((x) => x.metros === metros && x.contexto === ctx);
}

function filaMejor(e: EntradaCorrer, esf: readonly EsfuerzoCorrer[], metros: number, id: string, titulo: string, comoRitmo: boolean, record: CandidatoRecord | null): FilaProgreso {
  const lista = esfuerzosDelPeldano(esf, metros, e);
  const ctx = lista[0]?.contexto ?? 'calle';
  const aRitmo = S_POR_KM(metros);
  const agregar = (xs: readonly EsfuerzoCorrer[]) => {
    const t = mejorTiempo(xs);
    return t == null ? null : comoRitmo ? Math.round(aRitmo(t)) : Math.round(t);
  };
  const medidas = medidasDe(lista, e.ventana, agregar);
  return {
    id,
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: ctx === 'cinta' ? `${titulo} · cinta` : titulo,
    unidad: comoRitmo ? 's_km' : 'segundos',
    sentido: 'menor',
    umbral: umbralCorrer(e, comoRitmo ? undefined : aRitmo),
    medidas,
    minimo: MINIMO_MEJOR,
    ventana: e.ventana,
    serie: serieSemanalDe(lista, e.ventana, comoRitmo ? 's_km' : 'segundos', agregar),
    referencia: comoRitmo ? null : referenciaRecord(medidas, record ? Math.round(record.valor) : null),
    procedencia: {
      de: `mejor_esfuerzo_${clavePeldano(metros)}`,
      explica_es: `Tu mejor ${nombrePeldano(metros)} de cada periodo${ctx === 'cinta' ? ' en cinta' : ''}: un tramo, una sesión entera o el mejor tramo dentro de una sesión.`,
      medida: true,
      ancla: null,
      proveedor: null,
    },
    falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, e.ventana),
    puerta: puertaCorrer(e),
  };
}

interface ObsTipo extends Fechada {
  tipo: string;
  ritmo: number;
  metros: number;
}

/** Un calentamiento o una vuelta a la calma son una fase, no un tipo de sesión: su ritmo no dice nada de la forma. */
const FASES_NO_TIPO: ReadonlySet<string> = new Set(['warmup', 'cooldown']);

function obsTipos(e: EntradaCorrer): ObsTipo[] {
  const out: ObsTipo[] = [];
  for (const t of e.tramos) {
    const ritmo = ritmoDe(t);
    if (!t.trabajo || !t.tipo || FASES_NO_TIPO.has(t.tipo) || ritmo == null || t.metros == null || t.metros <= 0) continue;
    out.push({ dia: t.dia, tipo: t.tipo, ritmo, metros: t.metros });
  }
  return out;
}

const ritmoMedio = (xs: readonly ObsTipo[]) => {
  const v = mediaPonderada(xs.map((x) => ({ valor: x.ritmo, peso: x.metros })));
  return v == null ? null : Math.round(v);
};

function filaTipo(e: EntradaCorrer, obs: readonly ObsTipo[], tipo: string, id: string): FilaProgreso {
  const lista = obs.filter((o) => o.tipo === tipo);
  return {
    id,
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: `Ritmo en ${tipo}`,
    unidad: 's_km',
    sentido: 'menor',
    umbral: umbralCorrer(e),
    medidas: medidasDe(lista, e.ventana, ritmoMedio),
    minimo: MINIMO_MEDIA,
    ventana: e.ventana,
    serie: serieSemanalDe(lista, e.ventana, 's_km', ritmoMedio),
    procedencia: {
      de: `mismo_tipo_${tipo}`,
      explica_es: `Tu ritmo medio (ponderado por distancia) en las sesiones de tipo «${tipo}»: el mismo tipo contra sí mismo, nunca contra otro.`,
      medida: true,
      ancla: null,
      proveedor: null,
    },
    falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, e.ventana),
    puerta: puertaCorrer(e),
  };
}

/** ¿Se puede juzgar esta fila (evidencia en los dos periodos)? */
function comparable(f: FilaProgreso): boolean {
  const { actual, anterior } = f.medidas;
  return actual != null && anterior != null && actual.muestras >= f.minimo && anterior.muestras >= f.minimo;
}

/** La fila de correr: el primer peldaño comparable; si ninguno, el primero con número; si ninguno, el primero con dato viejo. */
function filaCorrer(e: EntradaCorrer, esf: readonly EsfuerzoCorrer[], tiposObs: readonly ObsTipo[]): Lectura {
  const id = 'progreso.correr';
  const candidatas: FilaProgreso[] = [];
  const motor = filaMotor(e, id, 'Correr · Motor');
  if (motor) candidatas.push(motor);
  // Los peldaños, del más largo al más corto: cuanto más largo, menos lo mueve un día bueno.
  for (const m of [...PELDANOS_VENTANA].reverse()) {
    if (esfuerzosDelPeldano(esf, m, e).length > 0) candidatas.push(filaMejor(e, esf, m, id, `Correr · Mejor ${nombrePeldano(m)}`, true, null));
  }
  const tipos = [...new Set(tiposObs.map((o) => o.tipo))].sort(
    (a, b) => tiposObs.filter((o) => o.tipo === b).length - tiposObs.filter((o) => o.tipo === a).length || a.localeCompare(b),
  );
  for (const t of tipos) candidatas.push({ ...filaTipo(e, tiposObs, t, id), titulo_es: `Correr · Ritmo en ${t}` });

  const elegida =
    candidatas.find(comparable) ?? candidatas.find((f) => f.medidas.actual != null) ?? candidatas.find((f) => f.medidas.ultima != null);
  if (elegida) return lecturaProgreso(elegida);
  return lecturaSinDato({
    id,
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: 'Correr',
    falta: e.tramos.length === 0 && e.marcas.length === 0 ? faltaDeFamiliaVacia(e.sin_historia, e.ventana) : faltaMotor(e),
    cobertura: { dias_ventana: e.ventana.dias },
    procedencia: { de: 'progreso_correr', explica_es: 'Tu Motor, tus mejores esfuerzos o tu ritmo por tipo de sesión, lo mejor que haya.', medida: true, ancla: null, proveedor: null },
  });
}

// ---------------------------------------------------------------------------
// EL DETALLE
// ---------------------------------------------------------------------------

function lecturaUmbral(e: EntradaCorrer): Lectura {
  const u = e.anclas.ritmo.run;
  const procedencia: Procedencia = {
    de: u ? `umbral_ritmo_${u.fuente}` : 'umbral_ritmo',
    explica_es: u
      ? `${u.explica_es}. El vigente hoy, sea cual sea la ventana: del que cuelgan tus zonas y la carga de correr.`
      : 'Tu ritmo umbral: del que cuelgan tus zonas y la carga de correr.',
    medida: u?.ancla === 'medida',
    ancla: u?.ancla ?? null,
    proveedor: null,
  };
  if (!u) return lecturaSinDato({ id: 'correr.umbral', grupo: GRUPO, familia: 'correr', titulo_es: 'Ritmo umbral', falta: { por: 'ancla' }, procedencia });
  return lecturaMedida({
    id: 'correr.umbral',
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: 'Ritmo umbral',
    dato: { valor: u.valor, unidad: 's_km', referencia: null },
    cobertura: { muestras: 1, dias_ventana: e.ventana.dias, dias_con_dato: 0, pct: null },
    procedencia,
  });
}

/** Los mejores de cada peldaño de la ventana, para el ajuste de velocidad crítica. */
function curvaDe(esf: readonly EsfuerzoCorrer[], periodo: { desde: string; hasta: string }, e: EntradaCorrer): EsfuerzoMaximal[] {
  const out: EsfuerzoMaximal[] = [];
  for (const m of PELDANOS_VENTANA) {
    const t = mejorTiempo(enPeriodo(esfuerzosDelPeldano(esf, m, e), periodo));
    if (t != null) out.push({ distancia_m: m, duracion_s: t });
  }
  return out;
}

function lecturasVelocidadCritica(e: EntradaCorrer, esf: readonly EsfuerzoCorrer[]): Lectura[] {
  const u = e.anclas.ritmo.run;
  const umbral = u && u.ancla === 'medida' ? { velocidad_m_s: 1000 / u.valor } : null;
  const curva = curvaDe(esf, e.ventana, e);
  const ajuste = ajustarVelocidadCritica(curva, e.metodo, umbral);
  const previo = e.ventana.anterior ? ajustarVelocidadCritica(curvaDe(esf, e.ventana.anterior, e), e.metodo, umbral) : null;
  return lecturasCapacidad({ ajuste, esfuerzos_ofrecidos: curva.length, dias_ventana: e.ventana.dias }).map((l) => {
    const base = { ...l, familia: 'correr' as const };
    if (!ajuste.ok || !previo?.ok || !e.ventana.anterior) return base;
    if (l.id === 'capacidad.velocidad_critica') {
      const comparacion = comparacionCon({
        valor: ajuste.cs_m_s,
        anterior: previo.cs_m_s,
        periodo: e.ventana.anterior,
        umbral: umbralCorrer(e, (v) => 1000 / v),
      });
      return { ...base, comparacion, veredicto: veredictoDeCambio(comparacion, 'menor') };
    }
    return { ...base, comparacion: comparacionCon({ valor: ajuste.d_prima_m, anterior: previo.d_prima_m, periodo: e.ventana.anterior, umbral: { unidad: 'metros', cambio_minimo: null } }) };
  });
}

interface ObsVdot extends Fechada {
  vdot: number;
}

function lecturaVdot(e: EntradaCorrer, esf: readonly EsfuerzoCorrer[]): Lectura {
  // Daniels tabula de 1500 m al maratón: por debajo, el VDOT de un 800 miente.
  const obs: ObsVdot[] = [];
  for (const x of esf) {
    if (x.metros < 1500) continue;
    const vdot = vdotFromEffort({ distance_meters: x.metros, duration_seconds: x.segundos });
    if (vdot != null && Number.isFinite(vdot)) obs.push({ dia: x.dia, vdot });
  }
  const agregar = (xs: readonly ObsVdot[]) => (xs.length ? Math.round(Math.max(...xs.map((x) => x.vdot)) * 10) / 10 : null);
  return lecturaProgreso({
    id: 'correr.vdot',
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: 'VDOT',
    unidad: 'ml_kg_min',
    sentido: 'mayor',
    umbral: { unidad: 'ml_kg_min', cambio_minimo: null },
    medidas: medidasDe(obs, e.ventana, agregar),
    minimo: MINIMO_MEJOR,
    ventana: e.ventana,
    procedencia: {
      de: 'vdot_mejor_esfuerzo',
      explica_es: 'El VDOT de Daniels de tu mejor esfuerzo del periodo (de 1500 m en adelante). Sale de entrenos, no de carreras: es un suelo, no tu techo.',
      medida: false,
      ancla: null,
      proveedor: null,
    },
    falta_sin_dato: faltaDeFamiliaVacia(e.sin_historia, e.ventana),
  });
}

function lecturaDesacople(e: EntradaCorrer): Lectura {
  const agregar = (xs: readonly DesacopleSesion[]) => {
    const m = medianaDe(xs.map((x) => x.pct));
    return m == null ? null : Math.round(m * 10) / 10;
  };
  return lecturaProgreso({
    id: 'correr.desacople',
    grupo: GRUPO,
    familia: 'correr',
    titulo_es: 'Desacople',
    unidad: 'pct',
    sentido: 'menor',
    umbral: { unidad: 'pp', cambio_minimo: null },
    medidas: medidasDe(e.desacoples, e.ventana, agregar),
    minimo: MINIMO_MEJOR,
    ventana: e.ventana,
    serie: serieSemanalDe(e.desacoples, e.ventana, 'pct', agregar),
    procedencia: {
      de: 'desacople_pa_hr',
      explica_es: 'Cuánto se despega el pulso del ritmo en tus esfuerzos sostenidos de más de 20 minutos (Pa:HR), la mediana del periodo: cuanto menos, mejor base aeróbica.',
      medida: true,
      ancla: null,
      proveedor: null,
    },
    falta_sin_dato: { por: 'ocasion' },
  });
}

/** La fila de correr, su detalle y sus candidatos a récord. */
export function progresoCorrer(e: EntradaCorrer): SalidaFamilia {
  const esf = esfuerzosCorrer({ tramos: e.tramos, trazas: e.trazas, marcas: e.marcas });
  const candidatos = candidatosRecordCorrer(esf);
  const records = recordsPorPrueba(candidatos);
  const tiposObs = obsTipos(e);
  const fila = filaCorrer(e, esf, tiposObs);

  const motor = filaMotor(e, 'correr.motor', 'Motor');
  const detalle: Lectura[] = [
    fila,
    motor
      ? lecturaProgreso({ ...motor, falta_sin_dato: faltaMotor(e) })
      : lecturaSinDato({
          id: 'correr.motor',
          grupo: GRUPO,
          familia: 'correr',
          titulo_es: 'Motor',
          falta: faltaMotor(e),
          cobertura: { dias_ventana: e.ventana.dias },
          procedencia: { de: 'motor_al_pulso', explica_es: 'Tu ritmo corregido a un mismo pulso: la forma, sin el esfuerzo del día.', medida: true, ancla: null, proveedor: null },
        }),
    lecturaUmbral(e),
  ];
  for (const m of PELDANOS_VENTANA) {
    const ctx = contextoDelPeldano(esf, m, e.ventana);
    const record = ctx == null ? null : records.get(ctx === 'cinta' ? `correr.${clavePeldano(m)}.cinta` : `correr.${clavePeldano(m)}`)?.record ?? null;
    detalle.push(lecturaProgreso(filaMejor(e, esf, m, `correr.mejor.${clavePeldano(m)}`, `Mejor ${nombrePeldano(m)}`, false, record)));
  }
  const tipos = [...new Set(tiposObs.map((o) => o.tipo))].sort();
  for (const t of tipos) detalle.push(lecturaProgreso(filaTipo(e, tiposObs, t, `correr.tipo.${t}`)));
  detalle.push(lecturaVdot(e, esf), ...lecturasVelocidadCritica(e, esf), lecturaDesacople(e));
  return { fila, detalle, candidatos };
}
