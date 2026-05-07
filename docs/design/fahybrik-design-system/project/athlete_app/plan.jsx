// Plan tab — 3 variants. Mirrors UX spec 04 + PlanView.swift.
// V1 SAFE — vertical week stack, REAL macro-block visible
// V2 BOLD — single big "tomorrow" focus + week strip
// V3 EXPERT — full month grid, dense

function PlanScreen({ variant = 'safe', onOpen }) {
  if (variant === 'bold')   return <PlanBold onOpen={onOpen} />;
  if (variant === 'expert') return <PlanExpert onOpen={onOpen} />;
  return <PlanSafe onOpen={onOpen} />;
}

const DAYS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TODAY_DAY = 3; // Thursday-ish — index 3

function PlanSafe({ onOpen }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>Plan</H2>
        <Chip>Mes</Chip>
      </div>

      {/* macro context */}
      <Card padding={14}>
        <Label>BLOQUE</Label>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <H3>REAL · sem 2 / 3</H3>
          <Small style={{ marginLeft: 'auto' }}><Mono>{PERSONA.daysToRace}d → {PERSONA.raceName}</Mono></Small>
        </div>
        {/* phases bar */}
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ flex: 4, background: 'rgba(255,255,255,0.10)' }}/>
          <div style={{ flex: 4, background: 'rgba(255,255,255,0.18)' }}/>
          <div style={{ flex: 3, background: T.accent }}/>
          <div style={{ flex: 1, background: T.accent + '4D' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <Small style={{ fontSize: 10 }}><Mono>ACC</Mono></Small>
          <Small style={{ fontSize: 10 }}><Mono>TRANS</Mono></Small>
          <Small style={{ fontSize: 10 }} color={T.accent}><Mono>REAL ◆</Mono></Small>
          <Small style={{ fontSize: 10 }}><Mono>PEAK</Mono></Small>
        </div>
      </Card>

      {WEEK_PLAN.map((wk, wi) => (
        <div key={wk.wk}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Label color={wk.current ? T.accent : T.muted}>{wk.wk} · {wk.label}</Label>
          </div>
          <div style={{ background: T.surface, borderRadius: 14, overflow: 'hidden', border: wk.current ? `1px solid ${T.accent}` : 'none' }}>
            {wk.days.map((d, di) => {
              const isToday = wk.current && di === TODAY_DAY;
              return (
                <button key={di} onClick={() => onOpen && onOpen(wi, di)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '12px 14px', background: isToday ? T.accent + '14' : 'transparent',
                  border: 0, borderTop: di === 0 ? 'none' : `1px solid ${T.hairline}`,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isToday ? T.accent : 'rgba(255,255,255,0.06)', color: isToday ? '#fff' : T.muted,
                    fontFamily: T.fontSans, fontSize: 11, fontWeight: 700,
                  }}>{DAYS_ES[di]}</span>
                  <Body style={{ flex: 1, fontSize: 14, color: d === 'Rest' ? T.muted : T.fg }}>{d}</Body>
                  {d.includes('★') && <ZBadge zone="Z4" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanBold({ onOpen }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* tomorrow hero */}
      <div>
        <Label color={T.accent}>HOY · JUE</Label>
        <H1 style={{ marginTop: 6, fontSize: 30 }}>Sled Push + Wall Ball</H1>
        <Small style={{ marginTop: 6, display: 'block' }}><Mono>~52 min · For Time · Z3-Z5</Mono></Small>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <ZBadge zone="Z3" />
          <ZBadge zone="Z4" />
          <ZBadge zone="Z5" />
        </div>
      </div>

      {/* week strip */}
      <div>
        <Label style={{ marginBottom: 10 }}>SEMANA · REAL w2</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {WEEK_PLAN[3].days.map((d, di) => {
            const isToday = di === TODAY_DAY;
            const isPast = di < TODAY_DAY;
            return (
              <button key={di} onClick={() => onOpen && onOpen(3, di)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 4px', background: isToday ? T.accent : T.surface,
                border: 0, borderRadius: 10, cursor: 'pointer',
                opacity: isPast ? 0.5 : 1,
              }}>
                <span style={{ fontFamily: T.fontSans, fontSize: 10, color: isToday ? '#fff' : T.muted, fontWeight: 600 }}>{DAYS_ES[di]}</span>
                <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 18, color: isToday ? '#fff' : T.fg }}>
                  <Mono>{16 + di}</Mono>
                </span>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: d === 'Rest' ? 'transparent' : (isPast ? T.ok : isToday ? '#fff' : T.muted) }}/>
              </button>
            );
          })}
        </div>
      </div>

      {/* week sessions list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {WEEK_PLAN[3].days.map((d, di) => {
          const isToday = di === TODAY_DAY;
          const isPast = di < TODAY_DAY;
          return (
            <div key={di} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: isToday ? T.accent + '14' : T.surface, borderRadius: 10,
              border: isToday ? `1px solid ${T.accent}` : 'none',
            }}>
              <span style={{ fontFamily: T.fontSans, fontSize: 11, fontWeight: 700, color: isToday ? T.accent : T.muted, width: 18 }}>{DAYS_ES[di]}</span>
              <Body style={{ flex: 1, fontSize: 13, color: d === 'Rest' ? T.muted : T.fg }}>{d}</Body>
              {isPast && <span style={{ color: T.ok, fontSize: 12 }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* race countdown */}
      <Card padding={16} style={{ borderTop: `2px solid ${T.accent}` }}>
        <Label>A-EVENT</Label>
        <H3 style={{ marginTop: 4 }}>{PERSONA.raceName}</H3>
        <div style={{ marginTop: 10 }}>
          <HeroNumber size={64} color={T.accent}><Mono>{PERSONA.daysToRace}</Mono></HeroNumber>
          <Small style={{ marginLeft: 8 }}>días</Small>
        </div>
      </Card>
    </div>
  );
}

function PlanExpert({ onOpen }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
        <H3 style={{ fontSize: 16 }}>Plan · 4 sem</H3>
        <Small style={{ fontSize: 11 }}><Mono>{PERSONA.daysToRace}d</Mono></Small>
      </div>

      {/* macro phase strip */}
      <Card padding={10}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ flex: 4, background: 'rgba(255,255,255,0.10)' }}/>
          <div style={{ flex: 4, background: 'rgba(255,255,255,0.18)' }}/>
          <div style={{ flex: 3, background: T.accent }}/>
          <div style={{ flex: 1, background: T.accent + '4D' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <Small style={{ fontSize: 9 }}><Mono>ACC 4w</Mono></Small>
          <Small style={{ fontSize: 9 }}><Mono>TRANS 4w</Mono></Small>
          <Small style={{ fontSize: 9 }} color={T.accent}><Mono>REAL 3w◆</Mono></Small>
          <Small style={{ fontSize: 9 }}><Mono>PEAK 1w</Mono></Small>
        </div>
      </Card>

      {/* 4-week dense grid */}
      <Card padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7, 1fr)', borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ padding: '6px 8px' }}><Label style={{ fontSize: 9 }}>WK</Label></div>
          {DAYS_ES.map(d => (
            <div key={d} style={{ padding: '6px 4px', textAlign: 'center', borderLeft: `1px solid ${T.hairline}` }}>
              <Label style={{ fontSize: 9 }}>{d}</Label>
            </div>
          ))}
        </div>
        {WEEK_PLAN.map((wk, wi) => (
          <div key={wk.wk} style={{ display: 'grid', gridTemplateColumns: '46px repeat(7, 1fr)', borderTop: wi === 0 ? 'none' : `1px solid ${T.hairline}`, background: wk.current ? T.accent + '0D' : 'transparent' }}>
            <div style={{ padding: '8px 8px' }}>
              <Small style={{ fontSize: 11, fontWeight: 600 }} color={wk.current ? T.accent : T.muted}><Mono>{wk.wk}</Mono></Small>
              <Small style={{ fontSize: 9, display: 'block' }} color={wk.current ? T.accent : T.muted}>{wk.label.split(' ')[0]}</Small>
            </div>
            {wk.days.map((d, di) => {
              const isToday = wk.current && di === TODAY_DAY;
              const isPast = wk.current ? di < TODAY_DAY : wi < 3;
              return (
                <button key={di} onClick={() => onOpen && onOpen(wi, di)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  padding: '8px 2px', borderLeft: `1px solid ${T.hairline}`, border: 0,
                  background: isToday ? T.accent : 'transparent', cursor: 'pointer',
                  minHeight: 56,
                }}>
                  {d === 'Rest' ? (
                    <span style={{ color: isToday ? '#fff' : T.muted, fontSize: 9 }}>—</span>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {d.toLowerCase().includes('strength') && <Dot c={T.z2} />}
                        {(d.toLowerCase().includes('thresh') || d.toLowerCase().includes('hyrox') || d.toLowerCase().includes('sled') || d.toLowerCase().includes('vo2') || d.toLowerCase().includes('race') || d.toLowerCase().includes('test') || d.toLowerCase().includes('sharp') || d.toLowerCase().includes('tempo')) && <Dot c={T.z4} />}
                        {(d.toLowerCase().includes('long') || d.toLowerCase().includes('z2') || d.toLowerCase().includes('z3')) && <Dot c={T.z3} />}
                      </div>
                      <Small style={{ fontSize: 8, lineHeight: 1.1, textAlign: 'center', color: isToday ? '#fff' : (isPast ? T.muted : T.fg) }}>
                        {d.replace('AM ', '').replace('PM ', '').slice(0, 10)}
                      </Small>
                      {isPast && <span style={{ color: isToday ? '#fff' : T.ok, fontSize: 8 }}>✓</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </Card>

      {/* legend */}
      <div style={{ display: 'flex', gap: 12, padding: '4px 6px', flexWrap: 'wrap' }}>
        <Legend c={T.z2} label="Strength" />
        <Legend c={T.z3} label="Aerobic" />
        <Legend c={T.z4} label="Threshold/Hyrox" />
      </div>
    </div>
  );
}

function Dot({ c }) {
  return <span style={{ width: 6, height: 6, borderRadius: 9999, background: c, display: 'inline-block' }} />;
}
function Legend({ c, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Dot c={c} />
      <Small style={{ fontSize: 10 }}>{label}</Small>
    </div>
  );
}

window.PlanScreen = PlanScreen;
