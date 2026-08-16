// GUÍA · 05 Tu metodología y tus fases — área "Tu biblioteca". BUILT.
// Real flow: Periodización es 100% dato del coach. Niveles (athlete_levels:
// código + etiqueta + descripción) = eje "quién". Una secuencia (nivel × días) es
// una lista ORDENADA de microciclos; el ORDEN es la periodización (no hay entidad
// "fase"). El NOMBRE del microciclo es la fase que ve el atleta. Sin catálogo
// hardcodeado, sin nombres impuestos. Doc kit en '../doc'; hues var(--v2-mod-*).

import {
  DocSection,
  QCWTriad,
  Principle,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
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
          Aquí no hay un método impuesto. La metodología es <b>tuya</b>: tú defines tus{' '}
          <b>niveles</b> de atleta y ordenas tus <b>microciclos</b> a lo largo del plan. Y el nombre
          que le pones a cada microciclo es la <b>fase</b> que tu atleta lee en su móvil.
        </>
      }
    >
      <Principle>
        <p>
          <b>Nosotros damos la palanca, tú pones el método.</b> Si entrenas por “Acumulación ·
          Transformación · Realización”, escribes eso. Si usas otro lenguaje, escribes el tuyo. No
          hay fases prefijadas ni jerga obligatoria.
        </p>
      </Principle>

      <QCWTriad
        que={
          <>
            Dos piezas tuyas: tus <b>niveles</b> (cómo agrupas a tus atletas) y tus{' '}
            <b>secuencias</b> (en qué orden encadenas los microciclos). El <b>orden</b> de los
            microciclos es tu periodización.
          </>
        }
        como={
          <>
            En <em className="em">Periodización</em> defines un nivel (código, etiqueta y el criterio
            que lo distingue) y, por nivel y días/semana, colocas los microciclos en orden. El nombre
            de cada uno será su fase.
          </>
        }
        porque={
          <>
            Porque cada entrenador periodiza distinto. En vez de encerrarte en un modelo, te damos el
            sitio donde escribir el tuyo — y que llegue intacto al atleta.
          </>
        }
      />

      <h3>1 · Tus niveles: cómo agrupas a tus atletas</h3>
      <p>
        Un <b>nivel</b> es tu forma de clasificar: un código corto (lo que se ve como etiqueta),
        un nombre legible y la descripción del criterio que lo distingue. Por ejemplo{' '}
        <code>N1 · Iniciación</code> o <code>Elite</code>. Son tuyos y editables — no conceptos del
        sistema. Cada atleta lleva un nivel, y el nivel decide qué secuencia recibe.
      </p>

      <h3>2 · Tus secuencias: el orden ES la periodización</h3>
      <p>
        Para cada nivel y cada cadencia (3, 4, 5 o 6 días/semana) ordenas tus microciclos uno tras
        otro. Ese <b>orden</b> es la periodización — no hay una entidad “fase” aparte. Cada microciclo
        dura las semanas que tú le des, y la suma es la duración del plan.
      </p>

      {/* Dashboard mockup: a periodization sequence (nivel × días → ordered microciclos) */}
      <DashboardMockup url="tu-panel / periodización / N2 · intermedio">
        <div className="wk-title" style={{ fontSize: '15px', marginBottom: '2px' }}>
          Secuencia · <small>N2 · Intermedio · 4 días/semana</small>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' }}>
          El orden de los microciclos es la periodización. Cada nombre es la fase que ve el atleta.
        </div>

        <SeqItem n={1} color={MOD.fuerza} name="Acumulación" weeks={5} />
        <SeqItem n={2} color={MOD.carrera} name="Transformación" weeks={4} />
        <SeqItem n={3} color={MOD.ergo} name="Realización" weeks={3} />

        {/* sparkline: segment width ∝ weeks */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '12px' }}>
          <span style={{ flex: 5, height: '6px', borderRadius: '99px', background: MOD.fuerza }} />
          <span style={{ flex: 4, height: '6px', borderRadius: '99px', background: MOD.carrera }} />
          <span style={{ flex: 3, height: '6px', borderRadius: '99px', background: MOD.ergo }} />
        </div>
        <div style={{ fontSize: '9px', color: 'var(--faint)', marginTop: '6px', fontFamily: 'var(--v2-font-mono)' }}>
          12 semanas en total · 3 microciclos
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Agnóstico de verdad">
        <p>
          El panel no impone ningún modelo: tus niveles, tus microciclos y tus nombres son datos
          tuyos. Cambia las palabras y cambian en todo — empezando por la pantalla de tu atleta.
        </p>
      </DocNote>

      <MovilBand
        title="Tu fase, en su teléfono"
        subtitle={
          <>
            El nombre que le diste al microciclo encabeza la semana del atleta como su <b>fase</b>.
            Lo que escribes en Periodización es exactamente lo que él lee.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su semana.</b> La fase es lo primero que ve: el nombre de tu microciclo, tal cual lo
              escribiste.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '6px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tu semana
            </div>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M8 6h12M8 12h12M8 18h12" />
              </svg>
            </div>
          </div>

          {/* Phase banner — the microciclo name */}
          <div
            style={{
              background: 'var(--accSoft)',
              border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc)' }}>
              Fase
            </div>
            <div className="ph-title sm" style={{ margin: '2px 0 0' }}>
              Acumulación
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Semana 2 de 5
            </div>
          </div>

          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Base aeróbica</span>
          </div>

          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Tirada larga Z2</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Remo Z2</span>
            <span className="stg pend">›</span>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// One ordered microciclo slot in the sequence mock.
function SeqItem({ n, color, name, weeks }: { n: number; color: string; name: string; weeks: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderLeft: `3px solid ${color}`,
        borderRadius: '10px',
        padding: '10px 12px',
        marginBottom: '7px',
      }}
    >
      <span
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 800,
          fontFamily: 'var(--v2-font-mono)',
          background: 'var(--elev)',
          color: 'var(--muted)',
        }}
      >
        {n}
      </span>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>{name}</span>
      <span style={{ fontSize: '10.5px', color: 'var(--faint)', fontFamily: 'var(--v2-font-mono)' }}>
        {weeks} sem
      </span>
    </div>
  );
}
