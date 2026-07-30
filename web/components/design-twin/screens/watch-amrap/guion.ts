// (8) AMRAP — la única de las nueve donde la franja de acción se gana estar
// SIEMPRE a plena luz, y la única donde el sujeto es un solo glifo.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. **La ronda no la mide nadie: la declara el atleta con un toque.**
//
// Y eso no es una limitación del reloj, es del modelo de datos: en toda la base
// no hay UNA sola plantilla con formato AMRAP, y `score_rounds` / `score_reps`
// son NULL en las 77 ejecuciones sin una sola excepción. **La app no sabe
// guardar una ronda.** Así que las cifras de esta vista —la ventana de 12 min y
// la tarea— son PROPUESTA, y van marcadas como tal en `datos-reloj.ts`.
//
// Lo que no es propuesta es la regla, y es la que ordena la pantalla: si el
// atleta no la declara, la ronda no existe para nadie.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// `mando` de principio a fin, y es la EXCEPCIÓN RAZONADA al «cero controles».
//
// En las otras ocho vistas el momento de tocar lo anuncia algo que no eres tú:
// se acaba el descanso, salta la ronda, cierras la serie que el coach escribió.
// Aquí no lo anuncia nada — el momento llega cuando TÚ cierras una ronda, y sólo
// tú sabes cuándo ha sido. Si la etiqueta no está puesta, el atleta no sabe que
// el gesto existe; y una ronda que no se declara es una ronda que no ocurrió,
// porque no hay nadie más contando. Esos 15 pt de franja son lo único que separa
// al marcador de perderse, así que se los queda.
//
// Y por la misma razón el gesto va en LAS DOS páginas, con su latido en las dos:
// el atleta que se ha quedado mirando su pulso cierra rondas igual, y si tuviera
// que deslizar para sumarla, para cuando llegara ya no se acordaría.
//
// ── EL SUJETO: LA RONDA ────────────────────────────────────────────────────
// Una ronda es UN glifo, y por primera vez en las nueve el ancho deja de mandar
// (un solo glifo daría para 219 pt de cifra, muy por encima del techo). Lo que
// manda aquí es el presupuesto vertical: el numeral crece hasta los ~110 pt con
// todos los apoyos puestos, y es el más grande de la familia — sigue siéndolo a
// dos cifras, porque a partir del segundo glifo el que ata sigue siendo el
// presupuesto y no el ancho. La muñeca entera es un número.
//
// Al cerrarse la ventana la acción desaparece —ya no hay nada que sumar— y el
// numeral CRECE con esos 15 pt liberados. Es exactamente lo que tiene que pasar:
// el contador acaba de convertirse en el marcador.
//
// ── DOS COSAS QUE NO CABEN, Y DÓNDE SE FUERON ──────────────────────────────
//  · La TAREA («10 wall balls · 15 cal remo») no está en la muñeca. En un EMOM
//    sí va, porque cambia de ronda a ronda y hay que recordarla; en un AMRAP es
//    la misma durante doce minutos y ya te la sabes desde la primera. Vive en el
//    móvil, que es donde hay sitio para leerla.
//  · Las repeticiones sueltas de la ronda a medias tampoco: `score_reps` es NULL
//    en las 77 ejecuciones igual que `score_rounds`, así que ofrecer sumarlas
//    sería prometer un almacenamiento que no existe.

