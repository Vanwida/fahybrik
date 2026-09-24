// GUÍA · Cómo se estructura un plan — el mapa: Ejercicio › Bloque › Entreno ›
// Semana › Programa › Plan, y dónde se toca cada pieza en el panel. El puente: la
// misma estructura es la navegación del atleta (su semana y, dentro, el entreno).

import { DocSection, DocNote, MovilBand, PhoneMockup } from '../doc';
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
          Un plan no es una lista suelta de entrenos: son piezas que encajan unas dentro de otras.
          Saber qué es cada una es saber <em className="em">dónde escribes cada cosa</em>, y dónde la
          lee tu atleta.
        </>
      }
    >
      <h3>Cada pieza, en una frase</h3>
      <ul className="clean">
        <li>
          <b>Ejercicio</b>: un movimiento de tu catálogo (sentadilla, remo, wall ball…), con su vídeo
          y tus claves.
        </li>
        <li>
          <b>Bloque</b>: una parte con letra dentro de un entreno (A, B, C): un tipo de trabajo con
          sus ejercicios y su carga. «A · Sentadilla 5×5 @ 75 %», «B · 6×800 m a ritmo de 10 km».
        </li>
        <li>
          <b>Entreno</b>: lo que tu atleta hace en un hueco del día, con su título. Un día puede
          tener uno, dos (mañana y tarde) o ser descanso.
        </li>
        <li>
          <b>Semana</b>: siete días, con un foco que ve el atleta.
        </li>
        <li>
          <b>Programa</b>: varias semanas con un nombre. Ese nombre es lo que tu atleta lee como{' '}
          <em className="em">su fase</em>.
        </li>
        <li>
          <b>Plan</b>: los programas de un atleta (o de un grupo) puestos en fechas, uno detrás de
          otro, con sus carreras.
        </li>
      </ul>

      <h3>Dónde se toca cada una</h3>
      <ul className="clean">
        <li>
          <b>Programar › Programas</b>: montas un programa entero, todas sus semanas a la vista (ver{' '}
          <b>Monta un programa</b>).
        </li>
        <li>
          <b>Programar › Biblioteca</b>: entrenos, bloques y ejercicios que reutilizas.
        </li>
        <li>
          <b>Programar › Grupos</b>: el plan de un grupo, sus programas en orden.
        </li>
        <li>
          <b>La ficha del atleta</b>, pestaña Plan: su plan ya en fechas; aquí ajustas su semana
          concreta sin tocar el programa de los demás.
        </li>
      </ul>

      <DocNote variant="log" title="El programa es el molde; el plan, lo que recibe cada uno">
        <p>
          Cambiar un programa en Programar no reescribe lo que ya entrenó nadie. Cambiar un entreno
          en la ficha de un atleta solo le toca a él. Así puedes afinar a uno sin romper el molde de
          todos.
        </p>
      </DocNote>

      <MovilBand
        title="La misma estructura, en su teléfono"
        subtitle={
          <>
            A la izquierda, la <b>semana</b> como su pestaña Plan: siete días con su color de
            modalidad. A la derecha, al abrir un día, el <b>entreno</b> con sus bloques y sus
            ejercicios anidados.
          </>
        }
      >
        {/* PHONE 1: PLAN (la semana) */}
        <PhoneMockup
          caption={
            <>
              <b>Plan.</b> La semana entera de un vistazo. Cada día lleva el color de su modalidad y
              su título; un toque abre el entreno.
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
              <b>El entreno.</b> Al abrir un día, el entreno se despliega en sus bloques, y cada
              bloque lista sus ejercicios. Las mismas piezas que montaste.
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
