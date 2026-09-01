'use client';

// LA ESPINA — las semanas de un plan como un camino vertical.
//
// Nació dentro de la nota del coach («por dónde voy a pasar») y vive aquí porque
// no es de la nota: es del PLAN. La misma pieza es la que dibuja la periodización
// del coach y la vista de un ciclo del atleta, y tenerla en tres sitios sería
// tenerla en tres versiones a los dos meses.
//
// PRESENTACIONAL PURO. No sabe de base de datos, ni de comunicados, ni de
// tokens: recibe los tramos ya resueltos y el vocabulario de la superficie que
// la dibuja (`tokens.ts`). Todo lo que decide QUÉ dice cada tramo —el nombre del
// microciclo, dónde está hoy, qué rompe la rutina— se resuelve antes: en
// `web/lib/plan/camino.ts` sobre el plan real del atleta, o en el derivador de
// cada superficie sobre lo que esa superficie tenga delante.
//
// LOS DOS EJES, como en el aro del reloj (docs/DECISIONS.md 2026-08-09): el
// COLOR dice de qué tramo es cada nodo (dónde acaba uno y empieza el siguiente),
// y el RELLENO dice si ahí pasa algo que rompe la rutina. Dónde estás hoy es el
// tercero y va aparte, con anillo y con la semana escrita: es lo único que
// cambia cada lunes.
//
// LO QUE CUELGA DE UN NODO ES DE CADA SUPERFICIE, EL DIBUJO NO. Por eso un nodo
// acepta `contenido` (las marcas de semana del móvil, los controles de reordenar
// del coach) en vez de que cada pantalla se dibuje su propio raíl: el día que el
// camino cambie de forma, cambia en un fichero y en todas las superficies.

import type { CSSProperties, ReactNode } from 'react';
import type { TokensEspina } from './tokens';

/** Qué clase de parada es un nodo del camino. */
export type FormaEspina =
  /** Las semanas seguidas de un microciclo. El caso normal. */
  | 'tramo'
  /** Aquello a lo que apunta todo lo de arriba: una carrera, una fecha objetivo. */
  | 'meta'
  /** Aquí se acaba lo que hay montado. El camino se dibuja roto, porque lo está. */
  | 'hueco';

/** Un nodo del camino, ya listo para pintar. El color llega resuelto: quien lo
 *  dibuja no decide de qué color es, sólo lo escribe. */
export interface TramoEspina {
  /** Clave estable de React. */
  clave: string;
  /**
   * Las semanas que ocupa, ya rotuladas: «S1», «S2-S5». Cadena vacía = este
   * nodo no ocupa semanas y no se rotula (una meta, un hueco).
   */
  semanas: string;
  titulo: string;
  detalle?: string | null;
  color: string;
  /** Rompe la rutina (un simulacro, unos tests): nodo relleno y halo. */
  destacado?: boolean;
  /** Es donde está hoy. Anillo + la semana en voz alta. */
  actual?: boolean;
  /** Qué semana de ESTE tramo es la de hoy, si lo es. */
  semanaActual?: number | null;
  /** Círculo por defecto. Ver `FormaEspina`. */
  forma?: FormaEspina;
  /**
   * Ya pasó. El nodo y su rótulo bajan de tinta en vez de taparse con opacidad,
   * que se come el contraste. Sólo lo declara quien SABE dónde está hoy: sin
   * cursor no se sabe qué queda detrás, y afirmarlo sería inventarlo.
   */
  pasado?: boolean;
  /**
   * Cuánto del sobrante vertical se lleva este nodo cuando la espina vive en una
   * columna de alto fijo (el móvil del atleta). Ausente = no crece, que es lo
   * que quiere una espina dentro de una página que scrollea.
   */
  peso?: number;
  /** Lo que cuelga de este nodo y es de la superficie, no del camino. */
  contenido?: ReactNode;
  /** El rótulo accesible cuando el nodo se puede tocar. */
  etiqueta?: string;
  /** Presente = el nodo es un botón. Ausente = es sólo dibujo. */
  onSeleccionar?: () => void;
}

/** El ancho de la columna del raíl y el diámetro del nodo. Son los del doble:
 *  cambiarlos aquí cambia la espina de todas las superficies a la vez. */
const RAIL = 13;
const NODO = 9;
/** Theme.Spacing.m — el aire entre el raíl y el texto, y bajo cada tramo. */
const AIRE = 12;

/**
 * La geometría, para quien necesite alinear algo CON el camino (una línea al pie
 * que arranca donde arranca el texto de las paradas). Se publica en vez de que
 * cada superficie repita los números: repetidos, un cambio de raíl desalinea
 * pantallas que nadie ha vuelto a mirar.
 */
export const GEOMETRIA_ESPINA = { rail: RAIL, aire: AIRE } as const;
/** Cuánta tinta le queda a lo que ya pasó. Suficiente para leerse, poco para
 *  competir con lo que viene. */
const TINTA_PASADO = 45;

export function Espina({
  tramos,
  tokens,
  style,
}: {
  tramos: TramoEspina[];
  tokens: TokensEspina;
  style?: CSSProperties;
}) {
  if (tramos.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {tramos.map((t, i) => (
        <Tramo
          key={t.clave}
          tramo={t}
          tokens={tokens}
          primero={i === 0}
          ultimo={i === tramos.length - 1}
        />
      ))}
    </div>
  );
}

