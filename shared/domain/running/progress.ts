// ¿ESTOY MEJORANDO? — el motor de la lectura longitudinal de carrera del atleta.
//
// POR QUÉ VIVE AQUÍ Y NO EN LA PANTALLA
// -------------------------------------
// Esta lógica nació dibujando el doble (`design-twin/screens/analiticas-correr`)
// porque razonarla hacía falta para diseñarla. Pero el veredicto lo tiene que
// calcular el SERVIDOR: la app del atleta es Swift y no puede ejecutar esto, así
// que si el motor se quedaba en la pantalla habría dos — uno en TypeScript para
// el mockup y otro reescrito en Swift — y el día que discreparan nadie sabría
// cuál es el bueno. Vive aquí, se ejecuta una vez en el servidor, y el mockup
// importa exactamente lo mismo que sirve la API. Por eso el doble no puede
// mentir sobre lo que hará la app.
//
// EL MODELO ENTERO. Una lectura longitudinal son cuatro cosas a la vez:
//
//   MAGNITUD    qué se mide
//   BASE        contra qué (sin base, un número no dice nada)
//   COBERTURA   si hay con qué afirmarlo
//   SENTIDO     hacia dónde es mejor — y NO es obvio: que el ritmo baje es
//               mejorar, que el volumen suba no lo es necesariamente.
//
// EL VEREDICTO SE DERIVA Y CABE EN TRES PALABRAS. No es un índice del 0 al 100
// sacado de una fórmula que nadie puede auditar: sale de una ESCALERA DE
// EVIDENCIA, y tiene que poder decir «aún no».
//
// REGLA Nº0. El mecanismo (la escalera, la detección de exceso de carga, qué
// silencia una lectura) es del producto y vive en este fichero. Los umbrales son
// MÉTODO del coach y ENTRAN POR PARÁMETRO — nunca como `const` de aquí. Ver
// `shared/domain/coach/running-thresholds.ts`.
//
// Puro y sin base de datos, como todo `shared/domain`.

import type { CoachRunningThresholds } from '../coach/running-thresholds';

// ---------------------------------------------------------------------------
// POR QUÉ UNA LECTURA PUEDE NO PODER DARSE
// ---------------------------------------------------------------------------

/**
 * Cinco razones, y se agrupan en DOS tratamientos. Esa agrupación es toda la
 * diferencia entre una pantalla honesta y una que da pena.
 *
 *   historia    le falta TIEMPO. Se le dibuja el plazo.
 *   ancla       no hay test de zonas: no se sabe qué es «suave» para él.
 *   sensor      no hay pulso medido, así que no hay nada que anclar.
 *   dispositivo no hay reloj que lo mida. Distinto de `sensor`: una banda de
 *               pulso no le da el sueño ni la variabilidad nocturna, y pedirle
 *               la banda para desbloquear el sueño sería mandarle a comprar lo
 *               que no le sirve.
 *   ocasion     la ocasión no se ha dado todavía (nunca corrió cansado).
 *   intencion   nadie le ha pedido nunca un ritmo: no hay contra qué cumplir.
 */
export type Falta =
  | { por: 'historia'; llevas: number; hacen: number }
  | { por: 'ancla' }
  | { por: 'sensor' }
  | { por: 'dispositivo' }
  | { por: 'ocasion' }
  | { por: 'intencion' };

/**
 * «Aún no» y «no aplica» parecen lo mismo y no lo son. Al recién llegado le
 * falta TIEMPO y se le dibuja el plazo. Al que no ha corrido nunca detrás de un
 * trineo no le falta nada: esa lectura no existe en su vida, y enseñarle un
 * hueco prometiéndosela es ruido con forma de dato.
 *
 * Regla dura (docs/DECISIONS.md, 12-ago): sin cobertura se dice por qué; si en
 * su caso no existe, la app se calla.
 */
export function seCalla(f: Falta): boolean {
  return f.por === 'ocasion' || f.por === 'intencion';
}

