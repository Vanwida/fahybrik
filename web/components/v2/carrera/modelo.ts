// EL MODELO DE LA LECTURA DE UNA CARRERA — qué número manda, y por qué.
//
// Este fichero es el hermano de `modelo.ts` del doble (`design-twin/screens/
// lectura-carrera/modelo.ts`), que decide lo mismo para el atleta. Deciden IGUAL
// porque la lectura es una propiedad de la CARRERA, no de quien la mira: si el
// atleta corrió un 6×800 con banda, la pregunta es si las clavó, mire quien
// mire. Lo único que cambia es la boca (ver `voz.ts`).
//
// SE LLAMA IGUAL QUE EL DEL DOBLE A PROPÓSITO. Son la misma pieza escrita dos
// veces: aquí sobre los tipos del cable, allí sobre los de la maqueta. Debería
// vivir UNA vez en `shared/domain/running/` con un tipo de entrada neutro —y
// `decidirLectura` ya lo tiene, no toca `CoachSessionDetail` por ningún lado—
// para que las dos superficies la llamen. Mientras eso no exista, la copia está
// declarada, no escondida.
//
// LO QUE NO SE DECIDE AQUÍ: el veredicto por tramo y su agregado los emite el
// servidor con el motor compartido. Este módulo los LEE.

import type { RecoveryMode } from '@fahybrid/shared/domain/prescription';
import type {
  RecoveryComplianceVerdict,
  RecoveryDurationVerdict,
  RunComplianceSummary,
  RunComplianceVerdict,
  WorkDurationVerdict,
} from '@fahybrid/shared/domain/adherence';
import { bandaComun, peorDesvio } from './banda';

// ---------------------------------------------------------------------------
// MÉTODO, no mecanismo (HARD RULE Nº0) — nacen como DEFECTO EDITABLE del coach
// ---------------------------------------------------------------------------

/**
 * A partir de qué pendiente media el ritmo bruto deja de ser comparable y el
 * troceado pasa a medirse en TIEMPO. Otro entrenador competente lo pondría en
 * otro sitio (hay quien corrige el ritmo por pendiente en vez de retirarlo), así
 * que es método: valor por defecto, nunca una constante enterrada. Espeja
 * `PENDIENTE_QUE_RETIRA_EL_RITMO_PCT` del doble a propósito.
 */
export const PENDIENTE_QUE_RETIRA_EL_RITMO_PCT = 3;

/**
 * Cuántos tramos de trabajo hacen falta para que el veredicto sea el SUJETO. Con
 * uno solo, «1 de 1 en banda» no es una lectura: es la media con un sello
 * encima, y así se pinta.
 */
export const MIN_TRAMOS_PARA_VEREDICTO = 2;

// ---------------------------------------------------------------------------
// Lo que se lee de un tramo
// ---------------------------------------------------------------------------

export type Papel = 'trabajo' | 'recuperacion';

export interface TramoLeido {
  /** Ordinal de la fila ejecutada. Clave con la que se casó su veredicto. */
  position: number;
  /** Numeración 1..N sobre las de TRABAJO. Las recuperaciones no se numeran:
   *  el atleta las nombra por la serie que cierran, no por sí mismas. */
  n: number | null;
  papel: Papel;
  fase: 'warmup' | 'main' | 'cooldown';
  /** Cómo se pidió recuperar. Sale de la PRESCRIPCIÓN: la ejecución no graba en
   *  qué modo se recuperó, y no se infiere de un umbral de ritmo inventado. */
  modo: RecoveryMode | null;
  distanciaM: number | null;
  duracionS: number | null;
  ritmoSkm: number | null;
  fcMediaPpm: number | null;
  pendientePct: number | null;
  /** Segundos desde el inicio de la ejecución, que es el cero de la traza. Null
   *  cuando el cable no trae ancla temporal: entonces el tramo existe y se lee
   *  en la tabla, pero no se puede situar sobre la curva. */
  inicioS: number | null;
  /** Intensidad. Dos vocabularios porque son dos preguntas con dos direcciones
   *  de fallo: el trabajo puede irse por rápido o por lento, una recuperación
   *  solo puede fallar por ir demasiado fuerte. */
  veredicto: RunComplianceVerdict | RecoveryComplianceVerdict | null;
  /** Duración. Pregunta INDEPENDIENTE de la intensidad, nunca mezclada con ella
   *  en un número: un tramo puede estar en banda de ritmo y haberse quedado
   *  corto de tiempo, y las dos cosas importan. */
  veredictoDuracion: WorkDurationVerdict | RecoveryDurationVerdict | null;
  /** La banda de RITMO que se le pidió, en s/km, para poder dibujarla sobre la
   *  curva. Null cuando el objetivo no era un ritmo (zona de pulso, RPE) o
   *  cuando no había objetivo: entonces no hay franja que pintar, y no se
   *  inventa una. */
  banda: { rapidoSkm: number; lentoSkm: number } | null;
}

