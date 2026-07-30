// (6) EMOM — manda el reloj de pared, y el MODO cambia de ronda a ronda sin que
// cambie el formato. Es la vista que mejor demuestra que el modo va por delante.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. Y aquí se nota más que en ninguna otra, porque **todo el EMOM es
// UNA SOLA fila de `segment_executions`** (ejecución 177): la modalidad en
// «other», el ski y la bici sin separar, y ni pulso por ronda ni tarea por ronda
// ni nada contado dentro del minuto. Sólo el agregado y el contador de rondas
// completadas.
//
// De ahí sale la regla que ordena la vista entera: **el «10 de 12 cal» que pide
// el §10.6 no sale de la ejecución.** O lo repite el móvil desde la máquina
// emparejada, en vivo, o no existe. Y ni siquiera con la máquina delante sale el
// «de 12»: esta plantilla prescribe 45 s de ski, no una dosis de calorías, así
// que lo que la muñeca puede contar es LO QUE LLEVAS. El objetivo contra el que
// compararlo no lo escribió nadie, y fabricarlo sería inventarme la otra mitad.
//
// El contraste entre los dos primeros escenarios es justo eso: con ergo
// emparejado, «0 m» al empezar la ronda es legítimo (un CONTADOR se pinta en
// cero, §6.2 bis); sin ergo emparejado no hay un contador a cero — no hay
// contador, y la tarea se pinta como la escribió el coach.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Los tres modos en la MISMA vista, cambiando de ronda a ronda:
//
//   · ronda de ski o de bici → `ojeada`. Las manos están ocupadas pero el cuerpo
//     va estable: puedes echar un vistazo, no puedes ponerte a pulsar.
//   · ronda de burpees       → `ciego`. Estás en el suelo. Ni miras ni tocas.
//   · los segundos de parada → `mando`. De pie, mirando el reloj, decidiendo si
//     te da tiempo a beber.
//
// Mismo formato, tres pantallas distintas. Lo que las separa no es el EMOM: es
// lo que el cuerpo del atleta puede hacer en ese momento.
//
// Sobre la acción «hecha»: el atleta acaba las calorías y EN ESE INSTANTE para y
// sí puede tocar. Por eso las páginas de trabajo declaran `accion` aunque estén
// en `ojeada` — el lienzo no la anuncia (esos 15 pt son del sujeto, corriendo no
// se lee una etiqueta), pero el gesto existe, porque toda la pantalla es el
// blanco y no hay que apuntar a nada.
//
// ── EL SUJETO: EL MINUTO DRENANDO ──────────────────────────────────────────
// Y no cambia al marcar la tarea. Lo que cambia es el COLOR del lienzo: pasa a
// verde y el mismo número se lee como «lo que te queda de respiro». Un dato, dos
// significados, cero pantallas nuevas.
//
// El aro, en cambio, lleva la VENTANA ENTERA de un tirón, cruzando trabajo y
// parada, porque la ventana no se para porque tú acabes antes. El número dice en
// qué tramo estás; el aro dice cuánto le queda al minuto.

import {
  NOTA,
  countdown,
  distanciaMedida,
  paginaPulso,
  tonoUrgente,
  unidadDistancia,
  type Ancla,
  type Modo,
  type PaginaReloj,
} from '../../kit-watch';
import { EMOM, EMOM_A_PULSO, ERGO, SIN_ANCLA, rampa } from '../../datos-reloj';

// ---------------------------------------------------------------------------
// El caso — los dos EMOM que existen, con la misma forma
// ---------------------------------------------------------------------------

export interface TareaEmom {
  /** Cómo la escribió el coach: «Ski 45 s», «10 burpees». */
  texto: string;
  /** ¿Puede mirar el reloj mientras la hace? De aquí sale la pantalla entera. */
  modo: Extract<Modo, 'ciego' | 'ojeada'>;
  /** La máquina de la ronda. `null` = a pulso, y entonces no hay nada que contar. */
  ergo: string | null;
}

export interface CasoEmom {
  procedencia: string;
  rondas: number;
  rondaActual: number;
  /** La ventana entera de una ronda. Es lo que dibuja el aro, de un tirón. */
  ventanaS: number;
  /** Lo que dura el trabajo. Igual a la ventana cuando el coach no separa parada. */
  trabajoS: number;
  /** Las tareas, alternas por ronda. */
  tareas: readonly TareaEmom[];
  fcDesde: number;
  fcHasta: number;
}

/**
 * Ejecución 177: ski y bici alternos, 45 s de trabajo y 15 de parada. La parada
 * la escribió el coach, así que la ventana son 60 s y el trabajo 45.
 */
export const EMOM_MAQUINAS: CasoEmom = {
  procedencia: EMOM.procedencia,
  rondas: EMOM.rondas,
  rondaActual: EMOM.actual,
  ventanaS: EMOM.trabajoS + EMOM.paradaS,
  trabajoS: EMOM.trabajoS,
  tareas: EMOM.movimientos.map((movimiento) => ({
    texto: `${movimiento} ${EMOM.trabajoS} s`,
    modo: 'ojeada' as const,
    ergo: movimiento,
  })),
  fcDesde: EMOM.fcDesde,
  fcHasta: EMOM.fcHasta,
};