/**
 * La SALIDA de una falta — el botón, que es todo el texto que se le dedica.
 * Null cuando no hay nada que el atleta pueda hacer hoy para desbloquearla
 * (esperar no es una acción).
 */
export function salidaDe(f: Falta): string | null {
  switch (f.por) {
    case 'ancla':
      return 'Hacer el test de zonas';
    case 'sensor':
      return 'Conectar banda de pulso';
    case 'dispositivo':
      return 'Conectar tu reloj';
    default:
      return null;
  }
}

/**
 * Cuando varias lecturas esperan LO MISMO, la salida sale UNA vez. Sin esto, al
 * atleta sin test le pediría el test tres veces seguidas en la misma pantalla.
 */
export function faltaComun(faltas: readonly Falta[]): Falta | null {
  const contables = faltas.filter((f) => !seCalla(f));
  if (contables.length < 2) return null;
  const primera = contables[0]!;
  return contables.every((f) => f.por === primera.por) ? primera : null;
}

// ---------------------------------------------------------------------------
// LO QUE SE SABE DEL ATLETA
// ---------------------------------------------------------------------------

/** Un punto semanal. `semana` es el lunes en ISO (`YYYY-MM-DD`) — el cliente
 *  decide cómo se escribe una fecha, el servidor no manda etiquetas. */
export interface PuntoSemana {
  semana: string;
  valor: number;
}

export interface Esfuerzo {
  metros: number;
  segundos: number;
}

/**
 * LO QUE LE PIDIERON, agregado. Es exactamente la forma que ya devuelve
 * `summarizeRunCompliance` por sesión — aquí llega sumado sobre la ventana, que
 * es lo único que faltaba: el veredicto por tramo ya se calculaba y se tiraba.
 */
export interface Pedido {
  evaluadas: number;
  dentro: number;
  fuera_lento: number;
  fuera_rapido: number;
  /**
   * El porcentaje en banda, TAL COMO LO SACA `summarizeRunCompliance`. Se
   * servía sin él y el cliente tenía que dividir: la misma división en dos
   * sitios, y el redondeo del cliente decidiendo si la cifra se pinta verde.
   * Null cuando no hay nada evaluable — nunca un 0 %.
   */
  pct_en_banda: number | null;
  /**
   * ¿Se puede JUZGAR ese porcentaje, o solo enseñarlo? Con pocas repeticiones
   * la cifra existe pero no concluye, y entonces sale en tinta normal en vez de
   * con color. El juicio es el color, así que quien decide el color no puede
   * ser el cliente con un umbral copiado.
   */
  juzgable: boolean;
}

export interface PuntoCansado {
  semana: string;
  coste_s_km: number;
  parejas: number;
}

export interface CarreraObjetivo {
  nombre: string;
  dias: number;
  /** Sin base previa no se inventa un tiempo. Nulo = no se pinta cifra. */
  predicho_s: number | null;
}

/**
 * EL VO₂MÁX ENTRA AQUÍ, Y NO EN PERFIL.
 *
 * En Perfil van las cosas que te DESCRIBEN; el VO₂máx contesta «¿estoy
 * mejorando?», que es esta pantalla. Va de titular de la prueba de forma, con
 * el ritmo al mismo pulso de gráfico debajo: el número que el atleta ya
 * reconoce de su reloj, sostenido por la señal que nosotros sí medimos en vez
 * de estimar.
 *
 * Y NO entran ni el pulso en reposo ni la variabilidad: son señales de
 * RECUPERACIÓN, no de forma corriendo.
 */
export interface Vo2Lectura {
  valor: number;
  /**
   * Contra la base de la propia serie. Positivo = ha subido.
   *
   * NULO, no cero, cuando la serie todavía no da para una base: un cero dice
   * «medimos y no se movió», y eso es justo lo que no sabemos. Es el mismo
   * error que un porcentaje sin muestras.
   */
  delta: number | null;
  /** Lo que abarca la serie DE VERDAD, no una ventana prometida. */
  ventana_semanas: number;
  serie: number[];
}

