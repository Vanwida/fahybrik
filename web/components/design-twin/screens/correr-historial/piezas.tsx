'use client';

// LAS PIEZAS DE ESTA PANTALLA — dibujadas en la voz de `analiticas-correr`
// (mirándola, no de memoria): cero cajas, cero rayas divisorias, los grupos se
// separan por aire (24 dentro de un grupo, 48 entre grupos), trazos finos,
// cifras mono, etiquetas en versalita, el naranja reservado a lo interactivo
// activo. La densidad es de LISTA DE DATOS — el arquetipo del CONTRATO-UI
// §6.2 — no de tarjetas: sin `Card`, sin `GrupoFilas`.

import type { CSSProperties, ReactNode } from 'react';
import { Chevron, Etiqueta } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { esDecimal, ppm, ritmoKm } from '../../kit-composicion/formato';
import {
  ORDEN_TIPOS,
  TIPO_LABEL,
  TIPO_LABEL_FILTRO,
  diaCorto,
  fechaCorta,
  horasYMin,
  type Agregado,
  type CarreraFila,
  type Periodo,
  type TipoRun,
} from './modelo';

const RESET: CSSProperties = {
  all: 'unset',
  boxSizing: 'border-box',
  cursor: 'pointer',
  display: 'flex',
  width: '100%',
};

// ---------------------------------------------------------------------------
// LOS AGREGADOS — el sujeto: los kilómetros del periodo y sus salidas
// ---------------------------------------------------------------------------

export function Agregados({ agregado }: { agregado: Agregado }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="t-readout-m" style={{ color: 'var(--twin-fg)' }}>
          {esDecimal(agregado.km, 0)}
        </span>
        <span
          style={{
            font: '600 12px/1.2 var(--twin-font-sans)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--twin-muted)',
          }}
        >
          km
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.l, flexWrap: 'wrap' }}>
        <Estadistica valor={String(agregado.salidas)} unidad={agregado.salidas === 1 ? 'salida' : 'salidas'} />
        <Estadistica valor={horasYMin(agregado.segundos)} unidad="tiempo" />
        {agregado.desnivelM > 0 && <Estadistica valor={`+${Math.round(agregado.desnivelM)}`} unidad="m desnivel" />}
      </div>
    </div>
  );
}

