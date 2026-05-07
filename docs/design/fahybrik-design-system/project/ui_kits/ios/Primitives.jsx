// FAHYBRIK iOS UI Kit — atomic primitives.
// Mirrors ios/FAHYBRIK/Theme/Theme.swift + onboarding/components.
// Exports to window for cross-script usage.

const FA_TOKENS = {
  bg: '#0A0A0A', surface: '#141414', surfaceElevated: '#1F1F1F',
  fg: '#F5F5F5', muted: '#A1A1A1',
  hairline: 'rgba(161,161,161,0.18)', outline: 'rgba(255,255,255,0.10)',
  accent: '#F06A2A', accentPress: '#D85A20',
  ok: '#3FC773', warning: '#F2A52E', danger: '#F23F3F',
  z1: '#C7C7C7', z2: '#4D9EEB', z3: '#4DC773', z4: '#F2B833', z5: '#EB4D4D',
  fontDisplay: '"Archivo", "SF Pro Display", system-ui, sans-serif',
  fontSans: '"Geist", "SF Pro Text", system-ui, sans-serif',
  fontMono: '"Geist Mono", "SF Mono", ui-monospace, monospace',
};

// Wordmark — bracketed orange F + foreground rest.
function Wordmark({ size = 38 }) {
  return (
    <span style={{
      fontFamily: FA_TOKENS.fontDisplay, fontWeight: 900, fontStyle: 'italic',
      fontSize: size, lineHeight: 1, letterSpacing: '-0.02em',
      color: FA_TOKENS.fg, whiteSpace: 'nowrap',
    }}>
      <span style={{ color: FA_TOKENS.accent }}>[F]</span>AHYBRIK
    </span>
  );
}

// Section label — UPPERCASE TRACKED 11px muted
function SectionLabel({ children, style = {} }) {
  return (
    <div style={{
      fontFamily: FA_TOKENS.fontSans, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: FA_TOKENS.muted, ...style,
    }}>{children}</div>
  );
}

// Italic-bold display headlines
function Headline({ size = 'm', children, style = {} }) {
  const sizes = { l: 38, m: 28, s: 20 };
  const weights = { l: 900, m: 900, s: 700 };
  return (
    <div style={{
      fontFamily: FA_TOKENS.fontDisplay, fontWeight: weights[size],
      fontStyle: 'italic', fontSize: sizes[size], lineHeight: 1.1,
      color: FA_TOKENS.fg, letterSpacing: '-0.01em', ...style,
    }}>{children}</div>
  );
}

// Primary CTA — orange fill, italic-bold, 54h
function PrimaryButton({ title, onClick, enabled = true, style = {} }) {
  return (
    <button onClick={enabled ? onClick : undefined}
      style={{
        height: 54, width: '100%', border: 0, borderRadius: 14, cursor: enabled ? 'pointer' : 'default',
        background: enabled ? FA_TOKENS.accent : `${FA_TOKENS.accent}66`,
        color: '#fff',
        fontFamily: FA_TOKENS.fontDisplay, fontWeight: 800, fontStyle: 'italic',
        fontSize: 16, letterSpacing: '0.06em',
        ...style,
      }}>{title}</button>
  );
}

function SecondaryButton({ title, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      height: 54, width: '100%', border: `1px solid ${FA_TOKENS.outline}`, borderRadius: 14, cursor: 'pointer',
      background: 'transparent', color: FA_TOKENS.fg,
      fontFamily: FA_TOKENS.fontSans, fontWeight: 600, fontSize: 16,
      ...style,
    }}>{title}</button>
  );
}

function SkipLink({ title, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 0, padding: '4px 0', cursor: 'pointer',
      fontFamily: FA_TOKENS.fontSans, fontSize: 13, fontWeight: 500,
      color: FA_TOKENS.muted, textDecoration: 'underline',
    }}>{title}</button>
  );
}

// Connection / chip pill
function Pill({ children, selected = false, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 9999, cursor: onClick ? 'pointer' : 'default',
      background: selected ? FA_TOKENS.accent : FA_TOKENS.surface,
      color: selected ? '#fff' : FA_TOKENS.fg,
      border: `1px solid ${selected ? FA_TOKENS.accent : 'rgba(161,161,161,0.35)'}`,
      fontFamily: FA_TOKENS.fontSans, fontSize: 13, fontWeight: 500,
      ...style,
    }}>{children}</button>
  );
}

// HR Zone badge — Z1..Z5 colored on tint
function ZoneBadge({ zone }) {
  const map = {
    Z1: FA_TOKENS.z1, Z2: FA_TOKENS.z2, Z3: FA_TOKENS.z3,
    Z4: FA_TOKENS.z4, Z5: FA_TOKENS.z5,
  };
  const color = map[zone] || FA_TOKENS.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '4px 10px', borderRadius: 9999,
      background: color + '26', color,
      fontFamily: FA_TOKENS.fontSans, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.16em',
    }}>{zone}</span>
  );
}

// Connection badge — label + check/x
function ConnectionBadge({ label, connected }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 9999,
      background: FA_TOKENS.surface,
      fontFamily: FA_TOKENS.fontSans, fontSize: 13,
      color: FA_TOKENS.fg,
    }}>
      {label}
      <span style={{ color: connected ? FA_TOKENS.ok : FA_TOKENS.danger }}>
        {connected ? '✓' : '✗'}
      </span>
    </span>
  );
}

// Card surface
function Card({ children, padding = 16, style = {} }) {
  return (
    <div style={{
      background: FA_TOKENS.surface, borderRadius: 14, padding,
      ...style,
    }}>{children}</div>
  );
}

// Hairline-divided list of metric rows
function MetricList({ items }) {
  return (
    <div style={{ background: FA_TOKENS.surface, borderRadius: 14, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', padding: '14px 16px',
          borderTop: i === 0 ? 'none' : `1px solid ${FA_TOKENS.hairline}`,
        }}>
          <span style={{ flex: 1, fontFamily: FA_TOKENS.fontSans, fontSize: 16, color: FA_TOKENS.fg }}>{it.label}</span>
          <span style={{
            fontFamily: FA_TOKENS.fontSans, fontWeight: 600, fontSize: 16,
            fontVariantNumeric: 'tabular-nums',
            color: it.color || FA_TOKENS.fg,
          }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// Progress dots — orange on, gray off
function ProgressDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: 3,
          background: i <= current ? FA_TOKENS.accent : 'rgba(161,161,161,0.3)',
        }} />
      ))}
    </div>
  );
}

Object.assign(window, {
  FA_TOKENS, Wordmark, SectionLabel, Headline,
  PrimaryButton, SecondaryButton, SkipLink,
  Pill, ZoneBadge, ConnectionBadge, Card, MetricList, ProgressDots,
});
