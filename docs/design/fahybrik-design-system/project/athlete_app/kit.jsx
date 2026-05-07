// Shared atomic components for the athlete prototype.
// Anything used across screens lives here. Screen-specific bits stay in their files.

const T = {
  bg: '#0A0A0A', surface: '#141414', surfaceUp: '#1F1F1F',
  fg: '#F5F5F5', muted: '#A1A1A1',
  hairline: 'rgba(161,161,161,0.18)', outline: 'rgba(255,255,255,0.10)',
  accent: '#F06A2A', accentPress: '#D85A20',
  ok: '#3FC773', warning: '#F2A52E', danger: '#F23F3F',
  z1: '#C7C7C7', z2: '#4D9EEB', z3: '#4DC773', z4: '#F2B833', z5: '#EB4D4D',
  fontDisp: '"Archivo", "SF Pro Display", system-ui, sans-serif',
  fontSans: '"Geist", "SF Pro Text", system-ui, sans-serif',
  fontMono: '"Geist Mono", "SF Mono", ui-monospace, monospace',
};

// ─── Brand ───
function Wordmark({ size = 22 }) {
  return (
    <span style={{
      fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
      fontSize: size, lineHeight: 1, letterSpacing: '-0.02em',
      color: T.fg, whiteSpace: 'nowrap',
    }}>
      <span style={{ color: T.accent }}>[F]</span>AHYBRIK
    </span>
  );
}

// ─── Type ───
function Label({ children, color = T.muted, style = {} }) {
  return (
    <div style={{
      fontFamily: T.fontSans, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color, ...style,
    }}>{children}</div>
  );
}
function H1({ children, style = {} }) {
  return (<div style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.01em', color: T.fg, ...style }}>{children}</div>);
}
function H2({ children, style = {} }) {
  return (<div style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.01em', color: T.fg, ...style }}>{children}</div>);
}
function H3({ children, style = {} }) {
  return (<div style={{ fontFamily: T.fontDisp, fontWeight: 700, fontStyle: 'italic', fontSize: 20, lineHeight: 1.2, color: T.fg, ...style }}>{children}</div>);
}
function Mono({ children, style = {} }) {
  return (<span style={{ fontFamily: T.fontMono, fontVariantNumeric: 'tabular-nums', ...style }}>{children}</span>);
}
function Body({ children, color = T.fg, style = {} }) {
  return (<span style={{ fontFamily: T.fontSans, fontSize: 16, color, ...style }}>{children}</span>);
}
function Small({ children, color = T.muted, style = {} }) {
  return (<span style={{ fontFamily: T.fontSans, fontSize: 13, color, ...style }}>{children}</span>);
}

// ─── Hero data ───
function HeroNumber({ children, size = 96, color = T.fg, style = {} }) {
  return (
    <span style={{
      fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
      fontSize: size, lineHeight: 0.95, color,
      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      ...style,
    }}>{children}</span>
  );
}

// ─── Buttons ───
function PrimaryBtn({ children, onClick, style = {}, disabled = false }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      height: 54, width: '100%', border: 0, borderRadius: 14, cursor: disabled ? 'default' : 'pointer',
      background: disabled ? T.accent + '4D' : T.accent, color: '#fff',
      fontFamily: T.fontDisp, fontWeight: 800, fontStyle: 'italic',
      fontSize: 16, letterSpacing: '0.06em',
      ...style,
    }}>{children}</button>
  );
}
function SecondaryBtn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      height: 54, width: '100%', border: `1px solid ${T.outline}`, borderRadius: 14, cursor: 'pointer',
      background: 'transparent', color: T.fg,
      fontFamily: T.fontSans, fontWeight: 600, fontSize: 16,
      ...style,
    }}>{children}</button>
  );
}
function GhostLink({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 0, padding: '4px 0', cursor: 'pointer',
      fontFamily: T.fontSans, fontSize: 13, fontWeight: 500,
      color: T.muted, textDecoration: 'underline', ...style,
    }}>{children}</button>
  );
}

// ─── Card ───
function Card({ children, padding = 16, style = {} }) {
  return (
    <div style={{ background: T.surface, borderRadius: 14, padding, ...style }}>{children}</div>
  );
}

