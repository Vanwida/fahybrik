// Onboarding step screens — mirrors ios/FAHYBRIK/Onboarding/*
// Each is a step inside OnboardingShell.

function OnboardingShell({ step, total, title, subtitle, children, onBack, onNext, onSkip, nextLabel = 'Siguiente', nextEnabled = true }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: FA_TOKENS.bg, color: FA_TOKENS.fg, padding: '8px 24px 24px' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24 }}>
        {onBack ? (
          <button onClick={onBack} style={{ background: 'transparent', border: 0, color: FA_TOKENS.muted, fontFamily: FA_TOKENS.fontSans, fontSize: 14, cursor: 'pointer' }}>← Atrás</button>
        ) : <span style={{ width: 50 }} />}
        <ProgressDots total={total} current={step} />
        {onSkip ? <SkipLink title="Omitir" onClick={onSkip} /> : <span style={{ width: 50 }} />}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <Headline size="l">{title}</Headline>
        {subtitle && (
          <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 15, color: FA_TOKENS.muted, lineHeight: 1.4 }}>{subtitle}</span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>

      <div style={{ paddingTop: 16 }}>
        <PrimaryButton title={nextLabel} onClick={onNext} enabled={nextEnabled} />
      </div>
    </div>
  );
}

// Step: Goal selection (Hyrox/Performance/Health)
function GoalStep({ ...props }) {
  const [selected, setSelected] = React.useState('hyrox');
  const goals = [
    { id: 'hyrox', label: 'Hyrox', sub: 'Competir o terminar carrera' },
    { id: 'performance', label: 'Rendimiento', sub: 'Más fuerte, más rápido' },
    { id: 'health', label: 'Salud', sub: 'Sentirme bien y consistente' },
  ];
  return (
    <OnboardingShell title="¿Cuál es tu objetivo?" subtitle="Calibra el plan a lo que quieres conseguir." {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {goals.map(g => (
          <button key={g.id} onClick={() => setSelected(g.id)} style={{
            textAlign: 'left', padding: 16, borderRadius: 14, cursor: 'pointer',
            background: FA_TOKENS.surface,
            border: `1px solid ${selected === g.id ? FA_TOKENS.accent : 'transparent'}`,
            color: FA_TOKENS.fg,
          }}>
            <div style={{ fontFamily: FA_TOKENS.fontDisplay, fontStyle: 'italic', fontWeight: 800, fontSize: 20 }}>{g.label}</div>
            <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted, marginTop: 2 }}>{g.sub}</div>
          </button>
        ))}
      </div>
    </OnboardingShell>
  );
}

// Step: Health connections
function HealthConnectStep({ ...props }) {
  const [hk, setHk] = React.useState(true);
  const [strava, setStrava] = React.useState(false);
  return (
    <OnboardingShell title="Conecta tu cuerpo" subtitle="Sin datos no hay autoregulación. Solo lo que entrenas y descansas." {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { id: 'hk', label: 'Apple Health', sub: 'HRV, sueño, RHR, FC', state: hk, set: setHk, required: true },
          { id: 'strava', label: 'Strava', sub: 'Carreras y ciclismo', state: strava, set: setStrava },
          { id: 'garmin', label: 'Garmin', sub: 'Próximamente', state: false, disabled: true },
        ].map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14,
            background: FA_TOKENS.surface, opacity: s.disabled ? 0.5 : 1,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 16, fontWeight: 600 }}>
                {s.label}
                {s.required && <span style={{ color: FA_TOKENS.accent, marginLeft: 6 }}>*</span>}
              </div>
              <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted, marginTop: 2 }}>{s.sub}</div>
            </div>
            <button disabled={s.disabled} onClick={() => s.set && s.set(!s.state)} style={{
              padding: '8px 14px', borderRadius: 9999, border: 0, cursor: s.disabled ? 'default' : 'pointer',
              background: s.state ? FA_TOKENS.ok : 'rgba(161,161,161,0.2)',
              color: s.state ? '#fff' : FA_TOKENS.fg,
              fontFamily: FA_TOKENS.fontSans, fontSize: 13, fontWeight: 600,
            }}>{s.state ? '✓ Conectado' : 'Conectar'}</button>
          </div>
        ))}
      </div>
    </OnboardingShell>
  );
}

// Step: Volume baseline (slider)
function VolumeStep({ ...props }) {
  const [volume, setVolume] = React.useState(4);
  return (
    <OnboardingShell title="¿Cuánto entrenas?" subtitle="Sesiones por semana. Lo usaremos como base; ajustaremos por carga real." {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '24px 0' }}>
        <div style={{
          fontFamily: FA_TOKENS.fontDisplay, fontStyle: 'italic', fontWeight: 900,
          fontSize: 96, lineHeight: 1, color: FA_TOKENS.fg, fontVariantNumeric: 'tabular-nums',
        }}>{volume}</div>
        <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 13, color: FA_TOKENS.muted, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          Sesiones / semana
        </span>
        <input type="range" min="1" max="7" value={volume} onChange={e => setVolume(+e.target.value)} style={{ width: '100%', accentColor: FA_TOKENS.accent }} />
      </div>
    </OnboardingShell>
  );
}

// Step: Welcome
function WelcomeStep({ onNext }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: FA_TOKENS.bg, color: FA_TOKENS.fg, padding: '0 24px 32px' }}>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 12 }}>
        <Wordmark size={44} />
        <Headline size="l" style={{ marginTop: 24 }}>Entrenar al detalle.</Headline>
        <span style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 15, color: FA_TOKENS.muted, lineHeight: 1.5 }}>
          Coaching híbrido para Hyrox y rendimiento. Datos crudos, planes que se autorregulan, voz a la altura.
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <PrimaryButton title="Empezar" onClick={onNext} />
    </div>
  );
}

Object.assign(window, { OnboardingShell, GoalStep, HealthConnectStep, VolumeStep, WelcomeStep });