/**
 * EL UMBRAL DE RITMO Y SU VDOT — el número del que salen las zonas.
 *
 * OJO, SON DOS ANCLAS DISTINTAS Y NO SE MEZCLAN. Ésta es la de RITMO
 * (`athlete_zone_profiles`, modalidad run): segundos por kilómetro, la que
 * ordena las zonas de ritmo y de la que cuelga el plan. `zonas_medidas`, más
 * abajo, es la de PULSO (`resolveThresholdHr`) y gobierna otras lecturas. Un
 * atleta puede tener una y no la otra, y confundirlas sería apagarle una
 * lectura por un test que no era el que le faltaba.
 */
export interface UmbralRitmo {
  /** Segundos por kilómetro. */
  ritmo_s_km: number | null;
  /** El VDOT de Daniels, del selector único de marcas — no del último 5k suelto. */
  vdot: number | null;
  /** De qué marca salió el VDOT, ya rotulado. Null si no hay marca. */
  vdot_desde: string | null;
  /** `coach_test` | `athlete_test` | `onboarding_auto`. */
  origen: string | null;
  /** Derivado en el alta y sin confirmar: real, pero sin revisar. */
  sin_revisar: boolean;
}

/** Una banda de ritmo del atleta. Bordes absolutos: `fast_s` menor = más rápido. */
export interface ZonaRitmo {
  code: string;
  label: string;
  color: string;
  /** El papel fisiológico de la banda (`recovery`, `aerobic_base`, `threshold`…).
   *  Viaja en el perfil guardado, así que se declara en vez de dejarlo colarse
   *  por un cast: un campo que existe y el tipo niega es un campo que alguien
   *  borra por «no se usa». */
  role?: string;
  fast_s: number | null;
  /** Nulo = banda abierta por el lado lento (la Z1 no tiene techo). */
  slow_s: number | null;
  sort_order: number;
}

/** La media real de un tipo de sesión. Es la EVIDENCIA del tercer peldaño: sin
 *  ella, ese peldaño se apoyaba en un número que la pantalla no podía dibujar. */
export interface TipoMedia {
  tipo: string;
  ritmo_s_km: number;
  metros: number;
  sesiones: number;
}

export interface RunningHistory {
  /** Semanas de historial del atleta con nosotros. */
  semanas: number;
  /**
   * Tiene un ancla de umbral que vale como evidencia (medida o declarada por
   * él). Un umbral deducido de su fecha de nacimiento NO cuenta: la propia
   * escalera de `methodology/hr-zones.ts` dice que una estimación nuestra no
   * puede puntuar como evidencia.
   */
  zonas_medidas: boolean;
  con_pulso: boolean;
  /** El pulso de referencia de `al_pulso`. 0 cuando no hay ancla. */
  ppm_referencia: number;
  /** Declarada, no deducida: de ella sale el color de la serie, y el color es dato. */
  zona_referencia: number | null;
  vo2: Vo2Lectura | null;
  /** Ritmo (s/km) al pulso de referencia, semana a semana. */
  al_pulso: PuntoSemana[];
  esfuerzos: Esfuerzo[];
  /** La sombra: los mismos esfuerzos en la ventana anterior. Vacío = aún no hay contra qué. */
  esfuerzos_antes: Esfuerzo[];
  semanas_km: PuntoSemana[];
  zonas_s: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  segundos_corriendo: number;
  pedido: Pedido | null;
  cansado: PuntoCansado[];
  carrera: CarreraObjetivo | null;
  /** El tercer peldaño: el mismo tipo de sesión, comparado consigo mismo. */
  mismo_tipo: { tipo: string; gana_s_km: number } | null;

  // ── El veredicto es la PUERTA a los datos, no su sustituto ─────────────────
  // Estas cuatro no alimentan el veredicto: son la densidad que crece según se
  // baja por la pantalla. Vienen de la pestaña anterior, que servía quince
  // lecturas donde ésta enseñaba siete.

