// LAS ANALÍTICAS DE CARRERA DEL ATLETA — ¿estoy mejorando?
//
// `lectura-carrera` (12-ago) contesta qué pasó EN una carrera. Esta contesta la
// otra pregunta, la que trae el atleta cuando abre la pestaña sin venir de
// entrenar: **si todo esto está sirviendo para algo**. No es la misma pregunta
// con más semanas: es otra pregunta, y por eso no se contesta con las mismas
// piezas más grandes.
//
// LO QUE HAY HOY Y POR QUÉ NO VALE. Catorce tarjetas, una por métrica, cada una
// con su número. Ninguna dice si el número es bueno. El atleta cierra la
// pestaña sabiendo su cadencia media y sin saber si está mejorando — que es lo
// único que había venido a mirar. Un panel de instrumentos no es una respuesta.
//
// EL MODELO ENTERO. Una lectura longitudinal no es «una métrica en el tiempo».
// Son cuatro cosas a la vez, y si falta una la lectura miente:
//
//   MAGNITUD    qué se mide
//   BASE        contra qué (sin base, un número no dice nada)
//   COBERTURA   si hay con qué afirmarlo, y si no, POR QUÉ no
//   SENTIDO     hacia dónde es mejor — y esto NO es obvio: que el ritmo baje es
//               mejorar, que el volumen suba no lo es necesariamente, y que la
//               cadencia suba no es nada.
//
// EL ORDEN ES CAUSAL, NO UNA REJILLA. Lo que sale (el efecto) primero, porque
// es la respuesta; lo que metes (el trabajo) después, porque es la explicación.
// Separarlos es lo que convierte cuatro tarjetas en un argumento: *esto es lo
// que has hecho, y esto es lo que ha producido*.
//
// EL VEREDICTO SE DERIVA, NO SE GUARDA. Es una lectura de la evidencia, no un
// índice propietario del 0 al 100 sacado de una fórmula que nadie puede
// auditar. Y tiene que poder decir **«todavía no lo sé»**: una pantalla que
// siempre tiene veredicto está inventando cuatro de cada cinco.
//
// REGLA Nº0. El mecanismo (la escalera de evidencia, cómo se detecta el exceso
// de carga, qué silencia una pieza) es del producto y vive en código. Los
// umbrales (cuántas semanas hacen falta para atreverse, cuántos segundos son
// una mejora, qué reparto se considera bueno) son MÉTODO: nacen aquí como
// defectos editables, no como constantes.

import type { Zona } from '../../kit-vivo';

// ---------------------------------------------------------------------------
// EL MÉTODO DEL COACH — defectos editables (Regla Nº0)
// ---------------------------------------------------------------------------

export interface Metodo {
  /** Semanas de historia antes de atreverse a afirmar una tendencia. */
  semanasParaAfirmar: number;
  /** Segundos por km a partir de los cuales un cambio deja de ser ruido. */
  mejoraMinimaSkm: number;
  /** Subida de volumen (proporción) que, con el ritmo empeorando, enciende el aviso. */
  subidaQueAvisa: number;
  /** Las distancias de la curva de mejores esfuerzos, en metros. */
  distanciasCurva: readonly number[];
  /** Parejas fresco/cansado al mismo objetivo antes de poder dar el coste. */
  parejasMinimasCansado: number;
  /** El reparto que este coach considera bueno. Suave y fuerte; el resto es medio. */
  reparto: { suave: number; fuerte: number };
  /** Cuántos puntos de desvío sobre ese reparto dejan de ser ruido. */
  desvioDeRepartoQueImporta: number;
  /** A partir de qué porcentaje en banda se considera que clava lo que le piden. */
  enBandaBienPct: number;
}

/**
 * Lo que hace hoy el sistema. Un coach que no toque nada se comporta igual que
 * ahora; el que quiera otra cosa cambia el dato, no el código.
 */
export const METODO: Metodo = {
  semanasParaAfirmar: 6,
  mejoraMinimaSkm: 3,
  subidaQueAvisa: 0.2,
  distanciasCurva: [400, 800, 1000, 1600, 3000, 5000, 10000],
  parejasMinimasCansado: 4,
  reparto: { suave: 80, fuerte: 20 },
  desvioDeRepartoQueImporta: 10,
  enBandaBienPct: 80,
};

