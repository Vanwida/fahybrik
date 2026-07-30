// (9) DOBLES — la vista donde lo que gobierna la pantalla lo hace OTRA persona.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Tu FC y tu tiempo. Y se acaba ahí, porque **lo que hace tu pareja no lo mide
// tu reloj jamás**: ni su ritmo, ni sus metros, ni cuánto le queda. Cuando el
// relevo es sobre una máquina (remo, ski, bici) tampoco mide el tuyo: eso lo lee
// el móvil por BLE y te lo repite, y por eso llega MARCADO.
//
// Y hay un hecho que ordena la vista entera: `dobles_live_status` tiene **CERO
// filas** — el relevo en vivo no se ha usado nunca. De las 27 carreras de dobles
// reales se guardan el crono y ocho parciales DE EQUIPO, sin reparto por atleta
// y sin un solo tiempo de cambio. Consecuencia directa: **«sales en ~40 s» no se
// puede calcular con nada de lo que hay hoy.** Sólo existe si el móvil tiene
// emparejada la máquina del relevo y puede ver cuánto le queda a tu pareja.
//
// De ahí el interruptor de esta vista, que no es un escenario cosmético:
// `conMaquina`. Sin él no hay estimación en ninguna de las dos fases, y lo único
// honesto que la muñeca puede enseñar mientras esperas es tu propio pulso.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// El sujeto de esta vista no es un número, es una pregunta: **¿trabajas tú o
// esperas?** Y cada respuesta es una pantalla distinta, no un estado de la misma:
//
//   · TRABAJANDO → estás remando. `ojeada`: un dato a sangre y cero controles
//     anunciados. El sujeto es lo que te queda de TU tramo (o tu tiempo dentro
//     de él, si no hay máquina emparejada).
//   · ESPERANDO  → y aquí está el giro. Cuando trabaja tu pareja, **TU SALIDA es
//     el sujeto**, y además es el momento más «tocable» de todo el entreno: de
//     pie, manos libres, mirando el reloj. `mando`, sin discusión.
//
// El cambio lo declara el atleta con un toque, siempre. Cuando hay estimación el
// reloj lo ANUNCIA (los últimos segundos en naranja y un destello al llegar a
// cero), pero anunciar no es medir: quien sabe que el relevo se ha hecho es el
// que entra, no el reloj.
//
// ── DÓNDE ME CHIRRIÓ EL MODELO ─────────────────────────────────────────────
// En fuerza, el descanso tiñe el lienzo de verde porque el verde ahí es un
// ESTADO (recuperación) y el sujeto es una cuenta atrás. Aquí no se puede hacer
// lo mismo: en la espera a ciegas el sujeto ES un pulso sin zona, y un fondo
// verde detrás de un pulso se leería como «estás en zona verde», que es pintar
// una suposición con cara de medida (§7). Así que la espera NO se tiñe: quién
// trabaja lo dice el bisel, que es exactamente para lo que existe `AroRelevo`.

