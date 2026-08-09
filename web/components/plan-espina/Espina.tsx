'use client';

// LA ESPINA — las semanas de un plan como un camino vertical.
//
// Nació dentro de la nota del coach («por dónde voy a pasar») y vive aquí porque
// no es de la nota: es del PLAN. La misma pieza es la que va a dibujar la
// periodización y la vista de un ciclo, y tenerla en tres sitios sería tenerla
// en tres versiones a los dos meses.
//
// PRESENTACIONAL PURO. No sabe de base de datos, ni de comunicados, ni de
// tokens: recibe los tramos ya resueltos y los seis colores de la superficie que
// la dibuja (`tokens.ts`). Todo lo que decide QUÉ dice cada tramo —el nombre del
// microciclo, dónde está hoy, qué rompe la rutina— se resuelve antes, en
// `web/lib/plan/camino.ts`, sobre el plan real.
//
// LOS DOS EJES, como en el aro del reloj (docs/DECISIONS.md 2026-08-09): el
// COLOR dice de qué tramo es cada nodo (dónde acaba uno y empieza el siguiente),
// y el RELLENO dice si ahí pasa algo que rompe la rutina. Dónde estás hoy es el
// tercero y va aparte, con anillo y con la semana escrita: es lo único que
// cambia cada lunes.

import type { CSSProperties } from 'react';
import type { TokensEspina } from './tokens';

/** Un tramo, ya listo para pintar. El color llega resuelto: quien lo dibuja no
 *  decide de qué color es, sólo lo escribe. */
export interface TramoEspina {
  /** Clave estable de React. */
  clave: string;
  /** Las semanas que ocupa, ya rotuladas: «S1», «S2-S5». */
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
}

/** El ancho de la columna del raíl y el diámetro del nodo. Son los del doble:
 *  cambiarlos aquí cambia la espina de todas las superficies a la vez. */
const RAIL = 13;
const NODO = 9;
/** Theme.Spacing.m — el aire entre el raíl y el texto, y bajo cada tramo. */
const AIRE = 12;

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
  const { color } = tramo;
  const destacado = tramo.destacado === true;
  const actual = tramo.actual === true;

  return (
    <div style={{ display: 'flex', gap: AIRE, alignItems: 'stretch' }}>
      <div style={{ flex: `0 0 ${RAIL}px`, position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {/* El raíl se corta arriba en el primero y abajo en el último: un camino
            que entra y sale del cuadro prometería tramos que no existen. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: primero ? 12 : 0,
            bottom: ultimo ? 'auto' : 0,
            height: ultimo ? 12 : undefined,
            width: 1,
            background: tokens.rail,
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'relative',
            marginTop: 8,
            width: NODO,
            height: NODO,
            borderRadius: '50%',
            flex: '0 0 auto',
            background: destacado ? color : tokens.bg,
            border: `1.6px solid ${color}`,
            boxShadow: halo(color, destacado, actual),
          }}
        />
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
        <span
          style={{
            font: `700 11px/1.1 ${tokens.fontMono}`,
            fontVariantNumeric: 'tabular-nums',
            color,
            letterSpacing: '0.06em',
          }}
        >
          {tramo.semanas}
        </span>
        <span style={{ font: `${destacado || actual ? 650 : 550} 14px/1.3 ${tokens.fontSans}`, color: tokens.fg }}>
          {tramo.titulo}
        </span>
        {tramo.detalle ? (
          <span style={{ font: `400 12.5px/1.4 ${tokens.fontSans}`, color: tokens.muted }}>
            {tramo.detalle}
          </span>
        ) : null}
        {actual ? (
          <span style={{ font: `600 12.5px/1.4 ${tokens.fontSans}`, color }}>{aquiEstas(tramo)}</span>
        ) : null}
      </div>
    </div>
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
