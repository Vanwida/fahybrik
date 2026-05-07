// Onboarding flow — 13 steps. Mirrors UX spec 01 + Onboarding/*View.swift.
// Three visual variants: SAFE (cards · classic), BOLD (full-bleed numbers),
// EXPERT (compact form-like). For brevity we render the same content; variant
// only changes layout density and heading scale. Steps:
//
//  0 welcome   1 basics       2 background   3 history    4 onerm
//  5 endurance 6 stations     7 threshold    8 training   9 recovery
// 10 goals    11 connect     12 done
//
// Each step is a compact, hi-fi mock — not a full form. The point is to
// demonstrate that the flow exists and is on-brand; production logic stays
// in the Swift app.

function OnboardingFlow({ variant = 'safe', onDone, onClose }) {
  const [step, setStep] = React.useState(0);
  const total = ONBOARDING_STEPS.length;

  const next = () => {
    if (step + 1 >= total) onDone && onDone();
    else setStep(step + 1);
  };
  const back = () => step > 0 ? setStep(step - 1) : onClose && onClose();

  const StepBody = STEP_BODIES[step];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, color: T.fg }}>
      {/* progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 8px' }}>
        <button onClick={back} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontFamily: T.fontSans, fontSize: 14 }}>← Atrás</button>
        <Small><Mono>{step + 1} / {total}</Mono></Small>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: T.muted, cursor: 'pointer', fontFamily: T.fontSans, fontSize: 13 }}>Salir</button>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', margin: '0 24px' }}>
        <div style={{ height: '100%', width: `${((step + 1) / total) * 100}%`, background: T.accent, transition: 'width 240ms' }}/>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Label color={T.accent}>PASO {String(step + 1).padStart(2, '0')}</Label>
        {variant === 'expert'
          ? <H3 style={{ fontSize: 22 }}>{ONBOARDING_STEPS[step].title}</H3>
          : <H1 style={{ fontSize: variant === 'bold' ? 38 : 30 }}>{ONBOARDING_STEPS[step].title}</H1>}
        {StepBody && <StepBody variant={variant} />}
      </div>

      {/* CTA */}
      <div style={{ padding: '8px 24px 24px' }}>
        <PrimaryBtn onClick={next}>
          {step + 1 === total ? '✓ EMPEZAR' : 'CONTINUAR'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Step body components (data-light demos) ───

function StepWelcome() {
  return (
    <>
      <Body style={{ fontSize: 16, lineHeight: 1.5, color: T.muted }}>
        Coaching híbrido para Hyrox y rendimiento. 12 pasos para calibrar tu plan.
      </Body>
      <Card style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 14 }}>
        <CoachQuote>"Empezamos por entender tu cuerpo. Sin datos, no hay plan."</CoachQuote>
      </Card>
    </>
  );
}

function StepBasics() {
  const [sex, setSex] = React.useState('M');
  return (
    <>
      <Field label="NOMBRE" value="Marc Vidal" />
      <Field label="EDAD" value="32" />
      <Field label="ALTURA · PESO" value="178 cm · 76 kg" />
      <div>
        <Label style={{ marginBottom: 8 }}>SEXO</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['M', 'F', 'Otro'].map(o => (
            <Chip key={o} selected={sex === o} onClick={() => setSex(o)}>{o}</Chip>
          ))}
        </div>
      </div>
    </>
  );
}

function StepBackground() {
  const [sel, setSel] = React.useState(['Crossfit', 'Running']);
  const opts = ['Running', 'Triatlón', 'Ciclismo', 'Crossfit', 'Hyrox', 'Strength', 'Team', 'Otro'];
  const toggle = o => setSel(s => s.includes(o) ? s.filter(x => x !== o) : [...s, o]);
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Selecciona los deportes que has practicado.</Body>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {opts.map(o => <Chip key={o} selected={sel.includes(o)} onClick={() => toggle(o)}>{o}</Chip>)}
      </div>
      <Field label="AÑOS DE ENTRENAMIENTO" value="6" />
    </>
  );
}

