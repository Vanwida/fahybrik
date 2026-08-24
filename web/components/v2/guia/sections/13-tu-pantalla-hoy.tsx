// GUÍA · 13 Tu pantalla Hoy — área "El día a día". La pantalla de operar: la cola
// de decisiones del día. Cuatro colas + las tiras que suben solas + la bandeja
// vacía como buena señal. El puente: cada cosa que tu atleta vive en su inicio es,
// si se tuerce, una de tus colas de Hoy.

import {
  DocSection,
  QCWTriad,
  DocFlow,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Canonical hues — never drift from the live app tokens.
const LANE = {
  fallo: 'var(--v2-mod-carrera)', // coral-red
  listo: 'var(--v2-ok)',
  vigilar: 'var(--v2-warn)',
  espera: 'var(--v2-info)',
} as const;

/** Small leading dot for a lane header. */
function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '99px',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

const laneBox = { marginTop: 0, maxWidth: 'none' } as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Hoy no es una lista de tareas: es tu <b>cola de decisiones del día</b>. El sistema entrega
          el plan a cada atleta solo, siguiendo tu método. A esta pantalla solo sube lo que se{' '}
          <b>sale del molde</b>: quien falló, quien va sobrado, quien manda una señal o un mensaje.
          Lo demás no te molesta: va según lo previsto.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'El sistema entrega el plan' },
          { label: 'Tu atleta entrena y vive su día', app: true },
          { label: 'Solo sube lo que se sale del molde', app: true },
          { label: 'Tú decides: aceptar o ajustar' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Una pantalla con <b>cuatro colas</b> y, encima, las decisiones que el sistema te propone.
            Arriba, tres números: cuántos atletas tienes, cuántos requieren atención y cuántos
            esperan respuesta.
          </>
        }
        como={
          <>
            La lees de un vistazo y actúas en el sitio: <b>Ver</b> la ficha, <b>Responder</b> un
            mensaje, <b>aceptar</b> una propuesta. Buscas a un atleta por nombre y se filtran todas
            las colas a la vez.
          </>
        }
        porque={
          <>
            Porque con muchos atletas no puedes mirarlos uno a uno cada mañana. Hoy te enseña{' '}
            <b>solo lo que necesita tu cabeza</b>, y deja en paz a quien va bien.
          </>
        }
      />

      <h3>1 · Las cuatro colas</h3>
      <p>
        Cada atleta cae como mucho en una de las tres colas de seguimiento (gana la más urgente), y
        los mensajes van por su cuenta:
      </p>
      <ul>
        <li>
          <b style={{ color: LANE.fallo }}>Falló sesiones</b>: adherencia baja o días sin completar
          nada. A quién empujar.
        </li>
        <li>
          <b style={{ color: LANE.listo }}>Listo para progresar</b>: semana limpia y constante, sin
          incidencias. A quién subir carga.
        </li>
        <li>
          <b style={{ color: LANE.vigilar }}>Vigilar fisiología</b>: readiness en rojo o una señal
          de fatiga. A quién dar margen.
        </li>
        <li>
          <b style={{ color: LANE.espera }}>Espera respuesta</b>: te escribió y sigue esperando. El
          más antiguo, primero.
        </li>
      </ul>

      <h3>2 · Lo que el sistema te propone (y tú firmas)</h3>
      <p>
        Sobre las colas aparecen <b>tiras de decisión</b>: un atleta nuevo con su{' '}
        <b>nivel sugerido</b> a confirmar, una <b>asignación sugerida</b> lista para arrancar con un
        clic, el <b>siguiente ciclo</b> de quien acaba de terminar el suyo, una propuesta de{' '}
        <b>ajuste de la semana</b>, o una <b>revisión 1:1</b> que ya toca por cadencia. El sistema
        hace el trabajo; tú solo aceptas o ajustas. Nada se aplica a tus espaldas.
      </p>

      <DocNote variant="log" title="Bandeja vacía = buena señal">
        <p>
          Si Hoy está vacía, no está rota: significa que <b>todos siguen su plan</b> y nada se ha
          salido del molde. Es la única pantalla del panel donde “sin nada que hacer” es exactamente
          lo que quieres ver.
        </p>
      </DocNote>

      {/* Dashboard mockup: la pantalla Hoy — barra + tira de decisión + 4 colas */}
      <DashboardMockup url="tu-panel / hoy">
        <div className="wk-head">
          <div className="wk-title">
            Hoy&nbsp; <small>jueves 19 jun</small>
          </div>
        </div>
        <div className="wk-sum">
          <span className="chip" style={{ color: 'var(--muted)' }}>
            24 atletas
          </span>
          <span className="chip" style={{ color: 'var(--dng)', borderColor: 'var(--dng)' }}>
            3 requieren atención
          </span>
          <span className="chip" style={{ color: LANE.espera, borderColor: LANE.espera }}>
            2 sin respuesta
          </span>
        </div>

        {/* Tira de decisión: el sistema propone */}
        <div className="lane" style={{ ...laneBox, marginBottom: '6px' }}>
          <div className="lh" style={{ color: LANE.listo }}>
            <Dot color={LANE.listo} /> Asignación sugerida
          </div>
          <div className="ac">
            <div className="av">N</div>
            <div className="nm">
              Nora&nbsp;<small style={{ color: 'var(--faint)', fontWeight: 600 }}>N2 · 4 días</small>
            </div>
            <div className="rs" style={{ color: LANE.listo }}>
              Empezar «Acumulación» ›
            </div>
          </div>
        </div>

        {/* Tablero · 4 colas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <div className="lane" style={laneBox}>
            <div className="lh" style={{ color: LANE.fallo }}>
              <Dot color={LANE.fallo} /> Falló sesiones
            </div>
            <div className="ac">
              <div className="av">M</div>
              <div className="nm">Marc</div>
              <div className="rs" style={{ color: LANE.fallo }}>
                67%
              </div>
            </div>
          </div>

          <div className="lane" style={laneBox}>
            <div className="lh" style={{ color: LANE.listo }}>
              <Dot color={LANE.listo} /> Listo para progresar
            </div>
            <div className="ac">
              <div className="av">J</div>
              <div className="nm">Júlia</div>
              <div className="rs" style={{ color: LANE.listo }}>
                94%
              </div>
            </div>
          </div>

          <div className="lane" style={laneBox}>
            <div className="lh" style={{ color: LANE.vigilar }}>
              <Dot color={LANE.vigilar} /> Vigilar fisiología
            </div>
            <div className="ac">
              <div className="av">L</div>
              <div className="nm">Leo</div>
              <div className="rs" style={{ color: LANE.vigilar }}>
                RDN 48
              </div>
            </div>
          </div>

          <div className="lane" style={laneBox}>
            <div className="lh" style={{ color: LANE.espera }}>
              <Dot color={LANE.espera} /> Espera respuesta
            </div>
            <div className="ac">
              <div className="av">O</div>
              <div className="nm">Ona</div>
              <div className="rs" style={{ color: LANE.espera }}>
                hace 3 h
              </div>
            </div>
          </div>
        </div>
      </DashboardMockup>

      <MovilBand
        title="Así lo ve tu atleta en el móvil"
        subtitle={
          <>
            Tu atleta no ve “colas”: ve su día normal. Pero cada pieza de su inicio es, si se tuerce,
            una de tus colas de Hoy. Por eso no tienes que perseguir a nadie: su día te habla solo.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su inicio.</b> La <b>sesión de hoy</b> → si no la marca, cae en <b>Falló sesiones</b>
              . El <b>readiness</b> → si baja, en <b>Vigilar fisiología</b>. Su <b>mensaje</b> → en{' '}
              <b>Espera respuesta</b>. Y una racha de semanas al verde lo asoma a{' '}
              <b>Listo para progresar</b>.
            </>
          }
        >
          <div className="ph-hd">
            <div className="ico-btn">
              <span className="dot" />
              <svg viewBox="0 0 24 24">
                <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 21h4" />
              </svg>
            </div>
            <div className="ph-mark">FAHYBRID</div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Jueves 19 jun</div>
          <div className="ph-title">Hola, Marc</div>
          <div className="focus-line">
            <span className="scope">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </span>
            <span className="ph">Acumulación</span>
            <span className="fo">· Foco: base aeróbica</span>
          </div>

          {/* Hero → Falló sesiones */}
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">Carrera · sesión de hoy</span>
            </div>
            <div className="ht">Series 6×800</div>
            <div className="meta num">Mañana · ≈ 48 min · 3 bloques</div>
            <div className="cta">▶ Empezar</div>
          </div>

          {/* Tiles → Vigilar fisiología / Listo para progresar */}
          <div className="tiles">
            <div className="tile">
              <span className="lbl">Readiness</span>
              <div className="big num">
                48<small> /100</small>
              </div>
              <div className="read" style={{ color: 'var(--warn)' }}>
                Fatiga: baja el ritmo
              </div>
            </div>
            <div className="tile">
              <span className="lbl">Constancia</span>
              <div className="big num">
                94<small> %</small>
              </div>
              <div className="read" style={{ color: 'var(--ok)' }}>
                4 semanas al verde
              </div>
            </div>
          </div>

          {/* Coach message → Espera respuesta */}
          <div className="row-card">
            <div className="ca">M</div>
            <div className="tx">
              <div className="e">Marc · hace 3 h</div>
              <div className="m">¿Cambio la sesión del viernes? Tengo viaje</div>
            </div>
            <div className="chev">›</div>
          </div>

          <div className="tabbar">
            <div className="tab on">
              <div className="pill">
                <svg viewBox="0 0 24 24">
                  <path d="M3 11l9-8 9 8" />
                  <path d="M5 10v10h14V10" />
                </svg>
              </div>
              <span className="tl">Inicio</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M8 6h12M8 12h12M8 18h12" />
              </svg>
              <span className="tl">Plan</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
              </svg>
              <span className="tl">Carreras</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M4 5h16v11H8l-4 4z" />
              </svg>
              <span className="tl">Chat</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              <span className="tl">Perfil</span>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        Hoy es donde <b>vigilas, no donde montas</b>. Cuando un atleta sube a una cola, un clic te
        lleva a su ficha o a su chat para resolverlo. El resto del seguimiento{' '}
        (<em className="em">cómo</em> lee cada señal) lo ves en las secciones siguientes.
      </p>
    </DocSection>
  );
}
