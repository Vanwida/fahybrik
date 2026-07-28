'use client';

// Átomos del HUD del reloj — espejo de ios/FAHYBRIKWatch/Views/LiveHUDShared.swift.
//
// El numeral gigante, la etiqueta trackeada, la tira de estado, el botón de
// toque grande, la píldora de FC, la teja de métrica, los puntos de serie y el
// andamio común. Todas las pantallas del reloj se componen de aquí, así que la
// jerarquía y los tamaños no pueden divergir entre familias (diseño: CLARO ·
// GRANDE · ≤4 métricas · pantalla = botón).

import type { CSSProperties, ReactNode } from 'react';
import { estimateWidth, fitScale } from './format';
import { HEAVY, SEMIBOLD, SCAFFOLD_W, W } from './theme';

/**
 * El lienzo del reloj: negro a sangre (como `WatchTheme.bg.ignoresSafeArea()`)
 * y el contenido dentro del safe area que fija DeviceFrame.
 */
export function WatchCanvas({ background = W.bg, children }: { background?: string; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background }}>
      <div className="twin-screen-safe">{children}</div>
    </div>
  );
}

// MARK: - Etiqueta

/** Etiqueta de 10 pt en versales trackeadas. `accent` la tiñe de naranja suave. */
export function WatchLabel({
  text,
  color = W.dim,
  accent = false,
}: {
  text: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: HEAVY,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: accent ? W.orangeSoft : color,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

// MARK: - Tira de estado

/** La tira superior («FUERZA · SERIE 2 / 5»). Naranja suave por defecto. */
export function StatusHeader({ text, color = W.orangeSoft }: { text: string; color?: string }) {
  return (
    <div
      style={{
        width: '100%',
        textAlign: 'center',
        fontSize: 11,
        fontWeight: HEAVY,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

// MARK: - Numeral gigante

/**
 * El número protagonista: heavy, cursiva, tabular. La unidad («/km», «kg») va
 * pequeña al lado, recta y sobre la línea base. Encoge como el
 * `minimumScaleFactor(0.4)` del reloj cuando el texto crece (un «01:30» ocupa
 * mucho más que un «:45»).
 */
export function GiantNumber({
  text,
  size = 72,
  color = W.ink,
  unit,
  maxWidth = SCAFFOLD_W,
}: {
  text: string;
  size?: number;
  color?: string;
  unit?: string;
  maxWidth?: number;
}) {
  const unitSize = size * 0.28;
  const raw = estimateWidth(text, size) + (unit ? estimateWidth(unit, unitSize) : 0);
  const scale = fitScale(raw, maxWidth);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1.1 }}>
      <span
        style={{
          fontSize: size * scale,
          fontWeight: HEAVY,
          fontStyle: 'italic',
          fontVariantNumeric: 'tabular-nums',
          color,
        }}
      >
        {text}
      </span>
      {unit ? (
        <span
          style={{
            fontSize: unitSize * scale,
            fontWeight: HEAVY,
            fontVariantNumeric: 'tabular-nums',
            color: W.dim,
          }}
        >
          {unit}
        </span>
      ) : null}
    </div>
  );
}

// MARK: - Botón de toque grande

/** La acción primaria a todo lo ancho: 52 pt de alto, radio 18, naranja o verde. */
export function BigTapButton({
  title,
  play = false,
  kind = 'orange',
  onClick,
}: {
  title: string;
  /** Glifo `play.fill` a la izquierda del título. */
  play?: boolean;
  kind?: 'orange' | 'green';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        height: 52,
        border: 0,
        padding: 0,
        borderRadius: 18,
        background: kind === 'green' ? W.zoneGreen : W.orange,
        color: kind === 'green' ? W.greenOn : '#FFFFFF',
        fontFamily: 'inherit',
        fontSize: 15,
        fontWeight: HEAVY,
        cursor: 'pointer',
        flex: '0 0 auto',
      }}
    >
      {play ? <PlayGlyph /> : null}
      {title}
    </button>
  );
}

function PlayGlyph() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden focusable="false">
      <path d="M1.4 1.1 10.7 6.5a.6.6 0 0 1 0 1L1.4 12.9A.6.6 0 0 1 .5 12.4V1.6a.6.6 0 0 1 .9-.5Z" fill="currentColor" />
    </svg>
  );
}

// MARK: - Píldora de FC

/** FC compacta con el punto teñido de zona. Sin dato, un guion: nunca un número inventado. */
export function HRPill({ bpm, dotColor }: { bpm: number | null; dotColor: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
      <span style={{ fontSize: 13, fontWeight: HEAVY, fontVariantNumeric: 'tabular-nums', color: W.ink }}>
        {bpm === null ? '—' : bpm}
      </span>
    </span>
  );
}

// MARK: - Teja de métrica

/**
 * Una métrica secundaria (DIST / FC …). Hasta tres bajo el héroe, que siempre
 * manda. Nota de fidelidad: en el Swift la teja intenta bajar su etiqueta a
 * 8.5 pt con un `.font()` POR FUERA de `WatchLabel`, que en SwiftUI no gana al
 * `.font()` interno — se dibuja a 10 pt, que es lo que se replica aquí.
 */
export function MetricTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        padding: '6px 2px',
        background: W.surface,
        borderRadius: 11,
      }}
    >
      <WatchLabel text={label} />
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 1, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 16, fontWeight: HEAVY, fontVariantNumeric: 'tabular-nums', color: W.ink }}>
          {value}
        </span>
        {unit ? <span style={{ fontSize: 9, fontWeight: SEMIBOLD, color: W.dim }}>{unit}</span> : null}
      </span>
    </div>
  );
}

// MARK: - Puntos de progreso de series

/** Hecha (verde) · actual (naranja) · pendiente (gris). */
export function SetDots({ total, currentIndex, doneCount }: { total: number; currentIndex: number; doneCount: number }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: i < doneCount ? W.zoneGreen : i === currentIndex ? W.orange : W.surfaceRaised,
          }}
        />
      ))}
    </div>
  );
}

// MARK: - Andamio de pantalla en vivo

/**
 * El marco común: lienzo negro, tira de estado arriba, héroe centrado y acción
 * anclada abajo. Los dos huecos flexibles son los `Spacer(minLength: 0)` del
 * Swift, que centran el héroe en lo que sobra.
 */
export function LiveScaffold({
  status,
  statusColor = W.orangeSoft,
  background,
  hero,
  bottom,
}: {
  status?: string;
  statusColor?: string;
  background?: string;
  hero: ReactNode;
  bottom?: ReactNode;
}) {
  return (
    <WatchCanvas background={background}>
      <div style={{ ...scaffoldColumn, padding: '6px 10px' }}>
        {status ? <StatusHeader text={status} color={statusColor} /> : null}
        <div style={{ flex: 1 }} />
        {hero}
        <div style={{ flex: 1 }} />
        {bottom}
      </div>
    </WatchCanvas>
  );
}

const scaffoldColumn: CSSProperties = {
  boxSizing: 'border-box',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
};

/** Columna vertical centrada — el `VStack(spacing:)` del Swift. */
export function VStack({
  gap,
  align = 'center',
  children,
  style,
}: {
  gap: number;
  align?: CSSProperties['alignItems'];
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap, ...style }}>{children}</div>
  );
}
