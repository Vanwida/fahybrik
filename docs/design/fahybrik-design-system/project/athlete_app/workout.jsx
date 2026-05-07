// Workout flow — pre-brief, active (live timer + LAP), post-summary.
// Mirrors UX spec 03 + ActiveWorkoutView.swift + PreWorkoutBriefView.swift + PostWorkoutSummaryView.swift.

const { useState, useEffect, useRef } = React;

// ════════════════════════════ PRE-WORKOUT BRIEF ════════════════════════════
function PreWorkoutBrief({ variant = 'safe', onStart, onClose }) {
  if (variant === 'bold')   return <PreBriefBold onStart={onStart} onClose={onClose} />;
  if (variant === 'expert') return <PreBriefExpert onStart={onStart} onClose={onClose} />;
  return <PreBriefSafe onStart={onStart} onClose={onClose} />;
}

function PreBriefSafe({ onStart, onClose }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <TopBar onBack={onClose} title="BRIEF" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Small><Mono>{PLAN.blockContext.toUpperCase()}</Mono></Small>
          <H2 style={{ marginTop: 6 }}>{PLAN.name}</H2>
          <Small><Mono>{PLAN.format} · ~{Math.round(PLAN.durationEst/60)} min</Mono></Small>
        </div>

        <Section title="ZONAS"><div style={{ display:'flex', gap: 8, flexWrap: 'wrap' }}>
          {PLAN.zoneTargets.map(zt => (
            <span key={zt.z} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ZBadge zone={zt.z} big />
              <Small style={{ fontWeight: 600 }}><Mono>{zt.pct}%</Mono></Small>
            </span>
          ))}
        </div></Section>

        <Section title="PLAN">
          <div style={{ background: T.surface, borderRadius: 14, overflow: 'hidden' }}>
            {PLAN.segments.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i===0?'none':`1px solid ${T.hairline}` }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted, minWidth: 18 }}>{i+1}</span>
                <div style={{ flex: 1 }}>
                  <Body style={{ fontSize: 14 }}>{s.title}</Body>
                  {s.paceTgt && <Small style={{ fontSize: 11 }}><Mono>tgt {s.paceTgt}</Mono></Small>}
                  {s.powerTgt && <Small style={{ fontSize: 11 }}><Mono>tgt {s.powerTgt}W</Mono></Small>}
                </div>
                <ZBadge zone={s.zone} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="EQUIPO"><div style={{ display:'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLAN.equipment.map(e => <Chip key={e}>{e}</Chip>)}
        </div></Section>

        <Section title="CONEXIONES"><div style={{ display:'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLAN.connections.map(c => (
            <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: T.surface, fontFamily: T.fontSans, fontSize: 13, color: T.fg }}>
              {c.label} <span style={{ color: c.ok ? T.ok : T.danger }}>{c.ok?'✓':'✗'}</span>
            </span>
          ))}
        </div></Section>

        <Section title="CALENTAMIENTO">
          <div style={{ background: T.surface, borderRadius: 14, overflow: 'hidden' }}>
            {PLAN.warmup.map((w, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i===0?'none':`1px solid ${T.hairline}`, cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: T.accent }}/>
                <Body style={{ fontSize: 14 }}>{w}</Body>
              </label>
            ))}
          </div>
        </Section>

        <Card style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 14 }}>
          <Label color={T.accent} style={{ marginBottom: 6 }}>NOTA · PABLO</Label>
          <CoachQuote>"{PLAN.coachNote}"</CoachQuote>
        </Card>
      </div>
      <div style={{ padding: '8px 24px 16px' }}>
        <PrimaryBtn onClick={onStart}>▶ EMPEZAR</PrimaryBtn>
      </div>
    </div>
  );
}

