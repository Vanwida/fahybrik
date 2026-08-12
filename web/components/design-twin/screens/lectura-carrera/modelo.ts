// EL MODELO DE LA LECTURA DE UNA CARRERA — qué número manda, y por qué.
//
// `tramos.ts` (29-jul) ya resolvía media pregunta: si la carrera fue UNA cosa,
// la media la describe; si fue dos, no. Le faltaba la mitad que ahora existe:
// **la intención del coach**. Con la traza archivada (T0) y la prescripción, la
// pregunta que el atleta trae al abrir esto deja de ser «¿a cuánto fui?» y pasa
// a ser «¿las hice?» — y ninguna otra app puede contestarla porque ninguna sabe
// qué le pidieron.
//
// EL MODELO ENTERO, no el caso de delante. Una lectura de carrera se decide con
// tres ejes y nada más:
//
//   INTENCIÓN   ninguna · banda de ritmo · zona · sensación (RPE, sin número)
//   ARCHIVO     sin traza · con traza (ritmo, pulso, distancia, altitud)
//   FORMA       continua · con repeticiones
//
// y un CORRECTOR que no es un caso especial sino una propiedad del eje: en
// pendiente el ritmo bruto no es comparable, así que el troceado se mide en
// TIEMPO. Con eso los siete escenarios de la prueba entran sin texto libre.
//
// EL MECANISMO ES NUESTRO, EL MÉTODO ES DEL COACH (Regla Nº0). El veredicto por
// repetición NO se reimplementa aquí: se llama a `evaluateRunSegment` de
// `@fahybrid/shared/domain/adherence`, el mismo motor que juzga la sesión en el
// panel del coach. Dos motores para el mismo hecho es cómo coach y atleta
// acaban leyendo veredictos distintos de la misma serie.

