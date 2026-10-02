'use client';

// LA RUTA — el contenido de UN bloque, con la forma que le toca a su formato.
//
// Aquí cabe más aire que en la hoja porque en pantalla solo hay un bloque: una
// tarjeta de fuerza enseña el ejercicio con su miniatura, su dosis grande y las
// series una a una; un EMOM se dibuja como lo que es (una pista de minutos que
// alternan); una simulación se dibuja como un recorrido (estaciones en un raíl con
// la carrera entre una y otra); unas series de pista, como su forma.

import type { CSSProperties, ReactNode } from 'react';
import { COLOR_MODALIDAD } from '../../datos-reales';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import type { Bloque, Movimiento } from '../../kit-ficha/contrato';
import {
  datosDePerfil,
  dosisDeMovimiento,
  explicacionDeFormato,
  lineaSecundaria,
  materialDeBloques,
  rangoDeCarga,
  sinDosis,
  textoSerie,
  tieneSeriesDistintas,
} from '../../kit-ficha/modelo';
import { Material, Miniatura, PastillaZona, PerfilDeTramos } from '../../kit-ficha/piezas';

export function Panel({ b, unaPieza = false, onAbrir }: { b: Bloque; unaPieza?: boolean; onAbrir: (m: Movimiento) => void }) {
  const explica = explicacionDeFormato(b);
  const material = b.rol === 'principal' ? materialDeBloques([b]) : [];
  const huecos = sinDosis(b);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {explica ? <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>{explica}</p> : null}
      {b.nota ? (
        <p
          style={{
            margin: 0,
            padding: '2px 0 2px 12px',
            borderLeft: '3px solid var(--twin-accent)',
            ...fuente(400, TAM.cuerpo, 1.4),
            color: 'var(--twin-fg)',
          }}
        >
          {b.nota}
        </p>
      ) : null}
      <Contenido b={b} onAbrir={onAbrir} />
      {huecos > 0 ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
          {huecos === 1 ? 'A 1 movimiento' : `A ${huecos} movimientos`} tu coach aún no les ha puesto cuánto. Pregúntaselo antes de empezar.
        </p>
      ) : null}
      {material.length > 0 ? <Material cosas={material} titulo={unaPieza ? 'Prepara' : 'Para este bloque'} /> : null}
    </div>
  );
}

function Contenido({ b, onAbrir }: { b: Bloque; onAbrir: (m: Movimiento) => void }) {
  const f = b.formato;
  switch (f.tipo) {
    case 'estaciones':
      return <Recorrido b={b} carrera={f.carrera} onAbrir={onAbrir} />;
    case 'emom':
      return <PistaEmom b={b} minutos={f.minutos} alterna={f.alterna} onAbrir={onAbrir} />;
    case 'amrap':
      return (
        <>
          <Reloj grande={`${f.minutos}:00`} etiqueta="AMRAP" />
          <Lista b={b} onAbrir={onAbrir} />
        </>
      );
    case 'fortime':
      return (
        <>
          <Reloj grande={f.rondas ? `${f.rondas} rondas` : 'For Time'} etiqueta={f.topeMin ? `Tope ${f.topeMin} min` : 'Sin tope'} />
          <Lista b={b} onAbrir={onAbrir} />
        </>
      );
    case 'superserie':
      return <Pareja b={b} rondas={f.rondas} descanso={f.descanso} onAbrir={onAbrir} />;
    case 'intervalos':
      return <>{b.movimientos.map((m) => (m.perfil ? <Forma key={m.id} m={m} /> : <TarjetaEjercicio key={m.id} m={m} onAbrir={onAbrir} />))}</>;
    case 'continuo':
      return <>{b.movimientos.map((m) => <Continua key={m.id} m={m} />)}</>;
    case 'marco':
      return <Lista b={b} compacta />;
    case 'series':
      return <>{b.movimientos.map((m) => <TarjetaEjercicio key={m.id} m={m} onAbrir={onAbrir} />)}</>;
  }
}