  /** El umbral de RITMO y su VDOT. Null = no tiene perfil de zonas de carrera. */
  umbral: UmbralRitmo | null;
  /** Sus bandas de ritmo. Cuelgan del umbral: vacías si no hay perfil. */
  zonas_ritmo: ZonaRitmo[];
  /** Cadencia media (pasos/min) por semana — la única lectura de técnica. */
  cadencia: PuntoSemana[];
  /** Medias reales por tipo de sesión, de más a menos kilómetros. */
  por_tipo: TipoMedia[];
}

// ---------------------------------------------------------------------------
// LA ESCALERA DE EVIDENCIA — de qué sale el veredicto
// ---------------------------------------------------------------------------

/**
 * El veredicto usa la MEJOR señal que el atleta tenga hoy, no una sola:
 *
 *  1. Ritmo al mismo pulso — la única que aísla la forma del esfuerzo.
 *  2. Mejores esfuerzos contra la sombra — menos limpia, hecho duro.
 *  3. Ritmo medio del mismo tipo de sesión — degradada, pero honesta.
 *
 * Sin ninguna no se improvisa un cuarto: se dice que aún no.
 */
export type Peldano =
  | { en: 'al-pulso'; gana_s_km: number; semanas: number }
  | { en: 'esfuerzos'; gana_s: number; metros: number }
  | { en: 'mismo-tipo'; gana_s_km: number; semanas: number };

export type ClaseVeredicto = 'mejor' | 'igual' | 'cargando' | 'peor' | 'aun-no';

export interface Veredicto {
  clase: ClaseVeredicto;
  /** Dos o tres palabras. Lo que antes lo explicaba debajo se dibuja o no está. */
  frase: string;
  peldano: Peldano | null;
  /** Solo en «aún no»: el plazo, para dibujarlo como barra que se llena. */
  plazo: { llevas: number; hacen: number } | null;
}

/** Cuánto ha ganado una serie de ritmos: el primero menos el último, porque en
 *  ritmo bajar es mejorar. Positivo = ha mejorado. */
function ganancia(serie: readonly PuntoSemana[]): number {
  if (serie.length < 2) return 0;
  return serie[0]!.valor - serie[serie.length - 1]!.valor;
}

/**
 * Subida del volumen: últimas dos semanas contra la media de las cuatro
 * primeras. Sola no juzga nada — subir kilómetros no es bueno ni malo. Solo
 * entra en el veredicto CRUZADA con que el motor esté respondiendo peor.
 */
export function subidaDeVolumen(semanas: readonly PuntoSemana[]): number {
  if (semanas.length < 4) return 0;
  const base = semanas.slice(0, 4).reduce((a, s) => a + s.valor, 0) / 4;
  if (base <= 0) return 0;
  const ultimas = semanas.slice(-2).reduce((a, s) => a + s.valor, 0) / Math.min(2, semanas.length);
  return ultimas / base - 1;
}

/** El peldaño más alto que el atleta puede sostener hoy. Null = ninguno. */
export function peldanoDisponible(h: RunningHistory): Peldano | null {
  if (h.con_pulso && h.zonas_medidas && h.al_pulso.length >= 3) {
    // N puntos semanales abarcan N-1 semanas: el primero es el origen, no un salto.
    return { en: 'al-pulso', gana_s_km: ganancia(h.al_pulso), semanas: h.al_pulso.length - 1 };
  }
  // La distancia MÁS LARGA que existe en las dos ventanas: cuanto más larga, menos
  // la mueve un día bueno, así que es la comparación más estable de las que hay.
  const comunes = h.esfuerzos
    .filter((e) => h.esfuerzos_antes.some((a) => a.metros === e.metros))
    .sort((a, b) => b.metros - a.metros);
  const hoy = comunes[0];
  if (hoy) {
    const antes = h.esfuerzos_antes.find((a) => a.metros === hoy.metros)!;
    return { en: 'esfuerzos', gana_s: antes.segundos - hoy.segundos, metros: hoy.metros };
  }
  if (h.mismo_tipo) {
    return {
      en: 'mismo-tipo',
      gana_s_km: h.mismo_tipo.gana_s_km,
      semanas: Math.max(1, h.semanas_km.length - 1),
    };
  }
  return null;
}

