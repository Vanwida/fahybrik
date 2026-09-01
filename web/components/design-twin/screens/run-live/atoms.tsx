'use client';

// Átomos transcritos de Theme/Atoms.swift y Devices/Treadmill/TreadmillHUDComponents.swift.
// Mismos tamaños, mismos radios (Theme.Radius 6/10/14/20), mismos espaciados
// (Theme.Spacing xs4 s8 m12 l16 xl24 xxl32). Todo por vars --twin-*, así el
// cambio claro/oscuro lo hace el estudio y no la pantalla.

import type { CSSProperties, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Tipografía
// ---------------------------------------------------------------------------

/** LabelText — mayúsculas trackeadas (0.16em), semibold, muted por defecto. */
export function Etiqueta({
  texto,
  size = 11,
  color = 'var(--twin-muted)',
}: {
  texto: string;
  size?: number;
  color?: string;
}) {
  return (
    <span className="t-data-label" style={{ fontSize: size, color }}>
      {texto}
    </span>
  );
}

/** Hairline. */
export function Linea({ opacity = 1 }: { opacity?: number }) {
  return <div style={{ height: 1, background: 'var(--twin-hairline)', opacity }} />;
}

// ---------------------------------------------------------------------------
// CardSurface — cara de instrumento: relleno degradado + costura clara arriba
// ---------------------------------------------------------------------------

export function Tarjeta({
  children,
  padding = 16,
  radius = 14,
  topAccent = false,
  leftAccent = false,
  elevated = false,
  style,
}: {
  children: ReactNode;
  padding?: number;
  radius?: number;
  topAccent?: boolean;
  leftAccent?: boolean;
  elevated?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: radius,
        overflow: 'hidden',
        background: elevated
          ? 'linear-gradient(180deg, var(--twin-surface-elevated), var(--twin-surface))'
          : 'linear-gradient(180deg, var(--twin-surface), color-mix(in srgb, var(--twin-surface) 92%, transparent))',
        // El trazo del Swift es un degradado hairlineStrong→hairline: en CSS lo
        // resolvemos con el borde superior más claro que el resto.
        border: '1px solid var(--twin-hairline)',
        borderTopColor: 'var(--twin-hairline-strong)',
        boxShadow: elevated ? 'var(--twin-shadow-hero)' : 'var(--twin-shadow-card)',
        ...style,
      }}
    >
      {topAccent && <div style={{ height: 2, background: 'var(--twin-accent)' }} />}
      {leftAccent && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--twin-accent)' }} />
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpertCell — celda de datos densa (Garmin-style)
// ---------------------------------------------------------------------------

export function Celda({
  etiqueta,
  valor,
  unidad = '',
  color = 'var(--twin-fg)',
  ausente,
}: {
  etiqueta: string;
  /** Nil = no hay medida. No se pinta el hueco: se pinta el porqué (ExpertCell). */
  valor: string | null;
  unidad?: string;
  color?: string;
  /** Lo que se dice cuando `valor` es null («sin reloj», «buscando la banda»…). */
  ausente?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '12px 12px',
        borderRadius: 10,
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline)',
        boxShadow: 'var(--twin-shadow-card-tight)',
        minWidth: 0,
      }}
    >
      <Etiqueta texto={etiqueta} />
      {valor !== null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
          <span
            style={{
              font: 'italic 800 30px/1 var(--twin-font-sans)',
              fontVariantNumeric: 'tabular-nums',
              color,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'clip',
            }}
          >
            {valor}
          </span>
          {unidad !== '' && <span style={{ font: '400 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>}
        </div>
      ) : (
        <span style={{ font: '600 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{ausente ?? 'sin medir'}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GoalProgress — el objetivo del tramo con barra y remate al completarse
// ---------------------------------------------------------------------------

export function ProgresoObjetivo({
  caption,
  primary,
  secondary,
  fraction,
  complete,
  elapsed,
}: {
  caption: string;
  primary: string;
  secondary: string;
  fraction: number;
  complete: boolean;
  /** El reloj del tramo, como segundo readout a la derecha (GoalProgress.elapsed)
   *  — solo cuando el llamador no lo enseña ya como readout principal. */
  elapsed?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--twin-surface-elevated)',
        border: `1px solid ${complete ? 'color-mix(in srgb, var(--twin-ok) 60%, transparent)' : 'var(--twin-hairline)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Etiqueta texto={caption} size={10} />
            {complete && (
              <span style={{ font: 'italic 800 11px/1 var(--twin-font-sans)', letterSpacing: '0.06em', color: 'var(--twin-ok)' }}>
                COMPLETADO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              className="t-readout-s"
              style={{ color: complete ? 'var(--twin-ok)' : 'var(--twin-fg)' }}
            >
              {primary}
            </span>
            <span style={{ font: '600 13px/1 var(--twin-font-mono)', color: 'var(--twin-muted)' }}>/ {secondary}</span>
          </div>
        </div>
        {elapsed !== undefined && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: '0 0 auto' }}>
            <Etiqueta texto="Tiempo" size={10} />
            <span className="t-readout-s" style={{ color: 'var(--twin-fg)' }}>
              {elapsed}
            </span>
          </div>
        )}
      </div>
      <div style={{ height: 8, borderRadius: 9999, background: 'var(--twin-surface)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            borderRadius: 9999,
            background: complete ? 'var(--twin-ok)' : 'var(--twin-accent)',
            transition: 'width 400ms linear',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ZoneMeter — cinco segmentos, el vivo encendido
// ---------------------------------------------------------------------------

const ZONAS = [1, 2, 3, 4, 5] as const;

export function MedidorZona({ zona, estimada = true }: { zona: 1 | 2 | 3 | 4 | 5; estimada?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {ZONAS.map((z) => (
          <div
            key={z}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 2,
              background: `var(--twin-z${z})`,
              opacity: z === zona ? 1 : 0.22,
              boxShadow: z === zona ? 'inset 0 0 0 1px color-mix(in srgb, var(--twin-fg) 50%, transparent)' : 'none',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ font: 'italic 800 15px/1 var(--twin-font-sans)', color: `var(--twin-z${zona})` }}>Z{zona}</span>
        {estimada && <span style={{ font: '600 10px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>genérica</span>}
      </div>
    </div>
  );
}

/** Chip de zona (tw-zone) — sólo en la disposición horizontal, donde el HUD
 *  es un ordenador de a bordo y la zona tiene sitio propio. */
export function ChipZona({ zona }: { zona: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="tw-zone" data-zone={zona}>
      Z{zona}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DeviceChip — el chip de dispositivo con su punto de estado
// ---------------------------------------------------------------------------

export function ChipDispositivo({
  icono,
  texto,
  encendido,
  buscando = false,
}: {
  icono: NombreIcono;
  texto: string;
  encendido: boolean;
  buscando?: boolean;
}) {
  const color = encendido ? 'var(--twin-accent-text)' : 'var(--twin-muted)';
  const punto = encendido ? 'var(--twin-ok)' : buscando ? 'var(--twin-warning)' : 'var(--twin-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 8px',
        borderRadius: 6,
        color,
        background: encendido ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'var(--twin-surface)',
        border: `1px solid ${encendido ? 'color-mix(in srgb, var(--twin-accent-text) 50%, transparent)' : 'var(--twin-outline)'}`,
        maxWidth: '100%',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: punto, opacity: buscando ? 0.6 : 1 }} />
      <Icono nombre={icono} size={9} />
      <span
        style={{
          font: 'italic 800 9px/1 var(--twin-font-sans)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {texto}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

/** neutralButton — 66 pt, cursiva heavy trackeada, cara elevada. */
export function BotonNeutro({ titulo, onClick }: { titulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 66,
        minWidth: 0,
        padding: '0 8px',
        borderRadius: 14,
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline-strong)',
        color: 'var(--twin-fg)',
        font: 'italic 800 17px/1 var(--twin-font-sans)',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {titulo}
    </button>
  );
}

/** ExpertPrimaryButton — relleno naranja, glifo accentOn. */
export function BotonPrimario({
  titulo,
  onClick,
  height = 54,
  enabled = true,
}: {
  titulo: string;
  onClick: () => void;
  height?: number;
  enabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className="tw-btn-primary"
      style={{
        width: '100%',
        height,
        letterSpacing: '0.06em',
        background: enabled ? 'var(--twin-accent)' : 'color-mix(in srgb, var(--twin-accent) 30%, transparent)',
        boxShadow: enabled ? 'var(--twin-shadow-card)' : 'none',
        cursor: enabled ? 'pointer' : 'default',
      }}
    >
      {titulo}
    </button>
  );
}

/** SecondaryButton — 16 semibold, sólo contorno. */
export function BotonSecundario({ titulo, onClick }: { titulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tw-btn-secondary" style={{ width: '100%' }}>
      {titulo}
    </button>
  );
}

/** Botón redondo de cabecera (34 pt) — salir, atrás, voz. */
export function BotonRedondo({
  icono,
  onClick,
  color = 'var(--twin-muted)',
  etiqueta,
  borde = false,
}: {
  icono: NombreIcono;
  onClick: () => void;
  color?: string;
  etiqueta: string;
  borde?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      style={{
        width: 34,
        height: 34,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
        background: 'var(--twin-surface)',
        border: borde ? '1px solid var(--twin-hairline)' : '1px solid transparent',
        color,
        cursor: 'pointer',
      }}
    >
      <Icono nombre={icono} size={14} />
    </button>
  );
}

/** stepperCard — el mando de la máquina: − valor unidad + */
export function TarjetaStepper({
  etiqueta,
  valor,
  unidad,
  onMenos,
  onMas,
}: {
  etiqueta: string;
  valor: string;
  unidad: string;
  onMenos: () => void;
  onMas: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 14,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <Etiqueta texto={etiqueta} size={10} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <BotonPaso icono="minus" onClick={onMenos} etiqueta={`Bajar ${etiqueta.toLowerCase()}`} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
          <span style={{ font: '800 24px/1 var(--twin-font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
            {valor}
          </span>
          <span style={{ font: '600 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>
        </div>
        <BotonPaso icono="plus" onClick={onMas} etiqueta={`Subir ${etiqueta.toLowerCase()}`} />
      </div>
    </div>
  );
}

function BotonPaso({ icono, onClick, etiqueta }: { icono: NombreIcono; onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      style={{
        width: 40,
        height: 40,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline-strong)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
      }}
    >
      <Icono nombre={icono} size={17} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Nota en tarjeta plana (readOnlyNote / manualSpeedNote / howToCard)
// ---------------------------------------------------------------------------

export function NotaPlana({ icono, children }: { icono: NombreIcono; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        background: 'var(--twin-surface)',
        color: 'var(--twin-muted)',
      }}
    >
      <span style={{ flex: '0 0 auto', marginTop: 1 }}>
        <Icono nombre={icono} size={13} />
      </span>
      <span style={{ font: '500 12px/1.35 var(--twin-font-sans)' }}>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iconos — SVG mínimos con la silueta del símbolo que usa la app
// ---------------------------------------------------------------------------

export type NombreIcono =
  | 'runner'
  | 'location-fill'
  | 'location'
  | 'location-slash'
  | 'speaker-on'
  | 'speaker-off'
  | 'xmark'
  | 'chevron-left'
  | 'pause-circle'
  | 'check-circle'
  | 'info-circle'
  | 'speedometer'
  | 'wifi-alert'
  | 'minus'
  | 'plus'
  | 'heart';

export function Icono({ nombre, size = 14 }: { nombre: NombreIcono; size?: number }) {
  const comun = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style: { display: 'block', flex: '0 0 auto' },
  };
  switch (nombre) {
    case 'runner':
      return (
        <svg {...comun} strokeWidth={0} fill="currentColor">
          <circle cx="14.4" cy="4" r="2.1" />
          <path d="M12.9 7.4 9.2 9.6a2 2 0 0 0-.9 1.2l-.7 2.7 2-.5.5-2 2-1.1.3 2.6-2.6 3.1-2.8 4.6 1.9 1 2.7-4.2 2.4-2.4 1.4 3.1 1.1 4.1 2-.5-1.2-4.6-1.6-3.6.2-2.9 1.8 1.9 2.9.6.4-2-2.2-.5-2.6-2.9a2 2 0 0 0-2-.4Z" />
        </svg>
      );
    case 'location-fill':
      return (
        <svg {...comun} strokeWidth={0} fill="currentColor">
          <path d="M20.6 3.4 4.1 10.2c-1 .4-.9 1.9.2 2.1l6.4 1.4a1 1 0 0 1 .8.8l1.4 6.4c.2 1.1 1.7 1.2 2.1.2l6.8-16.5c.3-.8-.4-1.5-1.2-1.2Z" />
        </svg>
      );
    case 'location':
      return (
        <svg {...comun}>
          <path d="M20.6 3.4 4.1 10.2c-1 .4-.9 1.9.2 2.1l6.4 1.4a1 1 0 0 1 .8.8l1.4 6.4c.2 1.1 1.7 1.2 2.1.2l6.8-16.5c.3-.8-.4-1.5-1.2-1.2Z" />
        </svg>
      );
    case 'location-slash':
      return (
        <svg {...comun}>
          <path d="M20.6 3.4 4.1 10.2c-1 .4-.9 1.9.2 2.1l6.4 1.4a1 1 0 0 1 .8.8l1.4 6.4c.2 1.1 1.7 1.2 2.1.2l6.8-16.5c.3-.8-.4-1.5-1.2-1.2Z" />
          <path d="M3 3 21 21" />
        </svg>
      );
    case 'speaker-on':
      return (
        <svg {...comun}>
          <path d="M11 5 6.5 8.8H3.5v6.4h3L11 19Z" fill="currentColor" strokeWidth={1.6} />
          <path d="M15.2 9.2a4 4 0 0 1 0 5.6M18 6.4a8 8 0 0 1 0 11.2" />
        </svg>
      );
    case 'speaker-off':
      return (
        <svg {...comun}>
          <path d="M11 5 6.5 8.8H3.5v6.4h3L11 19Z" fill="currentColor" strokeWidth={1.6} />
          <path d="M16 9.5 21 14.5M21 9.5 16 14.5" />
        </svg>
      );
    case 'xmark':
      return (
        <svg {...comun}>
          <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...comun}>
          <path d="M15 4.5 7.5 12l7.5 7.5" />
        </svg>
      );
    case 'pause-circle':
      return (
        <svg {...comun} strokeWidth={0} fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM10.4 8h1.3v8h-1.3V8Zm2.6 0h1.3v8H13V8Z" />
        </svg>
      );
    case 'check-circle':
      return (
        <svg {...comun} strokeWidth={0} fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 6.9-6.3 7.5-3.6-3.4 1.3-1.4 2.2 2.1 5-6Z" />
        </svg>
      );
    case 'info-circle':
      return (
        <svg {...comun}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5" />
          <path d="M12 7.6v.1" />
        </svg>
      );
    case 'speedometer':
      return (
        <svg {...comun}>
          <path d="M3.5 17a9 9 0 1 1 17 0" />
          <path d="M12 13.5 16 9" />
          <circle cx="12" cy="14.6" r="1.1" fill="currentColor" strokeWidth={0} />
        </svg>
      );
    case 'wifi-alert':
      return (
        <svg {...comun}>
          <path d="M2.5 8.6a14 14 0 0 1 13 -1.9" />
          <path d="M5.6 12.4a9.4 9.4 0 0 1 7.4 -1.4" />
          <path d="M8.8 16.1a4.8 4.8 0 0 1 3.2 -.5" />
          <path d="M19 8v5M19 16.4v.1" />
        </svg>
      );
    case 'minus':
      return (
        <svg {...comun} strokeWidth={2.8}>
          <path d="M5 12h14" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...comun} strokeWidth={2.8}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...comun} strokeWidth={0} fill="currentColor">
          <path d="M12 20.3 4.2 12.9a4.8 4.8 0 0 1 6.8-6.7l1 1 1-1a4.8 4.8 0 0 1 6.8 6.7Z" />
        </svg>
      );
  }
}
