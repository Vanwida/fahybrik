'use client';

// LA HOJA — los bloques, uno debajo de otro, una línea por movimiento.
//
// Dos reglas mandan sobre todo lo de aquí:
//  1. Cada cosa cuesta UNA línea (64 px), no una tarjeta (≈140): el nombre a la
//     izquierda, la dosis y contra qué a la derecha, alineadas en columna. Lo que
//     solo hace falta a veces (las series una a una, las claves, el vídeo) está
//     detrás de un toque, no delante de todo.
//  2. El formato se DICE en la cabecera del bloque («EMOM · 12 min · alterna») y
//     el bloque se organiza según él: una superserie lleva su raíl, un AMRAP no
//     tiene dosis por serie, unas series de pista se enseñan como forma, no como lista.

import { useState, type ReactNode } from 'react';
import { COLOR_MODALIDAD } from '../../datos-reales';
import { Pastilla } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import { fichaDe, ultimaVezDe } from '../sesion-previa/data';
import { FrameVideo } from '../sesion-previa/siluetas';
import type { Bloque, LecturaFicha, Movimiento } from '../../kit-ficha/contrato';
import {
  cuantosEjercicios,
  datosDePerfil,
  dosisDeMovimiento,
  etiquetaFormato,
  explicacionDeFormato,
  lineaSecundaria,
  minutosDelBloque,
  sinDosis,
  textoSerie,
  tieneDetalle,
  tieneSeriesDistintas,
  tituloRedundante,
} from '../../kit-ficha/modelo';
import { IcoDespliega, IcoPlay, PastillaZona, PerfilDeTramos } from '../../kit-ficha/piezas';

// ---------------------------------------------------------------------------
// La hoja entera
// ---------------------------------------------------------------------------