import {
  NOTA,
  distanciaMedida,
  paginaPulso,
  paginaTiempo,
  tonoUrgente,
  unidadDistancia,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { DOBLES, ERGO, SIN_ANCLA, rampa } from '../../datos-reloj';

export type Fase = 'trabajo' | 'espera';

export interface Estado {
  ancla: Ancla;
  fase: Fase;
  /**
   * ¿El móvil tiene emparejada la máquina del relevo? Es lo único que separa
   * «sales en ~40 s» de «no hay nada que estimar», y hoy la base entera está
   * del lado de `false`.
   */
  conMaquina: boolean;
  /** Segundos dentro de la fase. */
  t: number;
}

export interface Gestos {
  /** El cambio. Lo declara el atleta porque NADIE lo mide. */
  cambio: () => void;
}

/** Dónde estás cuando no te toca. La pareja no se nombra: es «tu pareja». */
const CONTEXTO_ESPERA = `Espera · rema ${DOBLES.pareja}`;

/** Metros por segundo del remo, del único split real que hay en la base. */
const REMO_MS = ERGO.tramoM / ERGO.ritmoSec500;

/**
 * Tu pulso. Sube hacia el de trabajo mientras remas y baja mientras esperas —
 * las tres cifras son las de la constante, y la rampa sólo les da la forma.
 *
 * El reloj mide esto SIEMPRE que lo lleves puesto: es el único dato de esta
 * vista que no depende de que haya nada emparejado.
 */
export function bpmDe(e: Estado): number {
  return e.fase === 'espera'
    ? rampa(DOBLES.fcEsperaDesde, DOBLES.fcEsperaHasta, e.t, DOBLES.esperaS)
    : rampa(DOBLES.fcEsperaHasta, DOBLES.fcTrabajo, e.t, DOBLES.esperaS);
}

/**
 * Los metros que te faltan de TU tramo. **`null` sin máquina emparejada**: el
 * reloj no ve el remo, así que sin el móvil delante estos metros no existen.
 */
export function metrosQueFaltan(e: Estado): number | null {
  if (!e.conMaquina || e.fase !== 'trabajo') return null;
  return Math.max(0, DOBLES.tramoM - (DOBLES.desdeM + e.t * REMO_MS));
}

/**
 * Lo que le queda a tu pareja. **`null` es la realidad de hoy**: nadie mide su
 * trabajo, así que no hay salida que anunciar y el sujeto tiene que degradar.
 */
export function quedaEspera(e: Estado): number | null {
  if (!e.conMaquina || e.fase !== 'espera') return null;
  return Math.max(0, DOBLES.esperaS - e.t);
}

/**
 * Lo que se enciende del bisel, y va con la misma regla que el For Time: **sólo
 * se rellena lo que se mide**.
 *
 * Con la máquina emparejada sabemos tus metros, así que tu mitad se rellena de
 * verdad. De tu pareja sabemos lo que le QUEDA pero no cuánto era su tramo
 * entero, así que su mitad se enciende del todo: en un relevo la mitad no dice
 * «cuánto falta», dice **de quién es esto ahora**, y para eso no hace falta
 * estimar nada. Sin máquina, las dos se comportan igual.
 */
export function fraccionRelevo(e: Estado): number {
  const faltan = metrosQueFaltan(e);
  return faltan == null ? 1 : 1 - faltan / DOBLES.tramoM;
}

/**
 * La página del pulso, de segundo. `bpmDe` nunca devuelve null —la constante
 * trae FC de las dos fases— así que `paginaPulso` tampoco: tu pulso es lo único
 * de esta vista que no se puede caer.
 */
function pagPulso(e: Estado, bpm: number): PaginaReloj {
  return paginaPulso({ bpm, ancla: e.ancla })!;
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const bpm = bpmDe(e);

  if (e.fase === 'espera') {
    const queda = quedaEspera(e);

    if (queda == null) {
      // EL MÍNIMO, Y ES EL 100 % DE LA REALIDAD: esperas y no hay NADA que
      // estimar. El sujeto degrada a tu pulso bajando, que además es lo útil —
      // te dice si vas a entrar recuperado. Una página, y no falta ninguna.
      return [
        {
          ...paginaPulso({ bpm, ancla: e.ancla, modo: 'mando', contexto: CONTEXTO_ESPERA })!,
          id: 'espera',
          accion: { etiqueta: 'Toca · cambio', onToca: g.cambio },
          // De las dos verdades que caben en la nota (no hay umbral, no hay
          // máquina) gana ésta: que no haya zona ya se ve —el segundo nivel
          // pone «ppm» y no un nombre de zona—, pero que el trabajo de tu
          // pareja no se mide no se ve por ningún lado, y sin decirlo la
          // pantalla parece estar siguiéndola.
          nota: NOTA.sinMaquina,
        },
      ];
    }

    return [
      {
        id: 'salida',
        contexto: CONTEXTO_ESPERA,
        // De pie, manos libres, mirando el reloj: el momento más tocable de
        // todo el entreno.
        modo: 'mando',
        // La virgulilla NO es decoración: es la marca de que esto es una
        // estimación del móvil y no una medida. No se cae ni en los últimos
        // segundos, que es justo cuando más tentador sería fingir precisión.
        sujeto: { texto: `~${queda}`, unidad: 's', tono: tonoUrgente(queda) },
        segundo: { valor: 'Te toca' },
        accion: { etiqueta: 'Toca · cambio', onToca: g.cambio },
        nota: NOTA.delMovil,
      },
      pagPulso(e, bpm),
    ];
  }

  const faltan = metrosQueFaltan(e);
  const tramo: PaginaReloj =
    faltan == null
      ? {
          // Sin máquina, de tu propio tramo el reloj sólo sabe cuánto llevas
          // remando. Es poco, pero es TUYO y es medido.
          ...paginaTiempo({ segundos: e.t, contexto: 'Remas tú', nota: NOTA.sinMaquina }),
          accion: { etiqueta: 'Al acabar · toca', onToca: g.cambio },
        }
      : {
          id: 'tramo',
          contexto: 'Remas tú · faltan',
          modo: 'ojeada',
          sujeto: { texto: distanciaMedida(faltan), unidad: unidadDistancia(faltan) },
          accion: { etiqueta: 'Al acabar · toca', onToca: g.cambio },
          // El reloj no ve la máquina: estos metros los lee el móvil y él sólo
          // los repite.
          nota: NOTA.delMovil,
        };

  return [tramo, pagPulso(e, bpm)];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { cambio: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

const CIEGO = { ancla: SIN_ANCLA, conMaquina: false } as const;
const CON_MAQUINA = { ancla: SIN_ANCLA, conMaquina: true } as const;

export const CASOS = [
  caso('espera a ciegas', { ...CIEGO, fase: 'espera', t: 12 }),
  caso('trabajo a ciegas', { ...CIEGO, fase: 'trabajo', t: 18 }),
  caso('espera con estimación', { ...CON_MAQUINA, fase: 'espera', t: 0 }),
  // Los últimos segundos: el sujeto se queda en dos glifos y se pone naranja,
  // y la virgulilla sigue ahí.
  caso('espera · 3-2-1', { ...CON_MAQUINA, fase: 'espera', t: 38 }),
  caso('trabajo con máquina', { ...CON_MAQUINA, fase: 'trabajo', t: 5 }),
  // Te has pasado de tu tramo y sigues remando: los metros se quedan en cero y
  // el cambio sigue esperando a que lo digas tú.
  caso('trabajo · metros a cero', { ...CON_MAQUINA, fase: 'trabajo', t: 60 }),
] as const;