export type Sujeto =
  /** 1 · Hubo objetivo medible y varios tramos: ¿los clavó? */
  | {
      clase: 'veredicto';
      dentro: number;
      evaluables: number;
      sesgo: Sesgo | null;
      fueraRapido: number;
      fueraLento: number;
      mediaTrabajoSkm: number | null;
      /** Cuánto se fue el peor, contra el BORDE de banda que rompió (no contra
       *  el centro): es la distancia real a lo que se le pidió. Null si ningún
       *  tramo tenía banda de ritmo con la que medirlo. */
      peorDesvioS: number | null;
      /** La banda pedida, cuando todos los tramos de trabajo compartían una.
       *  Con bandas distintas no hay UNA banda que escribir, y no se escribe. */
      banda: { rapidoSkm: number; lentoSkm: number } | null;
    }
  /** 2 · Hubo contraste sin objetivo: manda el contraste. */
  | {
      clase: 'contraste';
      nFuertes: number;
      fuerteSkm: number;
      suaveSkm: number | null;
      contrasteSkm: number | null;
      recuperacion: RecoveryMode | null;
    }
  /** 3 · Objetivo de zona sobre trabajo continuo: el tiempo dentro de ella. */
  | { clase: 'tiempo-en-zona'; zona: number; segundos: number; pct: number }
  /** 4 · Uniforme: el ritmo medio, con el veredicto de apoyo si lo hubo. */
  | { clase: 'ritmo-medio'; skm: number; veredicto: RunComplianceVerdict | null }
  /** 5 · En cuesta el ritmo no se compara: el tiempo por tramo y la caída. */
  | {
      clase: 'tiempo-por-tramo';
      nTramos: number;
      mediaS: number;
      primeraS: number;
      ultimaS: number;
      pendientePct: number;
    }
  /** 6 · Sin archivo: lo que sí se midió, diciendo por qué no hay más. */
  | { clase: 'sin-archivo'; distanciaM: number | null; porque: string };

/** Hacia dónde se fue lo que se salió. Es lo que de verdad informa al coach. */
export type Sesgo = 'lento' | 'rapido' | 'mixto';

// ---------------------------------------------------------------------------
// Medias
// ---------------------------------------------------------------------------

/** Ponderada por duración: cuatro tramos de 3′ y uno de 30″ no pesan igual. */
function mediaSkm(tramos: TramoLeido[]): number | null {
  const con = tramos.filter((t) => t.ritmoSkm != null && t.duracionS != null && t.duracionS > 0);
  if (con.length === 0) return null;
  const total = con.reduce((a, t) => a + t.duracionS!, 0);
  if (total <= 0) return null;
  return con.reduce((a, t) => a + t.ritmoSkm! * t.duracionS!, 0) / total;
}

function sesgoDe(fueraRapido: number, fueraLento: number): Sesgo | null {
  if (fueraRapido === 0 && fueraLento === 0) return null;
  if (fueraRapido > 0 && fueraLento > 0) return 'mixto';
  return fueraLento > 0 ? 'lento' : 'rapido';
}

