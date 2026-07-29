'use client';

// Átomos COMPARTIDOS entre `hoy.tsx` y `propuesta.tsx` — CONTRATO-UI §0: si las
// dos vistas los necesitan, viven aquí y no se copian dos veces (así nacieron
// los seis relojes distintos que motivaron el contrato).
//
// El cromo (`TopStrip`, `PhaseRail`) es LITERALMENTE el mismo en las dos
// vistas: el diagnóstico de esta pantalla no es "el cromo está mal", es "lo
// que hay DEBAJO del cromo no gana su altura". Por eso no se reinventa entre
// vistas — se reutiliza a propósito, para que el contraste sea limpio.
//
// `CURSOR_HYROX` fabrica los tiempos de la estación activa: no hay ninguna
// ejecución medida de esta asignación en `datos-reales.ts` (es la plantilla
// 441, sin `workout_executions` en el corpus de composición), así que se
// inventan UNA sola vez aquí y las dos vistas describen el MISMO instante.

import type { ReactNode } from 'react';
import { IconCheckCircle, IconChevron, IconCircle, IconClose, Label, Mono, RAD } from '../../kit';
import { HYROX, type ItemReal } from '../../datos-reales';

// ---------------------------------------------------------------------------
// topStrip — el cromo de salir/pausa/atrás + fase/segmento + índice global
// ---------------------------------------------------------------------------

