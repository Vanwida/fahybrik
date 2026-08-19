// GUÍA · 06 Cómo se estructura un plan — área "El plan". The conceptual map of
// the whole plan: the six nested levels (Fase › Semana › Día › Sesión › Bloque ›
// Ejercicio) and how that same nesting becomes the athlete's navigation. The two
// sections that follow (07 monta la semana, 08 carga e intensidad) detail the
// doing; this one gives the shape.

import { DocSection, QCWTriad, DocFlow, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

// Canonical modality hues from the live v2 tokens (never drift from the app).
const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
  calent: 'var(--v2-mod-calentamiento)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Un plan no es una lista suelta de entrenos: es una estructura que <b>anida</b>. Una fase
          contiene semanas, una semana contiene días, un día contiene una o dos sesiones, y cada
          sesión se monta con bloques de trabajo y ejercicios de tu catálogo. Entender esta
          anidación es saber <em className="em">dónde escribes cada cosa</em>, y dónde la lee tu
          atleta.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Seis niveles que encajan uno dentro de otro:{' '}
            <b>Fase › Semana › Día › Sesión › Bloque › Ejercicio</b>. Cada uno vive dentro del
            anterior, y cada uno tiene un sentido claro.
          </>
        }
        como={
          <>
            Casi siempre trabajas en la <b>semana</b>, que es el lienzo del editor: nombras la fase,
            abres un día, añades sesiones y, dentro, bloques y ejercicios con su carga.
          </>
        }
        porque={
          <>
            Porque así un plan largo se construye con piezas pequeñas y reutilizables, no con un
            Excel infinito. Y porque esa misma estructura es la que tu atleta navega en su móvil.
          </>
        }
      />

      <DocFlow
        steps={[
          { label: 'Fase' },
          { label: 'Semana' },
          { label: 'Día' },
          { label: 'Sesión' },
          { label: 'Bloque' },
          { label: 'Ejercicio' },
        ]}
      />

      <h3>1 · Cada nivel, en una frase</h3>
      <ul className="clean">
        <li>
          <b>Fase</b>: el tramo del plan con una intención (por ejemplo «Acumulación»). Su nombre es
          lo que tu atleta ve arriba como <em className="em">su fase</em>.
        </li>
        <li>
          <b>Semana</b>: la unidad que montas y entregas. Tiene un foco y siete días.
        </li>
        <li>
          <b>Día</b>: uno de los siete. Puede tener una o dos sesiones (mañana / tarde), o ser
          descanso.
        </li>
        <li>
          <b>Sesión</b>: el entreno de ese momento, con su título.
        </li>
        <li>
          <b>Bloque</b>: un tipo de trabajo dentro de la sesión: carrera, fuerza, circuito, test,
          activación…
        </li>
        <li>
          <b>Ejercicio</b>: la pieza concreta de tu catálogo, con su carga e intensidad.
        </li>
      </ul>

      <h3>2 · Dónde montas cada nivel</h3>
      <p>
        La semana es tu mesa de trabajo. La <b>fase</b> se nombra al abrir el microciclo; el{' '}
        <b>foco</b> y los días, en la propia semana; los <b>bloques</b> y <b>ejercicios</b>, dentro
        de cada sesión. No saltas entre pantallas: ves la semana entera y editas el día sin perder
        el contexto. Las dos secciones siguientes entran al detalle:{' '}
        <em className="em">montar la semana</em> y <em className="em">la carga de cada ejercicio</em>.
      </p>

      <DocNote variant="log" title="La misma estructura, los dos lados">
        <p>
          Lo que anidas en el panel se convierte en la navegación de tu atleta: la <b>fase</b>{' '}
          encabeza su Inicio, la <b>semana</b> es su pestaña Plan, y cada <b>día</b> abre su sesión
          con sus bloques y ejercicios. Una sola estructura, vista desde los dos lados.
        </p>
      </DocNote>

      <MovilBand
        title="La misma estructura, en su teléfono"
        subtitle={
          <>
            A la izquierda, la <b>semana</b> como su pestaña Plan: siete días con su color de
            modalidad. A la derecha, al abrir un día, la <b>sesión</b> con sus bloques y sus
            ejercicios anidados.
          </>
        }
      >
        {/* PHONE 1: PLAN (la semana) */}
        <PhoneMockup
          caption={
            <>
              <b>Plan.</b> La semana entera de un vistazo. Cada día lleva el color de su modalidad y
              su título; un toque abre la sesión.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            12–18 ene · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FASE</span>
            <span className="v">Acumulación · base aeróbica</span>
          </div>
          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">
              Tirada larga Z2 <span className="slotmini">AM</span>
            </span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Series 6×800</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">JUE</span>
            <span className="mdot" style={{ background: 'var(--faint)' }} />
            <span className="dt rest">Descanso</span>
          </div>
          <div className="day">
            <span className="dl">VIE</span>
            <span className="mdot" style={{ background: MOD.circuito }} />
            <span className="dt">Simulación HYROX</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">SÁB</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
        </PhoneMockup>

        {/* PHONE 2: SESIÓN (bloques + ejercicios anidados) */}
        <PhoneMockup
          caption={
            <>
              <b>Sesión.</b> Al abrir un día, la sesión se despliega en sus bloques, y cada bloque
              lista sus ejercicios. La misma anidación que montaste.
            </>
          }
        >
          <div className="kick" style={{ marginTop: '6px' }}>
            Martes 13 ene · Mañana
          </div>
          <div className="ph-title sm" style={{ margin: '2px 0 4px' }}>
            Fuerza · tren inferior
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            2 bloques · 4 ejercicios
          </div>

          <div className="logcard">
            <div className="lh" style={{ color: MOD.calent }}>
              Bloque 1 · Activación
            </div>
            <div style={exRow}>
              <span style={exName}>Movilidad de cadera</span>
              <span className="num" style={exLine}>
                2×8
              </span>
            </div>
            <div style={{ ...exRow, marginBottom: 0 }}>
              <span style={exName}>Sentadilla goblet</span>
              <span className="num" style={exLine}>
                2×10
              </span>
            </div>
          </div>

          <div className="logcard" style={{ marginBottom: 0 }}>
            <div className="lh" style={{ color: MOD.fuerza }}>
              Bloque 2 · Fuerza principal
            </div>
            <div style={exRow}>
              <span style={exName}>Sentadilla trasera</span>
              <span className="num" style={exLine}>
                4×5 · 75%
              </span>
            </div>
            <div style={{ ...exRow, marginBottom: 0 }}>
              <span style={exName}>Peso muerto rumano</span>
              <span className="num" style={exLine}>
                3×8 · 65%
              </span>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// Compact exercise-row styles (shared by the two blocks in the session phone).
const exRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '10px',
  padding: '6px 0',
  borderTop: '1px solid var(--hair)',
  marginBottom: '0',
};
const exName: React.CSSProperties = { fontSize: '12.5px', color: 'var(--fg)' };
const exLine: React.CSSProperties = { fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' };
