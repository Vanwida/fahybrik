// LA FORMA DE UNA CARRERA — cálculo puro, como `zonas.ts`.
//
// POR QUÉ EXISTE. El reloj de un atleta de Pablo, tras un fartlek de 14,5 km,
// le enseñó `AVERAGE PACE 5'36"/KM`. Ese número no describe ningún momento de
// esa carrera: es la media de los fuertes y los suaves, dos cosas distintas
// promediadas cruzando la frontera que las separa. Es la misma enfermedad que
// la FC media que era media de medias y el reparto de zonas dividido entre la
// suma en vez de la duración.
//
// Apple y Garmin promedian porque NO SABEN qué formato estás haciendo. Nosotros
// sí: lo prescribió el coach. Ahí está la ventaja, y este módulo la gasta.
//
// LA LEY, y es lo único que hay que recordar de todo el fichero:
//
//   **La media se gana el derecho a ser el sujeto sólo si la carrera fue UNA
//   SOLA COSA.**
//
// Eso convierte «la media miente» (que es falso: en un rodaje continuo la media
// describe cada minuto) en una regla decidible. Por eso lo que devuelve esta
// función no es «aquí van los tramos» sino UNA FORMA:
//
//   `uniforme`      — fue una sola cosa; la media es honesta y ES el sujeto.
//   `con-contraste` — fueron dos; el sujeto es el par, nunca su promedio.
//   `no-se-sabe`    — no se puede decomponer, y la pantalla lo dice.
//
// El tercer estado no es el caso raro: HOY es el único que la base puede
// producir. No existe ninguna serie de ritmo guardada (el enum
// `biometric_metric` no contempla `pace` ni `speed`), y 15 de las 16
// ejecuciones `recorded_via='live'` tienen UN solo `segment_executions`. Un
// fartlek grabado hoy con la app llega al servidor como un único ritmo medio.
// Ver el informe de la tanda: esta función está diseñada para el dato que hará
// falta, y declara honestamente que hoy no lo tiene.

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

/** Lo que se hace en un tramo. `parado` no es ritmo: es un semáforo o una pérdida de señal. */
export type TipoTramo = 'fuerte' | 'suave' | 'parado';

/** La forma de la carrera entera — lo que decide quién es el sujeto de la pantalla. */
export type FormaCarrera = 'uniforme' | 'con-contraste' | 'no-se-sabe';

/**
 * De dónde salen las fronteras, y cuánto se puede uno fiar. Va a la pantalla tal
 * cual (§7): un tramo inferido no puede leerse igual que uno medido.
 */
export type Certeza =
  /** Los cerró el motor: el coach los prescribió, o el atleta pulsó vuelta. */
  | 'marcados'
  /** Salieron del ritmo, con separación limpia y muestras de sobra. */
  | 'detectados'
  /** Salieron del ritmo, pero la separación o la densidad van justas. */
  | 'estimados';

/** Por qué no se pudo decomponer. Sólo con `forma: 'no-se-sabe'`. */
export type Motivo =
  /** No se guardó ninguna muestra de ritmo. El caso de producción HOY. */
  | 'sin-serie'
  /** Hay muestras, pero no bastan para resolver un tramo. */
  | 'muestras-escasas';

/** Cómo aguantó de la primera mitad del trabajo a la segunda. */
export type Veredicto = 'aguantaste' | 'de-menos-a-mas' | 'se-te-fue';

export interface Muestra {
  /** Segundos desde el inicio de la carrera. */
  t: number;
  /** Ritmo instantáneo en s/km. Nulo = parado o sin señal. */
  ritmoSkm: number | null;
}

/**
 * Un tramo cuya frontera YA se conoce: la prescripción del coach expandida por
 * el motor, o una vuelta pulsada. No hay nada que detectar, sólo que leer.
 */
export interface TramoMarcado {
  tipo: 'fuerte' | 'suave';
  duracionS: number;
  /** Nulo = se cronometró pero no se midió distancia; entonces no hay ritmo. */
  distanciaM: number | null;
}

