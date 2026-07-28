'use client';

// Marco de dispositivo del doble: un iPhone (o Apple Watch) dibujado en CSS
// alrededor del lienzo lógico de la app. Dos modos:
//
//  - enmarcado (por defecto): bisel + isla + barra de estado falsas, lienzo a
//    tamaño LÓGICO fijo (402×874 pt, clase iPhone 17 Pro) escalado para caber.
//  - bare (pantalla completa): sin chrome — el lienzo llena el viewport real y
//    los safe areas salen de env(safe-area-inset-*), así en el iPhone de
//    verdad la pantalla cae EXACTAMENTE donde caería en la app.
//
// El marco fija las vars --twin-safe-* que twin.css aplica en .twin-screen-safe;
// las pantallas jamás dibujan isla ni reloj de sistema.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TwinAppearance, TwinOrientation } from './types';

const IPHONE = { w: 402, h: 874, radius: 55 };
const WATCH = { w: 208, h: 248, radius: 56 };

/** Safe areas lógicos (pt) del lienzo iPhone. */
const SAFE = {
  portrait: { top: 59, bottom: 34, left: 0, right: 0 },
  landscape: { top: 0, bottom: 21, left: 59, right: 59 },
};

export interface DeviceFrameProps {
  device: 'iphone' | 'watch';
  orientation: TwinOrientation;
  appearance: TwinAppearance;
  /** Pantalla completa: sin bisel, lienzo = viewport, safe areas reales. */
  bare?: boolean;
  children: ReactNode;
}

export function DeviceFrame({ device, orientation, appearance, bare = false, children }: DeviceFrameProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const spec = device === 'watch' ? WATCH : IPHONE;
  const landscape = device === 'iphone' && orientation === 'landscape';
  const canvasW = landscape ? spec.h : spec.w;
  const canvasH = landscape ? spec.w : spec.h;

  // Escala para caber en el hueco disponible (nunca ampliamos >1: el lienzo es
  // tamaño lógico real y agrandarlo mentiría sobre densidades).
  useEffect(() => {
    if (bare) return;
    const el = holderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const PAD = 24;
      setScale(Math.min(1, (el.clientWidth - PAD) / canvasW, (el.clientHeight - PAD) / canvasH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bare, canvasW, canvasH]);

  const safe = device === 'watch'
    ? { top: 24, bottom: 12, left: 8, right: 8 }
    : SAFE[landscape ? 'landscape' : 'portrait'];

  const safeVars = bare
    ? {
        '--twin-safe-top': `max(env(safe-area-inset-top), ${safe.top}px)`,
        '--twin-safe-bottom': `max(env(safe-area-inset-bottom), ${safe.bottom}px)`,
        '--twin-safe-left': `env(safe-area-inset-left, ${safe.left}px)`,
        '--twin-safe-right': `env(safe-area-inset-right, ${safe.right}px)`,
      }
    : {
        '--twin-safe-top': `${safe.top}px`,
        '--twin-safe-bottom': `${safe.bottom}px`,
        '--twin-safe-left': `${safe.left}px`,
        '--twin-safe-right': `${safe.right}px`,
      };

  if (bare) {
    return (
      <div
        className="twin-root"
        data-appearance={appearance}
        style={{ position: 'fixed', inset: 0, zIndex: 40, ...(safeVars as CSSProperties) }}
      >
        <div className="twin-screen">{children}</div>
      </div>
    );
  }

  return (
    <div ref={holderRef} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ transform: `scale(${scale})`, transition: 'transform 200ms ease-out' }}>
        {/* Bisel del dispositivo */}
        <div
          style={{
            position: 'relative',
            width: canvasW + 28,
            height: canvasH + 28,
            padding: 14,
            background: '#0a0a0b',
            borderRadius: spec.radius + 14,
            boxShadow:
              'inset 0 0 0 1.5px rgba(255,255,255,0.16), inset 0 0 0 5px #000, 0 30px 70px rgba(0,0,0,0.55)',
            transition: 'width 350ms ease, height 350ms ease, border-radius 350ms ease',
          }}
        >
          {device === 'iphone' && <SideButtons landscape={landscape} />}
          {device === 'watch' && <WatchCrown />}

          {/* Lienzo lógico */}
          <div
            className="twin-root"
            data-appearance={device === 'watch' ? 'dark' : appearance}
            style={{
              position: 'relative',
              width: canvasW,
              height: canvasH,
              borderRadius: spec.radius,
              overflow: 'hidden',
              transition: 'width 350ms ease, height 350ms ease',
              ...(safeVars as CSSProperties),
            }}
          >
            <div className="twin-screen">{children}</div>
            {device === 'iphone' && <IslandAndStatus landscape={landscape} appearance={appearance} />}
            {device === 'iphone' && <HomeIndicator appearance={appearance} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Isla dinámica + barra de estado (solo retrato; en horizontal el HUD es inmersivo). */
function IslandAndStatus({ landscape, appearance }: { landscape: boolean; appearance: TwinAppearance }) {
  const ink = appearance === 'dark' ? '#f5f3f0' : '#0f1217';
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          background: '#000',
          borderRadius: 20,
          ...(landscape
            ? { left: 11, top: '50%', width: 37, height: 126, transform: 'translateY(-50%)' }
            : { top: 11, left: '50%', width: 126, height: 37, transform: 'translateX(-50%)' }),
        }}
      />
      {!landscape && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 59,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 32px 0',
            pointerEvents: 'none',
            color: ink,
          }}
        >
          <span style={{ font: '600 17px/1 var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums' }}>9:41</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <SignalGlyph ink={ink} />
            <WifiGlyph ink={ink} />
            <BatteryGlyph ink={ink} />
          </span>
        </div>
      )}
    </>
  );
}

