// (11) LA ZONA COMO SUJETO — la página que contesta «cómo de fuerte voy» sin
// pedir que se lea un número.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
// Alex, 8-ago, tras salir a hacer series: «ver las pulsaciones tan grandes está
// bien y la zona en pequeño, pero otra idea sería en otra view ver la zona en
// grande, por ejemplo Z2; cada zona tiene un color y según se acerque o se aleje
// de la siguiente zona se va llenando la pantalla de ese color en gradiente
// hacia el color siguiente».
//
// ── POR QUÉ ES OTRA PÁGINA Y NO OTRA MANERA DE PINTAR EL PULSO ─────────────
// Son dos preguntas distintas y las dos son legítimas:
//
//   pulso  → ¿cuántas pulsaciones tengo? Un número exacto, para mirarlo parado.
//   zona   → ¿cómo de fuerte voy AHORA MISMO? Un estado, para leerlo corriendo.
//
// «156 ppm» no contesta la segunda sin que el atleta haga la cuenta de sus
// bandas de memoria. «Z3» sí, y el color la contesta sin ni siquiera leer.
//
// ── LO QUE «Z3» NO DICE, Y ES LA MITAD DEL DATO ────────────────────────────
// A 145 y a 158 pone «Z3» igual, y uno de los dos está a un latido de irse a
// Z4. Corriendo, esa es exactamente la información que gobierna si aprietas o
// aflojas. De ahí el relleno: sube con tu posición DENTRO de la banda
// (`hrZonePosition`, mecanismo compartido) y su color deriva hacia el de la
// zona siguiente conforme te acercas. Cuando cruzas, el lienzo cambia de hue y
// el relleno vuelve abajo — el salto ES el aviso, y no cuesta ni una línea.
//
// ── HONESTIDAD (§7) ────────────────────────────────────────────────────────
// Sin ancla de FC no hay zona, y sin zona esta página NO EXISTE: no se insinúa
// un color sobre una banda que nadie ha medido. Es la misma regla del tinte del
// lienzo (`tinteDe`), aplicada a una pantalla entera en vez de a un fondo.

import { zoneColor, W } from '../watch-live/theme';
import { ZONA_NOMBRE, type Modo, type PaginaReloj, type Zona } from '../../kit-watch/modelo';

/** Dónde estás dentro de tu banda, ya resuelto por el mecanismo compartido. */
export interface Posicion {
  zona: Zona;
  /** 0…1 dentro de la banda. */
  fraccion: number;
  /** La zona hacia la que subes, o null en la última. */
  siguiente: Zona | null;
}

/**
 * EL LIENZO. Un relleno que sube desde abajo hasta `fraccion` de la altura, con
 * un degradado que va del color de TU zona (abajo) al de la SIGUIENTE (arriba
 * del relleno). Así el color dice dos cosas a la vez sin partir la pantalla:
 * en qué zona estás (el hue de abajo, que es el tuyo) y cuánto te falta para la
 * siguiente (cuánto ha subido, y cuánto ha derivado el hue de arriba).
 *
 * En la ÚLTIMA zona no hay hacia dónde derivar: el degradado se queda en su
 * propio color. Inventar un sexto hue sería prometer una zona que no existe.
 */
export function capasDelLienzo(p: Posicion): {
  /** Altura del relleno, 0…1. */
  alto: number;
  /** Color al pie del relleno — tu zona, a sangre. */
  desde: string;
  /** Color en el borde superior del relleno. */
  hasta: string;
  /** El resto del lienzo, por encima del relleno. */
  fondo: string;
} {
  const mio = zoneColor(p.zona);
  // No se mezcla al 100 %: el borde tiene que seguir leyéndose como el paso
  // hacia la siguiente, no como si ya estuvieras en ella.
  const hasta = p.siguiente == null ? mio : mezcla(mio, zoneColor(p.siguiente), 0.85);
  return { alto: p.fraccion, desde: mio, hasta, fondo: W.bg };
}

/** Mezcla dos hues en sRGB. `k` = cuánto del segundo. */
export function mezcla(a: string, b: string, k: number): string {
  return `color-mix(in srgb, ${b} ${Math.round(k * 100)}%, ${a})`;
}

/**
 * LA PÁGINA. El sujeto es la zona; el segundo nivel, su nombre en español de
 * box y el pulso que la produjo — porque un estado sin el número que lo
 * sostiene invita a desconfiar de él.
 *
 * Con objetivo prescrito, el segundo nivel lo dice y juzga: estar en Z3 cuando
 * el coach pidió Z2 es el dato, no un adorno.
 */
export function paginaZona({
  posicion,
  bpm,
  objetivo,
  modo = 'ojeada',
}: {
  posicion: Posicion | null;
  bpm: number | null;
  /** La zona que pidió el coach para este tramo, si la pidió. */
  objetivo?: Zona | null;
  modo?: Modo;
}): PaginaReloj | null {
  // Sin zona no hay página: no se pinta un color sobre una banda que nadie ha
  // medido (§7). El pulso sigue teniendo la suya, en ppm crudos.
  if (posicion == null) return null;

  const nombre = ZONA_NOMBRE[posicion.zona];
  const veredicto = juicio(posicion.zona, objetivo ?? null);
  return {
    id: 'zona',
    contexto: objetivo == null ? 'Zona' : `Zona · objetivo Z${objetivo}`,
    modo,
    sujeto: { texto: `Z${posicion.zona}`, tono: zoneColor(posicion.zona), latido: posicion.zona },
    segundo: {
      etiqueta: nombre,
      valor: bpm == null ? '—' : `${bpm} ppm`,
      tono: veredicto ? W.orangeSoft : undefined,
    },
    nota: veredicto ?? undefined,
  };
}

/**
 * El veredicto contra el objetivo, en dos palabras y sin sermón: el háptico ya
 * avisa, esto sólo dice de qué lado te has ido. Sin objetivo no hay veredicto —
 * un rodaje libre no está «mal» a ninguna intensidad.
 */
export function juicio(actual: Zona, objetivo: Zona | null): string | null {
  if (objetivo == null || actual === objetivo) return null;
  return actual > objetivo ? 'vas por encima' : 'vas por debajo';
}