export interface Tramo {
  tipo: TipoTramo;
  desdeS: number;
  hastaS: number;
  duracionS: number;
  /** Nulo en `parado`, y en un marcado sin distancia. */
  ritmoSkm: number | null;
  /** Su orden entre los de SU tipo, desde 1: «la 3.ª fuerte». */
  orden: number;
}

/** El agregado de un tipo de tramo: n, a qué ritmo y cuánto tiempo. */
export interface Grupo {
  n: number;
  ritmoSkm: number;
  duracionS: number;
  distanciaM: number;
}

export interface Aguante {
  primeraSkm: number;
  ultimaSkm: number;
  /** s/km perdidos (+) o ganados (−) de la primera mitad del trabajo a la segunda. */
  derivaSkm: number;
  veredicto: Veredicto;
}

export interface Lectura {
  forma: FormaCarrera;
  certeza: Certeza | null;
  motivo: Motivo | null;
  tramos: Tramo[];
  /**
   * Si los tramos son UNA LECTURA o sólo el andamio de la detección.
   *
   * En un rodaje continuo el disparador igualmente trocea la serie —tiene que
   * hacerlo para poder concluir que no hay frontera—, pero esos trozos no son
   * repeticiones: son ruido con nombre. Pintarlos sería enseñar una estructura
   * que el atleta no corrió. Lo decide el dominio y no la pantalla, para que
   * las dos superficies no puedan discrepar.
   */
  tramosSonLectura: boolean;
  fuerte: Grupo | null;
  suave: Grupo | null;
  /** s/km entre lo suave y lo fuerte. Es lo que hace que el ritmo fuerte signifique algo. */
  contrasteSkm: number | null;
  /** Necesita al menos `MIN_TRAMOS_AGUANTE` tramos fuertes: con dos es una anécdota. */
  aguante: Aguante | null;
  /** El ritmo medio de toda la carrera. Siempre se sabe: lo mide cualquier reloj. */
  mediaSkm: number | null;
  /**
   * La media promedia cruzando una frontera y por tanto no describe ningún
   * momento. Es el campo del que cuelga la única frase que nos separa de Apple.
   */
  mediaEsMezcla: boolean;
}

export interface Carrera {
  /** Lo que SIEMPRE se sabe. */
  distanciaM: number;
  duracionS: number;
  /** La serie de ritmo. Ausente = lo que la base devuelve hoy. */
  muestras?: Muestra[];
  /** Fronteras ya conocidas. Ganan a la detección: no se infiere lo que se sabe. */
  marcados?: TramoMarcado[];
  /**
   * La forma que el coach PRESCRIBIÓ. Es la ventaja que Apple no tiene: aunque
   * no podamos decomponer la carrera, si el coach mandó contraste sabemos que
   * la media es una mezcla, y eso se puede decir.
   */
  formaPrescrita?: 'continua' | 'con-contraste';
}

// ---------------------------------------------------------------------------
// Las constantes, y por qué valen lo que valen
// ---------------------------------------------------------------------------

/**
 * Suavizado por MEDIANA móvil, no por media: la mediana se come el pico del GPS
 * y el frenazo del semáforo sin arrastrar la frontera hacia ellos, que es justo
 * lo que hace la media y por lo que un detector con media corta tarde.
 */
const VENTANA_MEDIANA_S = 15;

/**
 * Por debajo de esto no es un tramo: es un semáforo, una cuesta o un adelanto.
 * Se absorbe en el vecino en vez de trocear la carrera en el ruido.
 */
const MIN_TRAMO_S = 25;

/** Suelo de la banda de histéresis: el ruido del ritmo por GPS, en s/km. */
const BANDA_MIN_SKM = 8;

/**
 * Por debajo de este contraste la variación no es una frontera: es el terreno.
 * Y entonces la carrera fue UNA cosa y su media es honesta. Esta constante hace
 * doble trabajo — decide la forma y protege a la media de una acusación falsa.
 */
