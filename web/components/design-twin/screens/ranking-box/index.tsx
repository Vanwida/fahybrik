'use client';

// Ranking del box — PROPUESTA (aún no existe en la app). Fuente: el mockup
// aprobado docs/design/marcas-ranking-analiticas-mockup.html, adaptado al
// lienzo del iPhone con los tokens del doble. Dos vistas: la card «En tu box»
// bajo el PR en el detalle de marca, y «Tus marcas» dentro de Analíticas.
// Regla del mockup: percentil y distribución SIN nombres — los nombres son del
// coach, en su dashboard, no de la app del atleta.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ANALITICAS, CUARTIL, REMO_500, topPct } from './data';

export const meta: TwinMeta = {
  id: 'ranking-box',
  titulo: 'Ranking del box — «En tu box»',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  descripcion:
    'Tu marca contra el box, sin nombres: percentil + distribución anónima en el detalle de marca, y «Tus marcas» dentro de Analíticas. Los datos ya viajan en el GET de marcas.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'en-tu-box',
    titulo: 'La card en el detalle de marca',
    descripcion: 'Bajo el PR: Top 18%, la distribución con tu barra encendida y tu progreso (del 50% al 82%).',
  },
  {
    id: 'analiticas',
    titulo: 'La sección en Analíticas',
    descripcion: '«Tus marcas»: progresión propia (sparkline) + posición en el box por marca.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {escenario === 'analiticas' ? <VistaAnaliticas /> : <VistaDetalle onLog={onLog} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome compartido (la barra de navegación en línea del detalle)
// ---------------------------------------------------------------------------

function NavBar({ titulo, atras }: { titulo: string; atras: boolean }) {
  return (
    <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 8px', flex: '0 0 auto' }}>
      <span style={{ width: 44, display: 'inline-flex', justifyContent: 'center', color: 'var(--twin-accent-text)' }}>
        {atras ? (
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="m10 3.4-5 4.6 5 4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span style={{ flex: 1, textAlign: 'center', font: '600 17px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {titulo}
      </span>
      <span style={{ width: 44 }} />
    </div>
  );
}

function Card({ children, padding = 15 }: { children: React.ReactNode; padding?: number }) {
  return (
    <div
      style={{
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        borderRadius: 14,
        padding,
      }}
    >
      {children}
    </div>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        font: '700 10.5px/1.1 var(--twin-font-sans)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--twin-faint)',
      }}
    >
      {children}
    </span>
  );
}

/** El pill de percentil: bajo el cuartil (Top ≤25 %) naranja; por encima, verde. */
function PillTop({ beatenPct }: { beatenPct: number }) {
  const top = topPct(beatenPct);
  const acc = top <= CUARTIL;
  const color = acc ? 'var(--twin-accent-text)' : 'var(--twin-ok)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 9999,
        font: '650 11.5px/1.2 var(--twin-font-sans)',
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      Top {top}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Vista 1 — el detalle de la marca con «En tu box»
// ---------------------------------------------------------------------------

function VistaDetalle({ onLog }: { onLog: (l: string) => void }) {
  const d = REMO_500;
  const max = Math.max(...d.histogram);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar titulo={d.markLabel} atras />
      <div className="twin-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <Card padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <K>Tu mejor marca</K>
            <span className="t-readout-l" style={{ color: 'var(--twin-fg)' }}>{d.best}</span>
            <span style={{ font: '500 11.5px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              {d.pace} · {d.age}
            </span>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <K>En tu box</K>
            <PillTop beatenPct={d.beatenPct} />
          </div>
          <button
            type="button"
            onClick={() => onLog('La distribución no tiene nombres — solo tu barra encendida')}
            style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
            aria-label={`Distribución del box: mejor que el ${d.beatenPct}%`}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2, height: 56, paddingTop: 8 }}>
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  left: `${((d.ownBucket + 0.5) / d.histogram.length) * 100}%`,
                  transform: 'translateX(-50%)',
                  font: '700 10px/1 var(--twin-font-sans)',
                  color: 'var(--twin-accent-text)',
                }}
              >
                tú
              </span>
              {d.histogram.map((count, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(8, (count / max) * 100)}%`,
                    borderRadius: '2px 2px 0 0',
                    background: i === d.ownBucket ? 'var(--twin-accent)' : 'color-mix(in srgb, var(--twin-fg) 10%, transparent)',
                  }}
                />
              ))}
            </div>
          </button>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              font: '500 11.5px/1.2 var(--twin-font-mono)',
              color: 'var(--twin-faint)',
            }}
          >
            <span>{d.worst}</span>
            <span>mediana {d.median}</span>
            <span>{d.bestOfBox}</span>
          </div>
          <p style={{ margin: '10px 0 0', font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Mejor que el <b style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>{d.beatenPct}%</b> de los hombres del box
            · {d.n} con marca
          </p>
        </Card>

        <Card>
          <div style={{ marginBottom: 4 }}>
            <K>Tu progreso aquí</K>
          </div>
          <p style={{ margin: 0, font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Hace 3 meses estabas en el <b style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>{d.beatenPct90dAgo}%</b>. Has
            adelantado a un tercio del box sin que nadie publicara nada.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista 2 — «Tus marcas» dentro de Analíticas
// ---------------------------------------------------------------------------

function VistaAnaliticas() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar titulo="Analíticas" atras={false} />
      <div className="twin-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <div style={{ padding: '2px 2px 0' }}>
          <K>Tus marcas</K>
        </div>
        <Card padding={6}>
          {ANALITICAS.map((m, idx) => (
            <div
              key={m.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 9px',
                borderBottom: idx < ANALITICAS.length - 1 ? '1px solid var(--twin-hairline)' : 'none',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ font: '650 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{m.label}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30, width: 90, marginTop: 4 }}>
                  {m.spark.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${h}%`,
                        borderRadius: '2px 2px 0 0',
                        background:
                          i === m.spark.length - 1
                            ? 'var(--twin-accent)'
                            : 'color-mix(in srgb, var(--twin-accent) 35%, transparent)',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span style={{ font: '700 14px/1.2 var(--twin-font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
                  {m.value}
                </span>
                <PillTop beatenPct={m.beatenPct} />
              </div>
            </div>
          ))}
        </Card>
        <p style={{ margin: 0, padding: '0 4px', font: '400 11.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          Comparado con los hombres del box, cada marca en su contexto (calle y cinta aparte).
        </p>
      </div>
    </div>
  );
}