function StepHistory() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Carreras destacadas. Mejores marcas si tienes.</Body>
      <Card padding={0}>
        {[
          { d: 'Hyrox BCN 2025',   r: '1:24:18' },
          { d: 'Maratón VLC 2024', r: '3:18:42' },
          { d: '10K Cursa MM 2024',r: '0:42:12' },
        ].map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
            <Body style={{ flex: 1, fontSize: 14 }}>{it.d}</Body>
            <Mono style={{ fontWeight: 600 }}>{it.r}</Mono>
          </div>
        ))}
      </Card>
      <GhostLink>+ Añadir carrera</GhostLink>
    </>
  );
}

function StepOneRm() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>1RMs estimados. No pasa nada si no los sabes.</Body>
      <Card padding={0}>
        {[
          { l: 'Back Squat', v: '160 kg' },
          { l: 'Deadlift',   v: '180 kg' },
          { l: 'Bench',      v: '110 kg' },
          { l: 'Press',      v: '70 kg' },
        ].map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
            <Body style={{ flex: 1, fontSize: 14 }}>{it.l}</Body>
            <Mono style={{ fontWeight: 600 }}>{it.v}</Mono>
          </div>
        ))}
      </Card>
    </>
  );
}

function StepEndurance() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Benchmarks recientes (últimos 6m).</Body>
      <Card padding={0}>
        {[
          { l: '5K run',  v: '20:42' },
          { l: '10K run', v: '42:18' },
          { l: '2K row',  v: '6:58' },
          { l: 'FTP bike',v: '258 W' },
        ].map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
            <Body style={{ flex: 1, fontSize: 14 }}>{it.l}</Body>
            <Mono style={{ fontWeight: 600 }}>{it.v}</Mono>
          </div>
        ))}
      </Card>
    </>
  );
}

function StepStations() {
  const stations = [
    { n: 'SkiErg 1000m', v: '4:18' },
    { n: 'Sled Push 50m / 152kg', v: '0:55' },
    { n: 'Sled Pull 50m / 103kg', v: '1:12' },
    { n: 'Burpee BJ 80m', v: '4:22' },
    { n: 'Row 1000m', v: '3:58' },
    { n: 'Farmers 200m / 24kg', v: '1:48' },
    { n: 'Sandbag Lunges 100m', v: '2:38' },
    { n: 'Wall Balls 100 · 9kg', v: '4:12' },
  ];
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Tus marcas en las 8 estaciones.</Body>
      <Card padding={0}>
        {stations.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
            <Body style={{ flex: 1, fontSize: 13 }}>{it.n}</Body>
            <Mono style={{ fontWeight: 600 }}>{it.v}</Mono>
          </div>
        ))}
      </Card>
    </>
  );
}

function StepThreshold() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Tests anaeróbicos. Si tienes umbrales medidos, pónlos.</Body>
      <Field label="LACTATE THRESHOLD HR" value="172 bpm" />
      <Field label="MAX HR (medido)" value="194 bpm" />
      <Field label="VO2 MAX (Garmin)" value="56 ml/kg/min" />
      <Field label="CRITICAL POWER" value="280 W" />
    </>
  );
}

function StepTraining() {
  const [vol, setVol] = React.useState(5);
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Sesiones por semana. Lo usaremos como base.</Body>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0' }}>
        <HeroNumber size={88} color={T.accent}><Mono>{vol}</Mono></HeroNumber>
        <Small><Mono>SESIONES / SEMANA</Mono></Small>
        <input type="range" min="1" max="7" value={vol} onChange={e => setVol(+e.target.value)} style={{ width: '100%', accentColor: T.accent }} />
      </div>
      <Field label="TIEMPO POR SESIÓN" value="60-90 min" />
      <Field label="PREFERENCIA" value="Mañanas" />
    </>
  );
}

function StepRecovery() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Cómo descansas afecta tu plan.</Body>
      <Field label="HORAS DE SUEÑO" value="7h 12m avg" />
      <Field label="ESTRÉS LABORAL" value="Medio" />
      <Field label="LESIONES ACTIVAS" value="Ninguna" />
      <Field label="LIMITACIONES" value="—" />
    </>
  );
}