import {
  evaluateRunSegment,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';
import type { Zona } from '../../kit-vivo';

// ---------------------------------------------------------------------------
// Lo que se sabe de la carrera
// ---------------------------------------------------------------------------

/** Lo que pidió el coach. Cuatro clases, y ninguna más hace falta. */
export type Objetivo =
  /** Salió a correr y ya está. No hay intención que contrastar. */
  | { clase: 'ninguno' }
  /** «a 3:30» o «entre 4:40 y 4:50» — ya resuelto a banda (el punto lleva su
   *  tolerancia aplicada por `paceBandFromTarget`). */
  | { clase: 'ritmo'; rapidoSkm: number; lentoSkm: number }
  /** «en Z2» — se mide por el pulso, que es la señal que la traza sí trae. */
  | { clase: 'zona'; zona: Zona; minPpm: number; maxPpm: number }
  /** «fuerte / suave», «al 8 de esfuerzo»: hay intención, no hay número contra
   *  el que medir una repetición. El contraste es todo lo que se puede leer. */
  | { clase: 'sensacion' };

/** Un tramo tal y como lo cerró el entreno, o como lo detectó la señal. */
export interface Repeticion {
  /** 1..N sobre las de TRABAJO. Las recuperaciones heredan el número de la que
   *  cierran, porque es como las cuenta el atleta («el trote de la tercera»). */
  n: number;
  papel: 'trabajo' | 'recuperacion';
  /** Solo en recuperación: cómo se recuperó. Cambia lo que se puede enseñar —
   *  un parado no tiene ritmo y no se le inventa uno. */
  modo?: 'trote' | 'andando' | 'parado';
  inicioS: number;
  duracionS: number;
  distanciaM: number | null;
  ritmoSkm: number | null;
  fcMediaPpm: number | null;
  /** Pendiente media del tramo, en %. Nula sin altitud archivada. */
  pendientePct: number | null;
}

/** Un kilómetro, DERIVADO de la traza — nunca persistido (DECISIONS 11-ago). */
export interface Kilometro {
  n: number;
  parcial: boolean;
  distanciaM: number;
  /** Instante del cruce, en s desde el inicio. Es lo que sitúa la marca sobre
   *  la curva — dibujarla por reparto igual del ancho la pondría donde no fue. */
  cruceS: number;
  ritmoSkm: number | null;
  fcMediaPpm: number | null;
  /** Por qué este kilómetro no tiene ritmo. Se escribe en lugar de la cifra;
   *  jamás un guion (§7 del CONTRATO-UI). */
  sinCobertura: string | null;
}

/** Una señal archivada: eje explícito, cadencia variable, huecos SIN rellenar. */
export interface Muestra {
  t: number;
  v: number;
}

export interface Traza {
  /** s/km. Derivado de la velocidad al leer — nunca se emite `pace` (DECISIONS). */
  ritmo: Muestra[];
  /** ppm. */
  pulso: Muestra[];
}

/** Un punto de la ruta, ya normalizado a 0..1 y con su zona de ritmo. */
export interface PuntoRuta {
  x: number;
  y: number;
  zona: Zona | null;
}

export interface Carrera {
  titulo: string;
  /** «Hoy» · «Martes 22 de julio». Va en el cromo, a la derecha. */
  cuando: string;
  /** Acabas de terminar (hay algo que guardar) o la abres del historial. */
  momento: 'al-terminar' | 'revision';
  /** La línea del coach, tal y como la escribió. Nula = entreno libre. */
  prescrito: string | null;
  objetivo: Objetivo;
  superficie: 'calle' | 'cinta';
  distanciaM: number;
  duracionS: number;
  fcMediaPpm: number | null;
  fcMaxPpm: number | null;
  desnivelM: number | null;
  /** Nula = sesión sin archivo. No es un error: es una carrera anterior a la
   *  tanda del archivo, y se dice. */
  traza: Traza | null;
  repeticiones: Repeticion[];
  /**
   * De dónde salen los tramos. Un tramo INFERIDO del ritmo no puede leerse
   * igual que uno que cerró el entreno (§7), y se escribe bajo el troceado.
   * Nulo = no hay tramos que calificar.
   */
  certezaTramos: 'marcados' | 'detectados' | null;
  kilometros: Kilometro[];
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  /** Solo lo que tenga número. Un campo ausente no se pinta. */
  derivado: {
    /** Cuánto más lento fue el ritmo en la segunda mitad al MISMO pulso. */
    derivaSkm?: number;
    /** Cuánto bajó el pulso en el minuto siguiente a parar. */
    bajadaPulsoPpm?: number;
  };
  /** Vacía en cinta, y en calle sin GPS. */
  ruta: PuntoRuta[];
  /** Lo que el atleta ya contestó, cuando la sesión se abre del historial.
   *  Ausente = no contestó nada, y entonces no hay nada que enseñar. */
  dicho?: { rpe?: number; dificultad?: 'too_easy' | 'as_expected' | 'too_hard' };
  /** De dónde salen los números de esta escena. El doble no finge producción. */
  procedencia: string;
}

// ---------------------------------------------------------------------------
// MÉTODO, no mecanismo (Regla Nº0) — nacen como DEFECTO EDITABLE del coach
// ---------------------------------------------------------------------------

/**
 * A partir de qué pendiente media el ritmo bruto deja de ser comparable y el
 * troceado pasa a medirse en TIEMPO. Otro entrenador competente lo pondría en
 * otro sitio (hay quien corrige el ritmo por pendiente en vez de retirarlo), así
 * que esto es método: valor por defecto, nunca una constante enterrada.
 */
export const PENDIENTE_QUE_RETIRA_EL_RITMO_PCT = 3;

/**
 * Cuántas repeticiones de trabajo hacen falta para que el veredicto sea el
 * SUJETO. Con una sola, «1 de 1 dentro» no es una lectura: es la media con un
 * sello encima, y así se pinta.
 */
export const MIN_REPETICIONES_PARA_VEREDICTO = 2;

/**
 * Hueco máximo (s) entre dos muestras para seguir dibujando línea entre ellas.
 * MECANISMO, no método: espeja `MAX_INTERPOLATION_GAP_S` de `km-splits.ts` —
 * un hueco es un hueco y tiene que verse, jamás se rellena.
 */
export const HUECO_QUE_PARTE_LA_CURVA_S = 30;

// ---------------------------------------------------------------------------
// El sujeto — uno por lectura, y solo uno
// ---------------------------------------------------------------------------

/** Hacia dónde se fue lo que se salió. Es lo que de verdad informa al coach. */
export type Sesgo = 'lento' | 'rapido' | 'mixto';

export type Sujeto =
  /** 1 · Hubo objetivo medible y varias repeticiones: ¿las hizo? */
  | {
      clase: 'veredicto';
      dentro: number;
      evaluables: number;
      sesgo: Sesgo | null;
      /** Cuánto se fue la peor, contra el borde de la banda que rompió. */
      peorDesvioS: number | null;
      mediaTrabajoSkm: number;
    }
  /** 2 · Hubo contraste sin objetivo: manda el contraste. */
  | {
      clase: 'contraste';
      nFuertes: number;
      fuerteSkm: number;
      suaveSkm: number | null;
      contrasteSkm: number | null;
      /** Cómo se recuperó, cuando la recuperación no tiene ritmo que enseñar. */
      recuperacion: 'trote' | 'andando' | 'parado' | null;
    }
  /** 3 · Uniforme con objetivo de zona: el tiempo dentro de la zona pedida. */
  | { clase: 'tiempo-en-zona'; zona: Zona; segundos: number; pct: number }
  /** 4 · Uniforme sin objetivo (o con banda, que baja a apoyo): el ritmo medio. */
  | { clase: 'ritmo-medio'; skm: number; veredicto: RunComplianceVerdict | null }
  /** 5 · El ritmo no se compara en cuesta: el tiempo por repetición y la caída. */
  | {
      clase: 'tiempo-por-repeticion';
      nRepeticiones: number;
      mediaS: number;
      primeraS: number;
      ultimaS: number;
      pendientePct: number;
    }
  /** 6 · Sin cobertura: lo que sí se midió, declarando por qué no hay más. */
  | { clase: 'kilometros'; km: number; porque: string };

export interface Lectura {
  sujeto: Sujeto;
  /** El troceado que corresponde. Nunca los dos a la vez. */
  troceado: 'repeticiones' | 'kilometros' | 'ninguno';
  /** El eje en el que se lee cada repetición. En cuesta, el tiempo. */
  eje: 'ritmo' | 'tiempo';
  /** La franja objetivo, dibujada sobre el eje donde de verdad vive. */
  banda:
    | { eje: 'ritmo'; rapidoSkm: number; lentoSkm: number }
    | { eje: 'pulso'; minPpm: number; maxPpm: number; zona: Zona }
    | null;
  /** Veredicto por repetición de TRABAJO, en orden. Vacío si no hay banda. */
  veredictos: RunComplianceVerdict[];
}

// ---------------------------------------------------------------------------
// El reparto
// ---------------------------------------------------------------------------

const trabajos = (c: Carrera) => c.repeticiones.filter((r) => r.papel === 'trabajo');

/** Media ponderada por duración: cuatro tramos de 3′ y uno de 30″ no pesan igual. */
function mediaSkm(reps: Repeticion[]): number | null {
  const con = reps.filter((r) => r.ritmoSkm != null);
  if (con.length === 0) return null;
  const t = con.reduce((a, r) => a + r.duracionS, 0);
  return con.reduce((a, r) => a + r.ritmoSkm! * r.duracionS, 0) / t;
}

function bandaDe(o: Objetivo): Lectura['banda'] {
  if (o.clase === 'ritmo') return { eje: 'ritmo', rapidoSkm: o.rapidoSkm, lentoSkm: o.lentoSkm };
  if (o.clase === 'zona') return { eje: 'pulso', minPpm: o.minPpm, maxPpm: o.maxPpm, zona: o.zona };
  return null;
}

/** El desvío de la peor repetición contra el borde de banda que rompió, en s. */
function peorDesvio(reps: Repeticion[], o: Objetivo): number | null {
  if (o.clase !== 'ritmo') return null;
  let peor: number | null = null;
  for (const r of reps) {
    if (r.ritmoSkm == null) continue;
    const fuera =
      r.ritmoSkm > o.lentoSkm ? r.ritmoSkm - o.lentoSkm : r.ritmoSkm < o.rapidoSkm ? o.rapidoSkm - r.ritmoSkm : 0;
    if (fuera > (peor ?? 0)) peor = fuera;
  }
  return peor;
}

function sesgoDe(vs: RunComplianceVerdict[]): Sesgo | null {
  const lentos = vs.filter((v) => v === 'fuera_lento').length;
  const rapidos = vs.filter((v) => v === 'fuera_rapido').length;
  if (lentos === 0 && rapidos === 0) return null;
  if (lentos > 0 && rapidos > 0) return 'mixto';
  return lentos > 0 ? 'lento' : 'rapido';
}

/** El veredicto de un tramo, por el MISMO motor que juzga al coach. */
function veredictoDe(r: Repeticion, o: Objetivo): RunComplianceVerdict {
  if (o.clase === 'ritmo') {
    return evaluateRunSegment({ axis: 'pace', fast_s: o.rapidoSkm, slow_s: o.lentoSkm }, { pace_s: r.ritmoSkm });
  }
  if (o.clase === 'zona') {
    return evaluateRunSegment({ axis: 'hr', min_bpm: o.minPpm, max_bpm: o.maxPpm }, { hr_bpm: r.fcMediaPpm });
  }
  return 'sin_dato';
}

/**
 * QUIÉN GANA EL NÚMERO GRANDE. La precedencia no es una lista de casos: es el
 * orden en que la carrera pierde información. Mientras haya intención medible y
 * tramos que medir, el sujeto es si la clavó; cuando falta la intención queda el
 * contraste; cuando falta la estructura queda la media; cuando falta el archivo
 * quedan los kilómetros, y se dice por qué.
 */
export function lecturaDeCorrer(c: Carrera): Lectura {
  const trabajo = trabajos(c);
  const banda = bandaDe(c.objetivo);

  // ── Sin archivo: no hay curva, no hay tramos, no hay kilómetros ────────────
  if (!c.traza) {
    return {
      sujeto: {
        clase: 'kilometros',
        km: c.distanciaM / 1000,
        porque:
          c.momento === 'revision'
            ? 'Esta carrera es anterior al archivo: se guardó el total, no el minuto a minuto.'
            : 'No se archivó la señal de esta carrera: se guardó el total, no el minuto a minuto.',
      },
      troceado: 'ninguno',
      eje: 'ritmo',
      banda: null,
      veredictos: [],
    };
  }

  // ── Con repeticiones ───────────────────────────────────────────────────────
  if (trabajo.length >= MIN_REPETICIONES_PARA_VEREDICTO) {
    const pendiente = trabajo.map((r) => r.pendientePct ?? 0).reduce((a, p) => a + p, 0) / trabajo.length;

    // El corrector, y no es un caso especial: en cuesta el ritmo no es
    // comparable, así que el eje del troceado pasa a ser el TIEMPO y el
    // veredicto de ritmo se retira en vez de emitirse mal.
    if (pendiente >= PENDIENTE_QUE_RETIRA_EL_RITMO_PCT) {
      const tiempos = trabajo.map((r) => r.duracionS);
      return {
        sujeto: {
          clase: 'tiempo-por-repeticion',
          nRepeticiones: trabajo.length,
          mediaS: tiempos.reduce((a, t) => a + t, 0) / tiempos.length,
          primeraS: tiempos[0]!,
          ultimaS: tiempos[tiempos.length - 1]!,
          pendientePct: pendiente,
        },
        troceado: 'repeticiones',
        eje: 'tiempo',
        banda: null,
        veredictos: [],
      };
    }

    // Hubo objetivo medible: el sujeto es si las hizo.
    if (banda) {
      const veredictos = trabajo.map((r) => veredictoDe(r, c.objetivo));
      const evaluables = veredictos.filter((v) => v !== 'sin_dato').length;
      if (evaluables > 0) {
        return {
          sujeto: {
            clase: 'veredicto',
            dentro: veredictos.filter((v) => v === 'dentro').length,
            evaluables,
            sesgo: sesgoDe(veredictos),
            peorDesvioS: peorDesvio(trabajo, c.objetivo),
            mediaTrabajoSkm: mediaSkm(trabajo) ?? mediaDeLaSesion(c),
          },
          troceado: 'repeticiones',
          eje: 'ritmo',
          banda,
          veredictos,
        };
      }
    }

    // Hubo contraste sin objetivo: manda el contraste.
    const recuperaciones = c.repeticiones.filter((r) => r.papel === 'recuperacion');
    const fuerteSkm = mediaSkm(trabajo);
    const suaveSkm = mediaSkm(recuperaciones);
    if (fuerteSkm != null) {
      return {
        sujeto: {
          clase: 'contraste',
          nFuertes: trabajo.length,
          fuerteSkm,
          suaveSkm,
          contrasteSkm: suaveSkm != null ? suaveSkm - fuerteSkm : null,
          recuperacion: recuperaciones[0]?.modo ?? null,
        },
        troceado: 'repeticiones',
        eje: 'ritmo',
        banda: null,
        veredictos: [],
      };
    }
  }

  // ── Trabajo continuo ───────────────────────────────────────────────────────
  // Objetivo de zona: el sujeto es el tiempo dentro de ella, medido por el
  // pulso — que es la señal que la traza trae en cada muestra.
  if (c.objetivo.clase === 'zona') {
    const enZona = c.zonasS[`z${c.objetivo.zona}` as const] ?? 0;
    if (enZona > 0) {
      return {
        sujeto: {
          clase: 'tiempo-en-zona',
          zona: c.objetivo.zona,
          segundos: enZona,
          pct: Math.round((enZona / c.duracionS) * 100),
        },
        troceado: 'kilometros',
        eje: 'ritmo',
        banda,
        veredictos: [],
      };
    }
  }

  // Uniforme: la media se gana el sujeto, y si había banda la lleva de apoyo.
  // Ponderada por los tramos cuando los hay; geométrica cuando la carrera es una
  // sola pieza, que es exactamente el caso en el que la media SÍ la describe.
  const media = mediaSkm(c.repeticiones) ?? mediaDeLaSesion(c);
  return {
    sujeto: {
      clase: 'ritmo-medio',
      skm: media,
      veredicto:
        c.objetivo.clase === 'ritmo'
          ? evaluateRunSegment(
              { axis: 'pace', fast_s: c.objetivo.rapidoSkm, slow_s: c.objetivo.lentoSkm },
              { pace_s: media },
            )
          : null,
    },
    troceado: 'kilometros',
    eje: 'ritmo',
    banda,
    veredictos: [],
  };
}

/** La media geométrica de la sesión entera: distancia contra tiempo. */
function mediaDeLaSesion(c: Carrera): number {
  return c.duracionS / (c.distanciaM / 1000);
}

// ---------------------------------------------------------------------------
// Vocabulario del veredicto — el MECANISMO es compartido, la VOZ es de aquí
// ---------------------------------------------------------------------------

/**
 * `RUN_COMPLIANCE_LABEL` es del panel del coach («En banda», «Más rápido»). El
 * atleta habla de SUS repeticiones, que son femeninas y no llevan la palabra
 * «banda» en la cabeza. Mismo veredicto, misma clasificación, otra boca.
 */
export const VOZ_ATLETA: Record<RunComplianceVerdict, string> = {
  dentro: 'Dentro',
  fuera_rapido: 'Más rápida',
  fuera_lento: 'Más lenta',
  sin_dato: 'Sin medir',
};

export const TONO_VEREDICTO: Record<RunComplianceVerdict, string> = {
  dentro: 'var(--twin-ok)',
  fuera_rapido: 'var(--twin-warning)',
  fuera_lento: 'var(--twin-warning)',
  sin_dato: 'var(--twin-muted)',
};

/** Cómo se cuenta lo que se salió, en una línea de gimnasio. */
export function fraseSesgo(sesgo: Sesgo | null, fuera: number): string | null {
  if (sesgo == null || fuera === 0) return null;
  const cuantas = fuera === 1 ? 'La que se salió' : `Las ${fuera} que se salieron`;
  if (sesgo === 'mixto') return `${cuantas} se fueron por los dos lados`;
  return `${cuantas} ${fuera === 1 ? 'fue' : 'fueron'} ${sesgo === 'lento' ? 'más lenta' : 'más rápida'}${fuera === 1 ? '' : 's'}`;
}
