// Today screen — 3 variants.
// V1 SAFE: classic stack of cards. Matches UX spec 02 + TodayView.swift.
// V2 BOLD: hero number takes over; data is pulled to the side.
// V3 EXPERIMENTAL: dashboard-density · single-screen Garmin-style.

function TodayScreen({ variant = 'safe', onStartWorkout, onOpenSession, onOpenCheckin }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {variant === 'safe'   && <TodaySafe onStartWorkout={onStartWorkout} onOpenSession={onOpenSession} onOpenCheckin={onOpenCheckin} />}
        {variant === 'bold'   && <TodayBold onStartWorkout={onStartWorkout} onOpenCheckin={onOpenCheckin} />}
        {variant === 'expert' && <TodayExpert onStartWorkout={onStartWorkout} onOpenCheckin={onOpenCheckin} />}
      </div>
    </div>
  );
}

// ──────────────────── V1 SAFE ────────────────────
function TodaySafe({ onStartWorkout, onOpenSession, onOpenCheckin }) {
  const p = PERSONA;
  return (
    <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={22} />
        <Gear />
      </div>

      {/* check-in nag */}
      <button onClick={onOpenCheckin} style={{
        background: T.surfaceUp, border: 0, borderRadius: 12,
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <div>
          <Label color={T.accent} style={{ marginBottom: 6 }}>BUENOS DÍAS · CHECK-IN</Label>
          <Body color={T.fg} style={{ fontSize: 14 }}>20 segundos · 5 preguntas</Body>
        </div>
        <span style={{ color: T.fg, fontSize: 18 }}>›</span>
      </button>

      {/* countdown */}
      <div>
        <Label>{p.raceName} · {p.daysToRace} días</Label>
        <div style={{ height: 1, background: T.hairline, marginTop: 8, marginBottom: 8 }} />
        <Small><span style={{ fontStyle: 'italic' }}>{p.block} · semana {p.week} · día {p.day}</span></Small>
      </div>

      {/* AM session done */}
      <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.65 }}>
        <span style={{ color: T.ok, fontSize: 18 }}>✓</span>
        <div style={{ flex: 1 }}>
          <Body style={{ fontSize: 14 }}>AM · Strength upper</Body>
          <Small><Mono>52:18 · RPE 7</Mono></Small>
        </div>
      </Card>

      {/* PM hero */}
      <Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)' }}>
        <Label color={T.accent}>PM · PRÓXIMA</Label>
        <H2>{PLAN.name}</H2>
        <Small><Mono>{PLAN.format} · ~{Math.round(PLAN.durationEst/60)} min</Mono></Small>
        <PrimaryBtn onClick={onStartWorkout}>▶ EMPEZAR</PrimaryBtn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.ok }} />
          <Small>Recovery {p.recoveryPct}% · OK</Small>
        </div>
      </Card>

      <Section title="TU CUERPO">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 4px 12px' }}>
          <RecoveryRing value={p.recoveryPct} size={84} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row k="HRV" v={`${p.hrv.delta} ${p.hrv.value} ${p.hrv.unit}`} />
            <Row k="Sueño" v={p.sleep} />
            <Row k="RHR" v={`${p.rhr} bpm`} />
          </div>
        </div>
      </Section>

      <Section title="ESTA SEMANA">
        <MetricRows items={[
          { label: 'Compliance', value: p.weekly.compliance },
          { label: 'Volumen', value: `${p.weekly.volumeDelta} vs LW` },
          { label: 'RPE medio', value: p.weekly.rpe },
        ]} />
      </Section>

      <Section title="CARGA">
        <MetricRows items={[
          { label: 'Fitness (CTL)', value: `${p.carga.ctl} ${p.carga.ctlTrend}` },
          { label: 'Fatiga (ATL)', value: `${p.carga.atl} ${p.carga.atlTrend}` },
          { label: 'Frescura (TSB)', value: `+${p.carga.tsb} ${p.carga.tsbLabel}`, color: T.ok },
          { label: 'ACR', value: `${p.carga.acr} ${p.carga.acrLabel}` },
          { label: 'Z3-4 últ 7d', value: `${p.carga.z34}%` },
          { label: 'Race Readiness', value: `${p.carga.readiness}/100`, color: T.ok },
        ]} />
      </Section>

      <Section title="AYER">
        <Card>
          <Body style={{ fontSize: 15 }}>{p.yesterday.title}</Body>
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <Small><Mono>{p.yesterday.duration} · RPE {p.yesterday.rpe} · ✓</Mono></Small>
          </div>
          <CoachQuote>"{p.yesterday.coachNote}"</CoachQuote>
        </Card>
      </Section>
    </div>
  );
}