const UMBRAL_CONTRASTE_SKM = 20;

/** Más lento que 9:00/km sostenido no es correr suave: es estar parado. */
const RITMO_PARADO_SKM = 540;

/** Con menos no hay nada que resolver. */
const MIN_MUESTRAS = 20;

/** Una muestra cada 15 s. Con menos no se resuelve un tramo de 30 s. */
const MIN_DENSIDAD_POR_MIN = 4;

/** Con menos tramos fuertes, «aguantaste» es una anécdota, no una lectura. */
const MIN_TRAMOS_AGUANTE = 4;

/**
 * Cuánto de la sesión puede quedarse fuera de los tramos antes de que ese hueco
 * sea la recuperación que nadie grabó, y no el redondeo del reloj.
 */
const HUECO_MINIMO = 0.1;

/**
 * Cuánto puede caerse el ritmo entre mitades y seguir siendo «aguantaste».
 * En porcentaje y no en s/km: 5 s/km sobre 3:00 es otra cosa que sobre 6:00.
 * El 2 % está por encima del ruido de medida de una repetición por GPS.
 */
const UMBRAL_AGUANTE = 0.02;

/**
 * Contraste, en s/km, a partir del cual la frontera deja de ser discutible.
 * Un fartlek de verdad son 60-90; una progresión suelta, 20-30. Por debajo de
 * este listón los tramos salen, pero se declaran `estimados`.
 */
const CONTRASTE_LIMPIO_SKM = 40;
/** Cuánto de la carrera tiene que caer dentro de tramos para fiarse. */
const COBERTURA_LIMPIA = 0.8;
/** Una muestra cada 6 s: bastante para ver las dos fronteras de un tramo de 30 s. */
const DENSIDAD_LIMPIA_POR_MIN = 10;

// ---------------------------------------------------------------------------
// Utilidades de estadística
// ---------------------------------------------------------------------------

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]!;
}

/**
 * Los dos centros de la distribución de ritmos: [el rápido, el lento].
 *
 * Lloyd de dos grupos en una dimensión, arrancando en los percentiles 10 y 90
 * para que la partida no dependa del orden de las muestras y el resultado sea
 * el mismo en el servidor y en el cliente. Doce vueltas bastan de sobra en 1-D;
 * se corta antes si deja de moverse.
 */
const VUELTAS_LLOYD = 12;

