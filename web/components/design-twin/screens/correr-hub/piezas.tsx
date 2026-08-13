'use client';

// LAS PUERTAS — el bloque atómico de este hub.
//
// Una puerta es SIEMPRE la misma forma: etiqueta versalita, su contenido
// (una cifra, una lista corta, unos chips…), y un chevron discreto centrado
// a la derecha de TODO el bloque — no pegado a la etiqueta, no pegado a la
// cifra: es el tratamiento único que dice «esto se entra», igual en las
// nueve puertas del hub aunque su contenido cambie de forma.
//
// EL ACABADO ES EL DE `analiticas-correr` (Alex, 13-ago): se reimportan sus
// piezas (`Cifra`, `Delta`, `Etiqueta`, `Apagado`, `Puntos`, `Barras`) en vez
// de reescribirlas — es la MISMA pantalla en otra composición, así que no
// puede sonar distinta. Lo único nuevo aquí es la fila-puerta y las dos
// piezas de dato que ese hub no necesitaba: la sesión reciente y el chip de
// tipo, porque `analiticas-correr` nunca listaba sesiones sueltas.

import type { ReactNode } from 'react';
import { Chevron } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { diaCorto, ppm } from '../../kit-composicion/formato';
import { Apagado } from '../analiticas-correr/graficos';
import { Etiqueta } from '../analiticas-correr/piezas';
import type { SesionReciente } from './datos';

// ---------------------------------------------------------------------------
// EL RAIL — el cromo real de la tab. Copia intencionada de `analiticas-correr`
// ---------------------------------------------------------------------------
//
// Es la SEGUNDA vez que este rail se escribe (la primera, en la tira que este
// hub sustituye). Dos repeticiones se anotan, no se generalizan todavía
// (§0 del contrato: el sitio compartido es el kit, y el kit está bloqueado
// mientras hay agentes en paralelo sobre él). El día que el hub sea el nivel
// 0 de verdad y la tira se retire, esta copia es la que queda — la de la
// tira se borra con ella.

const SECCIONES = ['Carrera', 'Ergo', 'Fuerza', 'HYROX', 'Recup.'];

export function Rail() {
  return (
    <div className="twin-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
      {SECCIONES.map((s, i) => (
        <span
          key={s}
          style={{
            flex: '0 0 auto',
            padding: '5px 12px',
            borderRadius: 9999,
            font: '700 12px/1.2 var(--twin-font-sans)',
            background: i === 0 ? 'var(--twin-fg)' : 'transparent',
            color: i === 0 ? 'var(--twin-bg)' : 'var(--twin-muted)',
            border: i === 0 ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA PUERTA — etiqueta + contenido libre + chevron centrado a la derecha
// ---------------------------------------------------------------------------

export function Puerta({ etiqueta, onTap, children }: { etiqueta: string; onTap: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S.s }}>
        <Etiqueta>{etiqueta}</Etiqueta>
        {children}
      </div>
      <Chevron />
    </button>
  );
}

/** Una lectura sin cobertura ACCIONABLE (§6.2bis): la silueta tenue de
 *  `analiticas-correr`, y el tap aterriza directo en su arreglo — nunca en
 *  un texto pidiendo el test. */
export function PuertaApagada({ etiqueta, alto = 60, onTap }: { etiqueta: string; alto?: number; onTap: () => void }) {
  return (
    <Puerta etiqueta={etiqueta} onTap={onTap}>
      <Apagado alto={alto} />
    </Puerta>
  );
}

// ---------------------------------------------------------------------------
// EL DATO MENOR — un número mono con su etiqueta debajo, sin caja
// ---------------------------------------------------------------------------

export function DatoMenor({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 700,
          fontSize: 15,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {valor}
      </span>
      <span style={{ font: '600 9px/1.2 var(--twin-font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
        {unidad}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// LOS CHIPS DE TIPO — «Series 12 · Rodajes 18 · Largos 6», sin caja
// ---------------------------------------------------------------------------

export function ChipsTipo({ items }: { items: { tipo: string; sesiones: number }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 5, font: '600 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
      {items.map((t, i) => (
        <span key={t.tipo}>
          {i > 0 && <span style={{ color: 'var(--twin-faint)' }}>· </span>}
          {t.tipo}{' '}
          <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 700, color: 'var(--twin-fg)' }}>{t.sesiones}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA FILA DE SESIÓN — «Tus carreras» son tres de éstas, no un gráfico
// ---------------------------------------------------------------------------
//
export function FilaSesion({ s, ritmoKm, esDecimal }: { s: SesionReciente; ritmoKm: (v: number) => string; esDecimal: (v: number, d?: number) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: S.m }}>
      <span style={{ width: 46, flex: '0 0 auto', whiteSpace: 'nowrap', fontFamily: 'var(--twin-font-mono)', fontWeight: 600, fontSize: 11, color: 'var(--twin-faint)' }}>
        {diaCorto(s.fecha)}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: '700 11px/1.2 var(--twin-font-sans)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {s.tipo}
      </span>
      <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
        {esDecimal(s.km)} km
      </span>
      <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--twin-muted)' }}>
        {ritmoKm(s.ritmo_s_km)}
      </span>
      {s.fc_media != null && (
        <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--twin-faint)' }}>
          {ppm(s.fc_media)}
        </span>
      )}
    </div>
  );
}

// `diaCorto` y `horasYMin` viven en el kit desde el 13-ago (§2.1): nacieron
// locales aquí mientras el kit estaba bloqueado y se promovieron el mismo día.
export { horasYMin } from '../../kit-composicion/formato';
