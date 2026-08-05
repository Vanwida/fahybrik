// (10) EL RELOJ DE PARED — los cuatro formatos que corta el crono cuando no hay
// ni GPS ni máquina, y que al reordenar las superficies se quedaron sin pantalla.
//
// ── EL HUECO, DICHO SIN ADORNOS ────────────────────────────────────────────
// `ActiveWorkoutView.swift` los rutea a los CUATRO al mismo sitio:
//
//     case .tabata, .intervals, .deathBy, .steady: ForTimeLiveHUD(session:)
//
// …con un comentario que reconoce el hueco en voz alta: «Para eso NO hay pantalla
// diseñada, así que se usa el suelo honesto que ya existe —el reloj del bloque con
// el movimiento y su dosis— en vez de inventar una: dice menos, pero no dice nada
// falso». Ese suelo enseña el crono del BLOQUE. Lo que no enseña es lo único que
// gobierna estos cuatro formatos: **la ventana de trabajo/descanso.**
//
// Y no se arregla con un `if` dentro del EMOM: `EmomVivoView` lee el plan del EMOM
// y su `emomPhaseRemaining`, así que enchufar ahí una tabata pintaría una cuenta
// atrás muerta. De ahí esta pantalla.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo, y se acaba ahí. No hay GPS que valga (estás en el sitio) y no hay
// máquina que emparejar (son burpees, planchas, un trineo). O sea: **el reloj lo
// sabe TODO de estos cuatro formatos, porque todo lo que hay que saber es qué
// hora es.** Es la familia donde la muñeca sola basta — sin móvil delante.
//
// El precio de eso está en el apartado (10) de `datos-reloj.ts`: ninguno de los
// cuatro se ha ejecutado nunca en funcional, así que los dos casos REALES van sin
// pulso (no hay ejecución que reproducir) y los dos que no existen le piden
// prestado el suyo al único trabajo funcional a pulso de toda la base.
//
// ── LA TESIS: UNA FAMILIA, CUATRO SUJETOS ──────────────────────────────────
// Lo compartido es el mecanismo (el reloj de pared corta y nadie mide el trabajo).
// Lo que NO se comparte es la pregunta, y como el sujeto sale de la pregunta,
// salen cuatro sujetos distintos del mismo lienzo:
//
//   formato      │ la pregunta que hace el atleta   │ el sujeto        │ el aro
//   ─────────────┼──────────────────────────────────┼──────────────────┼───────────
//   `intervals`  │ ¿cuánto le queda a ESTE y         │ cuenta atrás     │ segmentado
//                │  cuántos me faltan?              │ del tramo        │ (uno por serie)
//   `tabata`     │ ¿trabajo o paro?                 │ LA RONDA         │ segmentado (8)
//   `death_by`   │ ¿cuántas me tocan este minuto?   │ LAS REPETICIONES │ continuo
//   `steady`     │ ¿cuánto queda?                   │ cuenta atrás     │ continuo
//
// Meterlos a los cuatro en la misma pantalla con el mismo sujeto es exactamente
// el error que el suelo de hoy comete: sale un crono para todo y ninguno de los
// cuatro contesta lo suyo.

import {
  NOTA,
  countdown,
  paginaPulso,
  tonoUrgente,
  type Ancla,
  type Modo,
  type PaginaReloj,
} from '../../kit-watch';
import {
  DEATH_BY,
  INTERVALOS_CORE,
  INTERVALOS_ESTACION,
  SIN_ANCLA,
  STEADY_FUNCIONAL,
  TABATA,
  rampa,
  type ObjetivoPared,
  type PulsoCaso,
} from '../../datos-reloj';

// ---------------------------------------------------------------------------
// El caso — cuatro formas, no una con banderas
// ---------------------------------------------------------------------------

/**
 * Unión discriminada y no un objeto con campos anulables: el `arranque` de un
 * death by no es «un campo que a veces está», es que un death by y una tabata
 * son formatos distintos. Así `paginas()` es un `switch` sobre el formato —la
 * tesis de la pantalla, literal— y nadie puede pintar el incremento de algo que
 * no lo tiene.
 */
interface Base {
  procedencia: string;
  /** Cómo se lo dice el coach al atleta. Sólo lo pintan dos de los cuatro. */
  movimiento: string;
  /** La ronda en la que arranca la reproducción — la puesta en escena, no un hecho. */
  rondaActual: number;
  /** El rango de FC medido y sobre cuánto se reparte. `null` = no se midió. */
  pulso: PulsoCaso | null;
}

