'use client';

// EL BISEL — el progreso dibujado en el borde del lienzo.
//
// La idea que sostiene toda la familia: en un reloj el sitio más barato que
// existe son las esquinas redondeadas, porque ahí no cabe texto. Trazar el
// progreso SOBRE el borde de la pantalla cuesta CERO altura de contenido, se ve
// de reojo sin enfocar la vista, y devuelve al sujeto los ~52 pt que en la app
// de hoy se come el botón grande.
//
// Regla de significado, constante en las nueve vistas:
//   · el ARO es la ESTRUCTURA (cuánto queda de esto), siempre naranja;
//   · el FONDO es el CUERPO (tu zona) o el ESTADO (recuperación).
//
// Naranja SUAVE y no el naranja de marca: sobre el fondo teñido de una zona
// ámbar el #F06A2A se queda en 2,3:1 y un elemento gráfico que hay que
// entender necesita 3:1. El #FF8A4C pasa contra las cinco zonas.
//
// Vivía en `screens/watch-vivo/aro.tsx`, importado desde OTRA pantalla
// (`watch-resumen`). Una pantalla que importa de otra pantalla es la primera
// señal de que la pieza es del kit y estaba en el sitio equivocado.

import type { ReactNode } from 'react';
import type { Tramo } from '../tramos';
import { LIENZO } from './modelo';
import { W } from '../screens/watch-live/theme';

/** Cuánto se mete el trazo hacia dentro, y su grosor. */
const INSET = 4;
const GROSOR = 5;
const RADIO = LIENZO.radio - INSET;

/**
 * El perímetro, calculado a mano en vez de con `getTotalLength()`: sin medir el
 * DOM el resultado es idéntico en servidor y en cliente, que es la misma razón
 * por la que el reloj espejo estima anchos de texto en vez de medirlos.
 */
export const PERIMETRO =
  2 * (LIENZO.ancho - 2 * INSET - 2 * RADIO) +
  2 * (LIENZO.alto - 2 * INSET - 2 * RADIO) +
  2 * Math.PI * RADIO;

/** Arranca en las 12 y va en sentido horario, como cualquier reloj. */
const TRAZADO = [
  `M ${LIENZO.ancho / 2} ${INSET}`,
  `H ${LIENZO.ancho - INSET - RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${LIENZO.ancho - INSET} ${INSET + RADIO}`,
  `V ${LIENZO.alto - INSET - RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${LIENZO.ancho - INSET - RADIO} ${LIENZO.alto - INSET}`,
  `H ${INSET + RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${INSET} ${LIENZO.alto - INSET - RADIO}`,
  `V ${INSET + RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${INSET + RADIO} ${INSET}`,
  'Z',
].join(' ');

const COLOR_ARO = W.orangeSoft;
// El carril apagado del bisel: gris fijo sobre el negro OLED, derivado del
// blanco del tema en vez de un hex suelto.
const COLOR_VIA = 'color-mix(in srgb, var(--twin-fg) 12%, transparent)';

/** `via` dibuja el carril completo; el aro segmentado trae el suyo, troceado. */
function Aro({ via = true, children }: { via?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
      focusable="false"
    >
      {via ? <path d={TRAZADO} fill="none" stroke={COLOR_VIA} strokeWidth={GROSOR} /> : null}
      {children}
    </svg>
  );
}

/**
 * El aro que DRENA: una sola cosa en marcha (el minuto del EMOM, el descanso,
 * la ventana del AMRAP). `fraccion` es lo que QUEDA, de 1 a 0, y el trazo se
 * retrae hacia las 12.
 */
export function AroContinuo({ fraccion }: { fraccion: number }) {
  const queda = Math.min(1, Math.max(0, fraccion));
  return (
    <Aro>
      <path
        d={TRAZADO}
        fill="none"
        stroke={COLOR_ARO}
        strokeWidth={GROSOR}
        strokeLinecap="round"
        strokeDasharray={PERIMETRO}
        strokeDashoffset={PERIMETRO * (1 - queda)}
        style={{ transition: 'stroke-dashoffset 900ms linear' }}
      />
    </Aro>
  );
}

/**
 * El aro SEGMENTADO: una porción por repetición. Lleva el «serie 3 de 8» y el
 * avance dentro de la serie en el mismo sitio y sin gastar una línea de texto.
 *
 * `hechas` son las cerradas; la que está en curso es la siguiente y se rellena
 * con `fraccion`.
 */
