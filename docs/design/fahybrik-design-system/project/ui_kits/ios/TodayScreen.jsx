// Today screen — mirrors ios/FAHYBRIK/Today/TodayView.swift
function TodayScreen({ onStartWorkout }) {
  const [tab, setTab] = React.useState('today');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: FA_TOKENS.bg, color: FA_TOKENS.fg, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px' }}>
        {tab === 'today' && <TodayBody onStartWorkout={onStartWorkout} />}
        {tab === 'plan' && <ComingSoon label="Plan" />}
        {tab === 'stats' && <ComingSoon label="Stats" />}
        {tab === 'chat' && <ComingSoon label="Chat" />}
        {tab === 'profile' && <ComingSoon label="Perfil" />}
      </div>
      <FATabBar tab={tab} setTab={setTab} />
    </div>
  );
}

function TodayBody({ onStartWorkout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={28} />
        <Gear />
      </div>

      {/* Countdown + microcycle context */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SectionLabel>HYROX BCN · 42 días</SectionLabel>
        <div style={{ height: 1, background: 'rgba(161,161,161,0.2)' }} />
        <span style={{
          fontFamily: FA_TOKENS.fontSans, fontSize: 13, fontStyle: 'italic',
          color: FA_TOKENS.muted, marginTop: 4,
        }}>REAL · semana 2 · día 4</span>
      </div>

      {/* Hero card */}
      <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Headline size="m">Sled Push + Wall Ball Circuit</Headline>
        <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted }}>
          For Time · ~52 min
        </span>
        <PrimaryButton title="▶ Empezar" onClick={onStartWorkout} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: FA_TOKENS.ok }} />
          <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted }}>
            Recovery 72% · OK
          </span>
        </div>
      </Card>

      <SectionLabel>Tu cuerpo</SectionLabel>
      <MetricList items={[
        { label: 'HRV', value: '▲ 58 ms' },
        { label: 'Sueño', value: '7h 12m' },
        { label: 'RHR', value: '48 bpm' },
      ]} />

      <SectionLabel>Esta semana</SectionLabel>
      <MetricList items={[
        { label: 'Compliance', value: '5/6' },
        { label: 'Volumen', value: '+12% vs LW' },
        { label: 'RPE medio', value: '7.2' },
      ]} />

      <SectionLabel>Carga</SectionLabel>
      <MetricList items={[
        { label: 'Fitness (CTL)', value: '75 ▲' },
        { label: 'Fatiga (ATL)', value: '63 ▲' },
        { label: 'Frescura (TSB)', value: '+12 fresco', color: FA_TOKENS.ok },
        { label: 'ACR', value: '1.1 normal' },
        { label: 'Z3-4 últ 7d', value: '68%' },
      ]} />

      <SectionLabel>Ayer</SectionLabel>
      <Card>
        <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 16, color: FA_TOKENS.fg, marginBottom: 4 }}>
          100m Run · 50 Wall Balls
        </div>
        <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
          24:32 · RPE 8 · ✓
        </div>
        <div style={{
          fontFamily: FA_TOKENS.fontSans, fontStyle: 'italic', fontSize: 14,
          color: FA_TOKENS.muted, paddingLeft: 12,
          borderLeft: `2px solid ${FA_TOKENS.accent}`,
        }}>"Bien metido. Mantén."</div>
      </Card>

      <div style={{ height: 8 }} />
    </div>
  );
}

function Gear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={FA_TOKENS.muted} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function FATabBar({ tab, setTab }) {
  const items = [
    { id: 'today', label: 'Today', icon: <TabGlyph kind="grid" /> },
    { id: 'plan', label: 'Plan', icon: <TabGlyph kind="cal" /> },
    { id: 'stats', label: 'Stats', icon: <TabGlyph kind="bars" /> },
    { id: 'chat', label: 'Chat', icon: <TabGlyph kind="msg" /> },
    { id: 'profile', label: 'Perfil', icon: <TabGlyph kind="person" /> },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      padding: '8px 8px 28px', background: FA_TOKENS.bg,
      borderTop: `1px solid ${FA_TOKENS.hairline}`,
    }}>
      {items.map(it => (
        <button key={it.id} onClick={() => setTab(it.id)} style={{
          flex: 1, background: 'transparent', border: 0, cursor: 'pointer',
          padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: tab === it.id ? FA_TOKENS.accent : FA_TOKENS.muted,
        }}>
          {it.icon}
          <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 10, fontWeight: 500 }}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function TabGlyph({ kind }) {
  const c = 'currentColor', s = 22;
  if (kind === 'grid') return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
  if (kind === 'cal')  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
  if (kind === 'bars') return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M4 20V10M10 20V4M16 20V14M22 20V8"/></svg>);
  if (kind === 'msg')  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>);
  if (kind === 'person') return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
}

function ComingSoon({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 0', gap: 6 }}>
      <Headline size="l">{label}</Headline>
      <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted }}>Próximamente</span>
    </div>
  );
}

Object.assign(window, { TodayScreen, FATabBar });
