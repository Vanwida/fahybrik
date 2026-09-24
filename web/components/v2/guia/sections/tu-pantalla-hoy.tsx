// GUÍA · Hoy: quién te necesita — la bandeja que tiende a cero: «Afecta a
// varios» primero, luego Crítico y Vigilar (una fila por atleta, su peor señal),
// resolver / posponer / hecho con deshacer, y el teclado. El puente: cada cosa
// que el atleta vive en su inicio es, si se tuerce, una fila de Hoy.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Chips, InboxRow, Keys } from '../doc';
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
          El plan llega solo a cada atleta; aquí sube únicamente quien se sale de él, una fila por
          atleta con su señal más grave. Cada fila que resuelves desaparece: el objetivo del día es
          dejarla <b>a cero</b>.
        </>
      }
    >
      <PanelFigure
        caption={
          <>
            Arriba, cuántos te necesitan y cuántos ven su semana. Cada fila: la señal, <b>la prueba</b>{' '}
            (valor, su base, la ventana y la fecha) y la acción que toca.
          </>
        }
      >
        <Chips
          items={[
            { label: 'Todo', count: 12, active: true },
            { label: 'Por responder', count: 3 },
            { label: 'Sesiones', count: 4 },
            { label: 'Fisiología', count: 3 },
            { label: 'Plan', count: 1 },
            { label: 'Altas', count: 1 },
          ]}
        />
        <div className="flush overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
          <InboxRow
            name="Marc Vidal"
            level="N4"
            tone="danger"
            signal="Readiness 31"
            evidence="−24 vs su base · 3 días seguidos · hoy"
            action="Proponer descarga"
            age="2 h"
          />
          <InboxRow
            name="Laia Pons"
            level="N3"
            tone="warn"
            signal="2 de 4 debidas sin hacer"
            evidence="adherencia 7 d · última el lunes"
            action="Mensaje"
            age="1 d"
          />
        </div>
      </PanelFigure>

      <h3>Primero, lo que afecta a muchos</h3>
      <p>
        Si 30 atletas no tienen programa o 47 no ven su semana, no son 77 filas: es una fila en{' '}
        <b>Afecta a varios</b> con una acción para todos. <b>Publicar a los 47</b>,{' '}
        <b>Asignar a los 30…</b>, <b>Revisar en fila</b> las altas pendientes y, si tienes Negocio,{' '}
        <b>Recordar pagos</b> y <b>Ver leads</b>. <b>Ver quiénes</b> despliega los nombres antes de
        actuar.
      </p>

      <h3>Después, cada atleta: crítico y vigilar</h3>
      <ul className="clean">
        <li>
          <b>Crítico</b>: actúa hoy. Un readiness bajo tu suelo, entrenos debidos sin hacer, un pago
          vencido.
        </li>
        <li>
          <b>Vigilar</b>: mira esta semana. Una caída sostenida frente a su propia base, una semana
          muy dura, un mensaje esperando. A partir de diez se pliega; <b>Ver N más</b> lo abre.
        </li>
      </ul>
      <p>
        Un atleta sale una sola vez, con su peor señal; si tiene más, la fila lo dice («+1 señal»).
        Los chips filtran por tipo: <b>Por responder</b>, <b>Sesiones</b>, <b>Fisiología</b>,{' '}
        <b>Plan</b> y <b>Altas</b>. Pulsar la fila (o <b>Enter</b>) abre el <b>vistazo</b> del atleta
        a un lado, sin salir de la bandeja.
      </p>

      <h3>Resolver, posponer o marcar hecho</h3>
      <p>
        El botón de la fila hace lo que toca (<b>Responder</b>, <b>Publicar semana</b>,{' '}
        <b>Proponer descarga</b>, <b>Asignar programa</b>…). <b>Posponer</b> la esconde{' '}
        <b>hasta nueva señal</b> (si la cosa empeora, vuelve), <b>1 día</b> o <b>3 días</b>. El ✓ la
        marca hecha. Todo lleva <b>Deshacer</b>, y el pie (<b>Resuelto hoy · Pospuesto</b>) te deja
        reabrir o traer ya lo que apartaste. Con varias seleccionadas, la barra de abajo actúa sobre
        todas.
      </p>

      <PanelFigure caption={<>Con el teclado no tocas el ratón. <b>?</b> enseña esta lista en Hoy.</>}>
        <Keys
          items={[
            [['J', 'K'], 'Bajar y subir'],
            [['Enter'], 'Abrir el vistazo'],
            [['X'], 'Seleccionar'],
            [['E'], 'Hecho'],
            [['H'], 'Posponer hasta nueva señal'],
            [['R'], 'Responder'],
            [['⌘', 'Z'], 'Deshacer'],
            [['Esc'], 'Cerrar o quitar la selección'],
          ]}
        />
      </PanelFigure>

      <DocNote variant="log" title="Qué cuenta como señal lo decides tú">
        <p>
          Cuánto tiene que caer el readiness, cuántos días seguidos o cuántas horas puede esperar un
          mensaje son tu método: se cambian en <b>Ajustes › Método</b>, con el valor por defecto a la
          vista.
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
        Programar.
      </p>
    </DocSection>
  );
}