// ─── HR Zone badge ───
function ZBadge({ zone, big = false }) {
  const c = T['z' + zone[1]] || T.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: big ? '6px 14px' : '4px 10px', borderRadius: 9999,
      background: c + '26', color: c,
      fontFamily: T.fontSans, fontSize: big ? 13 : 11, fontWeight: 700,
      letterSpacing: '0.16em',
    }}>{zone}</span>
  );
}

// ─── Pill / chip ───
function Chip({ children, selected = false, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 9999, cursor: onClick ? 'pointer' : 'default',
      background: selected ? T.accent : T.surface, color: selected ? '#fff' : T.fg,
      border: `1px solid ${selected ? T.accent : 'rgba(161,161,161,0.35)'}`,
      fontFamily: T.fontSans, fontSize: 13, fontWeight: 500, ...style,
    }}>{children}</button>
  );
}

// ─── Hairline-divided rows ───
function MetricRows({ items, dense = false }) {
  return (
    <div style={{ background: T.surface, borderRadius: 14, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', padding: dense ? '10px 14px' : '14px 16px',
          borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`,
        }}>
          <span style={{ flex: 1, fontFamily: T.fontSans, fontSize: dense ? 14 : 16, color: T.fg }}>{it.label}</span>
          <span style={{
            fontFamily: T.fontSans, fontWeight: 600, fontSize: dense ? 14 : 16,
            fontVariantNumeric: 'tabular-nums', color: it.color || T.fg,
          }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Recovery ring (SVG) ───
function RecoveryRing({ value, size = 96, stroke = 8, color = T.fg }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
        fontSize: size * 0.36, color,
      }}>{value}</div>
    </div>
  );
}

// ─── Tab bar (5 tabs) ───
function TabBar({ tab, setTab, hidden = false }) {
  if (hidden) return null;
  const items = [
    { id: 'today',  label: 'Today',  glyph: 'grid' },
    { id: 'plan',   label: 'Plan',   glyph: 'cal' },
    { id: 'stats',  label: 'Stats',  glyph: 'bars' },
    { id: 'chat',   label: 'Chat',   glyph: 'msg' },
    { id: 'profile',label: 'Perfil', glyph: 'person' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      padding: '6px 4px 24px', background: T.bg,
      borderTop: `1px solid ${T.hairline}`,
    }}>
      {items.map(it => (
        <button key={it.id} onClick={() => setTab(it.id)} style={{
          flex: 1, background: 'transparent', border: 0, cursor: 'pointer',
          padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: tab === it.id ? T.accent : T.muted,
        }}>
          <TabGlyph kind={it.glyph} />
          <span style={{ fontFamily: T.fontSans, fontSize: 10, fontWeight: 500 }}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
function TabGlyph({ kind, s = 22 }) {
  const c = 'currentColor', sw = 1.6;
  if (kind === 'grid')   return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
  if (kind === 'cal')    return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
  if (kind === 'bars')   return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}><path d="M4 20V10M10 20V4M16 20V14M22 20V8"/></svg>);
  if (kind === 'msg')    return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>);
  if (kind === 'person') return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
  return null;
}

// ─── Coach quote ───
function CoachQuote({ children }) {
  return (
    <div style={{
      fontFamily: T.fontSans, fontStyle: 'italic', fontSize: 14, lineHeight: 1.45,
      color: T.muted, paddingLeft: 12, borderLeft: `2px solid ${T.accent}`,
    }}>{children}</div>
  );
}

// ─── Format helpers ───
function fmtClock(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function fmtClockHrs(seconds) {
  if (seconds < 3600) return fmtClock(seconds);
  const h = Math.floor(seconds / 3600), rest = seconds % 3600;
  return `${h}:${fmtClock(rest)}`;
}

Object.assign(window, {
  T, Wordmark, Label, H1, H2, H3, Mono, Body, Small,
  HeroNumber, PrimaryBtn, SecondaryBtn, GhostLink,
  Card, ZBadge, Chip, MetricRows, RecoveryRing, TabBar, CoachQuote,
  fmtClock, fmtClockHrs,
});
