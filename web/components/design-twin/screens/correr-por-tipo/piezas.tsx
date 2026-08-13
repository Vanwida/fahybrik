'use client';

// LAS PIEZAS DE ESTA PANTALLA — en la voz de `analiticas-correr` (mirándola):
// cero cajas, cero rayas divisorias, etiqueta en versalita + aire como único
// separador, cifras mono tabulares, el naranja reservado a lo interactivo
// activo (el chip encendido, nunca un color de dato).

import type { CSSProperties, ReactNode } from 'react';
import { Chevron } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { ppm, ritmoKm } from '../../kit-composicion/formato';
import { diaCorto, ORDEN_TIPOS, TIPO_LABEL, type Metrica, type SesionTipo, type TipoPorEntreno } from './modelo';

const RESET: CSSProperties = { all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', width: '100%' };

// ---------------------------------------------------------------------------
// LA ETIQUETA — versalita diminuta, el único separador entre bloques
// ---------------------------------------------------------------------------

export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="t-readout-label" style={{ color: 'var(--twin-faint)', letterSpacing: '0.18em' }}>
      {children}
    </span>
  );
}

export function Marca({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--twin-font-mono)',
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: '0.06em',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--twin-faint)',
      }}
    >
      {children}
    </span>
  );
}

export function Bloque({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
      <Etiqueta>{etiqueta}</Etiqueta>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// LA CIFRA + SU DELTA — mismo recorte que `analiticas-correr/piezas.tsx`:
// mono tabular, la unidad pequeña al lado, la flecha significa «mejor», no «más»
// ---------------------------------------------------------------------------

export function Cifra({
  valor,
  unidad,
  tam = 44,
  tono = 'var(--twin-fg)',
  children,
}: {
  valor: string;
  unidad?: string;
  tam?: number;
  tono?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          fontSize: tam,
          lineHeight: 0.9,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.045em',
          color: tono,
        }}
      >
        {valor}
      </span>
      {unidad && (
        <span style={{ font: '600 11px/1.2 var(--twin-font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>
          {unidad}
        </span>
      )}
      {children}
    </div>
  );
}

export function Delta({ mejor, valor, ventana }: { mejor: boolean | null; valor: string; ventana: string }) {
  const tono = mejor == null ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      {mejor != null && <span style={{ font: '700 11px/1 var(--twin-font-sans)', color: tono }}>{mejor ? '▲' : '▼'}</span>}
      <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 700, fontSize: 14, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: tono }}>
        {valor}
      </span>
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.08em', color: 'var(--twin-faint)' }}>{ventana}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// LOS CHIPS — el filtro ES la navegación (brief de Alex): activo lleno, resto
// contorno, cada uno con su recuento fino. Un contador se pinta en cero
// (CONTRATO §6.2 bis): «Fartlek 0» es información, no un hueco que esconder.
// ---------------------------------------------------------------------------

export function RielTipos({
  activo,
  recuentoDe,
  onSeleccionar,
}: {
  activo: TipoPorEntreno;
  recuentoDe: (t: TipoPorEntreno) => number;
  onSeleccionar: (t: TipoPorEntreno) => void;
}) {
  return (
    <div className="twin-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
      {ORDEN_TIPOS.map((t) => {
        const on = t === activo;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSeleccionar(t)}
            aria-pressed={on}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 5,
              padding: '7px 12px',
              borderRadius: R.pill,
              border: on ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
              background: on ? 'var(--twin-fg)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <span style={{ font: '700 12px/1.2 var(--twin-font-sans)', color: on ? 'var(--twin-bg)' : 'var(--twin-muted)' }}>
              {TIPO_LABEL[t]}
            </span>
            <span
              style={{
                fontFamily: 'var(--twin-font-mono)',
                fontWeight: 700,
                fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums',
                color: on ? 'color-mix(in srgb, var(--twin-bg) 60%, transparent)' : 'var(--twin-faint)',
              }}
            >
              {recuentoDe(t)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA FILA DE SESIÓN — fecha, dosis, ritmo, y el dato de cola (FC o % en banda)
// ---------------------------------------------------------------------------

export function FilaSesion({
  sesion,
  metrica,
  colaExtra,
  destacada,
  onTap,
}: {
  sesion: SesionTipo;
  metrica: Metrica;
  /** «fc» en la lista de sesiones; «banda» en la fila destacada (brief de Alex:
   *  la mejor sesión enseña % en banda donde las demás enseñan FC). */
  colaExtra: 'fc' | 'banda';
  destacada?: boolean;
  onTap: () => void;
}) {
  const ritmoMostrado = metrica === 'ritmo_al_pulso' && sesion.ritmo_al_pulso_s_km != null ? sesion.ritmo_al_pulso_s_km : sesion.ritmo_s_km;
  const extra =
    colaExtra === 'fc'
      ? sesion.fc_media_ppm != null
        ? ppm(sesion.fc_media_ppm)
        : null
      : sesion.pct_en_banda != null
        ? `${sesion.pct_en_banda} % en banda`
        : null;
  const datos = [ritmoKm(ritmoMostrado), extra].filter((x): x is string => x != null).join(' · ');

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${sesion.dosis}, ${diaCorto(sesion.fecha)}, ${datos}`}
      style={{ ...RESET, alignItems: 'center', gap: S.m, padding: '10px 0' }}
    >
      <span style={{ flex: '0 0 auto', width: 36, font: '700 12px/1.2 var(--twin-font-mono)', color: 'var(--twin-faint)' }}>
        {diaCorto(sesion.fecha)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
        <span
          style={{
            font: destacada ? '700 14px/1.25 var(--twin-font-sans)' : '600 13px/1.25 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sesion.dosis}
        </span>
        <span style={{ font: '600 12px/1.2 var(--twin-font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-faint)' }}>
          {datos}
        </span>
      </span>
      {destacada && (
        <span aria-hidden style={{ color: 'var(--twin-muted)', fontSize: 13, lineHeight: 1, flex: '0 0 auto' }}>
          ★
        </span>
      )}
      <Chevron />
    </button>
  );
}

// ---------------------------------------------------------------------------
// UN TIPO SIN SESIONES — el contador puede estar en cero (§6.2 bis): se dice
// sin pedir una acción que esta pantalla no puede resolver por ti.
// ---------------------------------------------------------------------------

export function SinTipo({ tipo }: { tipo: TipoPorEntreno }) {
  return (
    <p
      style={{
        margin: 0,
        padding: `${S.xxl}px 0`,
        textAlign: 'center',
        font: '500 13px/1.45 var(--twin-font-sans)',
        color: 'var(--twin-muted)',
      }}
    >
      {`Aún no has corrido ${TIPO_LABEL[tipo].toLowerCase()}.`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// PROGRESIÓN ESCASA — honesto: se listan las sesiones, no se inventa una línea
// ---------------------------------------------------------------------------

export function ProgresionEscasa() {
  return (
    <p style={{ margin: 0, font: '500 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
      Con unas cuantas más te digo si mejoras.
    </p>
  );
}
