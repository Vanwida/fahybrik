'use client';

// El detalle de una marca — espejo de ios/FAHYBRIK/Marks/MarkDetailView.swift.
//
// El PR, el historial, el gemelo de carrera y la forma de atacarla. Las marcas
// de correr guardan PR POR CONTEXTO (la cinta te mueve el suelo, así que un 5K
// en cinta nunca gana a uno de calle): los dos mejores se enseñan juntos.
//
// La CTA no monta el flujo en vivo: eso es otra pantalla del doble. Aquí solo
// deja el rastro en la cronología y el botón acusa el toque, como cuando iOS
// empieza a levantar el fullScreenCover.

import { useEffect, useRef, useState } from 'react';
import { Card, Hairline, Micro, Mono, NAVBAR_H, NavBar } from './chrome';
import {
  best,
  clock,
  delta,
  markValue,
  paceLine,
  relative,
  type Mark,
  type MarkResult,
  type RaceTwin,
} from './fixtures';

const CTA_DIM_MS = 520;

export function MarkDetail({ mark, onBack, onCta }: { mark: Mark; onBack: () => void; onCta: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const mejor = best(mark);
  const gemelo = mark.raceTwin;
  const registrable = mark.measuredBy === 'registered';

  const pulsarCta = () => {
    setLanzando(true);
    timer.current = window.setTimeout(() => setLanzando(false), CTA_DIM_MS);
    onCta();
  };

  return (
    <>
      <NavBar title={mark.label} back={{ label: 'Tus marcas', onTap: onBack }} scrolled={scrolled} />

      <div
        className="twin-scroll"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        style={{
          position: 'absolute',
          inset: 0,
          paddingTop: NAVBAR_H + 16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 120,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Hero mark={mark} mejor={mejor} />
        {mark.group === 'run' && <ContextBests mark={mark} />}
        {gemelo && mejor && <TwinCard mejor={mejor} gemelo={gemelo} />}
        <Historial mark={mark} />
      </div>

      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 2 }}>
        <button
          type="button"
          className="tw-btn-primary"
          onClick={pulsarCta}
          style={{
            width: '100%',
            font: 'italic 800 16px/1 var(--twin-font-sans)',
            letterSpacing: '1.2px',
            opacity: lanzando ? 0.4 : 1,
            transition: 'opacity 120ms ease-out, transform 80ms ease-out',
          }}
        >
          {registrable ? 'Registrar carrera' : 'Probarme ahora'}
        </button>
      </div>
    </>
  );
}

function Hero({ mark, mejor }: { mark: Mark; mejor: MarkResult | null }) {
  const ritmo = mejor ? paceLine(mark, mejor.value) : null;
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Micro>{mejor ? 'Tu mejor marca' : 'Sin marca todavía'}</Micro>
        <div className="t-readout-l">{mejor ? markValue(mark, mejor.value) : '—'}</div>
        {mejor ? (
          // El Swift pinta el «·» en cuanto hay fecha, haya ritmo o no: en Cooper
          // (metros, sin ritmo derivado) la línea arranca con el punto. Se espeja tal cual.
          <div
            style={{
              display: 'flex',
              gap: 6,
              font: '500 13px/1.4 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
            }}
          >
            {ritmo && <span>{ritmo}</span>}
            <span>·</span>
            <span>{relative(mejor.daysAgo)}</span>
          </div>
        ) : (
          <div style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {mark.approxLabel}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Calle y cinta llevan registros separados: se enseñan los dos, nunca mezclados. */
function ContextBests({ mark }: { mark: Mark }) {
  const aire = best(mark, 'outdoor');
  const cinta = best(mark, 'treadmill');
  if (!aire && !cinta) return null;
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <ContextTile titulo="Aire libre" valor={aire ? markValue(mark, aire.value) : null} />
      <ContextTile titulo="En cinta" valor={cinta ? markValue(mark, cinta.value) : null} />
    </div>
  );
}

function ContextTile({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <Card padding={12} style={{ flex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Micro>{titulo}</Micro>
        <Mono size={17} color={valor ? 'var(--twin-fg)' : 'var(--twin-faint)'}>
          {valor ?? '—'}
        </Mono>
      </div>
    </Card>
  );
}

/** Tu marca fresca contra la MISMA distancia dentro de tu última carrera. */
function TwinCard({ mejor, gemelo }: { mejor: MarkResult; gemelo: RaceTwin }) {
  const hueco = Math.round(gemelo.seconds - mejor.value);
  return (
    <Card padding={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TwinHalf titulo="En el box" valor={clock(mejor.value)} pie="tu PR" />
          <div style={{ width: 1, height: 40, background: 'var(--twin-hairline-strong)', flexShrink: 0 }} />
          <TwinHalf titulo="En carrera" valor={clock(gemelo.seconds)} pie={gemelo.raceName} />
        </div>
        {hueco > 0 && (
          <p
            style={{
              margin: 0,
              font: '500 13px/1.4 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
            }}
          >
            {`En carrera fuiste ${hueco} s más lento que fresco. Normal: llegas con kilómetros en las piernas. Ese hueco es lo que entrena tu plan.`}
          </p>
        )}
      </div>
    </Card>
  );
}

function TwinHalf({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <Micro>{titulo}</Micro>
      <Mono size={19}>{valor}</Mono>
      <span
        style={{
          font: '500 12px/1.3 var(--twin-font-sans)',
          color: 'var(--twin-faint)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pie}
      </span>
    </div>
  );
}

function Historial({ mark }: { mark: Mark }) {
  const vacio =
    mark.measuredBy === 'registered'
      ? `Registra tu primera ${mark.label.toLocaleLowerCase('es-ES')} y aquí verás la progresión.`
      : 'Pruébate y aquí verás la progresión.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Micro>Historial</Micro>
      <Card padding={0}>
        {mark.history.length === 0 ? (
          <p style={{ margin: 0, padding: 14, font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {vacio}
          </p>
        ) : (
          mark.history.map((resultado, i) => (
            <div key={`${resultado.daysAgo}-${resultado.value}`}>
              <FilaHistorial mark={mark} resultado={resultado} anterior={mark.history[i + 1]} />
              {i < mark.history.length - 1 && <Hairline inset={14} />}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function FilaHistorial({
  mark,
  resultado,
  anterior,
}: {
  mark: Mark;
  resultado: MarkResult;
  /** El de DEBAJO en la lista, es decir el más viejo: contra ese se mide el delta. */
  anterior: MarkResult | undefined;
}) {
  const d = anterior ? delta(mark, anterior.value, resultado.value) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {relative(resultado.daysAgo)}
        </span>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {etiquetaHistorial(resultado)}
        </span>
      </div>
      {d && (
        <span
          style={{
            font: '500 12px/1.3 var(--twin-font-sans)',
            color: d.improved ? 'var(--twin-ok)' : 'var(--twin-danger)',
          }}
        >
          {d.label}
        </span>
      )}
      <Mono size={14}>{markValue(mark, resultado.value)}</Mono>
    </div>
  );
}

function etiquetaHistorial(resultado: MarkResult): string {
  switch (resultado.source) {
    case 'coach_test':
      return 'test con tu coach';
    case 'registered':
      return resultado.eventName ?? 'carrera registrada';
    case 'onboarding':
      return 'de cuando entraste';
    default:
      if (resultado.runContext === 'treadmill') return 'en cinta';
      if (resultado.runContext === 'outdoor') return 'aire libre';
      return 'te probaste';
  }
}
