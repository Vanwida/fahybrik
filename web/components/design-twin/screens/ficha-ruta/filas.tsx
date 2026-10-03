'use client';

// LAS FILAS — todo lo que se lee de un vistazo cuando un bloque lleva varios movimientos: un AMRAP, un For Time, una tanda de fuerza,
// un calentamiento, las piezas de un test.
//
// Una fila dice, en ESE orden: el nombre; debajo y apagado, lo que se hace distinto (el %RM, el tempo, el descanso), las cargas de una
// rampa y lo que escribió el coach para ese movimiento (dos líneas como mucho: entera, en la hoja de técnica); y a la derecha la dosis y
// contra qué. Sin dosis, el nombre solo.
//
//   · `miniatura`: con la miniatura del movimiento. Lo normal en un bloque de trabajo.
//   · `compacta`: sin miniatura y con «dosis · contra» apagado: en un calentamiento lo que importa es que no se olvide uno.
//   · `numerada`: las piezas de una secuencia, una detrás de otra: un nodo numerado sobre un raíl en lugar de la miniatura.
//
// Una tarjeta GRANDE por movimiento solo cuando el movimiento es lo único del bloque (`tarjetas.tsx`): con varios, cada uno en su
// tarjeta hacía scrollear una pantalla entera para ver cinco ejercicios y se perdía el hilo de qué había que hacer.

import type { CSSProperties, ReactNode } from 'react';
import { fuente, TABULAR, TAM, tinte } from '../../kit-dia/tokens';
import type { Bloque, Movimiento } from '../../kit-ficha/contrato';
import { colorDeModalidad, columnaDeFila, columnaEnUnaLinea, lineaDeSeries, lineaSecundaria } from '../../kit-ficha/modelo';
import { Miniatura } from '../../kit-ficha/piezas';

/** Una fila que abre la técnica de su movimiento al tocarla (o una fila quieta si no hay quién la abra). */
export function FilaTocable({
  m,
  onAbrir,
  style,
  children,
}: {
  m: Movimiento;
  onAbrir?: (m: Movimiento) => void;
  style: CSSProperties;
  children: ReactNode;
}) {
  if (!onAbrir) return <div style={style}>{children}</div>;
  return (
    <button type="button" className="fi-btn fi-fila" aria-label={`${m.nombre}. Ver la técnica`} onClick={() => onAbrir(m)} style={style}>
      {children}
    </button>
  );
}


export type EstiloDeLista = 'miniatura' | 'compacta' | 'numerada';

/** El nodo de una pieza numerada y lo que se queda corto el raíl por arriba y por abajo. */
const NODO = 30;
const RECORTE_DEL_RAIL = 20;
/** Las líneas que ocupa como mucho lo que escribió el coach en una fila. */
const LINEAS_DE_LA_NOTA = 2;
const ALTO_MINIMO: Record<EstiloDeLista, number> = { miniatura: 64, compacta: 48, numerada: 56 };

function Apagado({ children, lineas }: { children: ReactNode; lineas?: number }) {
  const recortado: CSSProperties = lineas
    ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lineas, overflow: 'hidden' }
    : {};
  return <span style={{ ...fuente(400, TAM.suelo, 1.3), color: 'var(--twin-muted)', overflowWrap: 'anywhere', ...recortado }}>{children}</span>;
}

/** El nombre y, debajo y apagado, lo que se hace distinto, las cargas de una rampa y lo que escribió el coach. */
function Textos({ m, fuerte }: { m: Movimiento; fuerte: boolean }) {
  const secundaria = lineaSecundaria(m);
  const cargas = lineaDeSeries(m);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...fuente(fuerte ? 650 : 500, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', overflowWrap: 'anywhere' }}>{m.nombre}</span>
      {secundaria ? <Apagado>{secundaria}</Apagado> : null}
      {cargas ? <Apagado>{cargas}</Apagado> : null}
      {m.nota ? <Apagado lineas={LINEAS_DE_LA_NOTA}>{m.nota}</Apagado> : null}
    </div>
  );
}

function Derecha({ m, estilo }: { m: Movimiento; estilo: EstiloDeLista }) {
  if (estilo === 'compacta') {
    const linea = columnaEnUnaLinea(m);
    return linea ? <span style={{ textAlign: 'right', ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', ...TABULAR }}>{linea}</span> : null;
  }
  const { principal, contra } = columnaDeFila(m);
  const fuerte = estilo === 'numerada';
  return (
    <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, ...TABULAR }}>
      {principal ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{principal}</span> : null}
      {contra ? <span style={{ ...fuente(fuerte ? 700 : 500, TAM.suelo, 1.2), color: fuerte ? 'var(--twin-fg)' : 'var(--twin-muted)' }}>{contra}</span> : null}
    </span>
  );
}

function Nodo({ numero, m }: { numero: number; m: Movimiento }) {
  return (
    <span
      style={{
        width: NODO,
        height: NODO,
        flex: '0 0 auto',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: tinte(colorDeModalidad(m.modalidad), 28, 'var(--twin-bg)'),
        border: `2px solid ${colorDeModalidad(m.modalidad)}`,
        color: 'var(--twin-fg)',
        ...fuente(800, TAM.suelo, 1),
        ...TABULAR,
      }}
    >
      {numero}
    </span>
  );
}

export function Lista({ b, estilo = 'miniatura', onAbrir }: { b: Bloque; estilo?: EstiloDeLista; onAbrir?: (m: Movimiento) => void }) {
  const numerada = estilo === 'numerada';
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {numerada ? (
        <span aria-hidden style={{ position: 'absolute', left: NODO / 2 - 1, top: RECORTE_DEL_RAIL, bottom: RECORTE_DEL_RAIL, width: 2, background: 'var(--twin-hairline-strong)' }} />
      ) : null}
      {b.movimientos.map((m, i) => (
        <FilaTocable
          key={m.id}
          m={m}
          onAbrir={onAbrir}
          style={{
            position: 'relative',
            minHeight: ALTO_MINIMO[estilo],
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: estilo === 'compacta' ? '6px 0' : '8px 0',
            borderTop: i === 0 || numerada ? 'none' : '1px solid var(--twin-hairline)',
          }}
        >
          {estilo === 'miniatura' ? <Miniatura m={m} ancho={64} /> : null}
          {numerada ? <Nodo numero={i + 1} m={m} /> : null}
          <Textos m={m} fuerte={estilo !== 'compacta'} />
          <Derecha m={m} estilo={estilo} />
        </FilaTocable>
      ))}
    </div>
  );
}
