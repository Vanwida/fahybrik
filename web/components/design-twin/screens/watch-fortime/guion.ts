// (7) FOR TIME — el formato donde el reloj sabe MENOS de toda la app.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// El crono. Y en la mitad de la carrera, nada más que el crono.
//
// De las 16 estaciones de la ruta, **8 son tramos de carrera que el GPS sí mide
// (distancia y ritmo) y 8 son estaciones que el reloj no ve en absoluto**:
// trineo, wall balls, farmers carry, burpee broad jump, zancadas con saco. No
// hay sensor que cuente un wall ball ni que sepa cuántos metros llevas de un
// sled push. Cada estación lo declara en `RUTA_FORTIME.loMideElReloj`, y esa
// bandera —no el formato— es la que parte esta vista en dos.
//
// Y hay un segundo hecho, peor: la ejecución 59 marcó 4.380 s (73:00 clavados)
// y **CERO `segment_executions`**. Ni un parcial, ni un pulso, ni un metro. El
// otro intento capturó 3 de 23 segmentos y se abandonó. O sea que **lo más
// completo que existe de un For Time en toda la base es el tiempo final**, y
// eso es exactamente lo que esta pantalla promete: el crono, entero, siempre.
//
// Por eso aquí NO hay página de pulso. No es una omisión: `FORTIME` no trae FC
// porque sin `segment_executions` no hay `avg_hr` que reproducir, y un pulso
// inventado en la pantalla que presume de honestidad sería el peor sitio para
// inventarlo (§7). Sin FC tampoco hay zona, y sin zona no hay tinte: el lienzo
// de esta vista es negro de principio a fin.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Cambia estación a estación, y ése es el otro giro:
//
//   · tramo de carrera            → `ojeada`. Corres, miras de reojo, no tocas.
//   · trineo, farmers, sandbag    → `ciego`. Las dos manos ocupadas o cargando.
//   · wall balls, burpees         → `ciego`. Ni mirar ni tocar.
//
// La transición entre estaciones la gobierna un SUCESO que el reloj no ve
// (cruzas la línea de la siguiente estación), así que la declara el atleta con
// un toque. En `ciego` esa oferta se pinta atenuada —es para cuando sueltes el
// trineo, no ahora—; en `ojeada` no se pinta en absoluto, pero el gesto sigue
// ahí: toda la pantalla es el blanco.
//
// ── DÓNDE ME CHIRRIÓ EL MODELO DE LOS TRES MODOS ───────────────────────────
// El `mando` no aparece en ninguna página de esta vista, y no es un descuido:
// **un For Time no tiene un solo momento en el que el atleta se pare**. El
// instante de tocar existe (cruzas la línea y tocas), pero es un instante, no
// un estado en el que la pantalla se quede. Modelarlo como fase sería inventar
// un descanso que la carrera no tiene.

import {
  NOTA,
  distanciaMedida,
  unidadDistancia,
  type PaginaReloj,
} from '../../kit-watch';
import { RUTA_FORTIME } from '../../datos-reloj';

/** Los ocho tramos de carrera de la ruta son de 1,00 km (`RUTA_FORTIME`). */
const TRAMO_RUN_M = 1_000;

export interface Estado {
  /** Índice de la estación en curso dentro de `RUTA_FORTIME`. */
  estacion: number;
  /** El crono total desde la salida. ES la puntuación, y no se va de pantalla. */
  cronoS: number;
  /** Segundos dentro de la estación en curso. */
  enEstacionS: number;
}

export interface Gestos {
  /** «Estación hecha»: la gobierna un suceso que el reloj no ve, así que la dices tú. */
  estacionHecha: () => void;
}

/**
 * EL CRONO DE LA CARRERA, Y AQUÍ ESTÁ EL HALLAZGO DE ESTA VISTA.
 *
 * Un HYROX dura entre 60 y 90 minutos, así que el `clock` del kit —que rueda a
 * horas a partir de 3.600 s— escribiría `1:02:40`: SEIS glifos, o sea 37 pt de
 * altura de cifra en un lienzo de 188 de ancho. A ese tamaño el crono ya no es
 * un dato gigante, es una línea de texto grande, y deja de ser el sujeto.
 *
 * La salida está en el propio CONTRATO-UI §2 (`enHoras: false`): **el marcador
 * de una carrera habla en minutos**. `73:00` son cinco glifos y 44 pt, que es
 * justo el suelo. La hora, si algún día hace falta, vive en el contexto.
 *
 * Los minutos van a dos cifras a propósito: el numeral no cambia de tamaño al
 * pasar de 09:59 a 10:00, y en la muñeca un sujeto que se reajusta solo es un
 * sujeto que hay que volver a leer.
 *
 * (El límite conocido: a partir de 100 minutos serían seis glifos otra vez. No
 * lo alcanza ninguna carrera de la base —la más larga son los 73:00 de la
 * ejecución 59— y resolverlo antes de tener el caso sería inventárselo.)
 */
