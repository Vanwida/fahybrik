// Stats tab — 3 variants. Sub-tabs: Carga · HR · Hyrox · Tendencias.
// V1 SAFE — Carga focus (CTL/ATL/TSB), classic
// V2 BOLD — Polarización donut hero
// V3 EXPERT — multi-chart dashboard

function StatsScreen({ variant = 'safe' }) {
  const [tab, setTab] = React.useState('carga');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* sub-tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 12px', overflowX: 'auto' }}>
        {[
          { id: 'carga',  label: 'Carga' },
          { id: 'hr',     label: 'HR' },
          { id: 'hyrox',  label: 'Hyrox' },
          { id: 'trend',  label: 'Tendencias' },
        ].map(t => (
          <Chip key={t.id} selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {variant === 'bold'   && <StatsBold tab={tab} />}
        {variant === 'expert' && <StatsExpert tab={tab} />}
        {variant === 'safe'   && <StatsSafe tab={tab} />}
      </div>
    </div>
  );
}

// CTL/ATL/TSB demo data (28 days)
const TRAIN_LOAD = Array.from({ length: 28 }, (_, i) => ({
  day: i,
  ctl: 60 + Math.sin(i * 0.18) * 6 + i * 0.55,
  atl: 50 + Math.cos(i * 0.3) * 12 + i * 0.45,
}));
TRAIN_LOAD.forEach(d => d.tsb = d.ctl - d.atl);

// HR zone polarization (last 4 weeks vs target)
const POL_DATA = [
  { z: 'Z1+Z2', value: 72, target: 80, color: T.z2 },
  { z: 'Z3',    value: 12, target: 10, color: T.z3 },
  { z: 'Z4+Z5', value: 16, target: 10, color: T.z4 },
];

// Hyrox station benchmarks
const HYROX_STATIONS = [
  { name: 'SkiErg 1000m',     time: '4:18', best: '4:08', delta: '+10s' },
  { name: 'Sled Push 50m',    time: '0:55', best: '0:52', delta: '+3s' },
  { name: 'Sled Pull 50m',    time: '1:12', best: '1:08', delta: '+4s' },
  { name: 'Burpee BJ 80m',    time: '4:22', best: '4:00', delta: '+22s', flag: true },
  { name: 'Row 1000m',        time: '3:58', best: '3:50', delta: '+8s' },
  { name: 'Farmers 200m',     time: '1:48', best: '1:42', delta: '+6s' },
  { name: 'Sandbag Lunges',   time: '2:38', best: '2:30', delta: '+8s' },
  { name: 'Wall Balls 100',   time: '4:12', best: '3:55', delta: '+17s', flag: true },
];

function StatsSafe({ tab }) {
  if (tab === 'hr')    return <SafeHR />;
  if (tab === 'hyrox') return <SafeHyrox />;
  if (tab === 'trend') return <SafeTrend />;
  return <SafeCarga />;
}

function SafeCarga() {
  return (
    <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <Label>FORMA · TSB</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <HeroNumber size={88} color={T.ok}><Mono>+{PERSONA.carga.tsb}</Mono></HeroNumber>
          <Small><Mono>{PERSONA.carga.tsbLabel}</Mono></Small>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Card padding={14}>
          <Label>CTL · 42d</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <HeroNumber size={32}><Mono>{PERSONA.carga.ctl}</Mono></HeroNumber>
            <Small color={T.ok}>▲</Small>
          </div>
          <Small style={{ fontSize: 11 }}>fitness</Small>
        </Card>
        <Card padding={14}>
          <Label>ATL · 7d</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <HeroNumber size={32}><Mono>{PERSONA.carga.atl}</Mono></HeroNumber>
            <Small color={T.warning}>▲</Small>
          </div>
          <Small style={{ fontSize: 11 }}>fatiga</Small>
        </Card>
        <Card padding={14}>
          <Label>ACR</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <HeroNumber size={32}><Mono>{PERSONA.carga.acr}</Mono></HeroNumber>
          </div>
          <Small style={{ fontSize: 11 }}>{PERSONA.carga.acrLabel}</Small>
        </Card>
        <Card padding={14}>
          <Label>READY</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <HeroNumber size={32} color={T.ok}><Mono>{PERSONA.carga.readiness}</Mono></HeroNumber>
          </div>
          <Small style={{ fontSize: 11 }}>composite</Small>
        </Card>
      </div>

      <Section title="CTL / ATL · 28 días">
        <Card padding={14}>
          <LoadChart h={140} />
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <Legend2 c={T.fg} label="CTL" />
            <Legend2 c={T.warning} label="ATL" />
          </div>
        </Card>
      </Section>
    </div>
  );
}

function SafeHR() {
  return (
    <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <Label>HRV · 7d avg</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <HeroNumber size={72}><Mono>58</Mono></HeroNumber>
          <Small color={T.ok}>▲ 4 vs base</Small>
        </div>
      </div>

      <Section title="POLARIZACIÓN · 28 días">
        <Card padding={14}>
          {POL_DATA.map(p => (
            <div key={p.z} style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Small style={{ fontWeight: 600 }} color={p.color}>{p.z}</Small>
                <Small><Mono>{p.value}% / tgt {p.target}%</Mono></Small>
              </div>
              <div style={{ height: 10, marginTop: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 5, position: 'relative' }}>
                <div style={{ width: `${p.value}%`, height: '100%', background: p.color, borderRadius: 5 }}/>
                <div style={{ position: 'absolute', left: `${p.target}%`, top: -2, height: 14, width: 2, background: T.fg }} />
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="REPOSO · RHR">
        <MetricRows items={[
          { label: 'Hoy', value: '48 bpm', color: T.ok },
          { label: 'Avg 7d', value: '49 bpm' },
          { label: 'Baseline', value: '52 bpm' },
        ]} />
      </Section>
    </div>
  );
}

function SafeHyrox() {
  return (
    <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Card padding={16}>
        <Label>SIMULACRO · 06.05</Label>
        <div style={{ marginTop: 6 }}><HeroNumber size={56}><Mono>1:18:42</Mono></HeroNumber></div>
        <Small style={{ marginTop: 4 }}><Mono color={T.ok}>−4:18 vs último</Mono></Small>
      </Card>

      <Section title="ESTACIONES">
        <Card padding={0}>
          {HYROX_STATIONS.map((s, i) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 26px', gap: 8, alignItems: 'center', padding: '12px 14px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
              <Body style={{ fontSize: 14 }}>{s.name}</Body>
              <Small style={{ textAlign: 'right' }}><Mono>{s.time}</Mono></Small>
              <Small style={{ textAlign: 'right', fontSize: 11 }} color={s.flag ? T.warning : T.muted}><Mono>{s.delta}</Mono></Small>
              {s.flag ? <span style={{ color: T.warning, textAlign: 'center' }}>⚑</span> : <span/>}
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}

function SafeTrend() {
  return (
    <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Section title="VOLUMEN · 8 SEM">
        <Card padding={14}>
          <BarChart data={[7.2, 8.1, 7.8, 9.0, 9.4, 8.6, 10.2, 9.8]} unit="h" h={120} />
        </Card>
      </Section>
      <Section title="RPE · 8 SEM">
        <Card padding={14}>
          <LineMini data={[6.8, 7.0, 7.4, 7.1, 7.6, 7.2, 7.5, 7.2]} h={80} />
        </Card>
      </Section>
      <Section title="PRs · 90d">
        <MetricRows items={[
          { label: 'Back Squat', value: '160 kg ▲ +5kg', color: T.ok },
          { label: 'Run 5k',     value: '20:42 ▲ −0:18', color: T.ok },
          { label: 'Row 2k',     value: '6:58 ▲ −0:08',  color: T.ok },
        ]} />
      </Section>
    </div>
  );
}

function StatsBold({ tab }) {
  if (tab === 'hr') {
    return (
      <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* polarization donut hero */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <Label color={T.accent}>POLARIZACIÓN · 28d</Label>
          <PolarDonut data={POL_DATA} size={220} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {POL_DATA.map(p => (
            <div key={p.z} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.surface, borderRadius: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: p.color }} />
              <Body style={{ flex: 1, fontSize: 14 }}>{p.z}</Body>
              <Mono style={{ fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 22, color: p.color }}>{p.value}%</Mono>
              <Small style={{ fontSize: 11 }}><Mono>tgt {p.target}%</Mono></Small>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // default = carga big TSB
  return (
    <div style={{ padding: '12px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Label>FORMA · TSB</Label>
        <div style={{ marginTop: 6 }}><HeroNumber size={140} color={T.ok}><Mono>+{PERSONA.carga.tsb}</Mono></HeroNumber></div>
        <span style={{ display: 'inline-block', marginTop: 8, padding: '6px 14px', borderRadius: 9999, background: T.ok + '26', color: T.ok, fontFamily: T.fontDisp, fontWeight: 800, fontStyle: 'italic', fontSize: 14, letterSpacing: '0.08em' }}>FRESCO</span>
      </div>

      <Card padding={16}>
        <LoadChart h={160} />
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <Legend2 c={T.fg} label="CTL · fitness" />
          <Legend2 c={T.warning} label="ATL · fatiga" />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Card padding={12}><Label style={{ fontSize: 10 }}>CTL</Label><div style={{ marginTop: 4 }}><HeroNumber size={28}><Mono>{PERSONA.carga.ctl}</Mono></HeroNumber></div></Card>
        <Card padding={12}><Label style={{ fontSize: 10 }}>ATL</Label><div style={{ marginTop: 4 }}><HeroNumber size={28}><Mono>{PERSONA.carga.atl}</Mono></HeroNumber></div></Card>
        <Card padding={12}><Label style={{ fontSize: 10 }}>ACR</Label><div style={{ marginTop: 4 }}><HeroNumber size={28}><Mono>{PERSONA.carga.acr}</Mono></HeroNumber></div></Card>
      </div>
    </div>
  );
}

function StatsExpert({ tab }) {
  // dense multi-panel dashboard
  return (
    <div style={{ padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Card padding={10}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Label style={{ fontSize: 9 }}>CTL · ATL · TSB · 28D</Label>
          <Small style={{ fontSize: 10, marginLeft: 'auto' }}><Mono color={T.ok}>+{PERSONA.carga.tsb} fresco</Mono></Small>
        </div>
        <LoadChart h={100} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <ExpertStat label="CTL" v={PERSONA.carga.ctl} sub="fitness" />
        <ExpertStat label="ATL" v={PERSONA.carga.atl} sub="fatiga" />
        <ExpertStat label="ACR" v={PERSONA.carga.acr} sub="ratio" />
        <ExpertStat label="HRV" v={58} sub="ms · ▲4" color={T.ok} />
        <ExpertStat label="RHR" v={48} sub="bpm · ▼4" color={T.ok} />
        <ExpertStat label="READY" v={PERSONA.carga.readiness} sub="composite" color={T.ok} />
      </div>

      <Card padding={10}>
        <Label style={{ fontSize: 9, marginBottom: 6 }}>POLARIZACIÓN · 28D</Label>
        <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }}>
          {POL_DATA.map(p => (
            <div key={p.z} style={{ width: `${p.value}%`, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: T.fontSans, color: '#000' }}>{p.value}%</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {POL_DATA.map(p => <Small key={p.z} style={{ fontSize: 9 }}><Mono color={p.color}>{p.z} (tgt {p.target}%)</Mono></Small>)}
        </div>
      </Card>

      <Card padding={0}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.hairline}` }}>
          <Label style={{ fontSize: 9 }}>HYROX · STATIONS</Label>
        </div>
        {HYROX_STATIONS.map((s, i) => (
          <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 46px 18px', gap: 6, alignItems: 'center', padding: '7px 10px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
            <Small style={{ fontSize: 11 }}>{s.name}</Small>
            <Small style={{ textAlign: 'right', fontSize: 11 }}><Mono>{s.time}</Mono></Small>
            <Small style={{ textAlign: 'right', fontSize: 10 }} color={s.flag ? T.warning : T.muted}><Mono>{s.delta}</Mono></Small>
            {s.flag ? <span style={{ color: T.warning, fontSize: 11, textAlign: 'center' }}>⚑</span> : <span/>}
          </div>
        ))}
      </Card>
    </div>
  );
}

function ExpertStat({ label, v, sub, color = T.fg }) {
  return (
    <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
      <Label style={{ fontSize: 9 }}>{label}</Label>
      <div style={{ marginTop: 2, fontFamily: T.fontDisp, fontWeight: 900, fontStyle: 'italic', fontSize: 22, color, lineHeight: 1 }}><Mono>{v}</Mono></div>
      <Small style={{ fontSize: 10 }}>{sub}</Small>
    </div>
  );
}

// ─── Mini charts (SVG, deterministic) ───
function LoadChart({ h = 140 }) {
  const w = 320; // viewBox width
  const xs = TRAIN_LOAD.map((_, i) => (i / (TRAIN_LOAD.length - 1)) * w);
  const min = 30, max = 100;
  const y = v => h - ((v - min) / (max - min)) * h;
  const ctlPath = TRAIN_LOAD.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${y(d.ctl).toFixed(1)}`).join(' ');
  const atlPath = TRAIN_LOAD.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${y(d.atl).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1="0" y1={h-0.5} x2={w} y2={h-0.5} stroke={T.hairline} />
      <line x1="0" y1={y(75)} x2={w} y2={y(75)} stroke={T.hairline} strokeDasharray="2 4" />
      <path d={ctlPath} stroke={T.fg} strokeWidth="2" fill="none" />
      <path d={atlPath} stroke={T.warning} strokeWidth="1.5" fill="none" />
    </svg>
  );
}
function BarChart({ data, h = 100, unit = '' }) {
  const w = 320, max = Math.max(...data) * 1.1;
  const bw = w / data.length - 6;
  return (
    <svg width="100%" height={h + 18} viewBox={`0 0 ${w} ${h + 18}`} preserveAspectRatio="none">
      {data.map((v, i) => {
        const bh = (v / max) * h;
        return (
          <g key={i}>
            <rect x={i * (w / data.length) + 3} y={h - bh} width={bw} height={bh} fill={i === data.length - 1 ? T.accent : T.fg} opacity={i === data.length - 1 ? 1 : 0.7} rx="1.5"/>
            <text x={i * (w / data.length) + 3 + bw/2} y={h + 12} fontFamily={T.fontMono} fontSize="9" fill={T.muted} textAnchor="middle">w{i+1}</text>
          </g>
        );
      })}
    </svg>
  );
}
function LineMini({ data, h = 80 }) {
  const w = 320, min = Math.min(...data) - 0.5, max = Math.max(...data) + 0.5;
  const y = v => h - ((v - min) / (max - min)) * h;
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (data.length - 1) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={path} stroke={T.accent} strokeWidth="2" fill="none" />
    </svg>
  );
}
function PolarDonut({ data, size = 200 }) {
  const stroke = 26, r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
      {data.map(d => {
        const len = (d.value / total) * c;
        const dash = `${len} ${c - len}`;
        const dashOffset = -off;
        off += len;
        return (
          <circle key={d.z} cx={size/2} cy={size/2} r={r} stroke={d.color} strokeWidth={stroke} fill="none"
            strokeDasharray={dash} strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        );
      })}
    </svg>
  );
}
function Legend2({ c, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 2, background: c }}/>
      <Small style={{ fontSize: 11 }}>{label}</Small>
    </div>
  );
}

window.StatsScreen = StatsScreen;