// ── El TERCER peldaño ────────────────────────────────────────────────────────
//
// El más flojo de los tres, y el que salva al atleta que no tiene ninguno de
// los otros dos: sin banda de pulso no hay «al mismo pulso», y sin un mes
// previo con las mismas distancias no hay sombra contra la que comparar
// esfuerzos. Ése se quedaría en «aún no» para siempre aunque llevara medio año
// entrenando, que es exactamente el fallo que la escalera existe para evitar.
//
// COMPARA UN TIPO DE SESIÓN CONSIGO MISMO, nunca dos tipos entre sí. El ritmo
// medio de «todo lo que corrió» sube y baja según cuántas series tocaran esa
// semana, así que mediría el calendario, no la forma. Dentro de un mismo tipo
// —sus rodajes contra sus rodajes— el sesgo desaparece.

/** Un tramo de trabajo con el tipo de sesión al que pertenecía. */
export interface TipoObservacion {
  /** El formato de la sesión (`steady`, `intervals`, `sets`…). */
  tipo: string;
  /** Lunes de la semana en ISO. */
  semana: string;
  pace_s_per_km: number;
  distance_m: number;
  /** La ejecución de la que salió, para contar sesiones sin repetirlas. */
  sesion_id?: string;
}

/**
 * Tramos mínimos en CADA mitad de la ventana para que la comparación signifique
 * algo. Con dos, un día de viento decide el veredicto del atleta. Mecanismo, no
 * método: es cuándo una media deja de ser una anécdota, la misma clase de
 * decisión que `MIN_LEGS_FOR_PACING_SHAPE`.
 */
export const MIN_TRAMOS_POR_MITAD = 3;

/**
 * El tipo de sesión más frecuente comparado consigo mismo: su ritmo medio en la
 * primera mitad de la ventana contra la segunda. Positivo = ha mejorado.
 *
 * Null cuando ningún tipo llega al mínimo en las dos mitades — no se baja el
 * listón para poder decir algo.
 */
export function mismoTipoDe(
  observaciones: readonly TipoObservacion[],
): { tipo: string; gana_s_km: number } | null {
  const usables = observaciones.filter(
    (o) =>
      o.tipo != null &&
      o.tipo !== '' &&
      Number.isFinite(o.pace_s_per_km) &&
      o.pace_s_per_km > 0 &&
      Number.isFinite(o.distance_m) &&
      o.distance_m > 0,
  );
  if (usables.length === 0) return null;

  // El corte va por SEMANAS distintas, no por número de tramos: partir por la
  // mitad de las filas dejaría las dos mitades en la misma semana si una sesión
  // trajo veinte series.
  const semanas = [...new Set(usables.map((o) => o.semana))].sort((a, b) => a.localeCompare(b));
  if (semanas.length < 2) return null;
  const corte = semanas[Math.floor(semanas.length / 2)]!;

  let mejor: { tipo: string; gana_s_km: number; n: number } | null = null;

  for (const tipo of new Set(usables.map((o) => o.tipo))) {
    const delTipo = usables.filter((o) => o.tipo === tipo);
    const antes = delTipo.filter((o) => o.semana < corte);
    const ahora = delTipo.filter((o) => o.semana >= corte);
    if (antes.length < MIN_TRAMOS_POR_MITAD || ahora.length < MIN_TRAMOS_POR_MITAD) continue;

    // Ponderado por distancia, por lo mismo que en `same-hr-pace.ts`: un tramo
    // de 5 km describe mejor el estado que uno de 400 m, y contarlos igual deja
    // que una sesión troceada mande sobre la media.
    const medio = (xs: TipoObservacion[]) =>
      xs.reduce((a, o) => a + o.pace_s_per_km * o.distance_m, 0) /
      xs.reduce((a, o) => a + o.distance_m, 0);

    const gana = medio(antes) - medio(ahora);
    if (!Number.isFinite(gana)) continue;

    const n = delTipo.length;
    // El tipo con más evidencia manda; los empates los rompe el nombre para que
    // dos lecturas seguidas de los mismos datos no den tipos distintos.
    if (mejor == null || n > mejor.n || (n === mejor.n && tipo < mejor.tipo)) {
      mejor = { tipo, gana_s_km: Math.round(gana * 10) / 10, n };
    }
  }

  return mejor ? { tipo: mejor.tipo, gana_s_km: mejor.gana_s_km } : null;
}

