// GUÍA · 11 Cuestionario inicial y tests — área "Asignar y empezar". BUILT.
// Real flow: el atleta responde el onboarding (AthleteAnswers: objetivos, estado
// basal, experiencia, lesiones, disponibilidad, benchmarks…) → cae en la cola de
// Altas → el coach lo lee en la revisión de intake y decide los tests de la semana 1
// (BaselineTestsStep: pasivos·automáticos / programados·los agendas tú). Strings reales.

import {
  DocSection,
  QCWTriad,
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
          Antes de montarle nada, sabes quién es tu atleta. Él responde un <b>cuestionario</b> al
          entrar (objetivo, experiencia, lesiones, días disponibles, marcas) y eso te llega ordenado
          a tu cola de <b>altas</b>. Tú lo lees y decides los <b>tests</b> de la primera semana. El
          plan se construye sobre datos, no sobre suposiciones.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Todo lo que tu atleta declaró al entrar: <b>objetivos</b>, estado basal (sueño, estrés,
            compromiso), experiencia, <b>lesiones</b>, disponibilidad, marcas e instalación. Y los{' '}
            <b>tests de la semana 1</b> que tú eliges para tomarle el pulso real.
          </>
        }
        como={
          <>
            Su cuestionario aparece en <code>Altas</code> como un alta sin revisar. La abres: a la
            derecha, <b>sus respuestas</b>; a la izquierda, tus decisiones. Marcas qué tests entran en
            la primera semana.
          </>
        }
        porque={
          <>
            Porque un buen plan empieza por escuchar. Su objetivo, sus lesiones y sus días reales son
            lo que hace que la primera semana le encaje, y los tests te dan el punto de partida medido.
          </>
        }
      />

      <h3>1 · El atleta responde, tú recibes ordenado</h3>
      <p>
        Nada más entrar, tu atleta rellena el cuestionario en su móvil. Cuando termina, su alta cae en
        tu cola <code>Altas</code> marcada como <em className="em">sin revisar</em>. No tienes que
        perseguir nada: lo abres cuando puedas y tienes toda su foto en una pantalla.
      </p>

      <h3>2 · Sus respuestas, en una columna que se lee de un vistazo</h3>
      <p>
        En la revisión, la columna derecha (<code>Respuestas del atleta</code>) agrupa lo que
        declaró: <b>Objetivos</b> (y si es alcanzable en 2-4 meses), <b>Estado basal</b> (sueño /
        estrés / compromiso sobre 10), <b>Experiencia</b> en carrera y fuerza, <b>Lesiones</b> con su
        zona y severidad, <b>Disponibilidad</b> (días y franja), <b>Benchmarks</b>, instalación y
        dispositivos. Cada decisión que tomas a la izquierda se apoya en esta evidencia.
      </p>

      <h3>3 · Los tests de la semana 1 los eliges tú</h3>
      <p>
        Para empezar con números reales, la primera semana puede incluir tests. Hay dos tipos:{' '}
        <span className="k">pasivos · automáticos</span> (se calculan solos a partir de lo que entrena)
        y <span className="k">programados · los agendas tú</span> (una sesión de test que pones en su
        semana). Tú marcas cuáles entran con un toque; solo los seleccionados llegan a su plan.
      </p>

      {/* Dashboard mockup: revisión de intake — respuestas + tests semana 1 */}
      <DashboardMockup url="tu-panel / altas / marta · intake">
        <div className="ath-hd">
          <div className="av">M</div>
          <div className="nm">
            Marta Ruiz<small>esperando 2 días · sin revisar</small>
          </div>
        </div>
        <div className="wk-sum">
          <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Respuestas del atleta</span>
          <span className="chip">Objetivo: mejorar marca</span>
          <span className="chip">3 días/sem</span>
          <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            Rodilla · leve
          </span>
        </div>
        <table className="sesstbl">
          <tbody>
            <tr>
              <th>Tests de la semana 1</th>
              <th>Tipo</th>
              <th>Entra</th>
            </tr>
            <tr>
              <td>Umbral de carrera</td>
              <td className="n">Programado</td>
              <td>
                <span className="sp done">● Sí</span>
              </td>
            </tr>
            <tr>
              <td>Ritmo medio · zonas</td>
              <td className="n">Automático</td>
              <td>
                <span className="sp done">● Sí</span>
              </td>
            </tr>
            <tr>
              <td>Fuerza máxima · sentadilla</td>
              <td className="n">Programado</td>
              <td>
                <span className="sp pend">○ No</span>
              </td>
            </tr>
          </tbody>
        </table>
      </DashboardMockup>

      <DocNote variant="log" title="Pasivos vs programados">
        <ul>
          <li>
            <span className="k">Pasivos</span>: no le cuestan una sesión, salen de lo que ya entrena
            (ritmos, zonas). Déjalos activados y se calculan solos.
          </li>
          <li>
            <span className="k">Programados</span>: son una sesión de test de verdad. Si lo añades,
            tu atleta lo verá como un entreno más de su primera semana.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Lo que respondió, lo que va a probar"
        subtitle={
          <>
            A la izquierda, el cuestionario tal y como tu atleta lo rellena en su móvil. A la derecha,
            un <b>test programado</b> que elegiste: aparece en su semana 1 como una sesión más, con su
            color de modalidad.
          </>
        }
      >
        {/* PHONE 1: cuestionario */}
        <PhoneMockup
          caption={
            <>
              <b>Cuestionario.</b> Objetivo, experiencia, lesiones, días y marcas. Esto es lo que tú
              lees en la columna de respuestas.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </div>
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Cuéntanos de ti
            </div>
            <div className="num" style={{ fontSize: '11px', color: 'var(--muted)' }}>
              3 / 6
            </div>
          </div>
          <div className="logcard">
            <div className="lh">¿Cuál es tu objetivo?</div>
            <div className="day today" style={{ marginTop: '2px' }}>
              <span className="mdot" style={{ background: 'var(--acc)' }} />
              <span className="dt">Mejorar mi marca de HYROX</span>
              <span className="stg done">✓</span>
            </div>
            <div className="day">
              <span className="mdot" style={{ background: 'var(--faint)' }} />
              <span className="dt rest">Primer HYROX</span>
            </div>
            <div className="day">
              <span className="mdot" style={{ background: 'var(--faint)' }} />
              <span className="dt rest">Completar y disfrutar</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">¿Cómo duermes? · del 1 al 10</div>
            <div className="rpe">
              <span className="r">4</span>
              <span className="r">5</span>
              <span className="r">6</span>
              <span className="r sel">7</span>
              <span className="r">8</span>
              <span className="r">9</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Días que puedes entrenar</div>
            <div className="legend-mini" style={{ marginTop: '2px' }}>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />L
              </span>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />X
              </span>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />V
              </span>
              <span>
                <span className="d" style={{ background: 'var(--faint)' }} />M J S D
              </span>
            </div>
          </div>
          <div className="cta">Siguiente</div>
        </PhoneMockup>

        {/* PHONE 2: test en la semana 1 */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 1.</b> El test que programaste aparece como una sesión más, marcada para que
              tu atleta sepa que esa va de medir.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Semana 1 · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Tomar referencias</span>
          </div>
          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">
              Test · umbral de carrera <span className="slotmini">TEST</span>
            </span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">VIE</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">DOM</span>
            <span className="mdot" style={{ background: 'var(--faint)' }} />
            <span className="dt rest">Descanso</span>
          </div>
          <div className="prog">
            <span className="l">De qué va esta semana</span>
            <div className="cap" style={{ marginTop: '4px' }}>
              Medimos tu punto de partida para ajustar ritmos y cargas.
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