export function AroSegmentado({
  total,
  hechas,
  fraccion,
}: {
  total: number;
  hechas: number;
  fraccion: number;
}) {
  const hueco = 7;
  const paso = PERIMETRO / total;
  const largo = paso - hueco;
  const avance = Math.min(1, Math.max(0, fraccion));
  return (
    <Aro via={false}>
      {Array.from({ length: total }, (_, i) => {
        const inicio = i * paso + hueco / 2;
        const visible = i < hechas ? largo : i === hechas ? largo * avance : 0;
        return (
          <g key={i}>
            <path
              d={TRAZADO}
              fill="none"
              stroke={COLOR_VIA}
              strokeWidth={GROSOR}
              strokeDasharray={`${largo} ${PERIMETRO}`}
              strokeDashoffset={-inicio}
            />
            {visible > 0 ? (
              <path
                d={TRAZADO}
                fill="none"
                stroke={COLOR_ARO}
                strokeWidth={GROSOR}
                strokeLinecap="butt"
                strokeDasharray={`${visible} ${PERIMETRO}`}
                strokeDashoffset={-inicio}
                style={{ transition: 'stroke-dasharray 900ms linear' }}
              />
            ) : null}
          </g>
        );
      })}
    </Aro>
  );
}

/**
 * El gris de una recuperación en el aro de estructura. Es el `dim` del tema y no
 * un blanco al X %: lo que separa un tramo suave de uno fuerte tiene que ser un
 * color con significado, y un significado no se improvisa con una opacidad.
 */
const COLOR_RECUPERA = W.dim;

/**
 * El brillo dice DÓNDE ESTÁS. Lo hecho a plena luz, lo de ahora a media, lo que
 * viene apenas insinuado — lo justo para leer el ritmo del entreno de reojo sin
 * que lo pendiente compita con el tramo que estás corriendo.
 */
const BRILLO = { hecho: 1, enCurso: 0.4, pendiente: 0.16 } as const;

/** Hecho, en curso, por venir: el segundo eje del modelo, y no hay más casos. */
function brillo(i: number, enCurso: number): number {
  if (i < enCurso) return BRILLO.hecho;
  if (i === enCurso) return BRILLO.enCurso;
  return BRILLO.pendiente;
}

/** Un arco del bisel: un tramo de la fase que se está corriendo. */
export interface ArcoDeTramo {
  trabajo: boolean;
  /**
   * Peso relativo del arco. No es una unidad: es la parte del perímetro que le
   * toca. Cómo se reparte, en `FormaDelAro.pesos` (por orden de evidencia).
   */
  peso: number;
}

/**
 * EL ARO DE ESTRUCTURA — el on/off de la serie entera, un arco por tramo.
 *
 * `AroSegmentado` sólo sabe contar repeticiones iguales, así que un 5×(1200 m +
 * trote de 90'') salía como cinco trozos idénticos y, al entrar la recuperación,
 * el aro se cambiaba por otro que drena: la mitad del entreno no existía en el
 * bisel, y la referencia de dónde estabas desaparecía justo en el tramo en el
 * que hay tiempo para mirarla. Aquí se dibuja la fase entera y en orden.
 *
 * Dos ejes y ninguna excepción (espejo de `FormaDelAro` y `WatchAroEstructura`):
 *   · el HUE dice QUÉ ES el tramo — trabajo naranja, recuperación gris;
 *   · el BRILLO dice DÓNDE ESTÁS — hecho, en curso, por venir.
 * Con eso se leen de reojo las dos preguntas de una serie: cuántas fuertes
 * quedan y por cuál vas.
 *
 * El segmentado sigue mandando donde los trozos SÍ son iguales (fuerza, ergo, el
 * reloj de pared): allí contar repeticiones es la verdad, y esto dibujaría una
 * desigualdad que no existe.
 */