export interface CasoIntervals extends Base {
  formato: 'intervals';
  rondas: number;
  trabajoS: number;
  descansoS: number;
  /** Lo que el coach escribió para gobernar el esfuerzo. `null` = no escribió nada. */
  objetivo: ObjetivoPared | null;
}

export interface CasoTabata extends Base {
  formato: 'tabata';
  rondas: number;
  trabajoS: number;
  descansoS: number;
}

export interface CasoDeathBy extends Base {
  formato: 'death_by';
  minutoS: number;
  /** Repeticiones de la ronda 1 y lo que sube cada ronda (`start` / `increment`). */
  arranque: number;
  incremento: number;
}

export interface CasoSteady extends Base {
  formato: 'steady';
  ventanaS: number;
}

export type CasoPared = CasoIntervals | CasoTabata | CasoDeathBy | CasoSteady;

export const PLANCHA: CasoIntervals = { formato: 'intervals', ...INTERVALOS_CORE };
export const TRINEO: CasoIntervals = { formato: 'intervals', ...INTERVALOS_ESTACION };
export const TABATA_BURPEES: CasoTabata = { formato: 'tabata', ...TABATA };
export const DEATH_BY_BURPEES: CasoDeathBy = { formato: 'death_by', ...DEATH_BY };
export const MOVILIDAD: CasoSteady = { formato: 'steady', ...STEADY_FUNCIONAL };

// ---------------------------------------------------------------------------
// El estado
// ---------------------------------------------------------------------------

export type Fase = 'trabajo' | 'parada';

export interface Estado {
  caso: CasoPared;
  ancla: Ancla;
  /**
   * La ronda / serie / minuto en curso, desde 1. La avanza EL RELOJ DE PARED,
   * nunca el atleta: es lo que define a los cuatro formatos.
   */
  ronda: number;
  /** Segundos dentro del ciclo de la ronda, de 0 a `cicloDe`. */
  t: number;
  /** Death By: el atleta ha declarado que no llegó, y el bloque se acaba ahí. */
  fallado: boolean;
}

export interface Gestos {
  /**
   * Death By: declarar que no llegaste a las repeticiones del minuto. Es el
   * ÚNICO gesto de toda la familia — ver `accionDe` para el porqué.
   */
  rendirse: () => void;
}

/** Lo que dura el trabajo de una ronda. En `steady` es la ventana entera. */
export function trabajoDe(c: CasoPared): number {
  switch (c.formato) {
    case 'intervals':
    case 'tabata':
      return c.trabajoS;
    case 'death_by':
      return c.minutoS;
    case 'steady':
      return c.ventanaS;
  }
}

/**
 * EL CICLO: trabajo + descanso. Es lo que el aro recorre de un tirón, y no se
 * reinicia porque tú pares — el mismo hallazgo del EMOM, que aquí vale para los
 * cuatro. `death_by` y `steady` no tienen descanso: su ciclo ES su trabajo.
 */
export function cicloDe(c: CasoPared): number {
  switch (c.formato) {
    case 'intervals':
    case 'tabata':
      return c.trabajoS + c.descansoS;
    default:
      return trabajoDe(c);
  }
}

/** Cuántas rondas hay. `null` en `death_by`: la ronda 12 existe si llegas. */
export function rondasDe(c: CasoPared): number | null {
  switch (c.formato) {
    case 'intervals':
    case 'tabata':
      return c.rondas;
    default:
      return null;
  }
}

export function faseDe(e: Estado): Fase {
  return e.t < trabajoDe(e.caso) ? 'trabajo' : 'parada';
}

/** Lo que queda del tramo en el que estás. La ventana entera la lleva el aro. */
export function quedaDe(e: Estado): number {
  const fin = faseDe(e) === 'trabajo' ? trabajoDe(e.caso) : cicloDe(e.caso);
  return Math.max(0, fin - e.t);
}

/** Segundos desde que empezó el bloque — la base de la curva de FC. */
export function transcurridoDe(e: Estado): number {
  return (e.ronda - 1) * cicloDe(e.caso) + e.t;
}

