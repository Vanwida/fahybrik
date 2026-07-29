'use client';

// La ruta: dónde estás dentro del bloque.
//
// Una fila cerrada no enseña el plan cumplido, enseña lo que PASÓ: su tiempo
// real y lo que leyó el aparato. Y si no lo medía nadie, solo el tiempo — esa
// ausencia es la información, no un hueco que rellenar con un guion.

import { Card, Hairline, IconChevron, Label, Mono, SP } from '../../kit';
// ---------------------------------------------------------------------------
// La ruta — la fila, el riel de tres y la hoja entera
// ---------------------------------------------------------------------------

export type EstadoFila = 'hecha' | 'activa' | 'pendiente';

export interface Fila {
  indice: number;
  /** El plan, tal cual lo pidió el coach. */
  plan: string;
  estado: EstadoFila;
  /** Lo que se midió y su tiempo real. Nulo mientras no esté cerrada. */
  hecho: string | null;
  color: string;
}

export function FilaTramo({ fila, alto }: { fila: Fila; alto: number }) {
  const hecha = fila.estado === 'hecha';
  const activa = fila.estado === 'activa';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        minHeight: alto,
        padding: `0 ${SP.m}px`,
        background: activa ? 'color-mix(in srgb, var(--twin-accent) 12%, transparent)' : 'transparent',
        borderLeft: `3px solid ${activa ? 'var(--twin-accent)' : 'transparent'}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flex: '0 0 auto',
          background: hecha ? 'transparent' : fila.color,
          border: hecha ? '1.5px solid var(--twin-faint)' : 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `${activa ? 700 : 500} 13px/1.2 var(--twin-font-sans)`,
          color: hecha ? 'var(--twin-faint)' : 'var(--twin-fg)',
          textDecoration: hecha ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {fila.plan}
      </span>
      {fila.hecho && (
        <Mono size={11} weight={hecha ? 500 : 700} color={hecha ? 'var(--twin-faint)' : 'var(--twin-accent-text)'}>
          {fila.hecho}
        </Mono>
      )}
    </div>
  );
}

/**
 * La ruta alrededor del cursor.
 *
 * `ventana` enseña TRES filas — la que cerraste, la que haces y la que viene —
 * en vez de la ruta entera. No es una preferencia estética: los apoyos de
 * `MarcoVivo` son ~213 pt (§10.3) y seis filas de ruta más la fila de lecturas
 * no caben ahí. Antes esto se «resolvía» dejando que el sujeto encogiera, que
 * es exactamente lo que la banda vino a impedir.
 *
 * `verTodas` añade además la salida a la hoja entera — hace falta cuando la
 * ruta son 16 estaciones y ni siquiera la hoja cabe en el cuerpo.
 */
export function Riel({
  filas,
  activo,
  alto = 40,
  ventana = false,
  verTodas,
}: {
  filas: Fila[];
  activo: number;
  alto?: number;
  /** Tres filas alrededor del cursor en vez de la ruta entera. */
  ventana?: boolean;
  verTodas?: { etiqueta: string; onClick: () => void };
}) {
  const visibles = ventana
    ? [filas[activo - 1], filas[activo], filas[activo + 1]].filter((f): f is Fila => Boolean(f))
    : filas;
  return (
    <div style={{ flex: '0 0 auto' }}>
      <Card padding={0}>
        {visibles.map((f, i) => (
          <div key={f.indice}>
            {i > 0 && <Hairline />}
            <FilaTramo fila={f} alto={alto} />
          </div>
        ))}
        {verTodas && (
          <>
            <Hairline />
            <button
              type="button"
              onClick={verTodas.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                height: 38,
                padding: `0 ${SP.m}px`,
                background: 'transparent',
                border: 0,
                color: 'var(--twin-fg)',
                font: '600 13px var(--twin-font-sans)',
                cursor: 'pointer',
              }}
            >
              {verTodas.etiqueta}
              <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
                <IconChevron size={12} />
              </span>
            </button>
          </>
        )}
      </Card>
    </div>
  );
}

/** La hoja con la ruta entera. Se abre encima del cuerpo; la franja se queda. */
export function HojaRuta({
  titulo,
  filas,
  resumen,
  columnas = 1,
}: {
  titulo: string;
  filas: Fila[];
  resumen: string;
  /**
   * En horizontal la hoja RECOMPONE en dos columnas en vez de encoger: hay
   * 756 pt de ancho y 381 de alto, así que partir las 16 en 8 y 8 las enseña
   * TODAS de una sin scroll. Esconderlas detrás de una inercia vertical sería
   * desperdiciar justo lo que sobra.
   */
  columnas?: 1 | 2;
}) {
  const corte = Math.ceil(filas.length / columnas);
  const grupos = columnas === 1 ? [filas] : [filas.slice(0, corte), filas.slice(corte)];
  return (
    // Sin relleno propio: el marco ya lo pone, y doblarlo dejaba la lista
    // sangrada respecto del cromo que tiene justo encima.
    <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
        <Label size={11}>{titulo}</Label>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{resumen}</span>
      </div>
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: SP.s }}>
        {grupos.map((grupo, g) => (
          <div key={g} style={{ flex: 1, minWidth: 0 }}>
            <Card padding={0}>
              {grupo.map((f, i) => (
                <div key={f.indice}>
                  {i > 0 && <Hairline />}
                  <FilaTramo fila={f} alto={columnas === 2 ? 36 : 38} />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