function dosCentros(xs: number[]): [number, number] {
  let a = percentil(xs, 0.1);
  let b = percentil(xs, 0.9);
  for (let v = 0; v < VUELTAS_LLOYD; v += 1) {
    const corte = (a + b) / 2;
    const bajos = xs.filter((x) => x <= corte);
    const altos = xs.filter((x) => x > corte);
    // Un grupo vacío significa que no hay dos poblaciones: se deja como está.
    if (bajos.length === 0 || altos.length === 0) break;
    const na = bajos.reduce((s, x) => s + x, 0) / bajos.length;
    const nb = altos.reduce((s, x) => s + x, 0) / altos.length;
    if (Math.abs(na - a) < 0.01 && Math.abs(nb - b) < 0.01) {
      [a, b] = [na, nb];
      break;
    }
    [a, b] = [na, nb];
  }
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * EL RITMO MEDIO DE UN CONJUNTO DE TRAMOS — y no es la media aritmética.
 *
 * El ritmo es s/km: un inverso. Sobre muestras repartidas en el TIEMPO, la media
 * aritmética de los ritmos sale más lenta que la verdad, porque pesa igual un
 * segundo rápido (que cubre más metros) que uno lento. La media buena es
 * tiempo total / distancia total, que sobre muestras equiespaciadas es la media
 * armónica. Con 8 repeticiones a 3:58 y una a 5:12 la diferencia son varios
 * segundos por kilómetro: bastante para desmentir el sujeto de la pantalla.
 */
function ritmoDe(tramos: Array<{ duracionS: number; ritmoSkm: number }>): Grupo {
  const duracionS = tramos.reduce((a, t) => a + t.duracionS, 0);
  const distanciaM = tramos.reduce((a, t) => a + (t.duracionS / t.ritmoSkm) * 1000, 0);
  return { n: tramos.length, duracionS, distanciaM, ritmoSkm: (duracionS / distanciaM) * 1000 };
}

// ---------------------------------------------------------------------------
// La lectura
// ---------------------------------------------------------------------------

export function lecturaDeCarrera(c: Carrera): Lectura {
  const mediaSkm = c.distanciaM > 0 ? (c.duracionS / c.distanciaM) * 1000 : null;
  const marcados = c.marcados ?? [];
  const crudos = marcados.length > 0 ? desdeMarcados(marcados) : desdeMuestras(c.muestras ?? []);

  if (crudos === 'sin-serie' || crudos === 'muestras-escasas') {
    return {
      tramos: [],
      tramosSonLectura: false,
      forma: 'no-se-sabe',
      certeza: null,
      motivo: crudos,
      fuerte: null,
      suave: null,
      contrasteSkm: null,
      aguante: null,
      mediaSkm,
      // Aquí está la ventaja que Apple no tiene: no sabemos decomponerla, pero
      // SABEMOS que el coach mandó contraste, así que sabemos que miente.
      mediaEsMezcla: c.formaPrescrita === 'con-contraste',
    };
  }

  const { tramos, certeza } = crudos;
  const conRitmo = (tipo: TipoTramo) =>
    tramos
      .filter((t) => t.tipo === tipo && t.ritmoSkm != null)
      .map((t) => ({ duracionS: t.duracionS, ritmoSkm: t.ritmoSkm! }));

  const fuertes = conRitmo('fuerte');
  const suaves = conRitmo('suave');
  const fuerte = fuertes.length > 0 ? ritmoDe(fuertes) : null;
  const suave = suaves.length > 0 ? ritmoDe(suaves) : null;

  // EL HUECO — y es el caso de producción, no un borde raro.
  //
  // El motor de iOS graba los tramos de TRABAJO y tira los de recuperación
  // (`advanceRunLeg`: `if finished.kind == .work { recordRunLegLap(...) }`). Así
  // que un 5×1000 llega con cinco fuertes y sin nada contra lo que compararlos,
  // y el tiempo que falta hasta la duración de la sesión ES la recuperación.
  // Llamar «uniforme» a eso sería absolver a una media que promedia lo que
  // tenemos y lo que perdimos. Hubo contraste; lo que no hay es el suave.
  const cubierto = tramos.reduce((a, t) => a + t.duracionS, 0);
  const hueco = c.duracionS > 0 && (c.duracionS - cubierto) / c.duracionS > HUECO_MINIMO;
  const suaveNoRegistrado = fuerte != null && suave == null && hueco;

  const contrasteSkm = fuerte != null && suave != null ? suave.ritmoSkm - fuerte.ritmoSkm : null;

  // Sin las dos caras y sin hueco, o con una variación que no llega a frontera
  // (es el terreno, no un formato): fue UNA sola cosa y la media queda absuelta.
  const uniforme =
    !suaveNoRegistrado && (fuerte == null || suave == null || contrasteSkm! < UMBRAL_CONTRASTE_SKM);

  // Los tramos son una lectura cuando son repeticiones DE VERDAD: las que
  // definió el coach, o las que separa una frontera real. Los trozos en que la
  // detección parte un rodaje continuo no lo son — ni para el aguante, ni para
  // pintarlos.
  const repeticionesReales = certeza === 'marcados' || !uniforme;

  return {
    tramos,
    tramosSonLectura: repeticionesReales,
    forma: uniforme ? 'uniforme' : 'con-contraste',
    certeza,
    motivo: null,
    fuerte: uniforme ? null : fuerte,
    suave: uniforme ? null : suave,
    contrasteSkm: uniforme ? null : contrasteSkm,
    aguante: repeticionesReales && fuerte != null ? aguanteDe(fuertes) : null,
    mediaSkm,
    mediaEsMezcla: !uniforme,
  };
}

/** Con fronteras conocidas no se infiere nada: se lee. */
function desdeMarcados(marcados: TramoMarcado[]): { tramos: Tramo[]; certeza: Certeza } {
  let reloj = 0;
  const orden: Record<TipoTramo, number> = { fuerte: 0, suave: 0, parado: 0 };
  const tramos = marcados.map((m) => {
    const desdeS = reloj;
    reloj += m.duracionS;
    orden[m.tipo] += 1;
    return {
      tipo: m.tipo,
      desdeS,
      hastaS: reloj,
      duracionS: m.duracionS,
      ritmoSkm: m.distanciaM && m.distanciaM > 0 ? (m.duracionS / m.distanciaM) * 1000 : null,
      orden: orden[m.tipo],
    };
  });
  return { tramos, certeza: 'marcados' };
}

/**
 * LA DETECCIÓN — disparador de Schmitt sobre el ritmo suavizado.
 *
 * Sólo el RITMO pone las fronteras. La FC no: llega con 20-30 s de retraso
 * (el corazón tarda en subir y tarda más en bajar), así que un detector que
 * segmente por pulso coloca todas las fronteras tarde y alarga los fuertes a
 * costa de los suaves. La FC sirve para CORROBORAR que un tramo fue de
 * verdad — nunca para decidir dónde empieza.
 */
function desdeMuestras(muestras: Muestra[]): { tramos: Tramo[]; certeza: Certeza } | Motivo {
  if (muestras.length === 0) return 'sin-serie';

  const orden = [...muestras].sort((a, b) => a.t - b.t);
  const span = (orden.at(-1)!.t - orden[0]!.t) / 60;
  if (orden.length < MIN_MUESTRAS || span <= 0 || orden.length / span < MIN_DENSIDAD_POR_MIN) {
    return 'muestras-escasas';
  }

  // Cada muestra cubre hasta la siguiente; la última hereda el hueco anterior.
  const dts = orden.map((m, i) => (i + 1 < orden.length ? orden[i + 1]!.t - m.t : 0));
  dts[dts.length - 1] = dts.at(-2) ?? 1;

  // Suavizado por mediana móvil, con los `parado` fuera del cálculo para que un
  // semáforo no arrastre el ritmo de los vecinos.
  const corriendo = orden.map((m) => m.ritmoSkm != null && m.ritmoSkm <= RITMO_PARADO_SKM);
  const suavizado = orden.map((m, i) => {
    if (!corriendo[i]) return null;
    const pool: number[] = [];
    for (let j = 0; j < orden.length; j += 1) {
      if (corriendo[j] && Math.abs(orden[j]!.t - m.t) <= VENTANA_MEDIANA_S / 2) pool.push(orden[j]!.ritmoSkm!);
    }
    return pool.length > 0 ? mediana(pool) : m.ritmoSkm;
  });

  const validos = suavizado.filter((r): r is number => r != null);
  if (validos.length < MIN_MUESTRAS) return 'muestras-escasas';

  // LA REFERENCIA sale de los DOS CENTROS, no de la mediana.
  //
  // Y esto costó un rediseño: con la mediana, un fartlek en el que lo fuerte es
  // minoría del tiempo (que son todos — 8×1' fuerte contra 7×1'30" suave más el
  // calentamiento) deja la referencia clavada SOBRE el modo suave. El
  // disparador entra en fuerte y ya no puede salir, porque para volver tendría
  // que superar un umbral más lento que la propia recuperación. Salía una
  // carrera de un solo tramo — otra vez el promedio, por la puerta de atrás.
  //
  // «Encontrar las dos intensidades» es un problema de dos grupos, así que se
  // resuelve como tal, y la frontera cae siempre ENTRE ellas sea cual sea el
  // reparto de tiempo. En un rodaje los dos centros convergen, la banda se
  // queda en su suelo y el contraste no llega a umbral: uniforme, como debe.
  const [centroFuerte, centroSuave] = dosCentros(validos);
  const referencia = (centroFuerte + centroSuave) / 2;
  const banda = Math.max(BANDA_MIN_SKM, (centroSuave - centroFuerte) / 4);

  // Disparador de Schmitt: hay que cruzar 2·banda entera para cambiar de estado,
  // así que en la frontera no puede haber temblor. `parado` no cambia el estado:
  // al arrancar de nuevo se sigue donde se estaba hasta que el ritmo diga otra cosa.
  let estado: 'fuerte' | 'suave' = (suavizado.find((r) => r != null) ?? referencia) < referencia ? 'fuerte' : 'suave';
  const etiquetas: TipoTramo[] = suavizado.map((r) => {
    if (r == null) return 'parado';
    if (estado === 'suave' && r < referencia - banda) estado = 'fuerte';
    else if (estado === 'fuerte' && r > referencia + banda) estado = 'suave';
    return estado;
  });

  const bruto = agrupar(orden, dts, etiquetas, suavizado);
  const tramos = numerar(fundir(absorber(bruto)));

  return { tramos, certeza: certezaDe(tramos, orden.length / span) };
}

/**
 * DETECTADO O ESTIMADO — la diferencia va escrita en la pantalla (§7), así que
 * tiene que salir de algo, no del optimismo.
 *
 * Se miran las tres cosas que pueden hacer inventar una frontera:
 *
 *  · **La separación.** Un fartlek de verdad son 60-90 s/km entre lo fuerte y
 *    lo suave. Una progresión suelta son 20-30, y ahí la frontera existe pero
 *    es discutible. Se compara en s/km y no contra la banda: la banda se
 *    deriva de la propia separación, así que ese cociente vale casi siempre lo
 *    mismo y no informa de nada.
 *  · **La cobertura.** Si media carrera acabó en `parado`, lo que quede no es
 *    una lectura de la carrera.
 *  · **La densidad.** Una muestra cada 10 s resuelve un tramo de 30; una cada
 *    20, no — se ve la mitad de las fronteras y se cree que hay la mitad de
 *    repeticiones.
 */
function certezaDe(tramos: Tramo[], densidadPorMin: number): Certeza {
  const conRitmo = (tipo: TipoTramo) =>
    tramos
      .filter((t) => t.tipo === tipo && t.ritmoSkm != null)
      .map((t) => ({ duracionS: t.duracionS, ritmoSkm: t.ritmoSkm! }));
  const fuertes = conRitmo('fuerte');
  const suaves = conRitmo('suave');
  const contraste =
    fuertes.length > 0 && suaves.length > 0 ? ritmoDe(suaves).ritmoSkm - ritmoDe(fuertes).ritmoSkm : 0;

  const total = tramos.reduce((a, t) => a + t.duracionS, 0);
  const cubierto = tramos.filter((t) => t.tipo !== 'parado').reduce((a, t) => a + t.duracionS, 0);

  const limpia =
    contraste >= CONTRASTE_LIMPIO_SKM &&
    total > 0 &&
    cubierto / total >= COBERTURA_LIMPIA &&
    densidadPorMin >= DENSIDAD_LIMPIA_POR_MIN;
  return limpia ? 'detectados' : 'estimados';
}

interface Bruto {
  tipo: TipoTramo;
  desdeS: number;
  hastaS: number;
  duracionS: number;
  /** Tiempo y distancia acumulados, para sacar el ritmo exacto del tramo. */
  distanciaM: number;
}

function agrupar(orden: Muestra[], dts: number[], etiquetas: TipoTramo[], suavizado: Array<number | null>): Bruto[] {
  const out: Bruto[] = [];
  etiquetas.forEach((tipo, i) => {
    const dt = dts[i]!;
    const r = suavizado[i];
    const ultimo = out.at(-1);
    if (!ultimo || ultimo.tipo !== tipo) {
      out.push({
        tipo,
        desdeS: orden[i]!.t,
        hastaS: orden[i]!.t + dt,
        duracionS: dt,
        distanciaM: r != null ? (dt / r) * 1000 : 0,
      });
      return;
    }
    ultimo.hastaS = orden[i]!.t + dt;
    ultimo.duracionS += dt;
    if (r != null) ultimo.distanciaM += (dt / r) * 1000;
  });
  return out;
}

/** Lo que dura menos que `MIN_TRAMO_S` no es un tramo: se lo come el vecino. */
function absorber(brutos: Bruto[]): Bruto[] {
  const out: Bruto[] = [];
  for (const b of brutos) {
    if (b.duracionS >= MIN_TRAMO_S || out.length === 0) {
      out.push({ ...b });
      continue;
    }
    const previo = out.at(-1)!;
    previo.hastaS = b.hastaS;
    previo.duracionS += b.duracionS;
    previo.distanciaM += b.distanciaM;
  }
  // El primero también puede ser demasiado corto, y ahí el vecino es el siguiente.
  while (out.length > 1 && out[0]!.duracionS < MIN_TRAMO_S) {
    const [corto, siguiente] = [out[0]!, out[1]!];
    siguiente.desdeS = corto.desdeS;
    siguiente.duracionS += corto.duracionS;
    siguiente.distanciaM += corto.distanciaM;
    out.shift();
  }
  return out;
}

/** Absorber deja vecinos del mismo tipo pegados: se funden en uno. */
function fundir(brutos: Bruto[]): Bruto[] {
  const out: Bruto[] = [];
  for (const b of brutos) {
    const previo = out.at(-1);
    if (previo && previo.tipo === b.tipo) {
      previo.hastaS = b.hastaS;
      previo.duracionS += b.duracionS;
      previo.distanciaM += b.distanciaM;
    } else out.push({ ...b });
  }
  return out;
}

function numerar(brutos: Bruto[]): Tramo[] {
  const orden: Record<TipoTramo, number> = { fuerte: 0, suave: 0, parado: 0 };
  return brutos.map((b) => {
    orden[b.tipo] += 1;
    return {
      tipo: b.tipo,
      desdeS: Math.round(b.desdeS),
      hastaS: Math.round(b.hastaS),
      duracionS: Math.round(b.duracionS),
      ritmoSkm: b.tipo !== 'parado' && b.distanciaM > 0 ? (b.duracionS / b.distanciaM) * 1000 : null,
      orden: orden[b.tipo],
    };
  });
}

/**
 * EL AGUANTE — lo que de verdad juzga una sesión de calidad.
 *
 * «La última fuerte a 4:05, la primera a 3:52» son HECHOS y se dicen tal cual.
 * El VEREDICTO, en cambio, no puede colgar de dos repeticiones sueltas: se saca
 * comparando la primera mitad del trabajo con la segunda, que es lo que hace un
 * coach cuando mira la hoja. Y bajar de ritmo no es un fallo — es negativo, y
 * los coaches lo persiguen: por eso hay tres veredictos y no dos.
 */
function aguanteDe(fuertes: Array<{ duracionS: number; ritmoSkm: number }>): Aguante | null {
  if (fuertes.length < MIN_TRAMOS_AGUANTE) return null;
  const corte = Math.floor(fuertes.length / 2);
  const primera = ritmoDe(fuertes.slice(0, corte)).ritmoSkm;
  const segunda = ritmoDe(fuertes.slice(fuertes.length - corte)).ritmoSkm;
  const derivaSkm = segunda - primera;
  const margen = primera * UMBRAL_AGUANTE;
  return {
    primeraSkm: fuertes[0]!.ritmoSkm,
    ultimaSkm: fuertes.at(-1)!.ritmoSkm,
    derivaSkm,
    veredicto: derivaSkm > margen ? 'se-te-fue' : derivaSkm < -margen ? 'de-menos-a-mas' : 'aguantaste',
  };
}
