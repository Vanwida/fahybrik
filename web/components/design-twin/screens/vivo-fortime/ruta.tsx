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
 * Con `verTodas` enseña tres filas y una salida a la hoja entera — es lo que
 * hace falta cuando la ruta son 16 estaciones y no caben sin comerse al
 * sujeto. Sin `verTodas` las enseña TODAS: con seis tandas la ruta entera cabe,
 * y esconder cuatro filas detrás de un botón para abrir una hoja que enseña lo
 * mismo sería cromo por cromo.
 */
export function Riel({
  filas,
  activo,
  alto = 44,
  verTodas,
}: {
  filas: Fila[];
  activo: number;
  alto?: number;
  verTodas?: { etiqueta: string; onClick: () => void };
}) {
  const ventana = verTodas
    ? [filas[activo - 1], filas[activo], filas[activo + 1]].filter((f): f is Fila => Boolean(f))
    : filas;
  return (
    <div style={{ flex: '0 0 auto' }}>
      <Card padding={0}>
        {ventana.map((f, i) => (
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
                height: 42,
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
}: {
  titulo: string;
  filas: Fila[];
  resumen: string;
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s, padding: SP.m }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
        <Label size={11}>{titulo}</Label>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{resumen}</span>
      </div>
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Card padding={0}>
          {filas.map((f, i) => (
            <div key={f.indice}>
              {i > 0 && <Hairline />}
              <FilaTramo fila={f} alto={38} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
