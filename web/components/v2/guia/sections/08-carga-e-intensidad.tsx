// GUÍA · 08 Carga e intensidad de cada ejercicio — área "El plan". THE prescription
// model: every line is three axes — MODALIDAD × CÓMO SE MIDE × CONTRA QUÉ OBJETIVO
// — with zero free text. Grounded in the real editor (lib/dashboard/v2/editor-axes
// + components/v2/editor/PrescriptionFields), and the athlete-facing line comes
// from the SAME renderer the app uses (shared/domain prescriptionToText).

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Aquí está el corazón del plan: cómo le pones <b>carga e intensidad</b> a cada ejercicio.
          No escribes una frase libre — eliges entre opciones, y el panel construye una línea exacta.
          Cada ejercicio se define con <b>tres decisiones</b>: con qué modalidad, cómo se mide el
          trabajo y contra qué objetivo. Nada queda a interpretación.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Tres ejes para cada ejercicio: <b>Modalidad</b> (correr, ergómetro, fuerza, circuito),{' '}
            <b>cómo se mide</b> (distancia, tiempo, reps, calorías) y <b>contra qué objetivo</b>{' '}
            (ritmo, zona, RPE, %máx, RIR…).
          </>
        }
        como={
          <>
            Eliges la modalidad y el panel ya te ofrece solo lo que tiene sentido. Cambia un eje y
            los campos de abajo se adaptan: una serie de fuerza pide reps, carga, tempo y descanso;
            un rodaje pide distancia y ritmo.
          </>
        }
        porque={
          <>
            Porque una carga ambigua no sirve. Con campos estructurados, tu atleta lo entiende sin
            dudar, la app calcula sus analíticas y nada se pierde en un «más o menos».
          </>
        }
      />

      <h3>1 · Los tres ejes</h3>
      <p>
        Al añadir un ejercicio eliges su <b>modalidad</b> y, debajo, dos segmentos más:{' '}
        <code>Cómo se mide</code> y <code>Contra qué objetivo</code>. No son texto: son botones que
        solo muestran lo coherente con esa modalidad. Cambiar cualquiera de los tres reescribe los
        campos de abajo al instante.
      </p>

      {/* Dashboard mockup: the real PrescriptionFields — 3 axes + CAMPOS + preview */}
      <DashboardMockup url="tu-panel / sesión / añadir ejercicio">
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
          Sentadilla trasera
        </div>

        <AxisRow
          label="Modalidad"
          opts={[
            { t: 'Carrera' },
            { t: 'Ergómetro' },
            { t: 'Fuerza', on: true },
            { t: 'Circuito' },
          ]}
        />
        <AxisRow
          label="Cómo se mide"
          opts={[{ t: 'Reps', on: true }, { t: 'Tiempo' }]}
        />
        <AxisRow
          label="Contra qué objetivo"
          opts={[
            { t: '%máx', on: true },
            { t: 'kg' },
            { t: 'RIR' },
            { t: 'RPE' },
            { t: 'Peso corp.' },
          ]}
        />

        {/* CAMPOS — strength per-set table */}
        <div className="ed-block" style={{ marginTop: '12px', marginBottom: '10px' }}>
          <div className="bt">
            <span className="mdot" style={{ background: MOD.fuerza }} />
            Por serie
          </div>
          <table className="extbl">
            <tbody>
              <tr>
                <th>Serie</th>
                <th>Reps</th>
                <th>Carga</th>
                <th>Tempo</th>
                <th>Descanso</th>
              </tr>
              {[1, 2, 3, 4].map((n) => (
                <tr key={n}>
                  <td className="n">{n}</td>
                  <td className="n">5</td>
                  <td className="n">75% RM</td>
                  <td className="n">3·0·1</td>
                  <td className="n">2:00</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Vista previa atleta — the resolved line (real AthletePreviewLine wording) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'var(--accSoft)',
            border: '1px solid var(--hair)',
            borderRadius: '8px',
            padding: '9px 11px',
          }}
        >
          <span style={{ color: 'var(--acc)', fontWeight: 800, fontSize: '11px' }}>◉</span>
          <div>
            <div
              style={{
                fontSize: '8px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '2px',
              }}
            >
              Vista previa atleta · modelo
            </div>
            <div className="num2" style={{ fontSize: '11.5px', color: 'var(--fg)' }}>
              Sentadilla trasera — 4×5 @ 75% RM · descanso 2&apos;
            </div>
          </div>
        </div>
      </DashboardMockup>

      <h3>2 · Cada modalidad mide y apunta distinto</h3>
      <ul className="clean">
        <li>
          <b>Correr</b> — se mide en <em className="em">distancia o tiempo</em>, contra{' '}
          <em className="em">ritmo, zona o RPE</em>. Ej.: <code>4×1000m @ 4:10/km · r2&apos;</code>.
        </li>
        <li>
          <b>Ergómetro</b> (remo · ski · bici) — <em className="em">distancia, tiempo o calorías</em>,
          contra <em className="em">ritmo /500m o RPE</em>. Ej.: <code>40&apos; @ Z2</code>.
        </li>
        <li>
          <b>Fuerza</b> — por serie: <em className="em">reps + carga (%máx, kg, RIR o RPE) + tempo +
          descanso</em>. Ej.: <code>5×5 @ 75% RM · descanso 2&apos;</code>.
        </li>
        <li>
          <b>Circuito / metcon</b> — eliges el <em className="em">formato</em> (Continuo,
          Intervalos, AMRAP, EMOM, For Time, Rondas) y los componentes, contra RPE, zona o cap.
        </li>
      </ul>

      <DocNote variant="cue" title="Vista previa atleta, en vivo">
        <ul>
          <li>
            Bajo los campos siempre ves la <span className="k">Vista previa atleta · modelo</span>:
            la línea exacta que leerá tu atleta. Lo que ves ahí es lo que aterriza en su móvil, sin
            sorpresas.
          </li>
          <li>
            Cuando el plan ya está asignado a un atleta, su perfil convierte lo relativo (un{' '}
            <span className="k">%máx</span> o una <span className="k">zona</span>) en cifras
            absolutas para él — los mismos campos, su carga concreta.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="La carga que pusiste, en su sesión"
        subtitle={
          <>
            Cada ejercicio llega como una línea atlética y exacta. La misma para fuerza, para correr
            o para el ergómetro — solo cambia qué se mide y contra qué objetivo.
          </>
        }
      >
        {/* PHONE 1: sesión de fuerza */}
        <PhoneMockup
          caption={
            <>
              <b>Fuerza.</b> Reps, carga, tempo y descanso por serie, condensados en una línea que
              no deja dudas.
            </>
          }
        >
          <div className="kick" style={{ marginTop: '6px' }}>
            Martes 13 ene
          </div>
          <div className="ph-title sm" style={{ margin: '2px 0 4px' }}>
            Fuerza · tren inferior
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Bloque · Fuerza principal
          </div>
          <ExCard mod={MOD.fuerza} name="Sentadilla trasera" line="4×5 @ 75% RM · descanso 2'" />
          <ExCard mod={MOD.fuerza} name="Peso muerto rumano" line="3×8 @ 65% RM · descanso 2'30''" />
          <ExCard
            mod={MOD.fuerza}
            name="Zancada con mancuernas"
            line="3×10 @ RPE 8 · descanso 90''"
            last
          />
        </PhoneMockup>

        {/* PHONE 2: sesión de carrera + ergo */}
        <PhoneMockup
          caption={
            <>
              <b>Correr y ergómetro.</b> El mismo formato, ahora con distancia o tiempo contra ritmo
              y zona.
            </>
          }
        >
          <div className="kick" style={{ marginTop: '6px' }}>
            Miércoles 14 ene
          </div>
          <div className="ph-title sm" style={{ margin: '2px 0 4px' }}>
            Series 6×800
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Bloque · Serie principal
          </div>
          <ExCard mod={MOD.carrera} name="Calentamiento" line="10' @ Z2" />
          <ExCard mod={MOD.carrera} name="Series" line="6×800m @ 3:20/km · r90''" />
          <ExCard mod={MOD.ergo} name="Remo regenerativo" line="2000m @ Z1" last />
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// ── Editor mockup: one labelled axis with segmented pills ────────────────────
function AxisRow({ label, opts }: { label: string; opts: { t: string; on?: boolean }[] }) {
  return (
    <div style={{ marginBottom: '11px' }}>
      <div
        style={{
          fontSize: '8.5px',
          fontWeight: 800,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <span key={o.t} style={pill(o.on)}>
            {o.t}
          </span>
        ))}
      </div>
    </div>
  );
}

function pill(on?: boolean): React.CSSProperties {
  return {
    fontSize: '10.5px',
    fontWeight: 700,
    padding: '5px 11px',
    borderRadius: '7px',
    border: '1px solid',
    borderColor: on ? 'var(--acc)' : 'var(--hair2)',
    background: on ? 'var(--acc)' : 'var(--elev)',
    color: on ? 'var(--accOn)' : 'var(--muted)',
  };
}

// ── Athlete phone: one exercise card (name + resolved load line) ─────────────
function ExCard({
  mod,
  name,
  line,
  last,
}: {
  mod: string;
  name: string;
  line: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '12px',
        padding: '11px 12px',
        marginBottom: last ? 0 : '8px',
      }}
    >
      <span className="mdot" style={{ background: mod, marginTop: '5px' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--fg)', marginBottom: '3px' }}>
          {name}
        </div>
        <div className="num" style={{ fontSize: '11px', color: 'var(--acc)' }}>
          {line}
        </div>
      </div>
    </div>
  );
}
