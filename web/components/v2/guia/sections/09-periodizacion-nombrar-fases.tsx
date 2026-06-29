// GUÍA · 09 Periodización: nombrar fases — área "El plan". The agnostic model from
// the real Periodización section (components/v2/periodizacion/PeriodizacionView):
// a LEVEL holds an ordered SEQUENCE of microciclos per días/semana, and that order
// IS the periodization. No fixed phases, no hardcoded ATR — the coach names and
// sequences his own. Each microciclo's name is the fase the athlete reads.

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  circuito: 'var(--v2-mod-circuito)',
} as const;

// Phase hues for the sequence cards — purely illustrative grouping (your method
// decides the names; these just show that the ORDER is the periodization).
const PH = {
  acum: 'var(--v2-info)',
  transf: 'var(--v2-warn)',
  real: 'var(--v2-accent)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Periodizar es <b>nombrar tus fases y ponerlas en orden</b>. Cada fase es un microciclo que
          tú nombras; encadenarlas a lo largo del plan es la periodización. No hay fases prefijadas
          ni jerga impuesta: el lenguaje y la progresión son tuyos.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            La periodización vive dentro de cada <b>nivel</b>: una secuencia ordenada de microciclos
            por <b>días/semana</b>. Ese orden — no una etiqueta fija — <em className="em">es</em> la
            progresión.
          </>
        }
        como={
          <>
            En <code>Periodización</code> defines tus niveles, entras en uno y encadenas sus
            microciclos. Le pones nombre a cada fase y la colocas donde toca en la secuencia.
          </>
        }
        porque={
          <>
            Porque tu método es tuyo. Hoy «Acumulación → Transformación → Realización»; mañana, lo
            que tu sistema use. La app no te impone fases: lee las que tú escribes.
          </>
        }
      />

      <h3>1 · El nivel es el marco; el orden, la periodización</h3>
      <p>
        Un <b>nivel</b> clasifica al atleta y guarda su periodización. Dentro, encadenas microciclos
        por días/semana: el primero, el segundo, el tercero… y ese orden es la progresión que vivirá
        tu atleta. No existe una entidad «fase» suelta ni una matriz aparte —{' '}
        <em className="em">la secuencia es la fase puesta en el tiempo</em>.
      </p>

      {/* Dashboard mockup: Periodización — niveles + the ordered microciclo sequence */}
      <DashboardMockup url="tu-panel / periodización">
        <div className="wk-head" style={{ marginBottom: '12px' }}>
          <div className="wk-title">
            Periodización&nbsp; <small>· niveles</small>
          </div>
        </div>

        {/* niveles */}
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {[
            { t: 'Iniciación' },
            { t: 'Intermedio' },
            { t: 'Avanzado', on: true },
          ].map((l) => (
            <span
              key={l.t}
              className="chip"
              style={{
                fontSize: '11px',
                padding: '5px 11px',
                borderColor: l.on ? 'var(--acc)' : 'var(--hair2)',
                background: l.on ? 'var(--accSoft)' : 'var(--elev)',
                color: l.on ? 'var(--acc)' : 'var(--muted)',
                fontWeight: 700,
              }}
            >
              {l.t}
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: '8.5px',
            fontWeight: 800,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '8px',
          }}
        >
          Avanzado · 5 días/semana — secuencia de microciclos
        </div>

        {/* the ordered sequence: ORDER = periodization */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          <SeqCard n={1} name="Acumulación" weeks="5 sem" hue={PH.acum} />
          <SeqArrow />
          <SeqCard n={2} name="Transformación" weeks="4 sem" hue={PH.transf} />
          <SeqArrow />
          <SeqCard n={3} name="Realización" weeks="3 sem" hue={PH.real} />
        </div>

        <div
          style={{
            marginTop: '12px',
            fontSize: '10px',
            color: 'var(--faint)',
            fontStyle: 'italic',
          }}
        >
          El atleta cae en su nivel y sus días, y recibe esta secuencia. Tú la vigilas en Hoy.
        </div>
      </DashboardMockup>

      <h3>2 · Tú nombras, tú ordenas</h3>
      <p>
        El nombre de cada microciclo es la <b>fase</b> que ve tu atleta. Lo escribes tú, en tu
        idioma de entrenador, y lo colocas en la posición que tu método pide. Reordenar la secuencia
        reordena la progresión — sin tocar nada del lado del atleta.
      </p>

      <DocNote variant="log" title="Agnóstico de principio a fin">
        <p>
          La app no trae «las fases» de serie ni asume tres. Lee las que tú creas y las muestra en
          el orden que tú das. Si tu método cambia de lenguaje o de número de fases, no hay nada que
          reconfigurar: tu periodización es dato tuyo, no una regla del sistema.
        </p>
      </DocNote>

      <MovilBand
        title="La progresión, como la vive tu atleta"
        subtitle={
          <>
            Tu atleta no ve la secuencia entera de golpe: ve <b>su fase actual</b> encabezando el
            día. A medida que el plan avanza por tu orden, esa etiqueta cambia con él.
          </>
        }
      >
        {/* PHONE 1: principio de la secuencia */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 2.</b> Al principio del plan, su fase es la primera de tu secuencia.
            </>
          }
        >
          <PhaseHeader
            kick="Miércoles 14 ene"
            name="Marc"
            phase="Acumulación"
            foco="Foco: base aeróbica"
          />
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">Carrera · sesión de hoy</span>
            </div>
            <div className="ht">Rodaje largo Z2</div>
            <div className="meta num">Mañana · ≈ 70 min · 1 bloque</div>
            <div className="cta">▶ Empezar</div>
          </div>
          <div className="prog">
            <span className="l">Tu fase</span>
            <div className="v num" style={{ fontSize: '15px' }}>
              Semana 2 de 5
            </div>
            <div className="bar">
              <span style={{ width: '40%' }} />
            </div>
            <div className="cap">Construyendo base.</div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: final de la secuencia */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 10.</b> La misma app, más adelante: tu orden lo ha llevado a la última fase.
            </>
          }
        >
          <PhaseHeader
            kick="Lunes 9 mar"
            name="Marc"
            phase="Realización"
            foco="Foco: ritmo de carrera"
          />
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">HYROX · sesión de hoy</span>
            </div>
            <div className="ht">Simulación a ritmo</div>
            <div className="meta num">Mañana · ≈ 55 min · 4 estaciones</div>
            <div className="cta">▶ Empezar</div>
          </div>
          <div className="prog">
            <span className="l">Tu fase</span>
            <div className="v num" style={{ fontSize: '15px' }}>
              Semana 2 de 3
            </div>
            <div className="bar">
              <span style={{ width: '66%', background: MOD.circuito }} />
            </div>
            <div className="cap">Afinando para competir.</div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// ── Dashboard sequence card (a microciclo / fase in the ordered sequence) ────
function SeqCard({ n, name, weeks, hue }: { n: number; name: string; weeks: string; hue: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: '120px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '9px',
        padding: '9px 11px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: hue }} />
      <div className="num" style={{ fontSize: '8.5px', fontWeight: 800, color: 'var(--faint)' }}>
        {String(n).padStart(2, '0')}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)', margin: '2px 0 1px' }}>
        {name}
      </div>
      <div className="num" style={{ fontSize: '9.5px', color: 'var(--muted)' }}>
        {weeks}
      </div>
    </div>
  );
}

function SeqArrow() {
  return (
    <span style={{ alignSelf: 'center', color: 'var(--acc)', fontWeight: 800, fontSize: '14px' }}>
      →
    </span>
  );
}

// ── Athlete phone: the Inicio header showing the current fase ────────────────
function PhaseHeader({
  kick,
  name,
  phase,
  foco,
}: {
  kick: string;
  name: string;
  phase: string;
  foco: string;
}) {
  return (
    <>
      <div className="kick" style={{ marginTop: '6px' }}>
        {kick}
      </div>
      <div className="ph-title">Hola, {name}</div>
      <div className="focus-line">
        <span className="scope">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </span>
        <span className="ph">{phase}</span>
        <span className="fo">· {foco}</span>
      </div>
    </>
  );
}
