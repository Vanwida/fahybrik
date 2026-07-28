'use client';

// Átomos del hub: transcripción de Theme/Atoms.swift (CardSurface, Hairline,
// ExpertPrimaryButton, SecondaryButton, LabelText, ToastBanner) y de las piezas
// que ProfileView define para sus filas de dispositivos (deviceRowContent,
// SectionHeader, la píldora de estado). Los tamaños son los del Swift, no
// aproximaciones: 13 semibold el título, 11 el subtítulo, 10 tracked la píldora.

import type { CSSProperties, ReactNode } from 'react';
import { Glyph, type GlyphName } from './glyphs';
import { R, ROW_PAD, SP } from './tokens';

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

/** CardSurface(padding:) — surface + hairline + radio continuo de 14. */
export function Card({
  children,
  padding = SP.l,
  style,
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="tw-card" style={{ padding, ...style }}>
      {children}
    </div>
  );
}

/** Hairline() — la línea de 1 px que separa filas dentro de una card. */
export function Hairline() {
  return <div style={{ height: 1, background: 'var(--twin-hairline)' }} />;
}

/** SectionHeader de Perfil: 10 semibold, tracking 1.6, mayúsculas, muted. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        font: '600 10px/1.2 var(--twin-font-sans)',
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
        padding: `${SP.xs}px ${SP.xs}px 0`,
      }}
    >
      {title}
    </div>
  );
}

/** LabelText — micro-etiqueta en mayúsculas con el tracking de dataLabel. */
export function LabelText({ text, size = 11, color = 'var(--twin-muted)' }: { text: string; size?: number; color?: string }) {
  return (
    <div
      style={{
        font: `600 ${size}px/1.2 var(--twin-font-sans)`,
        letterSpacing: 1.76,
        textTransform: 'uppercase',
        color,
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila de dispositivo (ProfileView.deviceRowContent)
// ---------------------------------------------------------------------------

/** La píldora de estado del final de fila: 10 semibold, tracking 1.2, tinte 15 %. */
export function StatusPill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        font: '600 10px/1 var(--twin-font-sans)',
        letterSpacing: 1.2,
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        padding: '3px 8px',
        borderRadius: 9999,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export interface DeviceRowProps {
  icon: GlyphName;
  title: string;
  subtitle: ReactNode;
  /** Color del subtítulo — ok / danger / muted, como hace cada fila del Swift. */
  subtitleColor?: string;
  trailing?: ReactNode;
  onTap?: () => void;
  ariaLabel?: string;
}

/** El cuerpo común de toda fila del hub: glifo · título+subtítulo · trailing. */
export function DeviceRow({
  icon,
  title,
  subtitle,
  subtitleColor = 'var(--twin-muted)',
  trailing,
  onTap,
  ariaLabel,
}: DeviceRowProps) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${ROW_PAD.y}px ${ROW_PAD.x}px`,
        width: '100%',
        textAlign: 'left',
      }}
    >
      <div style={{ width: 26, display: 'flex', justifyContent: 'center', color: 'var(--twin-accent-text)' }}>
        <Glyph name={icon} size={16} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{title}</div>
        <div style={{ font: '400 11px/1.35 var(--twin-font-sans)', color: subtitleColor }}>{subtitle}</div>
      </div>
      {trailing}
    </div>
  );

  if (!onTap) return inner;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel ?? title}
      style={{ all: 'unset', display: 'block', cursor: 'pointer', width: '100%' }}
    >
      {inner}
    </button>
  );
}

/** El par píldora + chevron que cierra las filas navegables. */
export function PillAndChevron({ text, color, chevron = true }: { text: string; color: string; chevron?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: SP.s }}>
      <StatusPill text={text} color={color} />
      {chevron && <Glyph name="chevron.right" size={11} color="var(--twin-faint)" weight={2.6} />}
    </span>
  );
}

/**
 * deviceGroup(title:caption:) — el título ES la explicación de qué pueden hacer
 * los dispositivos de dentro, así el atleta no espera algo que no va a pasar.
 */
export function DeviceGroup({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
      <div style={{ font: '600 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{title}</div>
      <div style={{ font: '400 11px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', paddingBottom: 2 }}>
        {caption}
      </div>
      <Card padding={0}>{children}</Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

/** Toggle nativo de iOS con el tinte de marca (Theme.Color.accent). */
export function IOSSwitch({
  on,
  onChange,
  disabled = false,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        all: 'unset',
        width: 51,
        height: 31,
        borderRadius: 9999,
        background: on ? 'var(--twin-accent)' : 'var(--twin-surface-sunken)',
        boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--twin-hairline-strong)',
        position: 'relative',
        flex: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background-color 180ms ease-out',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: 9999,
          background: '#fff',
          boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
          transition: 'left 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />
    </button>
  );
}

/** ProgressView() — el indeterminado de iOS, tintado. */
export function Spinner({ size = 18, color = 'var(--twin-accent-text)' }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        border: `${Math.max(1.5, size / 10)}px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderTopColor: color,
        animation: 'twin-spin 780ms linear infinite',
      }}
    />
  );
}

