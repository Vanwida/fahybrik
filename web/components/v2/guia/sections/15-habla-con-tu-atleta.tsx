// GUÍA · 15 Habla con tu atleta — área "El día a día". El chat directo coach↔atleta:
// la pantalla Mensajes (lista + conversación + contexto), respuestas por texto y
// notas de voz del atleta. El puente: lo que escribes en el panel aparece en su
// pestaña Chat; lo que graba con el móvil te llega a la conversación.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// ── Inline bubble styles (no chat classes in guia.css — compose with v2 tokens,
//    which resolve inside both the dark window and the dark phone frames). ──────
const bubbleBase = {
  maxWidth: '78%',
  padding: '7px 11px',
  fontSize: '11.5px',
  lineHeight: 1.45,
  borderRadius: '13px',
} as const;

const coachBubble = {
  ...bubbleBase,
  alignSelf: 'flex-end',
  background: 'var(--v2-accent-soft)',
  color: 'var(--v2-fg)',
  borderBottomRightRadius: '4px',
} as const;

const athleteBubble = {
  ...bubbleBase,
  alignSelf: 'flex-start',
  background: 'var(--v2-surface-2)',
  color: 'var(--v2-fg)',
  borderBottomLeftRadius: '4px',
} as const;

const voiceChip = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 11px',
  borderRadius: '13px',
  border: '1px dashed var(--v2-border-strong)',
  background: 'var(--v2-surface-2)',
  color: 'var(--v2-fg)',
  fontSize: '11px',
  fontWeight: 600,
} as const;

const dayPill = {
  alignSelf: 'center',
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--v2-muted)',
  background: 'var(--v2-surface-2)',
  padding: '2px 9px',
  borderRadius: '99px',
} as const;

const timeStamp = {
  fontSize: '8.5px',
  color: 'var(--v2-faint)',
  fontFamily: 'var(--v2-font-mono)',
} as const;

/** A tiny static "waveform" for the voice-note chip. */
function Wave() {
  const bars = [6, 11, 8, 14, 9, 13, 7, 10, 6];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', height: '14px' }}>
      {bars.map((h, i) => (
        <span
          key={i}
          style={{ width: '2px', height: `${h}px`, borderRadius: '2px', background: 'var(--v2-accent)' }}
        />
      ))}
    </span>
  );
}