// ---------------------------------------------------------------------------
// POR QUÉ UNA LECTURA PUEDE NO PODER DARSE — y qué se hace en cada caso
// ---------------------------------------------------------------------------

/**
 * Cinco razones, y solo cinco. Las inventaría cualquiera de una en una según
 * fuera apareciendo el caso; enumeradas de golpe se ve que **se agrupan en dos
 * tratamientos distintos**, y esa es toda la diferencia entre una pantalla
 * honesta y una que da pena.
 */
export type Falta =
  /** Lleva poco tiempo. Se sabe cuánto falta, así que se dice. */
  | { por: 'historia'; semanasQueFaltan: number }
  /** Sin test de umbral no hay zonas, y sin zonas no hay nada que clasificar. */
  | { por: 'ancla' }
  /** Sus carreras vienen sin pulso. */
  | { por: 'sensor' }
  /** Nunca le ha pasado (nunca corrió dentro de un bloque multiestación). */
  | { por: 'ocasion' }
  /** Nunca le pidieron ritmos, así que no hay intención contra la que medir. */
  | { por: 'intencion' };

/**
 * LA LÍNEA QUE DECIDE SI LA PANTALLA DA PENA.
 *
 * «Todavía no» y «no aplica» parecen lo mismo y no lo son. Al recién llegado le
 * falta TIEMPO, y decírselo es un contrato: en tres semanas esto se llena. Al
 * que no ha corrido nunca detrás de un trineo no le falta nada — esa lectura no
 * existe en su vida, y enseñarle una tarjeta gris prometiéndosela es ruido con
 * forma de dato.
 *
 * Regla dura (DECISIONS.md, 12-ago): sin cobertura se dice por qué; **si en su
 * caso no existe, la app se calla**. Aquí es donde se aplica.
 */
export function seCalla(f: Falta): boolean {
  return f.por === 'ocasion' || f.por === 'intencion';
}

/** Lo que se lee cuando la falta SÍ se cuenta. Nunca un guion, nunca un cero. */
export function porQueFalta(f: Falta): string {
  switch (f.por) {
    case 'historia':
      return f.semanasQueFaltan === 1
        ? 'Con una semana más ya se puede leer.'
        : `Con ${f.semanasQueFaltan} semanas más ya se puede leer.`;
    case 'ancla':
      return 'Hace falta saber dónde están tus zonas.';
    case 'sensor':
      return 'Hace falta que tus carreras lleven pulso.';
    default:
      return '';
  }
}

/**
 * Cuando varias piezas esperan LO MISMO, la petición sale UNA vez y arriba.
 *
 * Sin esto, al atleta sin test de umbral le piden el test tres tarjetas
 * seguidas. Tres veces la misma frase no es tres veces más claro: es una
 * pantalla que da la brasa. Cada pieza dice qué espera; quién lo pide es la
 * pantalla, y una sola vez.
 */
export function faltaComun(faltas: Falta[]): Falta | null {
  const contables = faltas.filter((f) => !seCalla(f));
  if (contables.length < 2) return null;
  const primera = contables[0]!;
  return contables.every((f) => f.por === primera.por) ? primera : null;
}

// ---------------------------------------------------------------------------
// LO QUE SE SABE DEL ATLETA
// ---------------------------------------------------------------------------

/** Un punto de la serie «a este pulso, este ritmo». La señal más limpia que hay. */
export interface PuntoAlPulso {
  /** Etiqueta corta de la semana, tal y como se pinta en el eje. */
  semana: string;
  skm: number;
}

export interface Esfuerzo {
  metros: number;
  segundos: number;
}

export interface SemanaKm {
  semana: string;
  km: number;
}

/** Lo que le pidieron y lo que hizo. El sesgo importa más que el porcentaje. */
export interface Pedido {
  evaluadas: number;
  dentro: number;
  fueraLento: number;
  fueraRapido: number;
  /** Dónde se rompe dentro de la serie, si hay con qué verlo. */
  seRompeEnLaRepeticion: number | null;
}

/** El coste de entrar a correr cansado, semana a semana. Bajando = mejorando. */
export interface PuntoCansado {
  semana: string;
  costeSkm: number;
  parejas: number;
}

export interface CarreraObjetivo {
  nombre: string;
  dias: number;
  /** Solo si hay de dónde proyectarlo. Sin base previa no se inventa un tiempo. */
  predicho: { segundos: number; base: string } | null;
}

