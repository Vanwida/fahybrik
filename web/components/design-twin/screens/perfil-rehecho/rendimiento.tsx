'use client';

// RENDIMIENTO — lo que dice quién eres en cifras. Cinco teselas (tres sin coach)
// en una cuadrícula de dos columnas: la impar, la última, ocupa el ancho. La
// FORMA de cada tesela la fija su posición y no su estado, así que el esqueleto
// tiene la forma final y nada salta al llegar el dato.
//
// Las reglas que gobiernan cada una (CONTRATO-UI §4, §6.2 bis, §7), resueltas
// por `filasRendimiento` y solo pintadas aquí:
//  · un CONTADOR se pinta también en cero («0 de 4 calibrados» es información y
//    es cuando más falta hace); un VALOR MEDIDO no existe hasta que se mide, y
//    ahí va la invitación con el verbo que lo llena, no un guion;
//  · el dato pesa más que su etiqueta (32 contra 15) y el COLOR de estado no va
//    en la cifra: la tesela que pide un acto se tiñe de la marca, la cifra no;
//  · «sin ancla no hay zonas»: ninguna cifra por defecto, y un umbral estimado
//    escribe siempre de dónde sale;
//  · una fuente que falló dice que falló y ofrece reintentar: no se queda en
//    esqueleto para siempre.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { IcoChevron, IcoReintentar } from '../../kit-dia/iconos';
import { Esqueleto, Pastilla, Rotulo, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import type { ClaveFila, Fila, LecturaPerfil } from '../../kit-perfil/contrato';
import { filasRendimiento, lineaRendimiento, rendimientoSinRespuesta } from '../../kit-perfil/rendimiento';

/** Alto mínimo de una tesela de media columna: cabe el peor caso (tres líneas de invitación y su verbo). */
const ALTO_TESELA = 160;
const ALTO_TESELA_ANCHA = 132;
/** Dos líneas de pie (15 px × 1,3): la altura que se reserva para que las cifras se alineen. */
const PIE_DOS_LINEAS = Math.ceil(TAM.suelo * 1.3 * 2);

const chevron = (
  <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
    <IcoChevron tam={18} />
  </span>
);

/** N de M. Hasta 12 son segmentos (los cuatro tests, las doce marcas); más, una barra continua. */
function Regleta({ n, m }: { n: number; m: number }) {
  const lleno = 'var(--twin-accent)';
  const vacio = velo('var(--twin-fg)', 24);
  if (m > 12) {
    return (
      <span aria-hidden style={{ display: 'block', height: 6, borderRadius: 3, background: vacio, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (n / m) * 100)}%`, background: lleno }} />
      </span>
    );
  }
  return (
    <span aria-hidden style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: m }, (_, i) => (
        <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < n ? lleno : vacio }} />
      ))}
    </span>
  );
}

const cifra: CSSProperties = { ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR };

function Salida({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, ...fuente(700, TAM.suelo, 1.25), color: 'var(--twin-accent-text)' }}>
      {children}
      <IcoChevron tam={16} />
    </span>
  );
}

function tesela(ancha: boolean, pideActo: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    minHeight: ancha ? ALTO_TESELA_ANCHA : ALTO_TESELA,
    boxSizing: 'border-box',
    padding: 16,
    borderRadius: RADIO.tarjeta,
    background: pideActo ? tinte('var(--twin-accent)', 10, 'var(--twin-surface)') : 'var(--twin-surface)',
    border: `1px solid ${pideActo ? velo('var(--twin-accent)', 42) : 'var(--twin-hairline)'}`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 10,
    textAlign: 'left',
  };
}

function Cabecera({ etiqueta, conChevron = true }: { etiqueta: string; conChevron?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
      <Rotulo>{etiqueta}</Rotulo>
      {conChevron ? chevron : null}
    </span>
  );
}

const DESTINO: Record<ClaveFila, string> = {
  tests: 'el hub de tests',
  marcas: 'la biblioteca de marcas',
  vo2: 'tu VO₂ máx',
  zonas: 'tus zonas de FC',
  fuerza: 'tu fuerza (1RM)',
};

/** Lo que dice el lector de pantalla: etiqueta, dato y, si lo hay, qué se puede hacer. */
function etiquetaAccesible(f: Fila): string {
  const e = f.estado;
  switch (e.tipo) {
    case 'cargando':
      return `${f.etiqueta}, cargando`;
    case 'sin-respuesta':
      return `${f.etiqueta}, no pudimos cargarlo. Reintentar`;
    case 'valor':
      return `${f.etiqueta}: ${[e.cifra, e.sufijo].filter(Boolean).join(' ')}${e.pie ? `, ${e.pie}` : ''}`;
    case 'vacio':
      return `${f.etiqueta}, sin dato. ${e.invitacion}${e.salida ? `. ${e.salida}` : ''}`;
  }
}

function Esqueletos({ clave, ancha }: { clave: ClaveFila; ancha: boolean }) {
  const contador = clave === 'tests' || clave === 'marcas';
  return (
    <div aria-busy aria-label={`${clave}, cargando`} style={tesela(ancha, false)}>
      <Esqueleto ancho={96} alto={15} radio={5} style={{ marginTop: 3 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Esqueleto ancho={84} alto={34} radio={9} />
        {contador ? <Esqueleto alto={6} radio={3} /> : null}
      </span>
      <Esqueleto ancho="72%" alto={15} radio={5} />
    </div>
  );
}

function SinRespuesta({ f, ancha, onLog }: { f: Fila; ancha: boolean; onLog: (l: string) => void }) {
  const [reintentando, setReintentando] = useState(false);
  const reintenta = () => {
    if (reintentando) return;
    setReintentando(true);
    onLog(`${f.etiqueta} → reintentar: volvería a pedir solo esta fuente`);
    setTimeout(() => setReintentando(false), 1400);
  };
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={reintenta}
      disabled={reintentando}
      aria-busy={reintentando}
      aria-label={etiquetaAccesible(f)}
      style={tesela(ancha, false)}
    >
      <Cabecera etiqueta={f.etiqueta} conChevron={false} />
      <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)' }}>No pudimos cargarlo</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, ...fuente(700, TAM.suelo, 1.25), color: 'var(--twin-accent-text)' }}>
        <span className={reintentando ? 'hd-gira' : undefined} style={{ display: 'inline-flex' }}>
          <IcoReintentar tam={18} />
        </span>
        {reintentando ? 'Reintentando' : 'Reintentar'}
      </span>
    </button>
  );
}

function Tesela({ f, ancha, onLog }: { f: Fila; ancha: boolean; onLog: (l: string) => void }) {
  const e = f.estado;
  if (e.tipo === 'cargando') return <Esqueletos clave={f.clave} ancha={ancha} />;
  if (e.tipo === 'sin-respuesta') return <SinRespuesta f={f} ancha={ancha} onLog={onLog} />;
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onLog(`${f.etiqueta} → ${DESTINO[f.clave]}${e.tipo === 'vacio' && e.salida ? ` · ${e.salida.toLowerCase()}` : ''}`)}
      aria-label={etiquetaAccesible(f)}
      style={tesela(ancha, f.pideActo)}
    >
      <Cabecera etiqueta={f.etiqueta} />
      {e.tipo === 'valor' ? (
        <>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={cifra}>{e.cifra}</span>
              {e.sufijo ? <span style={{ ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-muted)', ...TABULAR }}>{e.sufijo}</span> : null}
            </span>
            {e.avance ? <Regleta n={e.avance.n} m={e.avance.m} /> : null}
          </span>
          {/* Dos líneas de pie reservadas: así las cifras de dos teselas contiguas caen a la misma altura. */}
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textWrap: 'pretty', minHeight: ancha ? undefined : PIE_DOS_LINEAS }}>{e.pie}</span>
        </>
      ) : (
        <>
          <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{e.invitacion}</span>
          {e.salida ? <Salida>{e.salida}</Salida> : <span />}
        </>
      )}
    </button>
  );
}

export function Rendimiento({ l, onLog }: { l: LecturaPerfil; onLog: (linea: string) => void }) {
  const filas = filasRendimiento(l);
  const linea = lineaRendimiento(filas);
  const sinNada = rendimientoSinRespuesta(filas);
  const impar = filas.length % 2 === 1;
  return (
    <section aria-label="Rendimiento" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion
        aparte={
          linea ? (
            <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
              {linea}
            </Pastilla>
          ) : undefined
        }
      >
        Rendimiento
      </TituloSeccion>
      {sinNada ? (
        // Sin red no son cinco teselas de error: es UNA frase que dice por qué y dónde está la salida.
        <div
          role="status"
          style={{
            borderRadius: RADIO.tarjeta,
            background: 'var(--twin-surface)',
            border: '1px solid var(--twin-hairline)',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>No pudimos cargar tus cifras</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>
            {l.errorCarga ? 'Se cargan junto con tu perfil: reintenta arriba.' : 'Vuelve a intentarlo en un momento.'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {filas.map((f, i) => (
            <div
              key={f.clave}
              className="hd-sube"
              style={{ '--i': i, display: 'flex', gridColumn: impar && i === filas.length - 1 ? '1 / -1' : undefined } as CSSProperties}
            >
              <Tesela f={f} ancha={impar && i === filas.length - 1} onLog={onLog} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
