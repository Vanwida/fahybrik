// GUÍA · Mensajes — la bandeja por «Por responder», hecho / posponer / marcar
// sin leer, el contexto del atleta, el teclado y «Enviar a varios». El puente: lo
// que escribes aparece en su pestaña Chat; lo que graba te llega a la conversación.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Chips, Keys } from '../doc';
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
          El chat vive <b>dentro de la app</b>, no en WhatsApp. En <b>Mensajes</b> la bandeja se abre
          por los que están <b>por responder</b> (el último mensaje es suyo y no le has contestado),
          el que más lleva esperando primero. Respondes con su contexto al lado, y lo que resuelves
          sale de la bandeja.
        </>
      }
    >
      <PanelFigure caption={<>El número de <b>Por responder</b> es el mismo que el globo de Mensajes en la barra lateral.</>}>
        <Chips
          items={[
            { label: 'Por responder', count: 15, active: true },
            { label: 'Todas' },
            { label: 'Sin leer', count: 9 },
            { label: 'Hechas' },
          ]}
        />
      </PanelFigure>

      <h3>La bandeja</h3>
      <p>
        Cada fila: el atleta, su nivel, el último mensaje y cuánto lleva esperando. Arriba, el
        buscador (tecla <b>/</b>) busca por nombre o por lo que se escribió. Abrir un hilo no marca
        como leído el de nadie más, y cada hilo tiene su propia dirección: un enlace o un aviso te
        lleva directo a esa conversación.
      </p>

      <h3>Responder, dar por hecho o posponer</h3>
      <p>
        Escribes abajo y envías con <b>⌘ Enter</b> (Enter solo hace salto de línea: aquí se escriben
        párrafos). También puedes <b>adjuntar un archivo</b> o <b>grabar una nota de voz</b>. Si el
        mensaje no pide respuesta («¡gracias!»), en <b>···</b> lo marcas{' '}
        <b>Hecho · no requiere respuesta</b>; si lo quieres contestar luego, <b>Posponer</b>. Y{' '}
        <b>Marcar sin leer</b> lo devuelve a la bandeja.
      </p>
      <p>
        El panel de <b>contexto</b> (a la derecha, o <b>Ver su contexto</b> en pantallas estrechas)
        enseña su estado, su readiness, su día y su semana, su adherencia y su último check-in, para
        que contestes sabiendo cómo va.
      </p>

      <PanelFigure>
        <Keys
          items={[
            [['J', 'K'], 'Bajar y subir por la bandeja'],
            [['Enter'], 'Abrir la conversación'],
            [['E'], 'Hecho'],
            [['H'], 'Posponer'],
            [['/'], 'Buscar'],
            [['⌘', 'Enter'], 'Enviar'],
          ]}
        />
      </PanelFigure>

      <h3>Escribir a varios</h3>
      <p>
        <b>Enviar a varios</b> (arriba en Mensajes, en la barra de Atletas con varios seleccionados o
        desde <b>+ Nuevo</b>) manda el mismo texto a los atletas y grupos que elijas. A cada uno le
        llega en su chat, como un mensaje tuyo más: no ven quién más lo ha recibido.
      </p>

      <DocNote variant="log" title="Cuándo algo pasa a «Por responder» en Hoy">
        <p>
          Un mensaje esperando no sube a Hoy al instante: sube cuando lleva más horas sin respuesta
          de las que tú fijes en <b>Ajustes › Método</b>. Mientras, lo tienes aquí.
        </p>
      </DocNote>

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

    </DocSection>
  );
}