/**
 * LAS REPETICIONES DE ESTE MINUTO, que son el death by entero:
 * `start + increment × rondas hechas` (`WorkoutSession.deathByTarget`).
 */
export function repsDelMinuto(c: CasoDeathBy, ronda: number): number {
  return c.arranque + c.incremento * (ronda - 1);
}

/**
 * La FC. Sube A LO LARGO DEL BLOQUE y no en diente de sierra por ronda: en una
 * tabata y en un death by el pulso no baja en 10 s ni en el minuto que te sobra,
 * sube hasta el techo y se queda. El diente de sierra del EMOM tenía su razón
 * (45 s de trabajo y 15 de parada de VERDAD, con la máquina soltada); aquí no
 * hay parada que valga.
 *
 * `null` cuando el caso no tiene pulso medido, y entonces esta vista se queda en
 * UNA página — que es exactamente lo que hay que enseñar.
 */
export function bpmDe(e: Estado): number | null {
  const p = e.caso.pulso;
  if (p == null) return null;
  return rampa(p.desde, p.hasta, transcurridoDe(e), p.sobreS);
}

// ---------------------------------------------------------------------------
// El modo — lo que el cuerpo puede hacer, que manda sobre el formato
// ---------------------------------------------------------------------------

/**
 * Trabajando, los cuatro son `ciego`: en los casos reales la muñeca está
 * OCUPADA (la que apoya en la plancha lateral, las dos en el trineo, las dos en
 * el suelo en un burpee). Un reloj que en ese momento pide algo está mal
 * diseñado por definición.
 *
 * `steady` es la excepción: una movilidad de cadera se hace mirando al frente y
 * con las manos libres, así que es `ojeada` — miras, y no hay nada que tocar.
 *
 * En la parada de un intervalo o de una tabata también es `ojeada` y NO `mando`,
 * y esa distinción es la que aquí importa: `mando` es «aquí van la decisión y
 * los controles», y en estos dos no hay ninguna decisión que tomar — el reloj
 * arranca la ronda siguiente él solo, y adelantarla rompería el on/off que
 * escribió el coach. Y en `ojeada` el lienzo no anuncia controles, así que esos
 * 15 pt vuelven al numeral.
 */
export function modoDe(e: Estado): Modo {
  if (e.caso.formato === 'steady') return 'ojeada';
  // Declarado el fallo, el bloque se acabó: estás de pie mirando lo que hiciste.
  if (e.caso.formato === 'death_by') return e.fallado ? 'mando' : 'ciego';
  return faseDe(e) === 'parada' ? 'ojeada' : 'ciego';
}

// ---------------------------------------------------------------------------
// Las cuatro páginas — una por pregunta
// ---------------------------------------------------------------------------

/**
 * (a) `intervals` — N repeticiones de trabajo/descanso CON LA MISMA DOSIS.
 *
 * El sujeto es la cuenta atrás del tramo en el que estás, y el aro segmentado
 * contesta lo otro («cuántos me faltan») sin gastar una línea de texto.
 *
 * DOS DECISIONES QUE LO SEPARAN DEL EMOM, y las dos salen de que aquí la dosis
 * NO ROTA:
 *
 *  1. **El segundo nivel no es el movimiento, es el OBJETIVO.** El EMOM tiene
 *     que decirte la tarea porque cambia de ronda a ronda; un intervalo hace lo
 *     mismo cuatro veces y ya te lo sabes desde la primera (el mismo motivo por
 *     el que el AMRAP dejó su tarea en el móvil). Lo que sí distingue a un
 *     intervalo de otro es contra qué lo empujas, y eso es lo único que el coach
 *     escribió aparte de los tiempos: en el bloque 402, `RPE 9`. En el 79 no
 *     escribió nada, así que no hay segundo nivel y el numeral crece — el §6.3
 *     en su forma más literal.
 *  2. **En la parada no se dice qué viene.** El EMOM escribe «Luego · Bici»
 *     porque viene otra cosa; aquí viene LO MISMO, y decirlo es ruido. La cuenta
 *     atrás del descanso se queda la pantalla entera, que es lo que miras.
 *
 * Y ninguna acción, nunca: con `work_s` escrito el motor rueda la fase solo
 * (`WorkoutSession.rollRotatingPhase`). El intervalo que SÍ cierra el atleta es
 * el de distancia, y ése no cae aquí — se lo lleva la vista de series.
 */