function HomeIndicator({ appearance }: { appearance: TwinAppearance }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 140,
        height: 5,
        borderRadius: 3,
        background: appearance === 'dark' ? 'rgba(245,243,240,0.35)' : 'rgba(15,18,23,0.30)',
      }}
    />
  );
}

function SideButtons({ landscape }: { landscape: boolean }) {
  const btn = (style: CSSProperties) => (
    <div style={{ position: 'absolute', background: '#1a1a1c', borderRadius: 2, ...style }} />
  );
  if (landscape) {
    return (
      <>
        {btn({ top: -2, left: 120, width: 36, height: 3 })}
        {btn({ top: -2, left: 170, width: 36, height: 3 })}
        {btn({ bottom: -2, left: 190, width: 54, height: 3 })}
      </>
    );
  }
  return (
    <>
      {btn({ left: -2, top: 120, width: 3, height: 36 })}
      {btn({ left: -2, top: 170, width: 3, height: 36 })}
      {btn({ right: -2, top: 190, width: 3, height: 54 })}
    </>
  );
}

function WatchCrown() {
  return (
    <>
      <div style={{ position: 'absolute', right: -4, top: 64, width: 6, height: 34, borderRadius: 3, background: '#1a1a1c' }} />
      <div style={{ position: 'absolute', right: -3, top: 118, width: 4, height: 44, borderRadius: 2, background: '#1a1a1c' }} />
    </>
  );
}

function SignalGlyph({ ink }: { ink: string }) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4.6} y={9 - i * 3 - (i === 0 ? 0 : 0)} width="3.2" height={3 + i * 3} rx="1" fill={ink} opacity={i < 3 ? 1 : 0.35} />
      ))}
    </svg>
  );
}

function WifiGlyph({ ink }: { ink: string }) {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" aria-hidden>
      <path d="M8.5 10.8 6.2 8.4a3.4 3.4 0 0 1 4.6 0Z" fill={ink} />
      <path d="M4.3 6.5a6.3 6.3 0 0 1 8.4 0l-1.5 1.5a4.2 4.2 0 0 0-5.4 0Z" fill={ink} />
      <path d="M2 4.1a9.6 9.6 0 0 1 13 0l-1.5 1.5a7.5 7.5 0 0 0-10 0Z" fill={ink} />
    </svg>
  );
}

function BatteryGlyph({ ink }: { ink: string }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
      <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke={ink} opacity="0.4" fill="none" />
      <rect x="2" y="2" width="16" height="8" rx="2" fill={ink} />
      <path d="M24 4v4a2.2 2.2 0 0 0 0-4Z" fill={ink} opacity="0.4" />
    </svg>
  );
}
