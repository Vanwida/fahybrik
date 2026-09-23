// GUÍA · 13 Hoy: quién te necesita — área «El día a día». La casa del panel:
// una bandeja que tiende a cero, una fila por atleta (su peor señal), con
// resolver / posponer / hecho y teclado. El puente con la app: cada cosa que el
// atleta vive en su inicio es, si se tuerce, una fila de Hoy.

import { DocSection, QCWTriad, DocFlow, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Hoy es la primera pantalla al entrar y responde una sola pregunta: <b>quién te necesita</b>.
          El plan llega solo a cada atleta; aquí sube únicamente quien se sale de él. Cada fila que
          resuelves desaparece. El objetivo del día es dejarla <b>a cero</b>.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'El plan llega solo' },
          { label: 'Tu atleta entrena, hace check-in, te escribe', app: true },
          { label: 'Sube a Hoy solo lo que se sale', app: true },
          { label: 'Resuelves, pospones o marcas hecho' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Una bandeja con <b>una fila por atleta</b>: su señal más grave, con la prueba (valor, su
            base, la ventana y la fecha) y la acción que toca. Arriba, los asuntos que afectan a
            muchos a la vez.
          </>
        }
        como={
          <>
            Actúas en la fila: <b>Responder</b>, <b>Publicar semana</b>, <b>Proponer descarga</b>…
            o la <b>pospones</b> 1 día, 3 días o hasta que haya una señal nueva. <b>J/K</b> para
            moverte, <b>E</b> hecho, <b>H</b> posponer, <b>R</b> responder, <b>Intro</b> abre su
            vistazo.
          </>
        }
        porque={
          <>
            Con cien atletas no puedes mirarlos uno a uno cada mañana. Hoy te enseña solo lo que
            necesita tu cabeza y deja en paz a quien va bien.
          </>
        }
      />

      <h3>1 · Primero, lo que afecta a muchos</h3>
      <p>
        Si 30 atletas no tienen programa o 47 no ven su semana, no son 77 filas: es una fila con una
        acción para todos. <b>Publicar a los 47</b>, <b>Asignar a los 30</b>, <b>Revisar altas
        pendientes</b>, <b>Recordar pagos</b> (si tienes Negocio). Lo resuelves de una vez.
      </p>

      <h3>2 · Después, cada atleta: crítico y vigilar</h3>
      <ul>
        <li>
          <b>Crítico</b>: actúa hoy. Readiness bajo tu suelo, entrenos debidos sin hacer, un pago
          vencido.
        </li>
        <li>
          <b>Vigilar</b>: mira esta semana. Una caída sostenida frente a su propia base, una semana
          muy dura, un mensaje esperando. Se pliega a partir de diez.
        </li>
      </ul>
      <p>
        Un atleta sale una sola vez, con su peor señal; si tiene más, la fila lo dice («+2»). Los
        chips de arriba filtran por tipo: <b>Por responder</b>, <b>Entrenos</b>, <b>Fisiología</b>,{' '}
        <b>Plan</b>, <b>Altas</b>.
      </p>

      <DocNote variant="log" title="Qué cuenta como señal lo decides tú">
        <p>
          Cuánto tiene que caer el readiness, cuántos días seguidos o cuántas horas esperar a un
          mensaje son tu método: se cambian en <b>Ajustes › Método</b>, con los valores por defecto a
          la vista.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Bandeja vacía = buena señal">
        <p>
          «Todo al día» no es que falte algo: todos siguen su plan. Es la única pantalla donde no
          tener nada que hacer es exactamente lo que quieres ver.
        </p>
      </DocNote>

      <MovilBand
        title="Así lo ve tu atleta en el móvil"
        subtitle={
          <>
            Tu atleta no ve señales: ve su día normal. Pero cada pieza de su inicio es, si se tuerce,
            una fila de tu Hoy. Por eso no tienes que perseguir a nadie: su día te habla solo.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su inicio.</b> El <b>entreno de hoy</b> → si se le acumulan sin hacer, sube a Hoy. El{' '}
              <b>readiness</b> → si cae frente a su base varios días. Su <b>mensaje</b> → como{' '}
              <b>Por responder</b>.
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
            <div className="ph-mark"><ClubMark /></div>
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
        Hoy es donde <b>decides, no donde montas</b>: el plan se cambia en la ficha del atleta o en
        Programar. Cómo se lee cada señal lo ves en las secciones siguientes.
      </p>
    </DocSection>
  );
}