export function cronoCarrera(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Los metros que faltan del tramo. **`null` en las ocho estaciones que el reloj
 * no ve**, y entonces esta vista no tiene página de tramo: no es que el dato
 * esté vacío, es que no hay nada que medir.
 *
 * El ritmo con el que avanza la reproducción sale del peso que la ruta le da al
 * tramo (270 s para 1 km ≈ 4:30/km). En la app estos metros los mide el GPS: el
 * peso sólo sirve para reproducir, y por eso no se escribe en pantalla.
 */
export function metrosQueFaltan(e: Estado): number | null {
  const est = RUTA_FORTIME[e.estacion]!;
  if (!est.loMideElReloj) return null;
  const hechos = (TRAMO_RUN_M * e.enEstacionS) / est.peso;
  return Math.max(0, TRAMO_RUN_M - hechos);
}

/**
 * Lo que se enciende del arco de la estación en curso.
 *
 * REGLA, y vale para las dos vistas del relevo y de la carrera: **el bisel sólo
 * rellena lo que se mide.** En un tramo de carrera se rellena con los metros
 * del GPS; en una estación ciega se queda a cero, porque no hay ni un dato con
 * el que rellenarlo. El resultado es que el aro se apaga justo donde el reloj
 * deja de medir, que es la tesis de esta vista dibujada en el borde. Y el «estás
 * aquí» no se pierde: lo dice el filo entre lo encendido y lo apagado.
 */
export function fraccionMedida(e: Estado): number {
  const faltan = metrosQueFaltan(e);
  return faltan == null ? 0 : 1 - faltan / TRAMO_RUN_M;
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const est = RUTA_FORTIME[e.estacion]!;
  const donde = `${est.nombre} · ${e.estacion + 1} de ${RUTA_FORTIME.length}`;
  const faltan = metrosQueFaltan(e);

  if (faltan == null) {
    // ESTACIÓN CIEGA — el caso real, y el mínimo de esta vista. Una página, y
    // no porque falte sitio: es que no hay un segundo dato que enseñar.
    return [
      {
        id: 'crono',
        contexto: donde,
        modo: 'ciego',
        sujeto: { texto: cronoCarrera(e.cronoS) },
        // La dosis del coach, que NO es una medida: es lo que hay que hacer.
        // Por eso va de segundo nivel y la nota dice de dónde sale.
        segundo: { valor: est.dosis },
        // Una oferta para cuando sueltes el trineo, no una petición: el lienzo
        // la pinta atenuada porque el modo es `ciego`.
        accion: { etiqueta: 'Al acabar · toca', onToca: g.estacionHecha },
        nota: NOTA.loDicesTu,
      },
    ];
  }

  // TRAMO DE CARRERA — lo único de los 16 pasos que el reloj mide por su cuenta.
  return [
    {
      id: 'crono',
      contexto: donde,
      modo: 'ojeada',
      // Sin segundo nivel y sin nota: corriendo, un dato gigante y nada más. La
      // dosis del tramo no hace falta aquí, la lleva la página de al lado.
      sujeto: { texto: cronoCarrera(e.cronoS) },
      accion: { etiqueta: 'Al llegar · toca', onToca: g.estacionHecha },
    },
    {
      id: 'tramo',
      contexto: `${est.nombre} · faltan`,
      modo: 'ojeada',
      sujeto: { texto: distanciaMedida(faltan), unidad: unidadDistancia(faltan) },
      // El gesto vive en las dos páginas: llegas a la estación y tocas, mires
      // la que mires. En `ojeada` no se anuncia, pero está.
      accion: { etiqueta: 'Al llegar · toca', onToca: g.estacionHecha },
    },
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { estacionHecha: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  caso('estación ciega · sled push', { estacion: 3, cronoS: 2_480, enEstacionS: 0 }),
  caso('tramo de carrera', { estacion: 10, cronoS: 2_480, enEstacionS: 20 }),
  // El GPS ya ha dado el kilómetro y la estación SIGUE abierta: la cierra el
  // atleta al cruzar, no el hito de distancia.
  caso('tramo · metros a cero', { estacion: 10, cronoS: 2_745, enEstacionS: 285 }),
  // La última estación, con el crono pasado de la hora: cinco glifos, 44 pt.
  // Es el caso que justifica el formateador en minutos.
  caso('wall balls · pasada la hora', { estacion: 15, cronoS: 4_200, enEstacionS: 90 }),
] as const;
