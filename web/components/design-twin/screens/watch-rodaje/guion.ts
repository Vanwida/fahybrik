// (1) RODAJE — la modalidad más rica de las nueve, y la única sin una sola
// decisión dentro.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Todo lo suyo: pulso, ritmo y distancia. Corriendo al aire libre el GPS y el
// sensor óptico son del reloj — no de una máquina, no del móvil— así que en
// esta vista no hay un solo dato repetido ni un solo dato declarado. Es, con
// las series de calle, la única de las nueve donde la muñeca puede PROMETER
// ritmo y distancia.
//
// Con una excepción, y es el escenario mínimo: hasta que el GPS no fija, ni el
// ritmo ni la distancia existen. No se pintan a cero — un «0,00 km» es un dato
// falso con cara de medida (§7) —: sus páginas DESAPARECEN, y el rodaje se
// queda en las dos cosas que el reloj mide pase lo que pase, tu pulso y el
// tiempo que llevas.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Correr. Y se acaba ahí. Un rodaje no tiene ninguna decisión dentro: no hay
// series que cerrar, ni descansos que adelantar, ni tareas que marcar. Por eso
// esta vista es `ojeada` DE PRINCIPIO A FIN y no declara ni una `accion` en
// ninguna página — terminar el rodaje es un gesto largo o la corona, no un
// toque que el brazo pueda disparar solo a cinco kilómetros de casa.
//
// Es la única de las nueve sin gestos, y por eso su guion no tiene `Gestos`:
// una interfaz vacía sería fingir que aquí hay algo que tocar.
//
// ── EL SUJETO, Y CÓMO DEGRADA ──────────────────────────────────────────────
// El sujeto del rodaje es TU ZONA, y eso son dos cosas a la vez: el lienzo
// teñido y el pulso como numeral en la primera página. Pero la zona cuelga de
// un ancla de FC que hoy NO TIENE NADIE (`datos-reloj.ts`, hecho 1), así que
// el sujeto tiene que saber degradar — y lo que gobierna un rodaje cuando el
// pulso no es interpretable es el RITMO. El pulso no desaparece: baja de sitio
// y se pinta en ppm crudos, con la nota que dice por qué no hay zona.

import {
  NOTA,
  distanciaMedida,
  pace,
  paginaPulso,
  paginaTiempo,
  unidadDistancia,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { ANCLA_MEDIDA, RODAJE, SIN_ANCLA, rampa } from '../../datos-reloj';

export interface Estado {
  ancla: Ancla;
  /** ¿Ha fijado el GPS? Sin fijar no hay ritmo ni distancia — ni sus páginas. */
  gps: boolean;
  /** Segundos dentro del rodaje. */
  t: number;
}

/** Los metros por segundo del rodaje: 1.000 m cada 312 s. */
export const VELOCIDAD_MS = 1000 / RODAJE.ritmoSecKm;

/**
 * Lo que dura el rodaje entero: 10.000 m a 5:12/km son 52:00. La reproducción
 * se para ahí por dos razones que apuntan al mismo sitio — el rodaje se acabó,
 * y un crono que pasa de la hora son SIETE glifos y deja de ser un sujeto (en
 * la muñeca manda el ancho, `modelo.ts`).
 */
export const DURACION_S = Math.round((RODAJE.distanciaM / 1000) * RODAJE.ritmoSecKm);

/** El segundo en el que arranca la reproducción: el metro 5.240, a mitad. */
export const DESDE_S = Math.round(RODAJE.desdeM / VELOCIDAD_MS);

/**
 * El objetivo, escrito con la MISMA grafía que tendrá la medida al llegar: si
 * el contexto dice «de 10,00 km», cuando llegues el sujeto dirá exactamente
 * eso. Dos grafías del mismo número en la misma pantalla es justo lo que el
 * CONTRATO-UI §2 vino a matar.
 */
const OBJETIVO = `${distanciaMedida(RODAJE.distanciaM)} ${unidadDistancia(RODAJE.distanciaM)}`;

function transcurrido(t: number): number {
  return Math.min(Math.max(0, t), DURACION_S);
}

/** Los metros cubiertos, a ritmo constante. Al llegar a los 10.000 se quedan. */
export function metrosDe(e: Estado): number {
  return transcurrido(e.t) * VELOCIDAD_MS;
}

/**
 * El pulso deriva despacio de la media a la máxima a lo largo del rodaje: 150
 * al salir, 158 al final. Son los dos únicos valores de FC que la ejecución
 * 145 dejó, y no se inventa una tercera cifra entre medias.
 */
export function bpmDe(e: Estado): number {
  return rampa(RODAJE.fcMedia, RODAJE.fcMax, transcurrido(e.t), DURACION_S);
}

export function paginas(e: Estado): PaginaReloj[] {
  const t = transcurrido(e.t);
  // El pulso se mide siempre: el sensor es del reloj y no depende de que el
  // GPS fije ni de que haya una máquina emparejada.
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla });
  const tiempo = paginaTiempo({ segundos: t, nota: e.gps ? undefined : NOTA.sinSenal });

  // EL MÍNIMO: sin señal quedan dos páginas, y la nota dice por qué son dos.
  if (!e.gps) return pulso ? [pulso, tiempo] : [tiempo];

  const metros = metrosDe(e);
  const ritmo: PaginaReloj = {
    id: 'ritmo',
    contexto: 'Ritmo',
    modo: 'ojeada',
    // La unidad se queda pegada al numeral porque el ritmo de un rodaje son
    // SIEMPRE cuatro glifos («5:12»), y ahí la cifra clava los 45 pt de alto.
    // Sólo se manda la unidad al segundo nivel cuando el estado más ancho de
    // esa página se caería por debajo del suelo, que no es el caso.
    sujeto: { texto: pace(RODAJE.ritmoSecKm), unidad: '/km' },
  };
  const distancia: PaginaReloj = {
    id: 'distancia',
    // Un «5,24» sin decir de cuánto no informa de nada. El objetivo va arriba
    // y lo que falta lo dibuja el aro, así que ninguno de los dos gasta la
    // línea del segundo nivel.
    contexto: `De ${OBJETIVO}`,
    modo: 'ojeada',
    sujeto: { texto: distanciaMedida(metros), unidad: unidadDistancia(metros) },
  };

  // CON zona, el pulso gobierna el rodaje y va primero: es el sujeto que da
  // identidad al entreno en vivo. SIN ancla no hay zona que gobernar, así que
  // manda el ritmo y el pulso baja al tercer sitio, detrás de la distancia:
  // un número de ppm que no se puede comparar con nada informa menos que
  // cuánto llevas corrido.
  return e.ancla != null && pulso
    ? [pulso, ritmo, distancia, tiempo]
    : [ritmo, distancia, ...(pulso ? [pulso] : []), tiempo];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e) };
}

export const CASOS = [
  caso('sin señal · el mínimo', { ancla: SIN_ANCLA, gps: false, t: 0 }),
  caso('sin umbral · a mitad', { ancla: SIN_ANCLA, gps: true, t: DESDE_S }),
  // Al llegar, el sujeto más ancho de la vista: «10,00 km» y un crono de cinco
  // glifos. Si algo de este rodaje no cabe, cae aquí.
  caso('sin umbral · al llegar', { ancla: SIN_ANCLA, gps: true, t: DURACION_S }),
  caso('con umbral · a mitad', { ancla: ANCLA_MEDIDA, gps: true, t: DESDE_S }),
] as const;