function Mic({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          El chat vive <b>dentro de la app</b>, no en WhatsApp. Tú respondes desde el panel con todo
          el contexto del atleta delante; tu atleta te escribe (o te manda una <b>nota de voz</b>)
          desde su móvil. Misma conversación en los dos lados, sin mezclarla con tu vida personal.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una pantalla <b>Mensajes</b> con tres zonas: la lista de conversaciones, la conversación
            abierta y el <b>contexto</b> del atleta (su nivel, su fase). Una conversación por atleta.
          </>
        }
        como={
          <>
            Filtras por <em className="em">Sin leer</em>, abres una conversación y respondes por
            texto (<b>Enter</b> envía). Tu atleta puede contestar con texto o con una{' '}
            <b>nota de voz</b> grabada desde la app.
          </>
        }
        porque={
          <>
            Porque la conversación pegada al entreno vale más que un WhatsApp perdido. Ves su nivel y
            su fase mientras le escribes, y todo queda ligado a su ficha, no a tu teléfono.
          </>
        }
      />

      <h3>1 · La pantalla Mensajes</h3>
      <p>
        A la izquierda, tus <b>Conversaciones</b> con un filtro <em className="em">Sin leer · Todas</em>
        ; las no leídas suben arriba. En el centro, la conversación: tus mensajes a la{' '}
        <b>derecha</b>, los de tu atleta a la <b>izquierda</b>, con separadores de día (<em className="em">
        Hoy</em>, <em className="em">Ayer</em>…). A la derecha del todo, una columna de{' '}
        <b>contexto</b> con el nivel y la fase del atleta y un acceso a <b>Ver perfil</b>.
      </p>

      <h3>2 · Respondes en el sitio, sin perder el hilo</h3>
      <p>
        Escribes en <code>Escribe una respuesta…</code> y pulsas <b>Enviar</b> (o Enter; Shift+Enter
        hace salto de línea). El mensaje aparece al momento mientras se envía, y la conversación se
        marca como leída al abrirla. La cabecera te recuerda con quién hablas: su nombre, su nivel y
        su fase actual.
      </p>

      <DocNote variant="log" title="Texto tú, voz tu atleta">
        <p>
          Desde el panel respondes por <b>texto</b>, limpio y rápido. Tu atleta, en cambio, puede
          mandarte una <b>nota de voz</b> desde el móvil cuando explicar algo a dedo es más fácil
          (una molestia, cómo se sintió en una serie). Llega a la conversación como un mensaje de voz
          más.
        </p>
      </DocNote>

      {/* Dashboard mockup: pantalla Mensajes — lista + conversación */}
      <DashboardMockup url="tu-panel / mensajes / marc">
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', minHeight: '260px' }}>
          {/* Lista de conversaciones */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--fg)',
                marginBottom: '8px',
              }}
            >
              Conversaciones
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <span className="chip" style={{ color: 'var(--acc)', borderColor: 'var(--acc)' }}>
                Sin leer · 2
              </span>
              <span className="chip" style={{ color: 'var(--muted)' }}>
                Todas
              </span>
            </div>
            <div className="ac" style={{ borderColor: 'var(--acc)', marginBottom: '6px' }}>
              <div className="av">M</div>
              <div className="nm">Marc</div>
              <div className="rs" style={{ color: 'var(--acc)' }}>
                2
              </div>
            </div>
            <div className="ac" style={{ marginBottom: '6px' }}>
              <div className="av">O</div>
              <div className="nm">Ona</div>
            </div>
            <div className="ac">
              <div className="av">J</div>
              <div className="nm">Júlia</div>
            </div>
          </div>

          {/* Conversación abierta */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Cabecera de la conversación */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--hair)',
                marginBottom: '12px',
              }}
            >
              <div className="av" style={{ width: '30px', height: '30px', fontSize: '12px' }}>
                M
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--fg)' }}>
                  Marc&nbsp;
                  <span
                    className="chip"
                    style={{ color: 'var(--acc)', borderColor: 'var(--acc)', fontSize: '8.5px' }}
                  >
                    N2
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Acumulación · semana 1</div>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Ver perfil ↗
              </span>
            </div>

            {/* Hilo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <span style={dayPill}>Hoy</span>
              <div style={athleteBubble}>¿Cambio la sesión del viernes? Tengo viaje y no llego al box.</div>
              <span style={{ ...voiceChip, marginBottom: '2px' }}>
                <Mic size={15} />
                <Wave />
                <span style={timeStamp}>0:14</span>
              </span>
              <div style={coachBubble}>Sin problema. Te la muevo al sábado por la mañana y dejo el viernes suave.</div>
              <span style={{ ...timeStamp, alignSelf: 'flex-end' }}>14:32</span>
            </div>

            {/* Composer — texto (sin micro en el panel) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: 'auto',
                paddingTop: '12px',
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: '10.5px',
                  color: 'var(--faint)',
                  border: '1px solid var(--hair)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                }}
              >
                Escribe una respuesta…
              </div>
              <span className="btn pri">Enviar ›</span>
            </div>
          </div>
        </div>
      </DashboardMockup>

      <MovilBand
        title="Así lo ve tu atleta en el móvil"
        subtitle={
          <>
            La misma conversación, en su pestaña <b>Chat</b>. Tu respuesta aparece a la izquierda
            como mensaje de su coach; abajo, su teclado y el botón de <b>nota de voz</b> para
            contestarte hablando.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Chat.</b> Recibe tu respuesta al instante y te contesta por texto o manteniendo el{' '}
              <b>micro</b> para grabar una nota de voz. Lo que graba aterriza en tu panel.
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
              Tu coach
            </div>
            <div className="avatar">P</div>
          </div>
          <div
            className="num"
            style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '12px', textAlign: 'center' }}
          >
            En línea · responde rápido
          </div>

          {/* Hilo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <span style={dayPill}>Hoy</span>
            <div style={athleteBubble}>¿Cambio la sesión del viernes? Tengo viaje y no llego al box.</div>
            <span style={voiceChip}>
              <Mic size={15} />
              <Wave />
              <span style={timeStamp}>0:14</span>
            </span>
            <div style={coachBubble}>
              Sin problema. Te la muevo al sábado por la mañana y dejo el viernes suave.
            </div>
            <span style={{ ...timeStamp, alignSelf: 'flex-end' }}>14:32</span>
          </div>

          {/* Composer del atleta — texto + micro (graba nota de voz) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--v2-border)',
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: '11px',
                color: 'var(--v2-faint)',
                border: '1px solid var(--v2-border)',
                borderRadius: '999px',
                padding: '8px 13px',
              }}
            >
              Mensaje…
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'var(--v2-accent)',
                color: 'var(--v2-accent-fg)',
                flexShrink: 0,
              }}
            >
              <Mic size={17} />
            </span>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        Ese es el canal directo: <b>tú con contexto, él con la voz</b>, todo dentro de la app y ligado
        a su ficha. Cuando un atleta te escribe, lo ves subir a <em className="em">Espera respuesta</em>{' '}
        en tu pantalla Hoy, y desde ahí entras a responderle en un clic.
      </p>
    </DocSection>
  );
}