export function TopStrip({
  faseLabel,
  segmentoTitulo,
  indice,
  total,
  puedeVolver = true,
}: {
  faseLabel: string | null;
  segmentoTitulo: string;
  indice: number;
  total: number;
  puedeVolver?: boolean;
}) {
  const iconBtn = (child: ReactNode, label: string, dim = false) => (
    <button
      type="button"
      aria-label={label}
      style={{
        width: 26,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        color: 'var(--twin-muted)',
        opacity: dim ? 0.3 : 1,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {child}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      {iconBtn(<IconClose size={13} />, 'Salir del entreno')}
      {iconBtn(<span style={{ fontSize: 16 }}>‖</span>, 'Pausar entreno')}
      {iconBtn(<IconChevron dir="left" size={13} />, 'Volver atrás', !puedeVolver)}
      {/* UN solo Spacer, como en el Swift: título e índice viajan juntos a la derecha. */}
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {faseLabel && (
          <span
            style={{
              font: 'italic 800 9px/1.1 var(--twin-font-sans)',
              letterSpacing: '0.08em',
              color: 'var(--twin-accent-text)',
            }}
          >
            {faseLabel.toUpperCase()}
          </span>
        )}
        <Mono size={11} color="var(--twin-muted)">{segmentoTitulo.toUpperCase()}</Mono>
      </div>
      <Mono size={11} color="var(--twin-muted)" style={{ marginLeft: 10 }}>{indice}/{total}</Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// phaseRail — las 3 pastillas de bloque (o 1 sola pastilla "Entreno" sin ellos)
// ---------------------------------------------------------------------------

export type FaseEstado = 'hecha' | 'actual' | 'futura';
export interface FasePill { titulo: string; estado: FaseEstado }

export function PhaseRail({ fases }: { fases: FasePill[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
      {fases.map((f) => (
        <div
          key={f.titulo}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '9px 4px',
            borderRadius: RAD.s,
            background: f.estado === 'actual' ? 'var(--twin-accent)' : 'var(--twin-surface)',
            color: f.estado === 'actual' ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
            border: `${f.estado === 'actual' ? 1.5 : 1}px solid ${
              f.estado === 'actual' ? 'var(--twin-accent-text)' : 'var(--twin-hairline)'
            }`,
            opacity: f.estado === 'futura' ? 0.5 : 1,
          }}
        >
          {f.estado === 'hecha' && <span style={{ fontSize: 9, fontWeight: 800 }}>✓</span>}
          <span
            style={{
              font: 'italic 800 10px/1 var(--twin-font-sans)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {f.titulo}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ForTimeContextStrip — el reloj del bloque, permanente (es la puntuación)
// ---------------------------------------------------------------------------

export function ContextStripForTime({ indiceActivo, total, reloj }: { indiceActivo: number; total: number; reloj: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '8px 12px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
      }}
    >
      <span style={{ font: '800 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-accent-text)' }}>
        FOR TIME
      </span>
      <span style={{ font: '700 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{indiceActivo} de {total}</span>
      <span style={{ flex: 1 }} />
      <Mono size={17} weight={600}>{reloj}</Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricRow3 — tres celdas: label 9px arriba, cifra mono 20px debajo
// ---------------------------------------------------------------------------

export interface MetricCelda { label: string; valor: string; unidad?: string; color?: string }

export function MetricRow3({ celdas }: { celdas: MetricCelda[] }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {celdas.map((c) => (
        <div
          key={c.label}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '10px 10px',
            borderRadius: RAD.m,
            background: 'var(--twin-surface-elevated)',
            border: '1px solid var(--twin-hairline)',
          }}
        >
          <Label size={9}>{c.label}</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <Mono size={20} weight={800} color={c.color ?? 'var(--twin-fg)'}>{c.valor}</Mono>
            {c.unidad && <Label size={9}>{c.unidad}</Label>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La ruta de la simulación — fabricación declarada del cursor + la fila
// ---------------------------------------------------------------------------

export const CURSOR_HYROX = {
  /** Sled Push — estación 4 de 16 (índice 0-based sobre HYROX.bloques[1].items). */
  indiceActivo: 3,
  relojBloque: '13:31',
  enEstacion: '2:14',
  fcPpm: 154,
  /** Run · SkiErg · Run — las tres estaciones ya cerradas, en orden. */
  parciales: ['4:38', '4:12', '4:41'],
} as const;

export type EstadoFila = 'hecha' | 'activa' | 'pendiente';
export interface FilaRuta { indice: number; item: ItemReal; estado: EstadoFila; parcial?: string }

export function rutaHyrox(): FilaRuta[] {
  return HYROX.bloques[1].items.map((item, indice) => {
    if (indice < CURSOR_HYROX.indiceActivo) {
      return { indice, item, estado: 'hecha', parcial: CURSOR_HYROX.parciales[indice] };
    }
    if (indice === CURSOR_HYROX.indiceActivo) return { indice, item, estado: 'activa' };
    return { indice, item, estado: 'pendiente' };
  });
}

/**
 * `"\(work)  \(name)"` del StrikeList — la dosis manda, el nombre la sigue.
 * Ninguna estación de la ruta de HYROX llega sin dosis, pero `ItemReal.dosis`
 * es `string | null` (el circuito de pierna del coach SÍ trae huecos), así
 * que la regla del propio tipo aplica aquí también: nulo se pinta como el
 * nombre solo, nunca con un guion ni un 0 (`datos-reales.ts`, §7).
 */
export function lineaItem(item: ItemReal): string {
  return item.dosis ? `${item.dosis} ${item.nombre}` : item.nombre;
}

/** La fila de una estación — la reutilizan la lista de 16 (hoy) y la ventana de 3 (propuesta). */
export function EstacionRow({ fila }: { fila: FilaRuta }) {
  const { item, estado, parcial } = fila;
  const activa = estado === 'activa';
  const hecha = estado === 'hecha';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 12px',
        background: activa ? 'color-mix(in srgb, var(--twin-accent) 8%, transparent)' : 'transparent',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `${activa ? 700 : 600} 14px/1.2 var(--twin-font-sans)`,
          color: hecha ? 'var(--twin-faint)' : 'var(--twin-fg)',
          textDecoration: hecha ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lineaItem(item)}
      </span>
      {hecha && parcial && <Mono size={11} color="var(--twin-faint)">{parcial}</Mono>}
      {activa && <Mono size={11} weight={700} color="var(--twin-accent-text)">{CURSOR_HYROX.enEstacion}</Mono>}
      {hecha && <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}><IconCheckCircle size={14} /></span>}
      {activa && <span style={{ color: 'var(--twin-accent-text)', display: 'inline-flex' }}><IconCircle size={15} /></span>}
    </div>
  );
}
