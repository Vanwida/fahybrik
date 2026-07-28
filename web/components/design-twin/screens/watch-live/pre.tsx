'use client';

// Antes del esfuerzo: el brief del día y la puerta de bloque.
// Espejo de ios/FAHYBRIKWatch/Views/TodayBriefView.swift y BlockGateView.swift.

import type { CSSProperties } from 'react';
import { BigTapButton, LiveScaffold, VStack, WatchCanvas, WatchLabel } from './atoms';
import { HEAVY, PADDED_W, SEMIBOLD, W } from './theme';

/**
 * «Hoy toca» — la sesión de un vistazo y un toque para empezar: título, píldoras
 * de bloques · minutos, la pista del primer bloque y el botón naranja. Nada se
 * inventa: el recuento de bloques y la pista salen del detalle decodificado.
 */
export function TodayBrief({
  eyebrow,
  titulo,
  bloques,
  minutos,
  primerBloque,
  onStart,
}: {
  eyebrow: string;
  titulo: string;
  bloques: number;
  minutos: number;
  primerBloque: string;
  onStart: () => void;
}) {
  return (
    <WatchCanvas>
      <div
        style={{
          boxSizing: 'border-box',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          padding: '10px 12px',
        }}
      >
        <WatchLabel text={eyebrow} accent />
        <div style={{ ...clamp2, fontSize: 24, fontWeight: HEAVY, color: W.ink, lineHeight: 1.15 }}>{titulo}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill text={`${bloques} bloques`} background={W.surfaceRaised} />
          <Pill text={`~${minutos} min`} background={W.surfaceRaised} />
        </div>
        <div style={{ fontSize: 11, fontWeight: SEMIBOLD, color: W.dim, whiteSpace: 'nowrap' }}>
          {`1º · ${primerBloque}`}
        </div>
        <div style={{ flex: 1 }} />
        <BigTapButton title="Empezar" play onClick={onStart} />
      </div>
    </WatchCanvas>
  );
}

/**
 * La puerta entre bloques: la sesión aparca aquí antes de cada bloque para que
 * el atleta lo arranque cuando quiera (cargar la barra, leer el WOD). Enseña la
 * posición del bloque, qué toca y sus chips de objetivo — solo lo que la
 * prescripción lleva de verdad.
 */
export function BlockGate({
  status,
  eyebrow,
  titulo,
  chips,
  onStart,
}: {
  status: string;
  eyebrow: string;
  titulo: string;
  chips: ReadonlyArray<string>;
  onStart: () => void;
}) {
  return (
    <LiveScaffold
      status={status}
      statusColor={W.dim}
      hero={
        <VStack gap={7}>
          <WatchLabel text={eyebrow} accent />
          <div
            style={{
              ...clamp2,
              maxWidth: PADDED_W,
              fontSize: 21,
              fontWeight: HEAVY,
              color: W.ink,
              lineHeight: 1.15,
              textAlign: 'center',
            }}
          >
            {titulo}
          </div>
          {chips.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {chips.slice(0, 3).map((chip) => (
                <Pill key={chip} text={chip} background={W.surface} />
              ))}
            </div>
          ) : null}
        </VStack>
      }
      bottom={<BigTapButton title="Empezar bloque" play onClick={onStart} />}
    />
  );
}

function Pill({ text, background }: { text: string; background: string }) {
  return (
    <span
      style={{
        padding: '4px 9px',
        borderRadius: 9999,
        background,
        fontSize: 11,
        fontWeight: HEAVY,
        color: W.ink,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

/** `lineLimit(2)` del reloj. */
const clamp2: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