export interface Historia {
  /** Semanas con al menos una carrera registrada. */
  semanas: number;
  /** ¿Hizo el test que fija sus zonas? */
  zonasMedidas: boolean;
  /** ¿Sus carreras traen pulso? */
  conPulso: boolean;
  /** Pulso de referencia de la lectura al mismo pulso (el techo de su aeróbico). */
  ppmReferencia: number;
  /**
   * En qué zona cae ese pulso. Va DECLARADO y no deducido porque de él sale el
   * color de la serie, y el color es dato (§9.1): pintar de Z2 una lectura que
   * en realidad cae en Z3 sería mentir con una variable de CSS.
   */
  zonaReferencia: Zona | null;
  alPulso: PuntoAlPulso[];
  esfuerzos: Esfuerzo[];
  /** La sombra: los mismos esfuerzos hace un mes. Vacío = aún no hay contra qué. */
  esfuerzosAntes: Esfuerzo[];
  semanasKm: SemanaKm[];
  /** Segundos por zona de las últimas cuatro semanas. */
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  /** Base del reparto: todo el tiempo corriendo, medido o no. */
  segundosCorriendo: number;
  pedido: Pedido | null;
  cansado: PuntoCansado[];
  carrera: CarreraObjetivo | null;
  /**
   * El tercer peldaño de la escalera. Va en el modelo aunque casi nunca sea el
   * que gana, porque un peldaño declarado y nunca alimentado es exactamente la
   * columna vacía que el diagnóstico de `docs/correr-analitica.html` (§04) le
   * reprocha a la carrera de hoy.
   */
  mismoTipo: { tipo: string; ganaSkm: number } | null;
}

// ---------------------------------------------------------------------------
// LA ESCALERA DE EVIDENCIA — de qué sale el veredicto
// ---------------------------------------------------------------------------

/**
 * El veredicto NO depende de una sola señal, porque entonces el atleta sin
 * pulsómetro no tendría veredicto nunca. Depende de la MEJOR señal que tenga
 * hoy, y la escalera dice cuál es mejor y por qué:
 *
 *  1. Ritmo al mismo pulso — la única que aísla la forma del esfuerzo. Si vas
 *     más rápido con el corazón igual de tranquilo, estás mejor. Punto.
 *  2. Mejores esfuerzos contra la sombra — menos limpia (un día bueno la
 *     mueve), pero es un hecho duro y se entiende a la primera.
 *  3. Ritmo medio del mismo tipo de sesión — degradada, porque compara días
 *     distintos con clima, terreno y frescura distintos. Se dice que es esa.
 *
 * Baja un peldaño solo cuando el de arriba no tiene cobertura. Y si no queda
 * ninguno, no se improvisa un cuarto: se dice que todavía no.
 */
export type Peldano =
  | { en: 'al-pulso'; ganaSkm: number; ppm: number; semanas: number }
  | { en: 'esfuerzos'; metros: number; ganaS: number }
  | { en: 'mismo-tipo'; tipo: string; ganaSkm: number; semanas: number };

export type ClaseVeredicto = 'mejor' | 'igual' | 'cargando' | 'peor' | 'todavia-no';

export interface Veredicto {
  clase: ClaseVeredicto;
  /** La frase. Una, corta, y en la voz de alguien del box. */
  frase: string;
  /** El porqué: de dónde sale, con el número delante. Una línea. */
  porque: string;
  /** El peldaño del que salió, para poder marcarlo en la evidencia. */
  peldano: Peldano | null;
  /** Solo en «todavía no»: qué SÍ se puede decir hoy, para no dejarlo a cero. */
  loQueSiHay: string | null;
}

const TONO: Record<ClaseVeredicto, string> = {
  mejor: 'var(--twin-ok)',
  igual: 'var(--twin-fg)',
  // Aviso, no alarma. El rojo se reserva para lo que hay que atender HOY; una
  // tendencia de cuatro semanas nunca lo es, y gastarlo aquí lo devalúa donde sí.
  cargando: 'var(--twin-warning)',
  peor: 'var(--twin-warning)',
  'todavia-no': 'var(--twin-muted)',
};

export function tonoDe(c: ClaseVeredicto): string {
  return TONO[c];
}