function PreBriefBold({ onStart, onClose }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <TopBar onBack={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Label color={T.accent}>{PLAN.blockContext.toUpperCase()}</Label>
        <H1>{PLAN.name}</H1>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <Stat2 label="DUR" value="52" unit="min" />
          <Stat2 label="FORMAT" value="FT" />
          <Stat2 label="SEGMENTS" value={PLAN.segments.length} />
        </div>

        {/* zones — inline horizontal bar */}
        <div>
          <Label style={{ marginBottom: 8 }}>DISTRIBUCIÓN</Label>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden' }}>
            {PLAN.zoneTargets.map(zt => (
              <div key={zt.z} style={{ width: `${zt.pct}%`, background: T['z'+zt.z[1]], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontSans, fontSize: 9, fontWeight: 700, color: '#000' }}>{zt.pct}%</div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {PLAN.zoneTargets.map(zt => <Small key={zt.z} style={{ fontSize: 11 }}><Mono color={T['z'+zt.z[1]]}>{zt.z}</Mono></Small>)}
          </div>
        </div>

        {/* segments — numbered grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PLAN.segments.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.surface, borderRadius: 10 }}>
              <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 22, color: T.muted, minWidth: 22 }}>{i+1}</span>
              <div style={{ flex: 1 }}>
                <Body style={{ fontSize: 14 }}>{s.title}</Body>
              </div>
              <ZBadge zone={s.zone} />
            </div>
          ))}
        </div>

        <Card style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 14 }}>
          <CoachQuote>"{PLAN.coachNote}"</CoachQuote>
        </Card>
      </div>
      <div style={{ padding: '8px 24px 16px' }}><PrimaryBtn onClick={onStart}>▶ EMPEZAR</PrimaryBtn></div>
    </div>
  );
}

function PreBriefExpert({ onStart, onClose }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <TopBar onBack={onClose} title="WORKOUT BRIEF" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* compact data grid */}
        <Card padding={12}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KV label="NAME" v={PLAN.name} />
            <KV label="FORMAT" v={PLAN.format} />
            <KV label="DUR" v="~52 min" />
            <KV label="SEGMENTS" v={PLAN.segments.length} />
            <KV label="BLOCK" v={PLAN.blockContext} />
            <KV label="EQUIP" v={PLAN.equipment.length + ' items'} />
          </div>
        </Card>

        {/* segments table */}
        <Card padding={0}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.hairline}` }}>
            <Label>SEGMENTS · TARGETS</Label>
          </div>
          {PLAN.segments.map((s, i) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 50px 60px', gap: 8, alignItems: 'center', padding: '10px 12px', borderTop: i===0?'none':`1px solid ${T.hairline}` }}>
              <Small style={{ fontSize: 11 }}><Mono>{i+1}</Mono></Small>
              <Body style={{ fontSize: 13 }}>{s.title}</Body>
              <Small style={{ fontSize: 11 }}><Mono>{s.paceTgt || (s.powerTgt && `${s.powerTgt}W`) || (s.reps && `${s.reps}r`) || '—'}</Mono></Small>
              <ZBadge zone={s.zone} />
            </div>
          ))}
        </Card>

        {/* connections grid */}
        <Card padding={12}>
          <Label style={{ marginBottom: 8 }}>CONNECTIONS</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {PLAN.connections.map(c => (
              <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '8px 10px', background: T.surfaceUp, borderRadius: 8 }}>
                <Small style={{ fontSize: 11 }}>{c.label}</Small>
                <Small color={c.ok ? T.ok : T.danger} style={{ fontWeight: 600 }}>{c.ok ? '✓ ready' : '✗ off'}</Small>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 14 }}>
          <CoachQuote>"{PLAN.coachNote}"</CoachQuote>
        </Card>
      </div>
      <div style={{ padding: '8px 16px 12px' }}><PrimaryBtn onClick={onStart}>▶ EMPEZAR</PrimaryBtn></div>
    </div>
  );
}

// ════════════════════════════ ACTIVE WORKOUT ════════════════════════════
function ActiveWorkout({ variant = 'safe', onClose, onComplete }) {
  // shared live state
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [totalSec, setTotalSec] = useState(872);   // resumes at 14:32 to feel realistic
  const [lapSec, setLapSec] = useState(42);
  const [segIdx, setSegIdx] = useState(2);          // wall balls, 3rd
  const [reps, setReps] = useState(23);
  const [hr, setHr] = useState(168);
  const [showPause, setShowPause] = useState(false);
  const [lapFlash, setLapFlash] = useState(false);

  useEffect(() => {
    if (!running || paused) return;
    const id = setInterval(() => {
      setTotalSec(s => s + 1);
      setLapSec(s => s + 1);
      setHr(h => Math.max(150, Math.min(184, h + (Math.random() - 0.5) * 3)));
      if (PLAN.segments[segIdx].kind === 'reps') {
        setReps(r => Math.min(PLAN.segments[segIdx].reps, r + (Math.random() < 0.4 ? 1 : 0)));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, paused, segIdx]);

  const seg = PLAN.segments[segIdx];
  const next = PLAN.segments[segIdx + 1];
  const zone = hr > 175 ? 'Z5' : hr > 165 ? 'Z4' : hr > 150 ? 'Z3' : 'Z2';

  const fireLap = () => {
    setLapFlash(true);
    setTimeout(() => setLapFlash(false), 200);
    setLapSec(0);
    if (segIdx + 1 >= PLAN.segments.length) {
      onComplete && onComplete();
      // stay on last segment so render doesn't read past array bounds
      // (when onComplete is a no-op, the screen remains visible)
    } else {
      setSegIdx(i => i + 1);
      setReps(0);
    }
  };

  const sharedProps = { seg, next, segIdx, hr, zone, totalSec, lapSec, reps, paused, lapFlash, setShowPause, fireLap };

  return (
    <>
      {variant === 'bold'   && <ActiveBold {...sharedProps} onClose={onClose} />}
      {variant === 'expert' && <ActiveExpert {...sharedProps} onClose={onClose} />}
      {variant === 'safe'   && <ActiveSafe {...sharedProps} onClose={onClose} />}
      {showPause && <PauseModal onResume={() => setShowPause(false)} onAbandon={onClose} />}
    </>
  );
}

// V1 SAFE — UX spec layout, classic
function ActiveSafe({ seg, next, segIdx, hr, zone, totalSec, lapSec, reps, lapFlash, setShowPause, fireLap, onClose }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg, padding: '8px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
        <button onClick={() => setShowPause(true)} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontFamily: T.fontSans, fontSize: 14 }}>‖ pausa</button>
        <Small><Mono>{segIdx+1}/{PLAN.segments.length}</Mono></Small>
      </div>

      {/* HR card hero */}
      <Card padding={16} style={{ marginBottom: 12 }}>
        <Label>FRECUENCIA</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <HeroNumber size={64} color={T['z'+zone[1]]}>{Math.round(hr)}</HeroNumber>
          <ZBadge zone={zone} big />
          <Small style={{ marginLeft: 'auto' }}><Mono>▲ 8 vs avg</Mono></Small>
        </div>
      </Card>

      {/* current segment */}
      <Body style={{ fontSize: 15, marginBottom: 10 }}>{seg.title}</Body>

      {/* 2x2 data grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <DataCell label="REPS" value={`${reps}/${seg.reps || '—'}`} />
        <DataCell label="TGT HR" value="Z3-Z4" />
        <DataCell label="LAP" value={fmtClock(lapSec)} />
        <DataCell label="TOTAL" value={fmtClock(totalSec)} />
      </div>

      <div style={{ flex: 1 }} />

      {/* LAP */}
      <button onClick={fireLap} style={{
        height: 120, width: '100%', borderRadius: 20, border: 0, cursor: 'pointer',
        background: lapFlash ? T.ok : T.accent, color: '#fff',
        fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
        fontSize: 56, letterSpacing: '0.06em',
        transition: 'background 200ms',
      }}>LAP</button>

      {next && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Small>Próx: {next.title}</Small>
          <ZBadge zone={next.zone} />
        </div>
      )}
    </div>
  );
}

// V2 BOLD — total time hero, LAP gigantic
function ActiveBold({ seg, next, segIdx, hr, zone, totalSec, lapSec, reps, lapFlash, setShowPause, fireLap }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg, padding: '8px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setShowPause(true)} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontSize: 18 }}>‖</button>
        <Small><Mono>{segIdx+1}/{PLAN.segments.length}</Mono></Small>
      </div>

      {/* TOTAL hero */}
      <div style={{ paddingTop: 12, paddingBottom: 8, textAlign: 'center' }}>
        <Label>TOTAL</Label>
        <div style={{ marginTop: 6 }}>
          <HeroNumber size={120}><Mono>{fmtClock(totalSec)}</Mono></HeroNumber>
        </div>
      </div>

      {/* HR strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
        <Mono style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 32, color: T['z'+zone[1]] }}>{Math.round(hr)}</Mono>
        <Small><Mono>BPM</Mono></Small>
        <ZBadge zone={zone} big />
      </div>

      {/* current segment block */}
      <Card padding={16} style={{ borderTop: `2px solid ${T.accent}`, marginBottom: 8 }}>
        <Label color={T.accent}>EN CURSO · {segIdx+1}/{PLAN.segments.length}</Label>
        <H3 style={{ marginTop: 4, fontSize: 18 }}>{seg.title}</H3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <Stat2 label="REPS" value={`${reps}/${seg.reps||'—'}`} />
          <Stat2 label="LAP" value={fmtClock(lapSec)} />
        </div>
      </Card>

      <div style={{ flex: 1 }} />

      <button onClick={fireLap} style={{
        height: 160, width: '100%', borderRadius: 20, border: 0, cursor: 'pointer',
        background: lapFlash ? T.ok : T.accent, color: '#fff',
        fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
        fontSize: 72, letterSpacing: '0.08em', transition: 'background 200ms',
      }}>LAP</button>

      {next && <Small style={{ marginTop: 10, textAlign: 'center', display: 'block' }}>↓ {next.title}</Small>}
    </div>
  );
}

// V3 EXPERT — Garmin watch face density
function ActiveExpert({ seg, next, segIdx, hr, zone, totalSec, lapSec, reps, lapFlash, setShowPause, fireLap }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg, padding: '8px 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <button onClick={() => setShowPause(true)} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontSize: 16 }}>‖</button>
        <Small style={{ fontSize: 11 }}><Mono>{seg.title.toUpperCase()}</Mono></Small>
        <Small style={{ fontSize: 11 }}><Mono>{segIdx+1}/{PLAN.segments.length}</Mono></Small>
      </div>

      {/* big LAP timer */}
      <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
        <Label style={{ fontSize: 9 }}>LAP</Label>
        <div><HeroNumber size={88}><Mono>{fmtClock(lapSec)}</Mono></HeroNumber></div>
      </div>

      {/* 4-cell metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <ExpertCell label="HR" value={Math.round(hr)} unit="bpm" color={T['z'+zone[1]]} />
        <ExpertCell label="ZONE" value={zone} unit="" color={T['z'+zone[1]]} />
        <ExpertCell label="REPS" value={`${reps}/${seg.reps||'—'}`} unit="" />
        <ExpertCell label="TOTAL" value={fmtClock(totalSec)} unit="" />
        <ExpertCell label="TGT HR" value="Z4" unit="" />
        <ExpertCell label="PACE" value="1.2" unit="r/s" />
      </div>

      <div style={{ flex: 1 }} />

      {/* LAP smaller, with next-segment chip */}
      <div style={{ marginTop: 8 }}>
        {next && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px' }}>
            <Small style={{ fontSize: 11 }}>NEXT · {next.title}</Small>
            <ZBadge zone={next.zone} />
          </div>
        )}
        <button onClick={fireLap} style={{
          height: 88, width: '100%', borderRadius: 14, border: 0, cursor: 'pointer',
          background: lapFlash ? T.ok : T.accent, color: '#fff',
          fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic',
          fontSize: 40, letterSpacing: '0.06em', transition: 'background 200ms',
        }}>LAP</button>
      </div>
    </div>
  );
}

function ExpertCell({ label, value, unit, color = T.fg }) {
  return (
    <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
      <Label style={{ fontSize: 9 }}>{label}</Label>
      <div style={{ marginTop: 2 }}>
        <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 22, color, lineHeight: 1 }}><Mono>{value}</Mono></span>
        {unit && <Small style={{ fontSize: 10, marginLeft: 4 }}>{unit}</Small>}
      </div>
    </div>
  );
}

// ── pause modal ──
function PauseModal({ onResume, onAbandon }) {
  const [n, setN] = useState(10);
  useEffect(() => { const id = setInterval(() => setN(x => Math.max(0, x-1)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (n === 0) onResume(); }, [n]);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
      <Card padding={24} style={{ width: '100%', borderRadius: 20 }}>
        <H2 style={{ marginBottom: 8 }}>Pausa</H2>
        <Small style={{ display: 'block', marginBottom: 20 }}>Auto-resume en {n}s si no confirmas.</Small>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PrimaryBtn onClick={onResume}>Reanudar</PrimaryBtn>
          <SecondaryBtn onClick={onAbandon}>Abandonar</SecondaryBtn>
        </div>
      </Card>
    </div>
  );
}

function DataCell({ label, value }) {
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: '12px 14px' }}>
      <Label>{label}</Label>
      <div style={{ marginTop: 4, fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 28, color: T.fg, lineHeight: 1 }}>
        <Mono>{value}</Mono>
      </div>
    </div>
  );
}

function Stat2({ label, value, unit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Label style={{ fontSize: 10 }}>{label}</Label>
      <span style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 22, color: T.fg, lineHeight: 1 }}>
        <Mono>{value}</Mono>{unit && <Small style={{ marginLeft: 4 }}>{unit}</Small>}
      </span>
    </div>
  );
}

function KV({ label, v }) {
  return (
    <div>
      <Label style={{ fontSize: 10 }}>{label}</Label>
      <Body style={{ fontSize: 13, marginTop: 2, display: 'block' }}>{v}</Body>
    </div>
  );
}

function TopBar({ onBack, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px 16px' }}>
      {onBack ? <button onClick={onBack} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontFamily: T.fontSans, fontSize: 14 }}>← Atrás</button> : <span/>}
      {title && <Label>{title}</Label>}
      <span style={{ width: 50 }}/>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label>{title}</Label>
      {children}
    </div>
  );
}

// ════════════════════════════ POST-WORKOUT SUMMARY ════════════════════════════
function PostWorkout({ variant = 'safe', onSave }) {
  const [rpe, setRpe] = useState(8);
  const props = { rpe, setRpe, onSave };
  if (variant === 'bold')   return <PostBold {...props} />;
  if (variant === 'expert') return <PostExpert {...props} />;
  return <PostSafe {...props} />;
}

const ZONE_DIST = [
  { z: 'Z1', pct: 3,  time: '1:24' },
  { z: 'Z2', pct: 7,  time: '3:18' },
  { z: 'Z3', pct: 31, time: '14:42' },
  { z: 'Z4', pct: 42, time: '19:54' },
  { z: 'Z5', pct: 17, time: '8:05' },
];

const SEG_RESULTS = [
  { name: 'Run 400m',     time: '1:42', trend: '▲', zone: 'Z3', pct: 92 },
  { name: 'Sled 100m',    time: '0:55', trend: '─', zone: 'Z4', pct: 100 },
  { name: 'Wall 50/9kg',  time: '1:24', trend: '▼', zone: 'Z4', pct: 87, weak: true },
  { name: 'Run 400m',     time: '1:51', trend: '─', zone: 'Z3', pct: 88 },
  { name: 'Row 500m',     time: '1:32', trend: '▲', zone: 'Z4', pct: 95 },
];

function PostSafe({ rpe, setRpe, onSave }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: T.ok, fontSize: 22 }}>✓</span>
            <H1>Hecho</H1>
          </div>
          <div style={{ marginTop: 8 }}><HeroNumber size={64}><Mono>47:23</Mono></HeroNumber></div>
          <Small style={{ marginTop: 6, display: 'block' }}>PR · <Mono color={T.ok}>-02:14 vs último</Mono></Small>
        </div>

        <Section title="ZONAS">
          <Card padding={14}>
            {ZONE_DIST.map(z => (
              <div key={z.z} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <ZBadge zone={z.z} />
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                  <div style={{ width: `${z.pct}%`, height: '100%', background: T['z'+z.z[1]], borderRadius: 3 }}/>
                </div>
                <Small style={{ minWidth: 30, textAlign: 'right' }}><Mono>{z.pct}%</Mono></Small>
                <Small style={{ minWidth: 42, textAlign: 'right' }}><Mono>{z.time}</Mono></Small>
              </div>
            ))}
          </Card>
        </Section>

        <Section title="HR">
          <MetricRows items={[
            { label: 'Avg', value: '161 bpm' },
            { label: 'Max', value: '184 bpm' },
            { label: 'Decoupling', value: '+4.2%', color: T.warning },
            { label: 'Recovery 60s', value: '−42 bpm', color: T.ok },
          ]} />
        </Section>

        <Section title="POR SEGMENTO">
          <div style={{ background: T.surface, borderRadius: 14, overflow: 'hidden' }}>
            {SEG_RESULTS.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 28px 50px 50px', gap: 8, alignItems: 'center', padding: '12px 14px', borderTop: i===0?'none':`1px solid ${T.hairline}` }}>
                <Body style={{ fontSize: 14 }}>{s.name}</Body>
                <Small style={{ textAlign: 'right' }}><Mono>{s.time}</Mono></Small>
                <span style={{ color: s.trend==='▲'?T.ok:s.trend==='▼'?T.danger:T.muted, textAlign: 'center' }}>{s.trend}</span>
                <ZBadge zone={s.zone} />
                <Small style={{ textAlign: 'right' }} color={s.weak ? T.warning : T.muted}><Mono>{s.pct}%</Mono></Small>
              </div>
            ))}
          </div>
        </Section>

        <Section title="¿CÓMO LO SENTISTE?">
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setRpe(n)} style={{
                width: 30, height: 30, borderRadius: 9999, border: 0, cursor: 'pointer',
                background: rpe===n ? T.accent : T.surface, color: rpe===n ? '#fff' : T.fg,
                fontFamily: T.fontSans, fontSize: 13, fontWeight: 600,
              }}>{n}</button>
            ))}
          </div>
        </Section>
      </div>
      <div style={{ padding: '8px 24px 16px' }}>
        <PrimaryBtn onClick={onSave}>GUARDAR</PrimaryBtn>
      </div>
    </div>
  );
}

function PostBold({ rpe, setRpe, onSave }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* big finish */}
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <span style={{ color: T.ok, fontSize: 30 }}>✓</span>
          <div style={{ marginTop: 8 }}><HeroNumber size={120}><Mono>47:23</Mono></HeroNumber></div>
          <div style={{ marginTop: 8 }}>
            <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 9999, background: T.ok+'26', color: T.ok, fontFamily: T.fontDisp, fontWeight: 800, fontStyle: 'italic', fontSize: 14, letterSpacing: '0.08em' }}>PR · −2:14</span>
          </div>
        </div>

        {/* zones — donut-feel stacked bar */}
        <Card padding={16}>
          <Label style={{ marginBottom: 12 }}>ZONAS</Label>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden' }}>
            {ZONE_DIST.map(z => <div key={z.z} title={z.z} style={{ width: `${z.pct}%`, background: T['z'+z.z[1]], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontSans, fontSize: 10, fontWeight: 700, color: '#000' }}>{z.pct>5?z.pct+'%':''}</div>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {ZONE_DIST.map(z => <Small key={z.z} style={{ fontSize: 11 }}><Mono color={T['z'+z.z[1]]}>{z.z}</Mono> <Mono>{z.time}</Mono></Small>)}
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Card padding={12}><Label style={{ fontSize: 10 }}>AVG HR</Label><div style={{ marginTop: 4 }}><HeroNumber size={28}><Mono>161</Mono></HeroNumber></div></Card>
          <Card padding={12}><Label style={{ fontSize: 10 }}>DECOUP</Label><div style={{ marginTop: 4 }}><HeroNumber size={28} color={T.warning}><Mono>+4.2%</Mono></HeroNumber></div></Card>
          <Card padding={12}><Label style={{ fontSize: 10 }}>REC 60s</Label><div style={{ marginTop: 4 }}><HeroNumber size={28} color={T.ok}><Mono>−42</Mono></HeroNumber></div></Card>
        </div>

        <Section title="¿CÓMO LO SENTISTE?">
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setRpe(n)} style={{
                width: 30, height: 30, borderRadius: 9999, border: 0, cursor: 'pointer',
                background: rpe===n ? T.accent : T.surface, color: rpe===n ? '#fff' : T.fg,
                fontFamily: T.fontSans, fontSize: 13, fontWeight: 600,
              }}>{n}</button>
            ))}
          </div>
        </Section>
      </div>
      <div style={{ padding: '8px 24px 16px' }}><PrimaryBtn onClick={onSave}>GUARDAR</PrimaryBtn></div>
    </div>
  );
}

function PostExpert({ rpe, setRpe, onSave }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* tight header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 6px' }}>
          <span style={{ color: T.ok, fontSize: 18 }}>✓</span>
          <HeroNumber size={36}><Mono>47:23</Mono></HeroNumber>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, background: T.ok+'26', color: T.ok, fontFamily: T.fontSans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>PR −2:14</span>
        </div>

        <Card padding={10}>
          <Label style={{ fontSize: 9 }}>ZONAS</Label>
          <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
            {ZONE_DIST.map(z => <div key={z.z} style={{ width: `${z.pct}%`, background: T['z'+z.z[1]] }} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {ZONE_DIST.map(z => <Small key={z.z} style={{ fontSize: 9 }}><Mono color={T['z'+z.z[1]]}>{z.z} {z.pct}%</Mono></Small>)}
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          <ExpertCell label="AVG HR" value="161" unit="bpm" />
          <ExpertCell label="MAX HR" value="184" unit="bpm" />
          <ExpertCell label="DECOUP" value="+4.2" unit="%" color={T.warning} />
          <ExpertCell label="REC 60S" value="−42" unit="bpm" color={T.ok} />
          <ExpertCell label="AVG PWR" value="232" unit="W" />
          <ExpertCell label="PEAK" value="318" unit="W" />
        </div>

        <Card padding={0}>
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.hairline}` }}><Label style={{ fontSize: 9 }}>POR SEGMENTO</Label></div>
          {SEG_RESULTS.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 18px 38px 36px', gap: 6, alignItems: 'center', padding: '8px 10px', borderTop: i===0?'none':`1px solid ${T.hairline}` }}>
              <Small style={{ fontSize: 11 }}>{s.name}</Small>
              <Small style={{ textAlign: 'right', fontSize: 11 }}><Mono>{s.time}</Mono></Small>
              <span style={{ color: s.trend==='▲'?T.ok:s.trend==='▼'?T.danger:T.muted, fontSize: 10, textAlign: 'center' }}>{s.trend}</span>
              <ZBadge zone={s.zone} />
              <Small style={{ textAlign: 'right', fontSize: 10 }} color={s.weak ? T.warning : T.muted}><Mono>{s.pct}%</Mono></Small>
            </div>
          ))}
        </Card>

        <Card padding={10}>
          <Label style={{ fontSize: 9, marginBottom: 6 }}>RPE</Label>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setRpe(n)} style={{
                width: 26, height: 26, borderRadius: 9999, border: 0, cursor: 'pointer',
                background: rpe===n ? T.accent : T.surfaceUp, color: rpe===n ? '#fff' : T.fg,
                fontFamily: T.fontSans, fontSize: 12, fontWeight: 600,
              }}>{n}</button>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ padding: '8px 12px 12px' }}><PrimaryBtn onClick={onSave} style={{ height: 46 }}>GUARDAR</PrimaryBtn></div>
    </div>
  );
}

window.PreWorkoutBrief = PreWorkoutBrief;
window.ActiveWorkout = ActiveWorkout;
window.PostWorkout = PostWorkout;