export function Hoja({ l, onLog }: { l: LecturaFicha; onLog: (linea: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {l.bloques.map((b) => (
        <Seccion key={b.id} b={b} ocultarTitulo={tituloRedundante(b, l)} onLog={onLog} />
      ))}
    </div>
  );
}

function Seccion({ b, ocultarTitulo, onLog }: { b: Bloque; ocultarTitulo: boolean; onLog: (linea: string) => void }) {
  if (b.formato.tipo === 'marco') return <MarcoPlegable b={b} onLog={onLog} />;
  const huecos = sinDosis(b);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CabeceraDeBloque b={b} ocultarTitulo={ocultarTitulo} />
      <Cuerpo b={b} onLog={onLog} />
      {huecos > 0 ? <AvisoSinDosis cuantos={huecos} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// La cabecera del bloque: nombre, formato y qué significa
// ---------------------------------------------------------------------------

function CabeceraDeBloque({ b, ocultarTitulo }: { b: Bloque; ocultarTitulo: boolean }) {
  const formato = etiquetaFormato(b);
  const explica = explicacionDeFormato(b);
  const min = minutosDelBloque(b);
  if (ocultarTitulo && !formato && !b.nota) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: ocultarTitulo ? 'flex-start' : 'space-between', gap: 12 }}>
        {ocultarTitulo ? null : (
          <h2 style={{ margin: 0, ...fuente(800, 22, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{b.titulo}</h2>
        )}
        {formato ? (
          <Pastilla fondo="var(--twin-surface-elevated)" tinta="var(--twin-fg)" borde="var(--twin-hairline-strong)">
            {formato}
          </Pastilla>
        ) : min !== null && b.formato.tipo === 'series' ? (
          <Pastilla fondo="var(--twin-surface-elevated)" tinta="var(--twin-fg)" borde="var(--twin-hairline-strong)">
            {min} min
          </Pastilla>
        ) : null}
      </div>
      {explica ? <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>{explica}</p> : null}
      {b.nota ? <NotaDeBloque texto={b.nota} /> : null}
    </div>
  );
}

function NotaDeBloque({ texto }: { texto: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: '2px 0 2px 12px',
        borderLeft: '3px solid var(--twin-accent)',
        ...fuente(400, TAM.cuerpo, 1.4),
        color: 'var(--twin-fg)',
      }}
    >
      {texto}
    </p>
  );
}

function AvisoSinDosis({ cuantos }: { cuantos: number }) {
  return (
    <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
      {cuantos === 1 ? 'A 1 movimiento' : `A ${cuantos} movimientos`} tu coach aún no les ha puesto cuánto. Pregúntaselo antes de empezar.
    </p>
  );
}

// ---------------------------------------------------------------------------
// El cuerpo, según el formato
// ---------------------------------------------------------------------------

function Cuerpo({ b, onLog }: { b: Bloque; onLog: (linea: string) => void }) {
  const f = b.formato;
  switch (f.tipo) {
    case 'estaciones':
      return <Estaciones b={b} carrera={f.carrera} />;
    case 'intervalos':
      return <>{b.movimientos.map((m) => (m.perfil ? <TarjetaDePerfil key={m.id} m={m} /> : <Fila key={m.id} m={m} onLog={onLog} />))}</>;
    case 'continuo':
      return <>{b.movimientos.map((m) => <TarjetaContinua key={m.id} m={m} />)}</>;
    case 'superserie':
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          <span aria-hidden style={{ width: 4, borderRadius: 4, background: velo('var(--twin-accent)', 70), flex: '0 0 auto', margin: '10px 0' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {b.movimientos.map((m) => (
              <Fila key={m.id} m={m} onLog={onLog} />
            ))}
            {f.descanso ? (
              <p style={{ margin: 0, padding: '10px 0 2px', ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
                Descanso {f.descanso} al acabar la pareja
              </p>
            ) : null}
          </div>
        </div>
      );
    default:
      return (
        <div>
          {b.movimientos.map((m) => (
            <Fila key={m.id} m={m} onLog={onLog} />
          ))}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Una línea = un movimiento
// ---------------------------------------------------------------------------

const ALTO_FILA = 64;

function Fila({ m, onLog }: { m: Movimiento; onLog: (linea: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const abrible = tieneDetalle(m);
  const { principal, contra } = dosisDeMovimiento(m);
  const sub = lineaSecundaria(m);

  const contenido = (
    <div style={{ minHeight: ALTO_FILA, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 12, padding: '10px 0' }}>
      <Punto m={m} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', overflowWrap: 'anywhere' }}>{m.nombre}</span>
        {sub ? <span style={{ ...fuente(400, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{sub}</span> : null}
      </div>
      <Dosis principal={principal} contra={contra} m={m} />
    </div>
  );

  return (
    <div style={{ borderTop: '1px solid var(--twin-hairline)' }}>
      {abrible ? (
        <button
          type="button"
          className="fi-btn fi-fila"
          aria-expanded={abierta}
          onClick={() => {
            setAbierta((v) => !v);
            onLog(`${m.nombre} · ${abierta ? 'se cierra' : 'se abre'}`);
          }}
        >
          {contenido}
        </button>
      ) : (
        contenido
      )}
      {abrible ? (
        <div className="fi-colapsable" data-abierto={abierta}>
          <div>
            <Detalle m={m} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Punto({ m }: { m: Movimiento }) {
  return (
    <span
      aria-hidden
      style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD[m.modalidad], alignSelf: 'start', marginTop: 8 }}
    />
  );
}

/** La columna de la derecha: la dosis y debajo contra qué. Los kilos pesan lo que la dosis; el resto, menos. */
function Dosis({ principal, contra, m }: { principal: string | null; contra: string | null; m: Movimiento }) {
  if (principal === null && contra === null) return <span />;
  const kilos = contra !== null && /kg$/.test(contra);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, ...TABULAR }}>
      {principal !== null ? <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{principal}</span> : null}
      {contra !== null ? (
        m.zona ? (
          <PastillaZona zona={m.zona} />
        ) : (
          <span style={{ ...fuente(kilos ? 700 : 500, TAM.suelo, 1.2), color: kilos ? 'var(--twin-fg)' : 'var(--twin-muted)' }}>{contra}</span>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lo que se abre: series una a una, la nota del coach para este movimiento y la técnica
// ---------------------------------------------------------------------------

function Detalle({ m }: { m: Movimiento }) {
  const ficha = fichaDe(m.nombre);
  const ultima = ultimaVezDe(m.nombre);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 0 16px 22px' }}>
      {tieneSeriesDistintas(m) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 14, rowGap: 6, alignItems: 'baseline', ...TABULAR }}>
          {m.series!.map((s, i) => (
            <SerieFila key={i} n={i + 1} texto={textoSerie(s)} descanso={s.descanso} />
          ))}
        </div>
      ) : null}
      {m.segunTuRm ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
          Según tu 1RM: <b style={{ color: 'var(--twin-fg)', ...TABULAR }}>{m.segunTuRm.kg}</b>
        </p>
      ) : null}
      {m.nota ? (
        <p style={{ margin: 0, padding: '2px 0 2px 12px', borderLeft: '3px solid var(--twin-accent)', ...fuente(400, TAM.cuerpo, 1.4), color: 'var(--twin-fg)' }}>
          {m.nota}
        </p>
      ) : null}
      {ultima ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
          La última vez: <b style={{ color: 'var(--twin-fg)', ...TABULAR }}>{ultima.resumen}</b>, hace {ultima.haceDias} días.
        </p>
      ) : null}
      {ficha.claves.length > 0 ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {ficha.pose !== 'generico' ? (
            <div style={{ position: 'relative' }}>
              <FrameVideo pose={ficha.pose} videoS={ficha.videoS} tinte={COLOR_MODALIDAD[m.modalidad]} ancho={104} />
            </div>
          ) : null}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            {ficha.claves.slice(0, 2).map((c) => (
              <li key={c} style={{ ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-fg)' }}>
                {c}
              </li>
            ))}
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--twin-accent-text)', ...fuente(700, TAM.suelo, 1.2) }}>
              <IcoPlay tam={13} /> Ver técnica
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SerieFila({ n, texto, descanso }: { n: number; texto: string; descanso?: string }) {
  return (
    <>
      <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>Serie {n}</span>
      <span style={{ ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-fg)' }}>{texto}</span>
      <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textAlign: 'right' }}>{descanso ? `desc. ${descanso}` : ''}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calentamiento y vuelta a la calma: una línea, se abre si quieres
// ---------------------------------------------------------------------------

function MarcoPlegable({ b, onLog }: { b: Bloque; onLog: (linea: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const min = minutosDelBloque(b);
  return (
    <section
      style={{
        borderRadius: RADIO.fila,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="fi-btn"
        aria-expanded={abierto}
        onClick={() => {
          setAbierto((v) => !v);
          onLog(`${b.titulo} · ${abierto ? 'se pliega' : 'se despliega'}`);
        }}
        style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}
      >
        <span style={{ ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)', flex: 1 }}>{b.titulo}</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>
          {cuantosEjercicios(b.movimientos.length)}
          {min !== null ? ` · ${min} min` : ''}
        </span>
        <span className="fi-chevron" data-abierto={abierto} style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
          <IcoDespliega tam={16} />
        </span>
      </button>
      <div className="fi-colapsable" data-abierto={abierto}>
        <div>
          <div style={{ padding: '0 16px 6px' }}>
            {b.movimientos.map((m) => {
              const { principal, contra } = dosisDeMovimiento(m);
              return (
                <div
                  key={m.id}
                  style={{
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    borderTop: '1px solid var(--twin-hairline)',
                  }}
                >
                  <span style={{ ...fuente(500, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
                  <span style={{ ...fuente(500, TAM.suelo, 1.25), color: 'var(--twin-muted)', ...TABULAR, textAlign: 'right' }}>
                    {[principal, contra].filter(Boolean).join(' · ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Las estaciones: OCHO filas, no dieciséis
// ---------------------------------------------------------------------------

function Estaciones({ b, carrera }: { b: Bloque; carrera: string }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          marginBottom: 4,
          borderRadius: RADIO.fila,
          background: tinte(COLOR_MODALIDAD.run, 12, 'var(--twin-surface)'),
          border: `1px solid ${velo(COLOR_MODALIDAD.run, 28)}`,
          ...fuente(600, TAM.suelo, 1.3),
          color: 'var(--twin-fg)',
        }}
      >
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD.run, flex: '0 0 auto' }} />
        Antes de cada estación, corres {carrera}
      </div>
      {b.movimientos.map((m, i) => {
        const { principal, contra } = dosisDeMovimiento(m);
        const sub = m.reparto ? 'Tu parte' : null;
        return (
          <div key={m.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)' }}>
            <div style={{ minHeight: 60, display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', columnGap: 12, padding: '8px 0' }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: tinte(COLOR_MODALIDAD[m.modalidad], 18, 'var(--twin-surface)'),
                  color: 'var(--twin-fg)',
                  ...fuente(800, TAM.suelo, 1),
                  ...TABULAR,
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ ...fuente(600, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{m.nombre}</span>
                {sub ? <span style={{ ...fuente(400, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{sub}</span> : null}
              </div>
              <Dosis principal={principal} contra={contra} m={m} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dos «sujetos» de una sola pieza: la carrera por tramos y la continua
// ---------------------------------------------------------------------------

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: RADIO.tarjeta,
        padding: '16px 18px 18px',
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

function TarjetaDePerfil({ m }: { m: Movimiento }) {
  const { principal } = dosisDeMovimiento(m);
  const datos = m.perfil ? datosDePerfil(m.perfil) : [];
  return (
    <Tarjeta>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD[m.modalidad] }} />
        {m.nombre}
      </span>
      <span style={{ ...fuente(800, 34, 1.05, true), letterSpacing: '-0.015em', color: 'var(--twin-fg)', ...TABULAR }}>{principal}</span>
      {m.perfil ? <PerfilDeTramos p={m.perfil} conFrase={false} /> : null}
      {datos.length > 0 ? (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 6, alignItems: 'baseline' }}>
          {datos.map((d) => (
            <DatoDePerfil key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} />
          ))}
        </dl>
      ) : null}
    </Tarjeta>
  );
}

function DatoDePerfil({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{etiqueta}</dt>
      <dd style={{ margin: 0, ...fuente(700, TAM.cuerpo, 1.3), color: 'var(--twin-fg)', ...TABULAR }}>{valor}</dd>
    </>
  );
}

function TarjetaContinua({ m }: { m: Movimiento }) {
  const { principal, contra } = dosisDeMovimiento(m);
  return (
    <Tarjeta>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MODALIDAD[m.modalidad] }} />
          {m.nombre}
        </span>
        {m.zona ? <PastillaZona zona={m.zona} /> : null}
      </div>
      {principal ? (
        <span style={{ ...fuente(800, 44, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }}>{principal}</span>
      ) : null}
      {contra && !m.zona ? <span style={{ ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-muted)' }}>{contra}</span> : null}
    </Tarjeta>
  );
}