// ---------------------------------------------------------------------------
// Una tarjeta de ejercicio (fuerza y accesorios)
// ---------------------------------------------------------------------------

function Tarjeta({ children, pad = 14, alTocar, etiqueta }: { children: ReactNode; pad?: number; alTocar?: () => void; etiqueta?: string }) {
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

/** Una fila que abre la técnica de su movimiento al tocarla (o una fila quieta si no hay quién la abra). */
function FilaTocable({
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

function TarjetaEjercicio({ m, onAbrir }: { m: Movimiento; onAbrir: (m: Movimiento) => void }) {
  const { principal, contra } = dosisDeMovimiento(m);
  const rampa = tieneSeriesDistintas(m);
  // Si todas las series hacen lo mismo salvo la carga, las reps se dicen UNA vez y cada ficha lleva solo los kilos.
  const trabajoComun = rampa && m.series!.every((s) => s.trabajo === m.series![0].trabajo) ? m.series![0].trabajo : null;
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
                background: tinte(COLOR_MODALIDAD[m.modalidad], 14, 'var(--twin-surface)'),
                border: `1px solid ${velo(COLOR_MODALIDAD[m.modalidad], 30)}`,
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
      {m.segunTuRm?.sinConfirmar ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>Según tu 1RM · sin confirmar</p>
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
// Una lista de filas con miniatura (AMRAP, For Time, calentamiento)
// ---------------------------------------------------------------------------

function Lista({ b, compacta = false, onAbrir }: { b: Bloque; compacta?: boolean; onAbrir?: (m: Movimiento) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {b.movimientos.map((m, i) => {
        const { principal, contra } = dosisDeMovimiento(m);
        return (
          <FilaTocable
            key={m.id}
            m={m}
            onAbrir={compacta ? undefined : onAbrir}
            style={{
              minHeight: compacta ? 48 : 64,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: compacta ? '6px 0' : '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)',
            }}
          >
            {compacta ? null : <Miniatura m={m} ancho={64} />}
            <span style={{ flex: 1, minWidth: 0, ...fuente(compacta ? 500 : 650, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
            <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, ...TABULAR }}>
              {principal ? (
                <span style={{ ...fuente(compacta ? 500 : 800, TAM.cuerpo, 1.2), color: compacta ? 'var(--twin-muted)' : 'var(--twin-fg)' }}>
                  {principal}
                </span>
              ) : null}
              {contra ? <span style={{ ...fuente(500, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{contra}</span> : null}
            </span>
          </FilaTocable>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Un reloj que manda (AMRAP, For Time)
// ---------------------------------------------------------------------------

function Reloj({ grande, etiqueta }: { grande: string; etiqueta: string }) {
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

function PistaEmom({ b, minutos, alterna, onAbrir }: { b: Bloque; minutos: number; alterna: boolean; onAbrir: (m: Movimiento) => void }) {
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

function Pareja({ b, rondas, descanso, onAbrir }: { b: Bloque; rondas: number; descanso?: string; onAbrir: (m: Movimiento) => void }) {
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
                  background: tinte(COLOR_MODALIDAD[m.modalidad], 20, 'var(--twin-surface)'),
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

function Recorrido({ b, carrera, onAbrir }: { b: Bloque; carrera: string; onAbrir: (m: Movimiento) => void }) {
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
                  background: tinte(COLOR_MODALIDAD[m.modalidad], 28, 'var(--twin-bg)'),
                  border: `2px solid ${COLOR_MODALIDAD[m.modalidad]}`,
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

// ---------------------------------------------------------------------------
// La forma de una carrera por tramos y la carrera continua
// ---------------------------------------------------------------------------

function Forma({ m }: { m: Movimiento }) {
  const { principal } = dosisDeMovimiento(m);
  const datos = m.perfil ? datosDePerfil(m.perfil) : [];
  return (
    <Tarjeta pad={18}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD[m.modalidad] }} />
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

function Continua({ m }: { m: Movimiento }) {
  const { principal, contra } = dosisDeMovimiento(m);
  return (
    <Tarjeta pad={18}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD[m.modalidad] }} />
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