function paginaIntervals(e: Estado, c: CasoIntervals): PaginaReloj {
  const queda = quedaDe(e);
  const parado = faseDe(e) === 'parada';
  const ultima = e.ronda >= c.rondas;
  // Sólo TRABAJANDO: en la parada no hay esfuerzo contra el que medirse. Y va
  // con su nota, porque no lo mide nadie —lo escribió el coach y lo pones tú—;
  // la cuenta atrás sí es del reloj y no necesita decir de dónde viene.
  const objetivo = parado ? null : c.objetivo;
  return {
    id: 'intervalo',
    // «Para» y no «Descanso», igual que el EMOM y que el móvil: el atleta no
    // puede aprender dos vocabularios para lo mismo.
    contexto: parado
      ? ultima
        ? 'Para · se acabó'
        : `Para · viene la ${e.ronda + 1}`
      : `${c.movimiento} · ${e.ronda} / ${c.rondas}`,
    modo: modoDe(e),
    sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
    ...(objetivo ? { segundo: { ...objetivo }, nota: NOTA.loDicesTu } : {}),
  };
}

/**
 * (b) `tabata` — 20/10 × 8. Y NO es un intervalo rápido: es otro sujeto.
 *
 * EL RAZONAMIENTO, que es el que pedía pensarse de verdad: en ventanas de 20 y
 * de 10 segundos **la cifra no se puede usar para nada.** No hay ninguna
 * decisión que tomes distinta sabiendo que te quedan 14 en vez de 12; y en los
 * 10 del descanso, para cuando enfocas el número el descanso se ha acabado. Un
 * dato que no cambia ninguna conducta no se gana ser el sujeto (§4).
 *
 * Lo que sí se usa, cada tres segundos, es el ESTADO: trabajas o paras. Y eso
 * viaja por tres canales que no piden enfocar la vista —el color del lienzo, el
 * destello del cambio y una palabra en la banda—, ninguno de los cuales necesita
 * el sujeto. Trabajando el modo es `ciego`: la pantalla NO SE MIRA, y aun así el
 * atleta sabe en qué tramo está. Ése es el instrumento.
 *
 * Así que el sujeto se lo lleva lo único que dura los cuatro minutos y que no
 * está en ningún otro sitio: **en qué ronda vas.** Una tabata se aguanta contando
 * rondas, y un glifo es el numeral más grande de toda la familia (~138 pt).
 * Debajo, `de 8 rondas` sin etiqueta —el mismo recurso que el marcador cerrado
 * del AMRAP— para que el número no sea ambiguo ni un segundo. Y NO cambia al
 * pasar de trabajo a parada: cambia el color. Es el hallazgo del EMOM llevado un
 * paso más lejos, porque aquí el color no es un refuerzo, es el canal principal.
 *
 * LO QUE ESTA PANTALLA NO HACE, Y ES A PROPÓSITO: **no cuenta repeticiones.** El
 * motor guarda `rotRepsByRound` y el móvil ofrece «+ REPS», pero su propio
 * comentario dice que la puntuación es el MÍNIMO de las rondas contadas y que
 * «un mínimo sobre un subconjunto es una cota inferior, no la puntuación». En la
 * muñeca, a mitad de burpee, sólo se contarían algunas rondas — y eso produce
 * justo la cota inferior con cara de marca que el motor se niega a sellar.
 */
function paginaTabata(e: Estado, c: CasoTabata): PaginaReloj {
  const parado = faseDe(e) === 'parada';
  const ultima = e.ronda >= c.rondas;
  return {
    id: 'tabata',
    // Una palabra. Es lo único que un tabata te pide leer, y a 10 px en versales
    // «TRABAJA» y «PARA» se distinguen por su longitud antes que por sus letras.
    contexto: parado ? (ultima ? 'Para · se acabó' : 'Para') : 'Trabaja',
    modo: modoDe(e),
    // El latido marca la ronda nueva: el golpe de escala es la confirmación que
    // sustituye a leer, que es de lo que va toda esta pantalla.
    sujeto: { texto: String(e.ronda), latido: e.ronda },
    segundo: { valor: `de ${c.rondas} rondas` },
    // Sin nota: las rondas las cuenta el reloj, que es suyo. Y no se promete
    // ninguna repetición, así que no hay nada que desmentir.
  };
}