/**
 * Plantilla 462: 10 rondas de 60 s a 10 burpees. **El coach no escribió parada**
 * — el respiro es lo que te sobre del minuto, y por eso aquí trabajo y ventana
 * son lo mismo. Es también el único EMOM a pulso que existe, y con él la vista
 * demuestra que el modo manda: mismo formato, otra pantalla.
 */
export const EMOM_BURPEES: CasoEmom = {
  procedencia: EMOM_A_PULSO.procedencia,
  rondas: EMOM_A_PULSO.rondas,
  rondaActual: EMOM_A_PULSO.actual,
  ventanaS: EMOM_A_PULSO.ventanaS,
  trabajoS: EMOM_A_PULSO.ventanaS,
  tareas: [{ texto: EMOM_A_PULSO.tarea, modo: 'ciego', ergo: null }],
  fcDesde: EMOM_A_PULSO.fcDesde,
  fcHasta: EMOM_A_PULSO.fcHasta,
};

/**
 * El ritmo al que corre el contador de metros cuando hay ergo emparejado.
 *
 * NO hay ni una medida de ski ni de bici en toda la base, así que se toma el
 * ÚNICO split de ergo que existe (ejecución 179: 500 m en 119,2 s) y se usa
 * igual para las dos máquinas. Inventarme dos ritmos distintos sería fabricar
 * dos datos donde no hay ninguno; con uno, al menos, se sabe de dónde sale.
 */
const RITMO_ERGO_MS = 500 / ERGO.ritmoSec500;

// ---------------------------------------------------------------------------
// El estado
// ---------------------------------------------------------------------------

export type Fase = 'trabajo' | 'parada';

export interface Estado {
  caso: CasoEmom;
  ancla: Ancla;
  /** Ronda en curso, desde 1. La avanza el reloj de pared, nunca el atleta. */
  ronda: number;
  /** Segundos dentro de la ventana de la ronda, de 0 a `ventanaS`. */
  t: number;
  /** Segundo en el que el atleta marcó la tarea. `null` = aún no la ha marcado. */
  hechaEnS: number | null;
  /** ¿Hay ergo emparejado AL MÓVIL? El reloj no ve la máquina jamás. */
  maquina: boolean;
}

export interface Gestos {
  /** Marcar la tarea de la ronda. Se toca al parar, nunca mientras trabajas. */
  marcarHecha: () => void;
}

export function tareaDe(caso: CasoEmom, ronda: number): TareaEmom {
  return caso.tareas[(ronda - 1) % caso.tareas.length]!;
}

export function faseDe(e: Estado): Fase {
  return e.t < e.caso.trabajoS ? 'trabajo' : 'parada';
}

/** Lo que queda del tramo en el que estás — no de la ventana: eso lo lleva el aro. */
export function quedaDe(e: Estado): number {
  const fin = faseDe(e) === 'trabajo' ? e.caso.trabajoS : e.caso.ventanaS;
  return Math.max(0, fin - e.t);
}

/**
 * La FC. Sube mientras empujas y empieza a bajar en cuanto paras — y «parar» en
 * un EMOM es marcar la tarea o que se acabe el trabajo, lo que llegue antes.
 *
 * La rampa se reinicia en cada ronda a propósito: lo que la ejecución 177 guarda
 * es una media de 140 y una máxima de 156 de toda la sesión, así que el diente
 * de sierra de dentro del minuto es la única forma honesta de repartir ese rango
 * — no hay pulso por ronda que reproducir.
 */
export function bpmDe(e: Estado): number {
  const { fcDesde, fcHasta, trabajoS } = e.caso;
  const paraEn = Math.min(e.hechaEnS ?? trabajoS, trabajoS);
  const pico = rampa(fcDesde, fcHasta, Math.min(e.t, paraEn), trabajoS);
  // 60 s de constante de bajada: en los 15 s del cambio se cae un cuarto del
  // recorrido, que es más o menos lo que baja un pulso de verdad en 15 s.
  return rampa(pico, fcDesde, Math.max(0, e.t - paraEn), 60);
}

/**
 * Los metros que lleva la máquina EN ESTA RONDA. `null` cuando no hay ergo
 * emparejado o cuando la tarea es a pulso: entonces no se pinta un contador a
 * cero, se pinta la tarea como la escribió el coach y no se cuenta nada.
 *
 * Se congela al marcar la tarea, porque al soltar la máquina deja de sumar.
 */
function metrosDe(e: Estado): number | null {
  const tarea = tareaDe(e.caso, e.ronda);
  if (!e.maquina || tarea.ergo == null) return null;
  const trabajado = Math.min(e.hechaEnS ?? e.t, e.caso.trabajoS);
  return Math.floor(RITMO_ERGO_MS * Math.max(0, trabajado));
}

/**
 * El segundo nivel de una ronda de trabajo, que es EL TRABAJO (§10.6): ni va en
 * gris de panel aparte ni es secundario. Con ergo emparejado sube a lo que la
 * máquina lleva contado; sin él, se queda en lo que prescribió el coach.
 */