function Estadistica({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ font: '700 16px/1 var(--twin-font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
        {valor}
      </span>
      <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL PERIODO — segmentado de cuatro, activo relleno
// ---------------------------------------------------------------------------

export function SegmentadoPeriodo({
  opciones,
  activo,
  onChange,
}: {
  opciones: { valor: Periodo; etiqueta: string }[];
  activo: Periodo;
  onChange: (v: Periodo) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {opciones.map((o) => {
        const on = o.valor === activo;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={on}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: R.pill,
              border: on ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
              background: on ? 'var(--twin-fg)' : 'transparent',
              color: on ? 'var(--twin-bg)' : 'var(--twin-muted)',
              font: '700 12px/1.2 var(--twin-font-sans)',
              cursor: 'pointer',
            }}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL FILTRO POR TIPO — plegado por defecto (CONTRATO §6.2: los filtros se pliegan)
// ---------------------------------------------------------------------------

export function FiltroTipo({
  abierto,
  activo,
  onToggle,
  onSeleccionar,
}: {
  abierto: boolean;
  activo: TipoRun | 'todos';
  onToggle: () => void;
  onSeleccionar: (v: TipoRun | 'todos') => void;
}) {
  const etiquetaActiva = activo === 'todos' ? 'Todos los tipos' : TIPO_LABEL_FILTRO[activo];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        style={{
          ...RESET,
          alignItems: 'center',
          gap: 6,
          padding: `${S.xs}px 0`,
        }}
      >
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{etiquetaActiva}</span>
        <span
          aria-hidden
          style={{
            color: 'var(--twin-faint)',
            fontSize: 10,
            transform: abierto ? 'rotate(180deg)' : 'none',
            transition: 'transform 160ms ease-out',
          }}
        >
          ▾
        </span>
      </button>
      {abierto && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip etiqueta="Todos" on={activo === 'todos'} onClick={() => onSeleccionar('todos')} />
          {ORDEN_TIPOS.map((t) => (
            <Chip key={t} etiqueta={TIPO_LABEL_FILTRO[t]} on={activo === t} onClick={() => onSeleccionar(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ etiqueta, on, onClick }: { etiqueta: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        padding: '6px 12px',
        borderRadius: R.pill,
        border: on ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
        background: on ? 'var(--twin-fg)' : 'transparent',
        color: on ? 'var(--twin-bg)' : 'var(--twin-muted)',
        font: '650 12px/1.2 var(--twin-font-sans)',
        cursor: 'pointer',
      }}
    >
      {etiqueta}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LA CABECERA DE SEMANA — fina, sin caja, con el subtotal a la derecha
// ---------------------------------------------------------------------------

export function CabeceraSemana({ lunes, km }: { lunes: string; km: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S.s }}>
      <Etiqueta>{`Semana del ${fechaCorta(lunes)}`}</Etiqueta>
      <span
        style={{
          font: '700 12px/1.2 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-muted)',
        }}
      >
        {esDecimal(km, 1)} km
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA FILA — un día, su tipo, sus tres cifras, y lo que la corona
// ---------------------------------------------------------------------------

export function FilaCarrera({ fila, onTap }: { fila: CarreraFila; onTap: () => void }) {
  const datos = [`${esDecimal(fila.km, 2)} km`, ritmoKm(fila.ritmoSKm), fila.fcMedia != null ? ppm(fila.fcMedia) : null]
    .filter((x): x is string => x != null)
    .join(' · ');

  const etiquetaAria = [
    `${TIPO_LABEL[fila.tipo]}${fila.nombre ? ` ${fila.nombre}` : ''}`,
    diaCorto(fila.fecha),
    datos,
    fila.record ? 'récord' : null,
    fila.veredicto === 'ok' ? 'dentro de lo pedido' : fila.veredicto === 'aviso' ? 'fuera de lo pedido' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button type="button" onClick={onTap} aria-label={etiquetaAria} style={{ ...RESET, alignItems: 'center', gap: S.m, padding: '10px 0' }}>
      <span
        style={{
          flex: '0 0 auto',
          width: 36,
          font: '700 12px/1.2 var(--twin-font-mono)',
          color: 'var(--twin-faint)',
        }}
      >
        {diaCorto(fila.fecha)}
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
          <Etiqueta>{TIPO_LABEL[fila.tipo]}</Etiqueta>
          {fila.nombre && (
            <span
              style={{
                font: '600 13px/1.2 var(--twin-font-sans)',
                color: 'var(--twin-fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              · {fila.nombre}
            </span>
          )}
        </span>
        <span
          style={{
            font: '600 12px/1.2 var(--twin-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-faint)',
          }}
        >
          {datos}
        </span>
      </span>

      {fila.record && <EstrellaRecord />}
      {fila.veredicto && <PuntoVeredicto tono={fila.veredicto} />}
      <Chevron />
    </button>
  );
}

/** Discreta: sin naranja. El naranja de marca no es un color de logro sostenido (§9.1). */
function EstrellaRecord() {
  return (
    <span aria-hidden style={{ color: 'var(--twin-muted)', fontSize: 13, lineHeight: 1, flex: '0 0 auto' }}>
      ★
    </span>
  );
}

/** Verde/ámbar por repetición, la misma paleta de veredicto que `Puntos` en analiticas-correr. */
function PuntoVeredicto({ tono }: { tono: 'ok' | 'aviso' }) {
  return (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: tono === 'ok' ? 'var(--twin-ok)' : 'var(--twin-warning)',
        flex: '0 0 auto',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SIN COINCIDENCIAS — hay historial, pero no con este filtro/periodo
// ---------------------------------------------------------------------------

export function SinCoincidencias({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: `${S.xl}px 0`,
        textAlign: 'center',
        font: '500 13px/1.4 var(--twin-font-sans)',
        color: 'var(--twin-muted)',
      }}
    >
      {children}
    </p>
  );
}