/**
 * La media de cada tipo de sesión, ponderada por distancia y ordenada de más a
 * menos kilómetros.
 *
 * COME EXACTAMENTE LAS MISMAS OBSERVACIONES QUE `mismoTipoDe`, y eso es lo que
 * la hace la evidencia del tercer peldaño en vez de una tarjeta que va por su
 * cuenta: si el veredicto dice «tus continuos van 4 s/km mejor», la fila de
 * continuos de aquí es de dónde salió ese número. Alimentarlas por separado —
 * una del `scheme` prescrito y otra del contexto ejecutado— habría dejado un
 * peldaño apoyado en un tipo que la lista de abajo ni menciona.
 */
export function mediasPorTipo(observaciones: readonly TipoObservacion[]): TipoMedia[] {
  const por = new Map<string, { metros: number; ponderado: number; sesiones: Set<string> }>();
  for (const o of observaciones) {
    if (!o.tipo) continue;
    if (!Number.isFinite(o.pace_s_per_km) || o.pace_s_per_km <= 0) continue;
    if (!Number.isFinite(o.distance_m) || o.distance_m <= 0) continue;
    const e = por.get(o.tipo) ?? { metros: 0, ponderado: 0, sesiones: new Set<string>() };
    e.metros += o.distance_m;
    e.ponderado += o.pace_s_per_km * o.distance_m;
    if (o.sesion_id) e.sesiones.add(o.sesion_id);
    por.set(o.tipo, e);
  }
  return [...por.entries()]
    .filter(([, e]) => e.metros > 0)
    .map(([tipo, e]) => ({
      tipo,
      ritmo_s_km: Math.round(e.ponderado / e.metros),
      metros: Math.round(e.metros),
      sesiones: e.sesiones.size,
    }))
    .sort((a, b) => b.metros - a.metros || a.tipo.localeCompare(b.tipo));
}

export function veredictoDe(h: RunningHistory, m: CoachRunningThresholds): Veredicto {
  const peldano = peldanoDisponible(h);

  // DOS MOTIVOS DISTINTOS PARA EL MISMO «AÚN NO», y solo UNO tiene plazo.
  //
  // Le falta TIEMPO → el plazo se dibuja como una barra que se llena, porque
  // esperar de verdad lo arregla. Le falta EVIDENCIA (ninguno de los tres
  // peldaños se sostiene) → NO hay plazo, porque esperar no lo arregla: lo
  // arregla hacerse el test o ponerse la banda, y eso ya lo dice la cobertura.
  //
  // Los cuatro atletas de la maqueta no separaban los dos casos (el recién
  // llegado no tiene ni tiempo ni evidencia, así que coincidían). Un atleta
  // real con diez semanas y sin ancla los separó: salía «llevas 10 de 6», una
  // barra más que llena, diciéndole que esperara cuando lo que necesitaba era
  // el test. Culpar al atleta de lo que le falta al dato es la peor forma de
  // fallar que tiene esta pantalla.
  const faltaTiempo = h.semanas < m.min_weeks_to_judge;
  if (!peldano || faltaTiempo) {
    return {
      clase: 'aun-no',
      frase: '',
      peldano,
      plazo: faltaTiempo ? { llevas: h.semanas, hacen: m.min_weeks_to_judge } : null,
    };
  }

  const gana = peldano.en === 'esfuerzos' ? peldano.gana_s : peldano.gana_s_km;
  const subida = subidaDeVolumen(h.semanas_km);

  if (gana >= m.meaningful_gain_s_per_km) {
    return { clase: 'mejor', frase: '', peldano, plazo: null };
  }

  // EL INCÓMODO. Volumen subiendo y motor respondiendo peor es la firma clásica
  // de estar metiendo más de lo que se asimila. La DETECCIÓN es mecanismo; los
  // dos umbrales que la disparan son método.
  if (gana <= -m.meaningful_gain_s_per_km && subida >= m.volume_surge_ratio) {
    return { clase: 'cargando', frase: '', peldano, plazo: null };
  }
  if (gana <= -m.meaningful_gain_s_per_km) {
    return { clase: 'peor', frase: '', peldano, plazo: null };
  }

  return { clase: 'igual', frase: '', peldano, plazo: null };
}