/**
 * (c) `death_by` — el minuto N pide N repeticiones.
 *
 * **Las repeticiones de ESTE minuto son el dato que define el formato**, y hoy
 * se pierden en una segunda línea. Aquí son el sujeto: una o dos cifras, o sea
 * el numeral más grande que el lienzo sabe dar (~100 pt con todos los apoyos
 * puestos), y con `latido` — que suban de golpe al entrar el minuto ES el
 * formato hablando.
 *
 * El movimiento no está en la muñeca: un death by es UN movimiento por
 * definición, así que a partir del minuto 2 decirlo es repetir lo que ya sabes
 * (precedente del AMRAP). Vive en el móvil, que es donde hay sitio.
 *
 * EL ARO ES CONTINUO, y es el único de los cuatro que no puede ser otra cosa: un
 * death by **no tiene un número de rondas** —la 12 existe si llegas—, así que no
 * hay nada que segmentar y el aro dice lo único que se sabe.
 *
 * LA ACCIÓN, que es la única de toda la familia: `Al fallar · toca`.
 *   · «Lo logré» NO se ofrece: el minuto que se cumple solo ya cuenta como
 *     logrado (`advanceDeathByMinute` en el auto-roll), así que un botón para
 *     eso no haría nada que el reloj no haga por ti.
 *   · El fallo, en cambio, sólo lo sabes tú, **y es lo único que acaba el
 *     bloque** (`deathByFail`). Sin él, un death by no se puede terminar desde la
 *     muñeca: hay que sacar el móvil, jadeando, justo en el peor momento.
 *   · Va ATENUADA porque el modo es `ciego`: es una oferta en reposo para cuando
 *     te levantes, jamás una petición mientras estás en el suelo.
 *
 * RIESGO QUE VEO Y QUE NO ESCONDO: en este kit la pantalla entera es el botón, y
 * aquí un toque accidental cierra el bloque. Se asume porque la alternativa
 * —dejar el formato sin final en la muñeca— es peor, y porque el lienzo ya lo
 * amortigua (franja atenuada + un arrastre de más de 24 px no dispara el toque).
 * Lo que lo cerraría del todo es una confirmación de dos toques, que el kit no
 * tiene hoy: si esta pantalla se porta, va con ella.
 */
function paginaDeathBy(e: Estado, c: CasoDeathBy, g: Gestos): PaginaReloj {
  // Declarado el fallo, el sujeto pasa a ser LA PUNTUACIÓN: las rondas
  // superadas, que es el minuto anterior al que no llegaste. Es la confirmación
  // inmediata del gesto —sin ella, un toque que acaba el bloque no devuelve
  // nada— y va con las palabras del propio resumen de la app.
  if (e.fallado) {
    return {
      id: 'muerto',
      contexto: `Se acabó · minuto ${e.ronda}`,
      modo: 'mando',
      sujeto: { texto: String(Math.max(0, e.ronda - 1)) },
      segundo: { valor: 'rondas superadas' },
    };
  }
  const queda = quedaDe(e);
  const reps = repsDelMinuto(c, e.ronda);
  return {
    id: 'minuto',
    contexto: `Minuto ${e.ronda}`,
    modo: modoDe(e),
    // La unidad pegada al numeral y no una línea aparte: sin ella un «7» sobre
    // un «Minuto 7» es ambiguo, y `reps` cuesta 1,2 glifos de ancho, no cuatro.
    sujeto: { texto: String(reps), unidad: 'reps', latido: reps },
    segundo: { etiqueta: 'Queda', valor: countdown(queda), tono: tonoUrgente(queda) },
    accion: { etiqueta: 'Al fallar · toca', onToca: g.rendirse },
    // Las repeticiones salen del protocolo que escribió el coach (`start` +
    // `increment`), no de nada que el reloj mida.
    nota: NOTA.loDicesTu,
  };
}

/**
 * (d) `steady` funcional — una sola ventana larga, sin trocear.
 *
 * La pantalla más corta de las diez, y a propósito: hay UNA cosa que saber y la
 * pantalla entera es esa cosa. Ni segundo nivel (no existe un segundo dato: no
 * hay dosis, no hay objetivo, no hay tramos), ni acción (la ventana se agota
 * sola), ni nota (el crono es del reloj). El movimiento se va a la banda de
 * contexto, que es donde cuesta cero.
 *
 * Y una observación que sólo aparece al hacer la cuenta: aquí el segundo nivel
 * habría sido GRATIS. Un `04:12` son cinco glifos, o sea que el ANCHO ya topa el
 * numeral en 44 pt y le sobra alto por todos lados — quitarle apoyos no lo hace
 * crecer ni un punto. Se deja vacío igualmente, porque el criterio no es «cabe»
 * sino «existe», y no existe ningún segundo dato que poner.
 */