// ──────────────────── V2 BOLD ────────────────────
function TodayBold({ onStartWorkout, onOpenCheckin }) {
  const p = PERSONA;
  return (
    <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={22} />
        <Gear />
      </div>

      {/* enormous countdown */}
      <div style={{ paddingTop: 8 }}>
        <Label color={T.accent}>{p.raceName}</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
          <HeroNumber size={132}>{p.daysToRace}</HeroNumber>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Label color={T.fg}>DÍAS</Label>
            <Small style={{ marginTop: 4 }}><Mono>{p.block} · w{p.week} d{p.day}</Mono></Small>
          </div>
        </div>
        <div style={{ height: 1, background: T.hairline, marginTop: 14 }} />
      </div>

      {/* check-in */}
      <button onClick={onOpenCheckin} style={{
        background: 'transparent', border: `1px solid ${T.outline}`, borderRadius: 12,
        padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <Body style={{ fontSize: 14 }}>Check-in matinal · 20s</Body>
        <span style={{ color: T.accent }}>→</span>
      </button>

      {/* hero workout — full bleed */}
      <div style={{
        background: T.surface, borderRadius: 14, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        <Label color={T.accent}>HOY · PM</Label>
        <H1 style={{ fontSize: 32 }}>{PLAN.name}</H1>
        <div style={{ display: 'flex', gap: 16 }}>
          <Stat label="DURACIÓN" value="52" unit="min" />
          <Stat label="FORMATO" value="For Time" small />
          <Stat label="RPE TGT" value="8" />
        </div>
        <PrimaryBtn onClick={onStartWorkout} style={{ marginTop: 4 }}>▶ EMPEZAR</PrimaryBtn>
      </div>

      {/* readiness — ring + breakdown */}
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <RecoveryRing value={p.recoveryPct} size={108} stroke={10} color={T.ok} />
          <div style={{ flex: 1 }}>
            <Label style={{ marginBottom: 8 }}>READY</Label>
            <Body style={{ fontSize: 14, lineHeight: 1.45 }}>
              Buen estado. HRV <Mono style={{ color: T.ok }}>▲58</Mono>, sueño <Mono>7h12</Mono>.
              Métele al sled.
            </Body>
          </div>
        </div>
      </Card>

      <Section title="CARGA">
        <Card padding={14}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <BigStat label="CTL" value={p.carga.ctl} trend="▲" />
            <BigStat label="TSB" value={`+${p.carga.tsb}`} sub="fresco" color={T.ok} />
            <BigStat label="ACR" value={p.carga.acr} sub="normal" />
          </div>
        </Card>
      </Section>

      <Section title="AYER">
        <Card>
          <Body style={{ fontSize: 15 }}>{p.yesterday.title}</Body>
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <Small><Mono>{p.yesterday.duration} · RPE {p.yesterday.rpe} · ✓</Mono></Small>
          </div>
          <CoachQuote>"{p.yesterday.coachNote}"</CoachQuote>
        </Card>
      </Section>
    </div>
  );
}

// ──────────────────── V3 EXPERT (Garmin-density) ────────────────────
function TodayExpert({ onStartWorkout, onOpenCheckin }) {
  const p = PERSONA;
  return (
    <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* compact header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
      }}>
        <Wordmark size={18} />
        <span style={{ flex: 1 }} />
        <Label style={{ fontSize: 10 }}><Mono>{p.raceName} · {p.daysToRace}D · {p.block} W{p.week}D{p.day}</Mono></Label>
        <Gear small />
      </div>

      {/* dashboard grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <DashTile label="READINESS" mono={`${p.carga.readiness}`} unit="/100" color={T.ok} />
        <DashTile label="HRV" mono={`▲${p.hrv.value}`} unit="ms" />
        <DashTile label="SLEEP" mono="7:12" unit="hrs" />
        <DashTile label="RHR" mono={`${p.rhr}`} unit="bpm" />
        <DashTile label="CTL" mono={`${p.carga.ctl}`} unit="▲" />
        <DashTile label="TSB" mono={`+${p.carga.tsb}`} unit="fresco" color={T.ok} />
      </div>

      {/* workout card — wider, less padding */}
      <Card padding={14} style={{ borderTop: `2px solid ${T.accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Label color={T.accent}>PM · NEXT</Label>
          <Small><Mono>~52 min · For Time</Mono></Small>
        </div>
        <H3 style={{ fontSize: 18 }}>{PLAN.name}</H3>
        <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {PLAN.zoneTargets.map(zt => (
            <span key={zt.z} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <ZBadge zone={zt.z} />
              <Small style={{ fontSize: 11 }}><Mono>{zt.pct}%</Mono></Small>
            </span>
          ))}
        </div>
        <PrimaryBtn onClick={onStartWorkout} style={{ height: 46 }}>▶ EMPEZAR</PrimaryBtn>
      </Card>

      {/* check-in row */}
      <button onClick={onOpenCheckin} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.surface, border: 0, borderRadius: 10, padding: '8px 12px',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.warning }} />
          <Small color={T.fg} style={{ fontSize: 12 }}>Check-in matinal pendiente</Small>
        </div>
        <Small color={T.accent}>20s →</Small>
      </button>

      {/* polarization */}
      <Card padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Label>POLARIZATION 14D</Label>
          <Small style={{ fontSize: 11 }}><Mono color={T.warning}>off-target</Mono></Small>
        </div>
        <PolBar z12={p.carga.polarization.z12} z3={p.carga.polarization.z3} z45={p.carga.polarization.z45} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <Small style={{ fontSize: 11 }}><Mono color={T.z2}>Z1-2 {p.carga.polarization.z12}%</Mono></Small>
          <Small style={{ fontSize: 11 }}><Mono color={T.z3}>Z3 {p.carga.polarization.z3}%</Mono></Small>
          <Small style={{ fontSize: 11 }}><Mono color={T.z5}>Z4-5 {p.carga.polarization.z45}%</Mono></Small>
        </div>
        <Small style={{ fontSize: 11, marginTop: 4, display: 'block' }}>target 80/0/20 · drift +8% Z1</Small>
      </Card>

      {/* yesterday compact */}
      <Card padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Label>AYER</Label>
          <Small style={{ fontSize: 11 }}><Mono>{p.yesterday.duration} · RPE {p.yesterday.rpe}</Mono></Small>
        </div>
        <Body style={{ fontSize: 13 }}>{p.yesterday.title}</Body>
        <div style={{ marginTop: 8 }}>
          <CoachQuote>"{p.yesterday.coachNote}"</CoachQuote>
        </div>
      </Card>
    </div>
  );
}

// ─── helpers used above ───
function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label>{title}</Label>
      {children}
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Small color={T.muted}>{k}</Small>
      <Small color={T.fg} style={{ fontWeight: 600 }}><Mono>{v}</Mono></Small>
    </div>
  );
}
function Stat({ label, value, unit, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Label>{label}</Label>
      <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: small ? 18 : 28, color: T.fg, lineHeight: 1 }}>
        <Mono>{value}</Mono>{unit && <span style={{ fontSize: 12, fontFamily: T.fontSans, fontWeight: 500, fontStyle: 'normal', color: T.muted, marginLeft: 4 }}>{unit}</span>}
      </span>
    </div>
  );
}
function BigStat({ label, value, sub, trend, color = T.fg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <Label style={{ fontSize: 10 }}>{label}</Label>
      <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 28, color, lineHeight: 1 }}>
        <Mono>{value}</Mono>{trend && <span style={{ marginLeft: 4, fontSize: 14 }}>{trend}</span>}
      </span>
      {sub && <Small style={{ fontSize: 11 }}>{sub}</Small>}
    </div>
  );
}
function DashTile({ label, mono, unit, color = T.fg }) {
  return (
    <div style={{ background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
      <Label style={{ fontSize: 9 }}>{label}</Label>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 24, color, lineHeight: 1 }}>
          <Mono>{mono}</Mono>
        </span>
        <Small style={{ fontSize: 10 }}>{unit}</Small>
      </div>
    </div>
  );
}
function PolBar({ z12, z3, z45 }) {
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${z12}%`, background: T.z2 }} />
      <div style={{ width: `${z3}%`, background: T.z3 }} />
      <div style={{ width: `${z45}%`, background: T.z5 }} />
    </div>
  );
}
function Gear({ small = false }) {
  const s = small ? 18 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

window.TodayScreen = TodayScreen;