export function AroEstructura({
  arcos,
  enCurso,
  fraccion,
}: {
  arcos: ArcoDeTramo[];
  /** Índice del tramo que se está corriendo dentro de `arcos`. */
  enCurso: number;
  /**
   * Avance dentro de ese tramo, de 0 a 1. Cero cuando nadie lo mide: el arco se
   * queda a medio brillo y no promete una fracción que no existe.
   */
  fraccion: number;
}) {
  if (arcos.length === 0) return null;
  const bruto = arcos.map((a) => Math.max(0, a.peso));
  const suma = bruto.reduce((a, p) => a + p, 0);
  // Sin pesos utilizables el aro no se calla: reparte a partes iguales y sigue
  // diciendo el on/off y por dónde vas, que es lo único que había prometido.
  const pesos = suma > 0 ? bruto : bruto.map(() => 1);
  const total = suma > 0 ? suma : arcos.length;
  // El hueco se estrecha con el número de arcos: fijo, un 12×400 con sus
  // recuperaciones (24 arcos) sería más hueco que aro.
  const hueco = Math.min(6, PERIMETRO / (arcos.length * 4));
  const avance = Math.min(1, Math.max(0, fraccion));
  // Los arranques se acumulan ANTES del render, igual que en `AroTramos`: mutar
  // una variable mientras se pinta es lo que hace que el segundo render salga
  // distinto del primero.
  const arranques = pesos.reduce<number[]>(
    (acc, p) => [...acc, acc[acc.length - 1]! + (p / total) * PERIMETRO],
    [0],
  );
  return (
    <Aro via={false}>
      {arcos.map((arco, i) => {
        const inicio = arranques[i]! + hueco / 2;
        const largo = Math.max(0, (pesos[i]! / total) * PERIMETRO - hueco);
        const color = arco.trabajo ? COLOR_ARO : COLOR_RECUPERA;
        const relleno = i === enCurso ? largo * avance : 0;
        return (
          <g key={i}>
            <path
              d={TRAZADO}
              fill="none"
              stroke={color}
              strokeOpacity={brillo(i, enCurso)}
              strokeWidth={GROSOR}
              strokeLinecap="butt"
              strokeDasharray={`${largo} ${PERIMETRO}`}
              strokeDashoffset={-inicio}
            />
            {relleno > 0 ? (
              <path
                d={TRAZADO}
                fill="none"
                stroke={color}
                strokeWidth={GROSOR}
                strokeLinecap="butt"
                strokeDasharray={`${relleno} ${PERIMETRO}`}
                strokeDashoffset={-inicio}
                style={{ transition: 'stroke-dasharray 900ms linear' }}
              />
            ) : null}
          </g>
        );
      })}
    </Aro>
  );
}

/**
 * EL ARO DE TRAMOS — la forma de lo que llevas (o de lo que acabas), en el bisel.
 *
 * Es `AroSegmentado` cuando los trozos NO miden lo mismo: la ruta de un For
 * Time (16 estaciones de duraciones muy distintas), o la carrera ya terminada
 * del resumen. Cada tramo ocupa el arco que le toca por duración; lo fuerte,
 * encendido; lo suave, el carril apagado; un parón, nada.
 */
export function AroTramos({ tramos }: { tramos: Tramo[] }) {
  const total = tramos.reduce((a, t) => a + t.duracionS, 0);
  if (total <= 0) return null;
  const hueco = tramos.length > 1 ? Math.min(6, PERIMETRO / (tramos.length * 4)) : 0;
  // Los arranques se acumulan ANTES del render y no dentro del `map`: mutar una
  // variable mientras se pinta es lo que hace que el segundo render salga
  // distinto del primero.
  const arranques = tramos.reduce<number[]>(
    (acc, t) => [...acc, acc[acc.length - 1]! + (t.duracionS / total) * PERIMETRO],
    [0],
  );
  return (
    <Aro via={false}>
      {tramos.map((t, i) => {
        const inicio = arranques[i]!;
        const paso = (t.duracionS / total) * PERIMETRO;
        const largo = Math.max(1, paso - hueco);
        return (
          <path
            key={i}
            d={TRAZADO}
            fill="none"
            stroke={t.tipo === 'fuerte' ? COLOR_ARO : COLOR_VIA}
            strokeWidth={GROSOR}
            strokeLinecap="butt"
            strokeDasharray={`${t.tipo === 'parado' ? 0 : largo} ${PERIMETRO}`}
            strokeDashoffset={-(inicio + hueco / 2)}
          />
        );
      })}
    </Aro>
  );
}