function paginaSteady(e: Estado, c: CasoSteady): PaginaReloj {
  const queda = Math.max(0, c.ventanaS - e.t);
  return {
    id: 'ventana',
    contexto: queda > 0 ? c.movimiento : 'Se acabó',
    modo: modoDe(e),
    sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
  };
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const principal =
    e.caso.formato === 'intervals'
      ? paginaIntervals(e, e.caso)
      : e.caso.formato === 'tabata'
        ? paginaTabata(e, e.caso)
        : e.caso.formato === 'death_by'
          ? paginaDeathBy(e, e.caso, g)
          : paginaSteady(e, e.caso);

  // El pulso hereda el modo DEL MOMENTO, no el suyo por defecto: si estás en el
  // suelo no puedes mirar, estés en la página que estés.
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla, modo: modoDe(e) });
  // Y la oferta de rendirse NO se replica aquí, al revés que la ronda del AMRAP:
  // es la única acción destructiva de la familia, y declarar el fallo no caduca
  // —el bloque sigue ahí hasta que lo digas—, así que no hace falta tenerla a
  // mano en las dos páginas a cambio de doblar la superficie de toque accidental.
  return pulso ? [principal, pulso] : [principal];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { rendirse: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

const BASE = { ancla: SIN_ANCLA, fallado: false } as const;

export const CASOS = [
  // ── intervals ────────────────────────────────────────────────────────────
  caso('plancha · trabajando', { ...BASE, caso: PLANCHA, ronda: 3, t: 12 }),
  // Los tres últimos segundos del tramo: el numeral se pone naranja.
  caso('plancha · se acaba el tramo', { ...BASE, caso: PLANCHA, ronda: 3, t: 38 }),
  caso('plancha · parada', { ...BASE, caso: PLANCHA, ronda: 3, t: 47 }),
  caso('plancha · última parada', { ...BASE, caso: PLANCHA, ronda: 4, t: 50 }),
  // El peor caso de ancho de la vista: el primer segundo de un tramo de 60 s,
  // que `countdown` escribe «01:00» — cinco glifos, justo en el suelo. Y encima
  // con objetivo y nota puestos, que es la página más cargada que hay aquí.
  caso('trineo · primer segundo', { ...BASE, caso: TRINEO, ronda: 2, t: 0 }),
  caso('trineo · con objetivo', { ...BASE, caso: TRINEO, ronda: 2, t: 24 }),
  // ── tabata ───────────────────────────────────────────────────────────────
  caso('tabata · trabaja', { ...BASE, caso: TABATA_BURPEES, ronda: 3, t: 8 }),
  caso('tabata · para', { ...BASE, caso: TABATA_BURPEES, ronda: 3, t: 24 }),
  caso('tabata · última parada', { ...BASE, caso: TABATA_BURPEES, ronda: 8, t: 26 }),
  // ── death by ─────────────────────────────────────────────────────────────
  caso('death by · minuto 1', { ...BASE, caso: DEATH_BY_BURPEES, ronda: 1, t: 14 }),
  // Dos cifras de repeticiones, para comprobar que el sujeto sigue cabiendo.
  caso('death by · minuto 12', { ...BASE, caso: DEATH_BY_BURPEES, ronda: 12, t: 40 }),
  caso('death by · fallado', { ...BASE, caso: DEATH_BY_BURPEES, ronda: 12, t: 40, fallado: true }),
  // ── steady ───────────────────────────────────────────────────────────────
  // El arranque, que es el peor ancho: «05:00», cinco glifos.
  caso('steady · arranque', { ...BASE, caso: MOVILIDAD, ronda: 1, t: 0 }),
  caso('steady · a mitad', { ...BASE, caso: MOVILIDAD, ronda: 1, t: 152 }),
  caso('steady · se acabó', { ...BASE, caso: MOVILIDAD, ronda: 1, t: MOVILIDAD.ventanaS }),
] as const;