// ---------------------------------------------------------------------------
// De la historia al veredicto
// ---------------------------------------------------------------------------

/** Segundos por km ganados entre el primer y el último punto. Positivo = más rápido. */
function ganancia(serie: PuntoAlPulso[]): number {
  if (serie.length < 2) return 0;
  return serie[0]!.skm - serie[serie.length - 1]!.skm;
}

/** Proporción de subida del volumen: última semana contra la media de las cuatro primeras. */
function subidaDeVolumen(semanas: SemanaKm[]): number {
  if (semanas.length < 4) return 0;
  const base = semanas.slice(0, 4).reduce((a, s) => a + s.km, 0) / 4;
  if (base <= 0) return 0;
  const ultimas = semanas.slice(-2).reduce((a, s) => a + s.km, 0) / Math.min(2, semanas.length);
  return ultimas / base - 1;
}

/** El peldaño más alto con cobertura. Null = no hay evidencia de nada. */
export function peldanoDisponible(h: Historia, m: Metodo = METODO): Peldano | null {
  if (h.conPulso && h.zonasMedidas && h.alPulso.length >= 3) {
    return { en: 'al-pulso', ganaSkm: ganancia(h.alPulso), ppm: h.ppmReferencia, semanas: h.alPulso.length };
  }
  if (h.esfuerzos.length > 0 && h.esfuerzosAntes.length > 0) {
    // El esfuerzo más largo que exista en las dos listas: el más corto lo mueve
    // un día suelto, el más largo describe el motor.
    const comunes = h.esfuerzos
      .filter((e) => h.esfuerzosAntes.some((a) => a.metros === e.metros))
      .sort((a, b) => b.metros - a.metros);
    const hoy = comunes[0];
    if (hoy) {
      const antes = h.esfuerzosAntes.find((a) => a.metros === hoy.metros)!;
      return { en: 'esfuerzos', metros: hoy.metros, ganaS: antes.segundos - hoy.segundos };
    }
  }
  if (h.mismoTipo) {
    return { en: 'mismo-tipo', tipo: h.mismoTipo.tipo, ganaSkm: h.mismoTipo.ganaSkm, semanas: h.semanasKm.length };
  }
  return null;
}

/**
 * El veredicto entero. Es una función de la evidencia y nada más: no hay estado
 * guardado, no hay índice, y cada frase se puede rastrear hasta el número del
 * que salió.
 */
export function veredictoDe(h: Historia, m: Metodo = METODO): Veredicto {
  const peldano = peldanoDisponible(h, m);

  // ─ No hay con qué. Y esto es un resultado, no un fallo ────────────────────
  if (!peldano || h.semanas < m.semanasParaAfirmar) {
    const faltan = Math.max(1, m.semanasParaAfirmar - h.semanas);
    const km = Math.round(h.semanasKm.reduce((a, s) => a + s.km, 0));
    return {
      clase: 'todavia-no',
      frase: 'Todavía no te lo puedo decir',
      porque:
        h.semanas === 1
          ? `Llevas una semana. Con ${m.semanasParaAfirmar} se ve una tendencia de verdad.`
          : `Llevas ${h.semanas} semanas. Con ${m.semanasParaAfirmar} se ve una tendencia de verdad.`,
      peldano,
      loQueSiHay:
        km > 0
          ? `De momento llevas ${km} km y ${faltan === 1 ? 'queda una semana' : `quedan ${faltan} semanas`} para la primera lectura.`
          : null,
    };
  }

  // ─ Cuánto se ha ganado, en el idioma del peldaño ──────────────────────────
  const gana = peldano.en === 'al-pulso' ? peldano.ganaSkm : peldano.en === 'esfuerzos' ? peldano.ganaS : peldano.ganaSkm;
  const subida = subidaDeVolumen(h.semanasKm);
  const mejora = gana >= m.mejoraMinimaSkm;
  const empeora = gana <= -m.mejoraMinimaSkm;

  if (mejora) {
    return {
      clase: 'mejor',
      frase: 'Vas mejor',
      porque: `${fraseDelPeldano(peldano)}.`,
      peldano,
      loQueSiHay: null,
    };
  }

  // ─ EL INCÓMODO. Volumen subiendo y el motor respondiendo peor es la firma
  //   clásica de estar metiendo más de lo que se asimila. La DETECCIÓN es
  //   mecanismo; los dos umbrales que la disparan son método. ────────────────
  if (empeora && subida >= m.subidaQueAvisa) {
    return {
      clase: 'cargando',
      frase: 'Estás metiendo más de lo que asimilas',
      porque: `${fraseDelPeldano(peldano)}, y estás corriendo un ${Math.round(subida * 100)}% más que en las primeras semanas.`,
      peldano,
      loQueSiHay: null,
    };
  }

  if (empeora) {
    return {
      clase: 'peor',
      frase: 'Vas más lento que hace unas semanas',
      porque: `${fraseDelPeldano(peldano)}.`,
      peldano,
      loQueSiHay: null,
    };
  }

  return {
    clase: 'igual',
    frase: 'Te estás manteniendo',
    porque: `${fraseDelPeldano(peldano)}, que es no moverte de donde estabas.`,
    peldano,
    loQueSiHay: null,
  };
}