/** ExpertPrimaryButton — relleno naranja, itálica heavy, tracking 1, alto 54. */
export function PrimaryButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="tw-btn-primary"
      onClick={onClick}
      style={{ width: '100%', letterSpacing: 1, fontSize: 16, boxShadow: 'var(--twin-shadow-card)' }}
    >
      {title}
    </button>
  );
}

/** SecondaryButton — contorno, 16 semibold, alto 54. */
export function SecondaryButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" className="tw-btn-secondary" onClick={onClick} style={{ width: '100%' }}>
      {title}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Navegación y presentaciones
// ---------------------------------------------------------------------------

/** Barra de navegación empujada: chevron de volver + título inline opcional. */
export function NavBar({ title, onBack }: { title?: string; onBack: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 44,
        padding: `0 ${SP.s}px`,
        position: 'relative',
        flex: 'none',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: `0 ${SP.s}px`, height: 44 }}
      >
        <Glyph name="chevron.left" size={19} color="var(--twin-accent-text)" weight={2.4} />
      </button>
      {title && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            font: '600 17px/1 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            pointerEvents: 'none',
          }}
        >
          {title}
        </span>
      )}
    </div>
  );
}

/**
 * Hoja modal de iOS: la página de debajo se encoge y se oscurece, y la tarjeta
 * sube dejando ver el borde superior. `topInset` = 0 para las hojas que cubren
 * casi todo (las que la app presenta sin detents).
 */
export function Sheet({ children, topInset = 48 }: { children: ReactNode; topInset?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--twin-scrim)' }} />
      <div
        style={{
          position: 'absolute',
          top: topInset,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--twin-bg)',
          borderTopLeftRadius: R.xl,
          borderTopRightRadius: R.xl,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.35)',
          animation: 'twin-sheet-up 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface ActionSheetProps {
  title: string;
  message: string;
  /** El botón destructivo (role: .destructive). */
  confirmTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** confirmationDialog(...) — el action sheet de iOS, con su botón Cancelar aparte. */
export function ActionSheet({ title, message, confirmTitle, onConfirm, onCancel }: ActionSheetProps) {
  const block: CSSProperties = {
    background: 'var(--twin-surface-elevated)',
    borderRadius: R.l,
    overflow: 'hidden',
    backdropFilter: 'blur(20px)',
  };
  const action: CSSProperties = {
    all: 'unset',
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    padding: '17px 16px',
    cursor: 'pointer',
    font: '400 20px/1.2 var(--twin-font-sans)',
  };
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--twin-scrim)' }} onClick={onCancel} />
      <div
        style={{
          position: 'relative',
          padding: `0 ${SP.s}px calc(var(--twin-safe-bottom) + ${SP.s}px)`,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.s,
          animation: 'twin-sheet-up 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={block}>
          <div style={{ padding: `${SP.l}px ${SP.l}px ${SP.m}px`, textAlign: 'center' }}>
            <div style={{ font: '600 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{title}</div>
            <div style={{ font: '400 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', marginTop: SP.xs }}>
              {message}
            </div>
          </div>
          <Hairline />
          <button type="button" style={{ ...action, color: 'var(--twin-danger)' }} onClick={onConfirm}>
            {confirmTitle}
          </button>
        </div>
        <button
          type="button"
          style={{ ...block, ...action, font: '600 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** ToastBanner — check verde + texto, sobre superficie elevada con borde naranja. */
export function Toast({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: `calc(var(--twin-safe-top) + ${SP.l}px)`,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 15,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: R.l,
          background: 'var(--twin-surface-elevated)',
          border: '1px solid color-mix(in srgb, var(--twin-accent-text) 35%, transparent)',
          boxShadow: 'var(--twin-shadow-card-tight)',
          animation: 'twin-toast-in 240ms ease-out',
        }}
      >
        <Glyph name="checkmark.circle.fill" size={16} color="var(--twin-ok)" />
        <span style={{ font: '600 13px/1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{text}</span>
      </div>
    </div>
  );
}

/** Keyframes locales — inyectados una vez por la pantalla que los usa. */
export const KEYFRAMES = `
@keyframes twin-spin { to { transform: rotate(360deg); } }
@keyframes twin-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes twin-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes twin-progress { from { width: 8%; } to { width: 92%; } }
`;
