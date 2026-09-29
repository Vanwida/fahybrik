'use client';

// LAS DOS TESELAS y LA ACCIÓN SECUNDARIA.
//
// Marca reciente y pasos son las dos pruebas que Hoy conserva del día a día:
// el PROGRESO entero vive en Analíticas (DECISIONS 29-sep), aquí queda UNA
// marca como muestra y lleva allí. Dos cifras de 32 px lado a lado, sin más.
//
// Una marca que no existe NO se pinta con un guion: es un hueco que el atleta
// puede llenar con un acto (medirse), así que se declara con su salida
// («¿Te pruebas?», §6.2 bis). Unos pasos sin muestras no son un cero medido.

import type { ReactNode } from 'react';
import type { LecturaHoy, MarcaReciente, Pasos } from '../../kit-hoy/contrato';
import { IcoBaja, IcoChevron, IcoHuellas, IcoMas, IcoSube } from '../../kit-dia/iconos';
import { Esqueleto, Rotulo } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM } from '../../kit-dia/tokens';

const tarjeta = {
  borderRadius: RADIO.tarjeta,
  background: 'var(--twin-surface)',
  border: '1px solid var(--twin-hairline)',
  boxSizing: 'border-box',
  padding: 16,
  minHeight: 128,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 10,
  textAlign: 'left',
} as const;

const dato = { ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR } as const;

function TeselaMarca({ marca, onLog }: { marca: MarcaReciente | null; onLog: (linea: string) => void }) {
  if (!marca) {
    return (
      <button
        type="button"
        className="hd-toque"
        onClick={() => onLog('Marca → «Probarme»: la biblioteca de marcas')}
        aria-label="¿Te pruebas? Un 1 km o un remo 500, y la app lo mide sola"
        style={{ ...tarjeta }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Rotulo>¿Te pruebas?</Rotulo>
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IcoChevron tam={18} />
          </span>
        </span>
        <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
          Un 1 km o un remo 500, y la app lo mide sola.
        </span>
      </button>
    );
  }
  const d = marca.delta;
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onLog('Marca → Analíticas · tu progreso')}
      aria-label={`${marca.titulo}: ${marca.valor}${d ? `, ${d.texto}` : ''}. Ver tu progreso`}
      style={{ ...tarjeta }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Rotulo>{marca.titulo}</Rotulo>
        <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
          <IcoChevron tam={18} />
        </span>
      </span>
      <span style={dato}>{marca.valor}</span>
      {d ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
            ...fuente(700, TAM.suelo, 1.25),
            color: d.mejora ? 'var(--twin-ok)' : 'var(--twin-danger)',
            ...TABULAR,
          }}
        >
          <span style={{ paddingTop: 2, display: 'inline-flex' }}>{d.mejora ? <IcoBaja tam={16} /> : <IcoSube tam={16} />}</span>
          {d.texto}
        </span>
      ) : (
        <span style={{ ...fuente(500, TAM.suelo, 1.25), color: 'var(--twin-muted)' }}>Tu primera prueba</span>
      )}
    </button>
  );
}

function CabeceraPasos() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--twin-muted)' }}>
      <Rotulo>Pasos hoy</Rotulo>
      <IcoHuellas tam={22} />
    </span>
  );
}

function TeselaPasos({ pasos, onLog }: { pasos: Pasos; onLog: (linea: string) => void }) {
  if (pasos.tipo === 'conectar') {
    return (
      <button
        type="button"
        className="hd-toque"
        onClick={() => onLog('Pasos → Perfil · conectar Apple Salud')}
        aria-label="Pasos hoy. Conecta Apple Salud para ver tus pasos"
        style={{ ...tarjeta }}
      >
        <CabeceraPasos />
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-accent-text)' }}>
          Conecta Apple Salud
          <IcoChevron tam={18} />
        </span>
      </button>
    );
  }
  return (
    <div style={{ ...tarjeta }} aria-label={pasos.tipo === 'cifra' ? `Pasos hoy, ${pasos.valor}` : 'Pasos hoy, sin datos todavía'} role="group">
      <CabeceraPasos />
      {pasos.tipo === 'cifra' ? (
        <span style={dato}>{pasos.valor}</span>
      ) : (
        <span style={{ ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-muted)' }}>Sin datos todavía</span>
      )}
      {pasos.tipo === 'sin-datos' ? (
        <span style={{ ...fuente(500, TAM.suelo, 1.25), color: 'var(--twin-muted)' }}>Salud aún no tiene pasos de hoy</span>
      ) : (
        <span aria-hidden style={{ height: 0 }} />
      )}
    </div>
  );
}

export function Teselas({ l, onLog }: { l: LecturaHoy; onLog: (linea: string) => void }) {
  if (l.cargando) {
    return (
      <div aria-busy aria-label="Cargando tu marca y tus pasos" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ ...tarjeta, gap: 10 }}>
            <Esqueleto ancho={96} alto={15} radio={5} />
            <Esqueleto ancho={100} alto={34} radio={9} />
            <Esqueleto ancho="70%" alto={15} radio={5} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <TeselaMarca marca={l.marca} onLog={onLog} />
      <TeselaPasos pasos={l.pasos} onLog={onLog} />
    </div>
  );
}

/** «Crear entreno libre»: la acción secundaria mientras el sujeto no sea ya el constructor. */
export function EntrenoLibre({ cargando, onLog }: { cargando: boolean; onLog: (linea: string) => void }) {
  const cuerpo: ReactNode = cargando ? (
    <>
      <Esqueleto ancho={44} alto={44} radio={22} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <Esqueleto ancho="52%" alto={17} radio={6} />
        <Esqueleto ancho="86%" alto={15} radio={5} />
      </span>
    </>
  ) : (
    <>
      <span
        aria-hidden
        style={{ width: 44, height: 44, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', background: 'var(--twin-accent)', color: 'var(--twin-accent-on)' }}
      >
        <IcoMas tam={22} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ ...fuente(800, TAM.cuerpo, 1.2, true), color: 'var(--twin-fg)' }}>Crear entreno libre</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
          Suma al plan, no lo rompe. Le llega igual a tu coach.
        </span>
      </span>
      <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
        <IcoChevron tam={18} />
      </span>
    </>
  );
  const estilo = {
    minHeight: 76,
    padding: '14px 16px',
    boxSizing: 'border-box',
    borderRadius: RADIO.tarjeta,
    border: '1px solid var(--twin-hairline-strong)',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  } as const;
  if (cargando) return <div aria-busy style={estilo}>{cuerpo}</div>;
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onLog('Crear entreno libre → constructor de entreno libre')}
      aria-label="Crear entreno libre. Suma al plan, no lo rompe. Le llega igual a tu coach"
      style={estilo}
    >
      {cuerpo}
    </button>
  );
}