function StepGoals() {
  const [g, setG] = React.useState('hyrox');
  const goals = [
    { id: 'hyrox', label: 'Hyrox', sub: 'Competir o terminar' },
    { id: 'perf',  label: 'Rendimiento', sub: 'Más fuerte, más rápido' },
    { id: 'health',label: 'Salud', sub: 'Sentirme bien y consistente' },
  ];
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>¿Cuál es tu A-event?</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {goals.map(o => (
          <button key={o.id} onClick={() => setG(o.id)} style={{
            textAlign: 'left', padding: 16, borderRadius: 14, cursor: 'pointer',
            background: T.surface,
            border: `1px solid ${g === o.id ? T.accent : 'transparent'}`,
            color: T.fg,
          }}>
            <H3 style={{ fontSize: 18 }}>{o.label}</H3>
            <Small style={{ marginTop: 2 }}>{o.sub}</Small>
          </button>
        ))}
      </div>
      <Field label="FECHA · A-EVENT" value="18 jun · BCN" />
    </>
  );
}

function StepConnect() {
  const services = [
    { n: 'Apple Health', sub: 'HRV, sueño, RHR, FC', state: true,  req: true },
    { n: 'Strava',       sub: 'Carreras y ciclismo', state: false },
    { n: 'Garmin',       sub: 'Próximamente',        state: false, off: true },
  ];
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 14 }}>Sin datos no hay autoregulación.</Body>
      <Card padding={0}>
        {services.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`, opacity: s.off ? 0.5 : 1 }}>
            <div style={{ flex: 1 }}>
              <Body style={{ fontSize: 14, fontWeight: 600 }}>
                {s.n} {s.req && <span style={{ color: T.accent, marginLeft: 4 }}>*</span>}
              </Body>
              <Small style={{ display: 'block', marginTop: 2 }}>{s.sub}</Small>
            </div>
            <span style={{
              padding: '6px 12px', borderRadius: 9999,
              background: s.state ? T.ok : 'rgba(161,161,161,0.2)',
              color: s.state ? '#fff' : T.fg,
              fontFamily: T.fontSans, fontSize: 12, fontWeight: 600,
            }}>{s.state ? '✓ Conectado' : 'Conectar'}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

function StepDone() {
  return (
    <>
      <Body style={{ color: T.muted, fontSize: 16, lineHeight: 1.5 }}>
        Plan calibrado. <strong style={{ color: T.fg }}>{PERSONA.daysToRace} días</strong> hasta {PERSONA.raceName}.
      </Body>
      <Card style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 14 }}>
        <CoachQuote>"Bienvenido al bloque. Hoy sentamos base; mañana ya entrenamos."</CoachQuote>
      </Card>
      <Card padding={14}>
        <Label>RESUMEN · SEMANA 1</Label>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <ColStat label="SESIONES" v="5" />
          <ColStat label="VOL" v="9.2h" />
          <ColStat label="FOCO" v="Aero" />
        </div>
      </Card>
    </>
  );
}

const STEP_BODIES = [
  StepWelcome, StepBasics, StepBackground, StepHistory, StepOneRm,
  StepEndurance, StepStations, StepThreshold, StepTraining, StepRecovery,
  StepGoals, StepConnect, StepDone,
];

function Field({ label, value }) {
  return (
    <div style={{ background: T.surface, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center' }}>
      <Label style={{ flex: 1, fontSize: 10 }}>{label}</Label>
      <Mono style={{ fontSize: 14, fontFamily: T.fontSans, fontWeight: 600 }}>{value}</Mono>
    </div>
  );
}
function ColStat({ label, v }) {
  return (
    <div>
      <Label style={{ fontSize: 10 }}>{label}</Label>
      <H3 style={{ fontSize: 22, marginTop: 2 }}>{v}</H3>
    </div>
  );
}

window.OnboardingFlow = OnboardingFlow;