/**
 * El porqué, en la voz del atleta. Ni «eficiencia aeróbica» ni «Pa:HR»: nadie
 * en un box dice eso, y el que lo dice no necesita que se lo expliquen.
 */
export function fraseDelPeldano(p: Peldano): string {
  const seg = (v: number) => `${Math.abs(Math.round(v))} s`;
  // La ventana va SIEMPRE dicha. «Que al empezar» es la trampa fácil: suena a
  // desde que entrenas y en realidad son las ocho semanas que se han mirado.
  // Una comparación sin su ventana es media comparación.
  switch (p.en) {
    case 'al-pulso':
      return p.ganaSkm === 0
        ? `Con el pulso a ${p.ppm} corres al mismo ritmo que hace ${p.semanas} semanas`
        : `Con el pulso a ${p.ppm} corres ${seg(p.ganaSkm)}/km ${p.ganaSkm > 0 ? 'más rápido' : 'más lento'} que hace ${p.semanas} semanas`;
    case 'esfuerzos': {
      const d = p.metros >= 1000 ? `${p.metros / 1000} km` : `${p.metros} m`;
      return p.ganaS === 0
        ? `Tu mejor ${d} sigue igual que hace un mes`
        : `Tu mejor ${d} va ${seg(p.ganaS)} ${p.ganaS > 0 ? 'por debajo' : 'por encima'} del de hace un mes`;
    }
    case 'mismo-tipo':
      return `En ${p.tipo} vas ${seg(p.ganaSkm)}/km ${p.ganaSkm > 0 ? 'más rápido' : 'más lento'} que hace ${p.semanas} semanas`;
  }
}

// ---------------------------------------------------------------------------
// La cobertura de cada pieza — una sola función, y la pantalla la obedece
// ---------------------------------------------------------------------------

export interface Cobertura {
  alPulso: Falta | null;
  esfuerzos: Falta | null;
  kilometros: Falta | null;
  reparto: Falta | null;
  pedido: Falta | null;
  cansado: Falta | null;
}

export function coberturaDe(h: Historia, m: Metodo = METODO): Cobertura {
  const faltanSemanas = Math.max(0, m.semanasParaAfirmar - h.semanas);
  const historia: Falta = { por: 'historia', semanasQueFaltan: faltanSemanas };

  return {
    // El pulso primero: sin señal no hay nada que anclar, y decirle que haga un
    // test cuando lo que le falta es la cinta del pecho sería mandarle al sitio
    // equivocado.
    alPulso: !h.conPulso ? { por: 'sensor' } : !h.zonasMedidas ? { por: 'ancla' } : h.alPulso.length < 3 ? historia : null,
    // La curva se pinta con un solo día de datos: es una foto, no una tendencia.
    // Lo que falta cuando falta es la SOMBRA, y eso es historia.
    esfuerzos: h.esfuerzos.length === 0 ? historia : null,
    kilometros: h.semanasKm.length === 0 ? historia : null,
    reparto: !h.zonasMedidas ? { por: 'ancla' } : h.segundosCorriendo <= 0 ? historia : null,
    pedido: h.pedido == null ? { por: 'intencion' } : null,
    cansado:
      h.cansado.length === 0
        ? { por: 'ocasion' }
        : h.cansado.reduce((a, c) => Math.max(a, c.parejas), 0) < m.parejasMinimasCansado
          ? historia
          : null,
  };
}