/** Media de pendiente de los tramos que la declararon. Sin ninguno, null: la
 *  ausencia de pendiente no es pendiente cero, y con cero nunca se retiraría el
 *  ritmo de una cuesta que sí lo era. */
function pendienteMedia(tramos: TramoLeido[]): number | null {
  const con = tramos.filter((t) => t.pendientePct != null);
  if (con.length === 0) return null;
  return con.reduce((a, t) => a + t.pendientePct!, 0) / con.length;
}

/** Suma de lo que midió cada tramo. Sin ninguno, null: la ausencia de medida no
 *  es cero. */
function distanciaTotal(tramos: TramoLeido[]): number | null {
  const con = tramos.filter((t) => t.distanciaM != null);
  if (con.length === 0) return null;
  return con.reduce((a, t) => a + t.distanciaM!, 0);
}


// ---------------------------------------------------------------------------
// La precedencia — quién gana el número grande
// ---------------------------------------------------------------------------

/**
 * Lo que la decisión necesita saber de la sesión, sin depender de la forma del
 * cable. Es a propósito: el día que esto viva en `shared/`, la app del atleta lo
 * rellena con lo suyo y la decisión no se entera.
 */
export interface ContextoDeLectura {
  /** Hay archivo, así que se pudieron derivar curva y kilómetros. */
  hayCurva: boolean;
  /** Cuántos kilómetros trajo la traza. Sin ellos no hay troceado por km. */
  nKilometros: number;
  /** La zona de PULSO pedida, cuando el objetivo de la línea era una zona. */
  zonaPedida: number | null;
  /** Segundos medidos dentro de esa zona. Null si no se midió pulso. */
  segundosEnZona: number | null;
  /** El veredicto cuando hay UN solo tramo evaluable en toda la sesión. */
  veredictoUnico: RunComplianceVerdict | null;
}

export interface Decision {
  sujeto: Sujeto;
  /** NUNCA los dos: los kilómetros de un 6×800 parten las series por la mitad,
   *  y los tramos de un rodaje no existen. */
  troceado: 'tramos' | 'kilometros' | 'ninguno';
  /** El eje en el que se lee cada tramo. En cuesta, el tiempo. */
  eje: 'ritmo' | 'tiempo';
}

/**
 * QUIÉN GANA EL NÚMERO GRANDE. La precedencia no es una lista de casos: es el
 * orden en que la carrera pierde información. Mientras haya intención medible y
 * tramos que medir, el sujeto es si los clavó; cuando falta la intención queda
 * el contraste; cuando falta la estructura queda la media o el tiempo en zona; y
 * cuando no queda nada medible, los totales, diciendo por qué.
 *
 * EL ARCHIVO NO MANDA SOBRE EL TROCEADO POR TRAMOS, y confundirlo escondía la
 * mitad de la lectura de toda sesión ya guardada. La traza sirve la CURVA y los
 * KILÓMETROS; los tramos y sus veredictos salen de la ejecución, que existe
 * desde mucho antes. Una sesión con seis series medidas y juzgadas se lee entera
 * aunque no haya ni un punto de señal: lo que falta es el dibujo, no el dato.
 */