/**
 * LA RUTA — el aro de una lista de pasos de duración desigual, con el paso
 * ACTIVO encendido y los ya hechos en tenue.
 *
 * Es lo que necesita el For Time: la forma de las 16 estaciones no cabe en
 * ninguna lista de la muñeca, pero SÍ cabe en el borde, y ahí dice a la vez
 * cuántas van, cuánto pesaba cada una y en cuál estás.
 */
export function AroRuta({
  pesos,
  activo,
  fraccion,
}: {
  /** El peso relativo de cada paso (duración estimada, metros, lo que sea). */
  pesos: number[];
  /** Índice del paso en curso. */
  activo: number;
  /** Avance dentro del paso activo, de 0 a 1. */
  fraccion: number;
}) {
  const total = pesos.reduce((a, p) => a + p, 0);
  if (total <= 0) return null;
  const hueco = Math.min(4, PERIMETRO / (pesos.length * 5));
  const arranques = pesos.reduce<number[]>(
    (acc, p) => [...acc, acc[acc.length - 1]! + (p / total) * PERIMETRO],
    [0],
  );
  const avance = Math.min(1, Math.max(0, fraccion));
  return (
    <Aro via={false}>
      {pesos.map((p, i) => {
        const inicio = arranques[i]! + hueco / 2;
        const largo = Math.max(1, (p / total) * PERIMETRO - hueco);
        const hecho = i < activo;
        const visible = hecho ? largo : i === activo ? largo * avance : 0;
        return (
          <g key={i}>
            <path
              d={TRAZADO}
              fill="none"
              stroke={COLOR_VIA}
              strokeWidth={GROSOR}
              strokeDasharray={`${largo} ${PERIMETRO}`}
              strokeDashoffset={-inicio}
            />
            {visible > 0 ? (
              <path
                d={TRAZADO}
                fill="none"
                // Lo hecho se apaga a la mitad: informa, pero el que manda es el
                // paso activo. Si todo pesara igual, el aro dejaría de decir
                // «estás aquí» y sólo diría «llevas tanto».
                stroke={COLOR_ARO}
                strokeOpacity={hecho ? 0.5 : 1}
                strokeWidth={GROSOR}
                strokeLinecap="butt"
                strokeDasharray={`${visible} ${PERIMETRO}`}
                strokeDashoffset={-inicio}
                style={{ transition: 'stroke-dasharray 900ms linear' }}
              />
            ) : null}
          </g>
        );
      })}
    </Aro>
  );
}

/**
 * EL RELEVO — el bisel partido en dos mitades, una por atleta.
 *
 * Los dobles no son un progreso, son un turno: lo que hay que ver de reojo no
 * es «cuánto queda» sino «de quién es esto ahora». La mitad de quien trabaja va
 * encendida; la del que espera, apagada. Sin una sola palabra.
 */
export function AroRelevo({ tuyo, fraccion }: { tuyo: boolean; fraccion: number }) {
  const mitad = PERIMETRO / 2;
  const hueco = 8;
  const avance = Math.min(1, Math.max(0, fraccion));
  // La mitad de arriba es la tuya SIEMPRE: en un relevo el atleta no puede
  // estar buscando cuál de las dos le toca mirar.
  const inicioTuyo = -PERIMETRO / 4 + hueco / 2;
  const inicioPareja = PERIMETRO / 4 + hueco / 2;
  const largo = mitad - hueco;
  return (
    <Aro via={false}>
      <path
        d={TRAZADO}
        fill="none"
        stroke={COLOR_VIA}
        strokeWidth={GROSOR}
        strokeDasharray={`${largo} ${PERIMETRO}`}
        strokeDashoffset={-inicioTuyo}
      />
      <path
        d={TRAZADO}
        fill="none"
        stroke={COLOR_VIA}
        strokeWidth={GROSOR}
        strokeDasharray={`${largo} ${PERIMETRO}`}
        strokeDashoffset={-inicioPareja}
      />
      <path
        d={TRAZADO}
        fill="none"
        stroke={COLOR_ARO}
        strokeWidth={GROSOR}
        strokeLinecap="butt"
        strokeDasharray={`${largo * avance} ${PERIMETRO}`}
        strokeDashoffset={-(tuyo ? inicioTuyo : inicioPareja)}
        style={{ transition: 'stroke-dasharray 900ms linear' }}
      />
    </Aro>
  );
}