// ---------------------------------------------------------------------------
// LAS CIFRAS DE DEBAJO — las que la pantalla dibuja bajo cada titular
// ---------------------------------------------------------------------------
//
// POR QUÉ ESTÁN AQUÍ Y NO EN EL CLIENTE. Son restas y divisiones triviales, y
// justo por eso es tentador hacerlas al dibujar. Pero DOS de ellas deciden algo
// —la subida de volumen es el segundo ingrediente de «cargando de más», y el
// porcentaje en banda decide si la cifra sale verde o ámbar—, así que
// recalcularlas del otro lado es tener dos motores para el número que sostiene
// un veredicto. El día que uno cambie, el atleta leería una cifra y el servidor
// habría juzgado con otra, contradiciéndose EN LA MISMA PANTALLA.
//
// Las otras se traen por la misma puerta aunque hoy no decidan nada: si media
// pantalla llega calculada y la otra media se calcula al dibujar, la siguiente
// cifra se añade donde toque por accidente, no por criterio.

/** Cuántos puntos semanales hacen falta para que la subida de volumen se
 *  dibuje. Por debajo, «la media de las cuatro primeras» describe casi las
 *  mismas semanas que «las dos últimas» y el porcentaje se compara consigo
 *  mismo. Mecanismo: es cuándo una resta significa algo, no una opinión. */
export const MIN_SEMANAS_PARA_SUBIDA = 6;

/** La distancia a la que se lee el avance de la curva de esfuerzos: la misma
 *  que titula el bloque, para que cifra y delta hablen del mismo esfuerzo. */
export const METROS_DE_REFERENCIA = 5000;

export interface Deltas {
  /**
   * Bajo los kilómetros. RATIO, no porcentaje (0,24 = +24 %) — mismas unidades
   * que `volume_surge_ratio`, con el que se compara; servir aquí un 24 y allí
   * un 0,2 es cómo se cuelan los errores de factor 100. El cliente multiplica
   * para escribirlo.
   *
   * NO JUZGA: subir kilómetros no es bueno ni malo por sí mismo, así que se
   * dibuja en neutro. De cruzarlo con el ritmo ya se encarga el veredicto.
   */
  volumen: { subida_ratio: number; semanas: number } | null;
  /** Bajo el titular de forma, SÓLO cuando no hay VO₂máx que lo titule (si lo
   *  hay, el delta es el suyo). Positivo = ha mejorado. */
  forma: { gana_s_km: number; semanas: number } | null;
  /** La curva contra su sombra, a `METROS_DE_REFERENCIA`. Positivo = mejor. */
  esfuerzos: { gana_s: number; metros: number } | null;
  /** Cuánto ha bajado el coste de correr cansado. Positivo = mejorando. */
  cansado: { mejora_s_km: number; semanas: number } | null;
}

/**
 * Todas las cifras de debajo, de una vez. Puro: las mismas entradas dan las
 * mismas cifras en el servidor, en el doble de diseño y en el test.
 *
 * No recibe el método porque ninguna de las cuatro tiene umbral que consultar:
 * el único juicio de este bloque (si el % en banda se puede colorear) viaja
 * dentro de `Pedido.juzgable`, resuelto donde se resuelve el resto del pedido.
 */
