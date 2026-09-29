'use client';

// EL CAMINO — un póster. La única fotografía de la portada vive aquí: la carrera
// hacia la que va todo el plan, con la cuenta atrás en cifras enormes.
//
// Contraste MEDIDO (CONTRATO §4.2): el texto va SIEMPRE sobre foto oscurecida,
// también con el tema claro. Por eso el póster es una superficie de tema oscuro
// anidada (`data-appearance="dark"` de twin.css): es el equivalente web de
// `.environment(\.colorScheme, .dark)` en SwiftUI, y sigue leyendo TOKENS, no
// hex. La capa que separa foto y texto (`VELO_FOTO`) se ajustó con una
// auditoría de píxeles sobre las tres fotos del catálogo, en las catorce
// pantallas y en los dos temas (no «se ve bien»: ratio por caja de texto).
//
// Estados: fijada (con o sin objetivo de tiempo, con o sin fase) · sin objetivo
// (invitación con su salida) · en frío (esqueleto de la misma forma) · sin
// coach o con error de carga NO se pinta: no sabemos qué carrera toca.

import type { CSSProperties, ReactNode } from 'react';
import type { CaminoEstado, Carrera, LecturaHoy, Simulacion } from '../../kit-hoy/contrato';
import { IcoCalendario, IcoDiana, IcoLupa } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { FOTO, fuente, RADIO, TABULAR, TAM, velo } from '../../kit-dia/tokens';

/**
 * La capa entre la foto y el texto: el `--twin-bg` OSCURO en cuatro paradas.
 * Arriba es suave (etiqueta y nombre son blancos: aguantan una foto viva, y ahí
 * es donde la foto se ve); a partir de la mitad cierra, porque la cuenta atrás
 * naranja (3:1 como texto grande) necesita un fondo casi negro y debajo van la
 * fase y la simulación, texto de 15-17 px.
 */
const VELO_FOTO =
  `linear-gradient(180deg, ${velo('var(--twin-bg)', 36)} 0%, ${velo('var(--twin-bg)', 42)} 24%, ${velo('var(--twin-bg)', 84)} 50%, ${velo('var(--twin-bg)', 80)} 100%)`;

const ALTO_POSTER = 256;

/**
 * La foto se oscurece ella misma antes del velo: las tres fotos del catálogo
 * llevan focos y muros de luz, y con solo el velo la cuenta atrás naranja medía
 * 2:1. Así la foto sigue viéndose (formas, gente, luz) y el velo se queda en un
 * apoyo, no en una persiana.
 */
const FILTRO_FOTO = 'brightness(0.56) contrast(1.06) saturate(0.95)';

/** La superficie oscura anidada: foto + velo + contenido. */
function Poster({
  foto,
  onClick,
  etiqueta,
  children,
}: {
  foto: Carrera['fondo'];
  onClick: () => void;
  etiqueta: string;
  children: ReactNode;
}) {
  const f = FOTO[foto];
  const capa: CSSProperties = { position: 'absolute', inset: 0 };
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      aria-label={etiqueta}
      style={{ borderRadius: RADIO.grande, overflow: 'hidden', isolation: 'isolate', '--hd-foco': 'var(--twin-fg)' } as CSSProperties}
    >
      <span
        className="twin-root"
        data-appearance="dark"
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: ALTO_POSTER, boxSizing: 'border-box' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.src} alt="" aria-hidden style={{ ...capa, width: '100%', height: '100%', objectFit: 'cover', objectPosition: f.posicion, filter: FILTRO_FOTO }} />
        <span aria-hidden style={{ ...capa, background: VELO_FOTO }} />
        <span
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            padding: '16px 20px 18px',
            textAlign: 'left',
            color: 'var(--twin-fg)',
          }}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

const etiquetaFoto: CSSProperties = {
  ...fuente(800, TAM.suelo, 1.2),
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--twin-fg)',
};

function LineaSimulacion({ s }: { s: Simulacion }) {
  const programada = s.tipo === 'programada';
  const texto = programada ? (s.hoy ? 'Simulación HYROX hoy' : `Simulación HYROX ${s.dia}`) : 'Una simulación afina tu predicho';
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingTop: 10,
        borderTop: `1px solid ${velo('var(--twin-fg)', 22)}`,
        ...fuente(600, TAM.suelo, 1.25),
        color: 'var(--twin-fg)',
      }}
    >
      <span style={{ color: 'var(--twin-accent-text)', display: 'inline-flex' }}>{programada ? <IcoCalendario tam={18} /> : <IcoDiana tam={18} />}</span>
      {texto}
    </span>
  );
}

/** N de M: la regleta de posición dentro del plan. */
function Regleta({ n, m }: { n: number; m: number }) {
  return (
    <span aria-hidden style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: m }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: i < n ? 'var(--twin-accent)' : velo('var(--twin-fg)', 30),
          }}
        />
      ))}
    </span>
  );
}