function Tramo({
  tramo,
  tokens,
  primero,
  ultimo,
}: {
  tramo: TramoEspina;
  tokens: TokensEspina;
  primero: boolean;
  ultimo: boolean;
}) {
  const forma: FormaEspina = tramo.forma ?? 'tramo';
  const destacado = tramo.destacado === true;
  const actual = tramo.actual === true;
  const pasado = tramo.pasado === true;
  /** La tinta del NODO. Baja al 45% cuando ya pasó: es dibujo (`aria-hidden`),
   *  así que puede perder contraste sin perder lectura. */
  const tinta = pasado ? `color-mix(in srgb, ${tramo.color} ${TINTA_PASADO}%, transparent)` : tramo.color;
  /** La tinta del TEXTO (el rótulo de semanas). NO es su tono al 45%: sobre
   *  lienzo claro eso cae muy por debajo de 4,5:1 y el rótulo deja de leerse.
   *  Baja a `tokens.muted` — la misma tinta a la que baja el título — que es
   *  un escalón de jerarquía, no un texto medio borrado. */
  const tintaTexto = pasado ? tokens.muted : tramo.color;

  const contenido = (
    <>
      <div style={{ flex: `0 0 ${RAIL}px`, position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {/* El raíl se corta arriba en el primero y abajo en el último: un camino
            que entra y sale del cuadro prometería tramos que no existen. Donde
            se acaba lo montado se dibuja discontinuo — el camino sigue, pero ya
            no hay nadie que diga por dónde. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: primero ? 12 : 0,
            bottom: ultimo ? 'auto' : 0,
            height: ultimo ? 12 : undefined,
            width: 1,
            background:
              forma === 'hueco'
                ? `repeating-linear-gradient(to bottom, ${tokens.rail} 0 3px, transparent 3px 6px)`
                : tokens.rail,
          }}
        />
        <Nodo forma={forma} tinta={tinta} destacado={destacado} actual={actual} fondo={tokens.bg} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: `4px 0 ${AIRE}px`,
        }}
      >
        {tramo.semanas ? (
          <span
            style={{
              font: `700 11px/1.1 ${tokens.fontMono}`,
              fontVariantNumeric: 'tabular-nums',
              color: tintaTexto,
              letterSpacing: '0.06em',
            }}
          >
            {tramo.semanas}
          </span>
        ) : null}
        <span
          style={{
            font: `${destacado || actual ? 650 : 550} 14px/1.3 ${tokens.fontSans}`,
            color: pasado ? tokens.muted : tokens.fg,
          }}
        >
          {tramo.titulo}
        </span>
        {tramo.detalle ? (
          <span style={{ font: `400 12.5px/1.4 ${tokens.fontSans}`, color: tokens.muted }}>
            {tramo.detalle}
          </span>
        ) : null}
        {actual ? (
          <span style={{ font: `600 12.5px/1.4 ${tokens.fontSans}`, color: tramo.color }}>
            {aquiEstas(tramo)}
          </span>
        ) : null}
        {tramo.contenido}
      </div>
    </>
  );

  const caja: CSSProperties = {
    display: 'flex',
    gap: AIRE,
    alignItems: 'stretch',
    ...(tramo.peso !== undefined ? { flex: `${tramo.peso} 1 auto`, minHeight: 0 } : null),
  };

  if (!tramo.onSeleccionar) return <div style={caja}>{contenido}</div>;
  return (
    <button
      type="button"
      onClick={tramo.onSeleccionar}
      aria-label={tramo.etiqueta}
      className={tokens.claseFoco}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        cursor: 'pointer',
        textAlign: 'left',
        ...caja,
      }}
    >
      {contenido}
    </button>
  );
}

/**
 * La marca del camino. Tres formas y una sola razón para cada una: un círculo es
 * un trozo de plan, un rombo es aquello a lo que apunta el plan, y un círculo
 * discontinuo es donde el plan se acaba sin que nadie haya dicho qué viene.
 */
function Nodo({
  forma,
  tinta,
  destacado,
  actual,
  fondo,
}: {
  forma: FormaEspina;
  tinta: string;
  destacado: boolean;
  actual: boolean;
  fondo: string;
}) {
  const meta = forma === 'meta';
  return (
    <span
      aria-hidden
      style={{
        // Sin `border-box` a propósito: el borde suma al diámetro, y ese es el
        // tamaño de nodo que ya está aprobado en la nota del coach.
        position: 'relative',
        marginTop: 8,
        width: NODO,
        height: NODO,
        borderRadius: meta ? 2 : '50%',
        transform: meta ? 'rotate(45deg)' : undefined,
        flex: '0 0 auto',
        background: destacado || meta ? tinta : fondo,
        border: `1.6px ${forma === 'hueco' ? 'dashed' : 'solid'} ${tinta}`,
        boxShadow: halo(tinta, destacado, actual),
      }}
    />
  );
}

/**
 * El halo. Uno para lo que rompe la rutina y otro, más ancho y hueco, para donde
 * estás hoy — si los dos fueran iguales, el nodo de hoy diría «aquí hay un
 * simulacro» y el del simulacro diría «estás aquí».
 */
function halo(color: string, destacado: boolean, actual: boolean): string {
  if (actual) return `0 0 0 4px color-mix(in srgb, ${color} 26%, transparent)`;
  if (destacado) return `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`;
  return 'none';
}

/** Dónde estás, dicho como se lo diría el coach. Sin el número de semana sería
 *  un «estás por aquí» que no sitúa nada dentro de un tramo de cinco. */
function aquiEstas(tramo: TramoEspina): string {
  const n = tramo.semanaActual;
  if (!n || n < 1) return 'Estás aquí';
  return `Estás aquí, semana ${n}`;
}