export function decidirLectura(
  tramos: TramoLeido[],
  resumen: RunComplianceSummary,
  ctx: ContextoDeLectura,
): Decision {
  const porKm: Decision['troceado'] = ctx.nKilometros > 0 ? 'kilometros' : 'ninguno';
  const trabajo = tramos.filter((t) => t.papel === 'trabajo' && t.fase === 'main');

  // ── Con tramos de trabajo ──────────────────────────────────────────────────
  if (trabajo.length >= MIN_TRAMOS_PARA_VEREDICTO) {
    // El corrector, y no es un caso especial: en cuesta el ritmo bruto no se
    // compara, así que el eje del troceado pasa a TIEMPO y el veredicto de
    // ritmo se retira en vez de emitirse mal.
    const pendiente = pendienteMedia(trabajo);
    if (pendiente != null && pendiente >= PENDIENTE_QUE_RETIRA_EL_RITMO_PCT) {
      const tiempos = trabajo.map((t) => t.duracionS).filter((s): s is number => s != null);
      if (tiempos.length >= MIN_TRAMOS_PARA_VEREDICTO) {
        return {
          sujeto: {
            clase: 'tiempo-por-tramo',
            nTramos: tiempos.length,
            mediaS: tiempos.reduce((a, s) => a + s, 0) / tiempos.length,
            primeraS: tiempos[0]!,
            ultimaS: tiempos[tiempos.length - 1]!,
            pendientePct: pendiente,
          },
          troceado: 'tramos',
          eje: 'tiempo',
        };
      }
    }

    // Hubo objetivo medible: el sujeto es si los clavó. El agregado sale del
    // servidor, no se vuelve a contar aquí.
    if (resumen.evaluable > 0) {
      return {
        sujeto: {
          clase: 'veredicto',
          dentro: resumen.dentro,
          evaluables: resumen.evaluable,
          sesgo: sesgoDe(resumen.fuera_rapido, resumen.fuera_lento),
          fueraRapido: resumen.fuera_rapido,
          fueraLento: resumen.fuera_lento,
          mediaTrabajoSkm: mediaSkm(trabajo),
          peorDesvioS: peorDesvio(trabajo),
          banda: bandaComun(trabajo),
        },
        troceado: 'tramos',
        eje: 'ritmo',
      };
    }

    // Hubo contraste sin objetivo: manda el contraste.
    const recuperaciones = tramos.filter((t) => t.papel === 'recuperacion');
    const fuerteSkm = mediaSkm(trabajo);
    if (fuerteSkm != null) {
      const suaveSkm = mediaSkm(recuperaciones);
      return {
        sujeto: {
          clase: 'contraste',
          nFuertes: trabajo.length,
          fuerteSkm,
          suaveSkm,
          contrasteSkm: suaveSkm != null ? suaveSkm - fuerteSkm : null,
          recuperacion: recuperaciones.find((r) => r.modo != null)?.modo ?? null,
        },
        troceado: 'tramos',
        eje: 'ritmo',
      };
    }
  }

  // ── Trabajo continuo ───────────────────────────────────────────────────────
  const total = tramos.reduce((a, t) => a + (t.duracionS ?? 0), 0);
  if (ctx.zonaPedida != null && ctx.segundosEnZona != null && ctx.segundosEnZona > 0 && total > 0) {
    return {
      sujeto: {
        clase: 'tiempo-en-zona',
        zona: ctx.zonaPedida,
        segundos: ctx.segundosEnZona,
        pct: Math.round((ctx.segundosEnZona / total) * 100),
      },
      troceado: porKm,
      eje: 'ritmo',
    };
  }

  const media = mediaSkm(tramos);
  if (media == null) {
    // Ni tramos que leer ni un ritmo que promediar. Lo único honesto que queda
    // son los totales, y el porqué cambia según si falta el archivo o el ritmo.
    return {
      sujeto: {
        clase: 'sin-archivo',
        distanciaM: distanciaTotal(tramos),
        porque: ctx.hayCurva
          ? 'No se midió ritmo en ningún tramo de esta carrera.'
          : 'Esta carrera es anterior al archivo: se guardó el total, no el minuto a minuto.',
      },
      troceado: porKm,
      eje: 'ritmo',
    };
  }
  return {
    sujeto: {
      clase: 'ritmo-medio',
      skm: media,
      // Con un solo tramo evaluable el veredicto de la sesión ES el suyo.
      veredicto: resumen.evaluable === 1 ? ctx.veredictoUnico : null,
    },
    troceado: porKm,
    eje: 'ritmo',
  };
}