function CarreraFijada({ c, sim, onLog }: { c: Carrera; sim: Simulacion | null; onLog: (linea: string) => void }) {
  const hoy = c.dias <= 0;
  const etiqueta = [
    `Camino a ${c.nombre}`,
    hoy ? 'es hoy' : `faltan ${c.dias} ${c.dias === 1 ? 'día' : 'días'}`,
    c.fase,
    c.meta ? `Objetivo ${c.meta}` : null,
    sim ? (sim.tipo === 'programada' ? (sim.hoy ? 'Simulación HYROX hoy' : `Simulación HYROX ${sim.dia}`) : 'Una simulación afina tu predicho') : null,
    'Ver carreras',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Poster foto={c.fondo} onClick={() => onLog(`Camino → Carreras · ${c.nombre}`)} etiqueta={etiqueta}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
          <span style={etiquetaFoto}>Camino a la carrera</span>
        </span>
        <span style={{ ...fuente(800, 26, 1.1, true), letterSpacing: '-0.015em', color: 'var(--twin-fg)', textWrap: 'balance' }}>{c.nombre}</span>
      </span>

      <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              ...fuente(800, hoy ? TAM.cuentaHoy : TAM.cuenta, 0.95, true),
              letterSpacing: '-0.04em',
              color: 'var(--twin-accent-text)',
              ...TABULAR,
            }}
          >
            {hoy ? 'Hoy' : c.dias}
          </span>
          {hoy ? null : (
            <span style={{ ...fuente(800, TAM.seccion, 1, true), color: 'var(--twin-fg)' }}>{c.dias === 1 ? 'día' : 'días'}</span>
          )}
        </span>
        {c.meta ? (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              padding: '8px 14px',
              borderRadius: RADIO.fila,
              boxSizing: 'border-box',
              background: velo('var(--twin-bg)', 62),
              border: `1px solid ${velo('var(--twin-fg)', 26)}`,
              color: 'var(--twin-fg)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.04em' }}>Objetivo</span>
            <span style={{ ...fuente(800, TAM.cuerpo, 1.2, true) }}>{c.meta}</span>
          </span>
        ) : null}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.fase ? (
          <>
            <span style={{ ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{c.fase}</span>
            {c.semana ? <Regleta n={c.semana.n} m={c.semana.m} /> : null}
          </>
        ) : null}
        {sim ? <LineaSimulacion s={sim} /> : null}
      </span>
    </Poster>
  );
}

function Invitacion({ sim, onLog }: { sim: Simulacion | null; onLog: (linea: string) => void }) {
  return (
    <Poster
      foto="sled-push"
      onClick={() => onLog('Camino → buscar tu carrera')}
      etiqueta="Camino a la carrera. Elige tu carrera objetivo. Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo. Busca tu carrera"
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
          <span style={etiquetaFoto}>Camino a la carrera</span>
        </span>
        <span style={{ ...fuente(800, 34, 1.05, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', textWrap: 'balance' }}>
          Elige tu carrera objetivo
        </span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.35), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
          Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo.
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span
          className="hd-pill"
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            height: 52,
            padding: '0 22px',
            boxSizing: 'border-box',
            borderRadius: RADIO.pastilla,
            background: 'var(--twin-fg)',
            color: 'var(--twin-bg)',
            ...fuente(800, TAM.cuerpo, 1, true),
          }}
        >
          <IcoLupa tam={20} />
          Busca tu carrera
        </span>
        {sim && sim.tipo === 'programada' ? <LineaSimulacion s={sim} /> : null}
      </span>
    </Poster>
  );
}

function EsqueletoCamino() {
  return (
    <div
      aria-busy
      aria-label="Cargando tu camino a la carrera"
      style={{
        borderRadius: RADIO.grande,
        minHeight: ALTO_POSTER,
        boxSizing: 'border-box',
        padding: '16px 20px 18px',
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={170} alto={15} radio={5} />
        </span>
        <Esqueleto ancho="62%" alto={28} radio={8} />
      </span>
      <Esqueleto ancho={128} alto={72} radio={12} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Esqueleto ancho="70%" alto={17} radio={6} />
        <Esqueleto alto={6} radio={3} />
        <Esqueleto ancho="48%" alto={15} radio={5} />
      </span>
    </div>
  );
}

/** Nada si no hay camino que contar (sin coach, error de carga): el hueco no se pinta. */
export function Camino({ l, onLog }: { l: LecturaHoy; onLog: (linea: string) => void }) {
  if (l.cargando) return <EsqueletoCamino />;
  const camino: CaminoEstado | null = l.camino;
  if (!camino) return null;
  if (camino.tipo === 'fijada') return <CarreraFijada c={camino.carrera} sim={l.simulacion} onLog={onLog} />;
  return <Invitacion sim={l.simulacion} onLog={onLog} />;
}