function segundoTrabajo(e: Estado, tarea: TareaEmom): { etiqueta?: string; valor: string } {
  const metros = metrosDe(e);
  if (tarea.ergo == null || metros == null) return { valor: tarea.texto };
  return {
    etiqueta: tarea.ergo,
    valor: `${distanciaMedida(metros)} ${unidadDistancia(metros)}`,
  };
}

/** De dónde sale lo que se está pintando, dicho al pie y sin rodeos. */
function notaDe(e: Estado, tarea: TareaEmom): string {
  // A pulso no hay máquina que emparejar: la ronda la declaras tú y ya está.
  if (tarea.ergo == null) return NOTA.loDicesTu;
  return e.maquina ? NOTA.delMovil : NOTA.sinMaquina;
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  // El modo es del MOMENTO, no de la página: si el atleta está en el suelo
  // haciendo burpees no puede mirar, esté en la página que esté. Por eso la de
  // pulso hereda el modo de la ronda en vez de quedarse con el `ojeada` que
  // `paginaPulso` trae por defecto.
  const modo: Modo = faseDe(e) === 'parada' ? 'mando' : tareaDe(e.caso, e.ronda).modo;
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla, modo });
  const resto = pulso ? [pulso] : [];
  const queda = quedaDe(e);

  if (faseDe(e) === 'parada') {
    const ultima = e.ronda >= e.caso.rondas;
    const siguiente = ultima ? null : tareaDe(e.caso, e.ronda + 1);
    return [
      {
        id: 'ronda',
        // «Para» y no «Descanso»: en un EMOM estos segundos no son para
        // recuperarse, son para QUITARSE de la máquina antes de que empiece la
        // ronda siguiente. La misma palabra que usa el móvil («Para. Empieza el
        // cambio»), para que el atleta no aprenda dos vocabularios.
        contexto: ultima ? 'Para · se acabó' : `Para · viene la ${e.ronda + 1}`,
        // De pie, manos libres, mirando el reloj: puede mirar y puede tocar.
        modo: 'mando',
        sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
        ...(siguiente ? { segundo: { etiqueta: 'Luego', valor: siguiente.texto } } : {}),
        // Sin nota: la cuenta atrás del cambio la mide el reloj con su propio
        // crono, y un dato que es suyo no necesita decir de dónde viene.
      },
      ...resto,
    ];
  }

  const tarea = tareaDe(e.caso, e.ronda);
  return [
    {
      id: 'ronda',
      contexto: `Ronda ${e.ronda} / ${e.caso.rondas}`,
      // El modo lo pone la TAREA, no el formato. Ski y bici, `ojeada`; burpees,
      // `ciego`. Es el giro entero de esta vista.
      modo: tarea.modo,
      sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
      segundo: segundoTrabajo(e, tarea),
      // La oferta desaparece al marcarla: ya no hay nada que cerrar, y el verde
      // del lienzo dice el resto.
      ...(e.hechaEnS == null
        ? { accion: { etiqueta: 'Al acabar · toca', onToca: g.marcarHecha } }
        : {}),
      nota: notaDe(e, tarea),
    },
    ...resto,
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { marcarHecha: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

const BASE = { ancla: SIN_ANCLA, hechaEnS: null } as const;

export const CASOS = [
  caso('sin máquina · ski', { ...BASE, caso: EMOM_MAQUINAS, ronda: 7, t: 12, maquina: false }),
  caso('con máquina · ski', { ...BASE, caso: EMOM_MAQUINAS, ronda: 7, t: 12, maquina: true }),
  // El arranque de la ronda con ergo: el contador a cero que SÍ es legítimo.
  caso('con máquina · 0 m', { ...BASE, caso: EMOM_MAQUINAS, ronda: 7, t: 0, maquina: true }),
  // Marcada: el sujeto no cambia, cambia el lienzo — y la oferta desaparece.
  caso('marcada · respiro', {
    ...BASE,
    caso: EMOM_MAQUINAS,
    ronda: 7,
    t: 38,
    hechaEnS: 31,
    maquina: true,
  }),
  caso('parada · viene la bici', { ...BASE, caso: EMOM_MAQUINAS, ronda: 7, t: 47, maquina: true }),
  // El último segundo del cambio, que es cuando el numeral pesa más.
  caso('parada · último segundo', { ...BASE, caso: EMOM_MAQUINAS, ronda: 7, t: 59, maquina: true }),
  caso('parada · última ronda', { ...BASE, caso: EMOM_MAQUINAS, ronda: 20, t: 50, maquina: true }),
  caso('a pulso · burpees', { ...BASE, caso: EMOM_BURPEES, ronda: 4, t: 9, maquina: false }),
  // El peor caso de ancho de la vista: el primer segundo de una ventana de 60,
  // que `countdown` escribe «01:00» — cinco glifos, justo en el suelo.
  caso('a pulso · primer segundo', { ...BASE, caso: EMOM_BURPEES, ronda: 4, t: 0, maquina: false }),
] as const;