export function deltasDe(h: RunningHistory): Deltas {
  const alPulso = h.al_pulso;
  const cansado = h.cansado;

  const hoy5k = h.esfuerzos.find((e) => e.metros === METROS_DE_REFERENCIA);
  const antes5k = h.esfuerzos_antes.find((e) => e.metros === METROS_DE_REFERENCIA);

  return {
    volumen:
      h.semanas_km.length >= MIN_SEMANAS_PARA_SUBIDA
        ? { subida_ratio: subidaDeVolumen(h.semanas_km), semanas: h.semanas_km.length - 1 }
        : null,
    // Con VO₂máx el titular es él y lleva su propio delta: éste sobra y sale
    // nulo, en vez de mandar dos deltas para el mismo titular.
    forma:
      h.vo2 == null && alPulso.length >= 2
        ? { gana_s_km: ganancia(alPulso), semanas: alPulso.length - 1 }
        : null,
    esfuerzos:
      hoy5k && antes5k
        ? { gana_s: antes5k.segundos - hoy5k.segundos, metros: METROS_DE_REFERENCIA }
        : null,
    cansado:
      cansado.length >= 2
        ? {
            mejora_s_km:
              Math.round((cansado[0]!.coste_s_km - cansado[cansado.length - 1]!.coste_s_km) * 10) / 10,
            semanas: cansado.length - 1,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// La cobertura de cada lectura
// ---------------------------------------------------------------------------

export interface Cobertura {
  forma: Falta | null;
  esfuerzos: Falta | null;
  volumen: Falta | null;
  reparto: Falta | null;
  pedido: Falta | null;
  cansado: Falta | null;
}

/** El orden en que la pantalla las recorre — aquí para que servidor y pantalla
 *  no puedan discrepar sobre cuál es «la primera falta». */
export const ORDEN_COBERTURA: readonly (keyof Cobertura)[] = [
  'forma',
  'esfuerzos',
  'volumen',
  'reparto',
  'pedido',
  'cansado',
];

export function coberturaDe(h: RunningHistory, m: CoachRunningThresholds): Cobertura {
  const historia: Falta = { por: 'historia', llevas: h.semanas, hacen: m.min_weeks_to_judge };

  return {
    // El sensor primero: pedirle el test cuando lo que le falta es la cinta del
    // pecho sería mandarle al sitio equivocado.
    forma: !h.con_pulso
      ? { por: 'sensor' }
      : !h.zonas_medidas
        ? { por: 'ancla' }
        : h.al_pulso.length < 3
          ? historia
          : null,
    esfuerzos: h.esfuerzos.length === 0 ? historia : null,
    volumen: h.semanas_km.length === 0 ? historia : null,
    reparto: !h.zonas_medidas ? { por: 'ancla' } : h.segundos_corriendo <= 0 ? historia : null,
    pedido: h.pedido == null ? { por: 'intencion' } : null,
    cansado:
      h.cansado.length === 0
        ? { por: 'ocasion' }
        : h.cansado.reduce((a, c) => Math.max(a, c.parejas), 0) < m.min_pairs_for_compromised_trend
          ? historia
          : null,
  };
}

/** Con pocas repeticiones el porcentaje existe pero no se puede juzgar: se
 *  enseña la cifra y se le retira el color, que es lo que juzga. */
export function sePuedeJuzgarElPedido(p: Pedido, m: CoachRunningThresholds): boolean {
  return p.evaluadas >= m.min_reps_to_judge_band;
}

/**
 * El colapso a tres cubos. Sale de los MISMOS segmentos que dibuja la barra,
 * para que texto y dibujo no puedan discrepar.
 *
 * Nota: el plegado de cinco zonas a tres bandas ya existe y es del coach
 * (`collapseToPolarization`, `shared/domain/coach/hr-method.ts`). Esto opera
 * sobre porcentajes ya repartidos, que es lo que la barra tiene en la mano.
 */
export function colapso(
  segmentos: readonly { zona: number | null; pct: number }[],
  low_max_zone: number,
  mid_max_zone: number,
) {
  const suma = (test: (z: number) => boolean) =>
    segmentos.filter((s) => s.zona != null && test(s.zona)).reduce((a, s) => a + s.pct, 0);
  return {
    suave: suma((z) => z <= low_max_zone),
    medio: suma((z) => z > low_max_zone && z <= mid_max_zone),
    fuerte: suma((z) => z > mid_max_zone),
  };
}