import {
  NOTA,
  clock,
  paginaPulso,
  tonoUrgente,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { AMRAP, SIN_ANCLA, rampa } from '../../datos-reloj';

export interface Estado {
  ancla: Ancla;
  /** Segundos transcurridos de la ventana, de 0 a `AMRAP.ventanaS`. */
  t: number;
  /** Rondas DECLARADAS por el atleta. Nadie más las cuenta. */
  rondas: number;
}

export interface Gestos {
  /** Cerrar una ronda. Es el único dato que esta vista produce. */
  sumarRonda: () => void;
}

/** Lo que queda de ventana. La ventana no se para por nada. */
export function quedaDe(e: Estado): number {
  return Math.max(0, AMRAP.ventanaS - e.t);
}

/**
 * La FC, subiendo a lo largo de la ventana. Es propuesta como todo lo demás de
 * este formato: sin una sola ejecución de AMRAP en la base, lo único que hay son
 * las dos cifras del caso y una rampa entre ellas.
 */
export function bpmDe(e: Estado): number {
  return rampa(AMRAP.fcDesde, AMRAP.fcHasta, e.t, AMRAP.ventanaS);
}

/** Los minutos de la ventana, para el contexto: «AMRAP · 12 min». */
const MINUTOS = Math.round(AMRAP.ventanaS / 60);

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const queda = quedaDe(e);
  const abierta = queda > 0;
  // El MISMO gesto en las dos páginas. Si sólo estuviera en la del marcador, un
  // atleta que se ha quedado mirando su pulso tendría que deslizar para sumar
  // una ronda que acaba de cerrar — y para cuando llegara, ya no se acordaría.
  const accion = abierta ? { etiqueta: 'Toca · ronda hecha', onToca: g.sumarRonda } : undefined;
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla, modo: 'mando' });

  return [
    {
      id: 'rondas',
      contexto: abierta ? `AMRAP · ${MINUTOS} min` : 'AMRAP · se acabó',
      // Mirar y tocar, siempre: ver arriba por qué esta vista se lo ha ganado.
      modo: 'mando',
      // El latido sube con el contador: el golpe de escala al sumar es la
      // confirmación que sustituye a mirar si el botón se ha pulsado. Un
      // destello a pantalla completa aquí sobraría — el destello se reserva para
      // lo que hace el RELOJ (cerrarse la ventana), no para lo que haces tú.
      sujeto: { texto: String(e.rondas), latido: e.rondas },
      segundo: abierta
        ? { etiqueta: 'Queda', valor: clock(queda), tono: tonoUrgente(queda) }
        : // Cerrada la ventana, el número ya no necesita un reloj al lado: sólo
          // su unidad, como el «ppm» de la página de pulso.
          { valor: e.rondas === 1 ? 'ronda' : 'rondas' },
      ...(accion ? { accion } : {}),
      nota: NOTA.loDicesTu,
    },
    ...(pulso
      ? [
          {
            ...pulso,
            // Y el mismo LATIDO. Si el gesto existe en esta página, su
            // confirmación también: sin él, tocar mientras miras tu pulso no
            // daría ninguna señal de que la ronda ha entrado, y en un AMRAP eso
            // es la diferencia entre un marcador y una duda.
            sujeto: { ...pulso.sujeto, latido: e.rondas },
            ...(accion ? { accion } : {}),
          },
        ]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { sumarRonda: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  // El mínimo: cero rondas. Un CONTADOR se pinta en cero (§6.2 bis), y es cuando
  // más falta hace — no hay nada que mirar salvo lo que queda de ventana.
  caso('arranque · cero rondas', { ancla: SIN_ANCLA, t: 0, rondas: 0 }),
  caso('a mitad', { ancla: SIN_ANCLA, t: 360, rondas: 5 }),
  caso('los últimos segundos', {
    ancla: SIN_ANCLA,
    t: AMRAP.ventanaS - AMRAP.restanteFinalS,
    rondas: AMRAP.rondasAlFinal,
  }),
  // Los tres últimos segundos: el tiempo restante se pone naranja.
  caso('se acaba', { ancla: SIN_ANCLA, t: AMRAP.ventanaS - 2, rondas: AMRAP.rondasAlFinal }),
  // Cerrada: la acción desaparece y el numeral crece con los 15 pt que suelta.
  caso('cerrada · el marcador', {
    ancla: SIN_ANCLA,
    t: AMRAP.ventanaS,
    rondas: AMRAP.rondasAlFinal,
  }),
  // Dos cifras, para comprobar que el sujeto sigue sin toparse con el ancho.
  caso('cerrada · dos cifras', { ancla: SIN_ANCLA, t: AMRAP.ventanaS, rondas: 12 }),
] as const;
