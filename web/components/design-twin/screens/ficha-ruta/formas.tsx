'use client';

// LAS FORMAS — cada formato con reloj, pareja o recorrido se dibuja como lo que es.
//
// Un reloj que manda (AMRAP, For Time); un EMOM como una pista de minutos que alternan, con su leyenda; una superserie como UNA tarjeta
// para la pareja; una simulación como un recorrido de estaciones en un raíl con la carrera entre una y otra.

import { COLOR_MODALIDAD } from '../../datos-reales';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import type { Bloque, Movimiento } from '../../kit-ficha/contrato';
import { colorDeModalidad, dosisDeMovimiento } from '../../kit-ficha/modelo';
import { Miniatura } from '../../kit-ficha/piezas';
import { FilaTocable } from './filas';
import { Tarjeta } from './tarjetas';

// ---------------------------------------------------------------------------
// Un reloj que manda (AMRAP, For Time)
// ---------------------------------------------------------------------------


export function Reloj({ grande, etiqueta }: { grande: string; etiqueta: string }) {
  return (
    <div
      style={{
        borderRadius: RADIO.tarjeta,
        padding: '16px 18px',
        background: tinte('var(--twin-accent)', 9, 'var(--twin-surface)'),
        border: `1px solid ${velo('var(--twin-accent)', 26)}`,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ ...fuente(800, 44, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }}>{grande}</span>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>
        {etiqueta}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMOM: la pista de minutos
// ---------------------------------------------------------------------------


/**
 * Un color por movimiento DENTRO de la pista, no el de su modalidad: dos movimientos de modalidades parecidas
 * (remo y wall balls son teal y verde) no se distinguirían, y la pista existe justo para ver que se alternan.
 */
const COLORES_DE_PISTA = ['var(--twin-accent)', 'var(--twin-info)', 'var(--twin-ok)', 'var(--twin-warning)'] as const;

export function PistaEmom({ b, minutos, alterna, onAbrir }: { b: Bloque; minutos: number; alterna: boolean; onAbrir: (m: Movimiento) => void }) {
  const columnas = minutos <= 12 ? 6 : 10;
  const indice = (i: number) => (alterna ? i % b.movimientos.length : 0);
  const color = (i: number) => COLORES_DE_PISTA[indice(i) % COLORES_DE_PISTA.length];
  return (
    <>
      <Reloj grande={`${minutos}:00`} etiqueta="EMOM" />
      <div
        role="img"
        aria-label={`${minutos} minutos${alterna ? ', alternando los movimientos' : ''}`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, 1fr)`, gap: 6 }}
      >
        {Array.from({ length: minutos }, (_, i) => (
          <span
            key={i}
            style={{
              height: 40,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: tinte(color(i), 24, 'var(--twin-surface)'),
              border: `1.5px solid ${velo(color(i), 70)}`,
              color: 'var(--twin-fg)',
              ...fuente(700, TAM.suelo, 1),
              ...TABULAR,
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {b.movimientos.map((m, i) => {
          const { principal, contra } = dosisDeMovimiento(m);
          return (
            <FilaTocable
              key={m.id}
              m={m}
              onAbrir={onAbrir}
              style={{
                minHeight: 64,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)',
              }}
            >
              <span aria-hidden style={{ width: 14, height: 14, borderRadius: 5, background: COLORES_DE_PISTA[(alterna ? i : 0) % COLORES_DE_PISTA.length], flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
                {m.rol ? <span style={{ ...fuente(400, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{m.rol}</span> : null}
              </div>
              <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', ...TABULAR }}>
                {principal ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{principal}</span> : null}
                {contra ? <span style={{ ...fuente(500, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{contra}</span> : null}
              </span>
            </FilaTocable>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Superserie: una pareja que se repite
// ---------------------------------------------------------------------------


export function Pareja({ b, rondas, descanso, onAbrir }: { b: Bloque; rondas: number; descanso?: string; onAbrir: (m: Movimiento) => void }) {
  return (
    <Tarjeta pad={0}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--twin-hairline)',
          ...fuente(700, TAM.suelo, 1.2),
          color: 'var(--twin-muted)',
        }}
      >
        <span>
          <b style={{ ...fuente(800, TAM.cuerpo, 1, true), color: 'var(--twin-fg)', ...TABULAR }}>{rondas}</b> rondas de la pareja
        </span>
        {descanso ? <span>desc. {descanso}</span> : null}
      </div>
      <div style={{ padding: '4px 16px 8px' }}>
        {b.movimientos.map((m, i) => {
          const { principal, contra } = dosisDeMovimiento(m);
          return (
            <FilaTocable
              key={m.id}
              m={m}
              onAbrir={onAbrir}
              style={{
                minHeight: 72,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)',
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  background: tinte(colorDeModalidad(m.modalidad), 20, 'var(--twin-surface)'),
                  color: 'var(--twin-fg)',
                  ...fuente(800, TAM.suelo, 1),
                }}
              >
                {m.rol}
              </span>
              <Miniatura m={m} ancho={64} />
              <span style={{ flex: 1, minWidth: 0, ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
              <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', ...TABULAR }}>
                {principal ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{principal}</span> : null}
                {contra ? <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)' }}>{contra}</span> : null}
              </span>
            </FilaTocable>
          );
        })}
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Recorrido: estaciones en un raíl, con la carrera entre una y otra
// ---------------------------------------------------------------------------


export function Recorrido({ b, carrera, onAbrir }: { b: Bloque; carrera: string; onAbrir: (m: Movimiento) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <span aria-hidden style={{ position: 'absolute', left: 17, top: 18, bottom: 18, width: 2, background: 'var(--twin-hairline-strong)' }} />
      {b.movimientos.map((m, i) => {
        const { principal, contra } = dosisDeMovimiento(m);
        return (
          <div key={m.id}>
            <Carrera carrera={carrera} primera={i === 0} />
            <FilaTocable
              m={m}
              onAbrir={onAbrir}
              style={{ display: 'grid', gridTemplateColumns: '36px 1fr', columnGap: 12, alignItems: 'center', minHeight: 64 }}
            >
              <span
                style={{
                  position: 'relative',
                  width: 36,
                  height: 36,
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
                {i + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Miniatura m={m} ancho={64} />
                <span style={{ flex: 1, minWidth: 0, ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
                <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', ...TABULAR }}>
                  {principal ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{principal}</span> : null}
                  {contra ? <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)' }}>{contra}</span> : null}
                </span>
              </div>
            </FilaTocable>
          </div>
        );
      })}
    </div>
  );
}

function Carrera({ carrera, primera }: { carrera: string; primera: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr', columnGap: 12, alignItems: 'center', minHeight: 34 }}>
      <span style={{ display: 'grid', placeItems: 'center' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD.run, boxShadow: '0 0 0 4px var(--twin-bg)' }} />
      </span>
      <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{primera ? `Sales corriendo ${carrera}` : `Corres ${carrera}`}</span>
    </div>
  );
}

