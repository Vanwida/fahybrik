'use client';

// LAS TARJETAS — un movimiento EN GRANDE: lo que ocupa la pantalla cuando es lo único del bloque.
//
// Una tarjeta de fuerza enseña el ejercicio con su miniatura, su dosis grande y las series una a una; una carrera por tramos, su
// forma (barras) y los pares ritmo / recuperación; un rodaje, su dosis enorme. Con VARIOS movimientos en el bloque no hay tarjetas:
// van en filas (`filas.tsx`), para verlos todos de una vez sin scrollear una pantalla entera.

import type { ReactNode } from 'react';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import type { Movimiento } from '../../kit-ficha/contrato';
import {
  colorDeModalidad,
  datosDePerfil,
  dosisDeMovimiento,
  lineaSecundaria,
  rangoDeCarga,
  textoSerie,
  tieneSeriesDistintas,
  trabajoComunDeSeries,
} from '../../kit-ficha/modelo';
import { Miniatura, PastillaZona, PerfilDeTramos } from '../../kit-ficha/piezas';

// ---------------------------------------------------------------------------
// Una tarjeta de ejercicio (fuerza y accesorios)
// ---------------------------------------------------------------------------

export function Tarjeta({ children, pad = 14, alTocar, etiqueta }: { children: ReactNode; pad?: number; alTocar?: () => void; etiqueta?: string }) {
  const cara = {
    borderRadius: RADIO.tarjeta,
    padding: pad,
    background: 'var(--twin-surface)',
    border: '1px solid var(--twin-hairline)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  };
  if (alTocar) {
    return (
      <button type="button" className="fi-btn" aria-label={etiqueta} onClick={alTocar} style={cara}>
        {children}
      </button>
    );
  }
  return (
    <div
      style={{
        borderRadius: RADIO.tarjeta,
        padding: pad,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function CabezaDeEjercicio({ m }: { m: Movimiento }) {
  const sub = lineaSecundaria(m);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Miniatura m={m} ancho={84} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)', overflowWrap: 'anywhere' }}>{m.nombre}</span>
        {sub ? <span style={{ ...fuente(400, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{sub}</span> : null}
      </div>
    </div>
  );
}

export function TarjetaEjercicio({ m, onAbrir }: { m: Movimiento; onAbrir: (m: Movimiento) => void }) {
  const { principal, contra } = dosisDeMovimiento(m);
  const rampa = tieneSeriesDistintas(m);
  // Si todas las series hacen lo mismo salvo la carga, las reps se dicen UNA vez y cada ficha lleva solo los kilos.
  const trabajoComun = trabajoComunDeSeries(m);
  return (
    <Tarjeta alTocar={() => onAbrir(m)} etiqueta={`${m.nombre}. Ver la técnica`}>
      <CabezaDeEjercicio m={m} />
      {principal !== null || contra !== null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 14px', ...TABULAR }}>
          {principal !== null ? (
            <span style={{ ...fuente(800, 30, 1.05, true), letterSpacing: '-0.015em', color: 'var(--twin-fg)' }}>{principal}</span>
          ) : null}
          {m.zona ? (
            <PastillaZona zona={m.zona} />
          ) : contra !== null ? (
            <span style={{ ...fuente(700, 20, 1.1), color: 'var(--twin-fg)' }}>{contra}</span>
          ) : null}
        </div>
      ) : null}
      {rampa ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {m.series!.map((s, i) => (
            <span
              key={i}
              style={{
                minHeight: 36,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 12px',
                borderRadius: 12,
                background: tinte(colorDeModalidad(m.modalidad), 14, 'var(--twin-surface)'),
                border: `1px solid ${velo(colorDeModalidad(m.modalidad), 30)}`,
                color: 'var(--twin-fg)',
                ...fuente(600, TAM.suelo, 1),
                ...TABULAR,
              }}
            >
              <span style={{ color: 'var(--twin-muted)', fontWeight: 500 }}>{i + 1}</span>
              {trabajoComun !== null ? (s.carga ?? s.trabajo) : textoSerie(s)}
            </span>
          ))}
        </div>
      ) : null}
      {trabajoComun !== null ? (
        <p style={{ margin: 0, ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
          Cada serie, {trabajoComun}
          {rangoDeCarga(m) ? ` · sube de ${rangoDeCarga(m)}` : ''}
        </p>
      ) : rampa && rangoDeCarga(m) ? (
        <p style={{ margin: 0, ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>Sube de {rangoDeCarga(m)}</p>
      ) : null}
      {m.nota ? (
        <p
          style={{
            margin: 0,
            padding: '2px 0 2px 12px',
            borderLeft: '3px solid var(--twin-accent)',
            ...fuente(400, TAM.suelo, 1.4),
            color: 'var(--twin-fg)',
          }}
        >
          {m.nota}
        </p>
      ) : null}
    </Tarjeta>
  );
}


// ---------------------------------------------------------------------------
// La forma de una carrera por tramos y la carrera continua
// ---------------------------------------------------------------------------


export function Forma({ m }: { m: Movimiento }) {
  const { principal } = dosisDeMovimiento(m);
  const datos = m.perfil ? datosDePerfil(m.perfil) : [];
  return (
    <Tarjeta pad={18}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: colorDeModalidad(m.modalidad) }} />
        {m.nombre}
      </span>
      <span style={{ ...fuente(800, 40, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }}>{principal}</span>
      {m.perfil ? <PerfilDeTramos p={m.perfil} alto={84} conFrase={false} /> : null}
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 8, alignItems: 'baseline' }}>
        {datos.map((d) => (
          <FilaDato key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} />
        ))}
      </dl>
    </Tarjeta>
  );
}

function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{etiqueta}</dt>
      <dd style={{ margin: 0, ...fuente(700, TAM.cuerpo, 1.3), color: 'var(--twin-fg)', ...TABULAR }}>{valor}</dd>
    </>
  );
}

export function Continua({ m }: { m: Movimiento }) {
  const { principal, contra } = dosisDeMovimiento(m);
  return (
    <Tarjeta pad={18}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: colorDeModalidad(m.modalidad) }} />
        {m.nombre}
      </span>
      {principal ? (
        <span style={{ ...fuente(800, 52, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }}>{principal}</span>
      ) : null}
      {m.zona ? (
        <div>
          <PastillaZona zona={m.zona} />
        </div>
      ) : contra ? (
        <span style={{ ...fuente(700, 20, 1.2), color: 'var(--twin-fg)' }}>{contra}</span>
      ) : null}
    </Tarjeta>
  );
}
