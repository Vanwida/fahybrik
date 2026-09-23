// GUÍA · Revisión 1:1 recurrente — Un repaso periódico
// cara a cara con tu atleta, agendado sin fricción: tú fijas la cadencia, el sistema
// te avisa en Hoy cuando vence, tú propones y el atleta elige su hueco — se agenda
// sola con Meet, reutilizando el sistema de citas. Verificado contra
// lib/citas/reviews.ts + shared/domain/coach/reviews.ts + lib/coach/signal-config.ts
// + lib/coach/attention/evaluators/reviews.ts.

import type { ReactNode } from 'react';
import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
} from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark, CoachInitial, CoachSubject, WithCoach } from '../tenant';

// A slot chip inside the phone (the athlete's hueco picker). Selected = accent.
function Slot({ children, sel }: { children: ReactNode; sel?: boolean }) {
  return (
    <span
      style={{
        textAlign: 'center',
        fontSize: '11px',
        fontWeight: 700,
        padding: '9px 4px',
        borderRadius: '9px',
        border: `1px solid ${sel ? 'var(--acc)' : 'var(--hair)'}`,
        background: sel ? 'var(--accSoft)' : 'var(--sunken)',
        color: sel ? 'var(--acc)' : 'var(--muted)',
      }}
    >
      {children}
    </span>
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
          Un repaso periódico cara a cara con tu atleta, agendado <b>sin fricción</b>: tú fijas cada
          cuánto toca, el sistema te avisa cuando vence, <b>tú propones</b> y{' '}
          <b>él elige el hueco</b>. La reunión se crea sola, con su Google Meet y su recordatorio,
          reutilizando el mismo sistema de citas de tus videollamadas.
        </>
      }
    >

      <QCWTriad
        que={
          <>
            Una <b>revisión 1:1 recurrente</b> por atleta. Tú fijas la cadencia{' '}
            (<b>mensual por defecto</b>) y el sistema levanta un aviso en tu Hoy cuando pasa el plazo
            sin una revisión. No es una cita nueva que montar: es la de siempre, aplicada al atleta.
          </>
        }
        como={
          <>
            Cuando el aviso sube, pulsas <b>Proponer revisión</b>. Tu atleta recibe la propuesta en su
            app y <b>elige el hueco</b> que le venga. Se agenda auto-aceptada, con <b>Meet</b> y
            recordatorio. Tras la llamada la cierras como un <b>parte de seguimiento</b>.
          </>
        }
        porque={
          <>
            Porque el 1:1 es lo que hace premium a un coaching de alto contacto, y lo que más se
            olvida. El sistema te lo <b>recuerda solo</b> y te ahorra el cuadrar agendas: mantienes el
            pulso con cada atleta sin perseguir a nadie.
          </>
        }
      />

      <h3>La cadencia la fijas tú, por atleta</h3>
      <p>
        En su ficha, <b>Perfil › 1:1</b>, eliges la <b>cadencia de revisión</b>:{' '}
        <code>Sin revisiones</code>, <code>Mensual</code> o <code>Trimestral</code>. Ahí mismo está{' '}
        <b>Proponer revisión</b> y, debajo, sus <b>Sesiones 1:1</b> con <b>Registrar sesión</b>. El default es <b>Mensual</b>: es opt-out a
        propósito: en un coaching 1:1 premium el repaso mensual es la norma, no la excepción. Bajas a
        trimestral o lo desactivas cuando quieras.
      </p>

      <h3>El aviso sube solo a Hoy cuando vence</h3>
      <p>
        El sistema mira los días desde la última 1:1. Si pasan más de <b>30</b> (mensual) o{' '}
        <b>90</b> (trimestral) sin una revisión y no hay ninguna reservada, levanta la señal{' '}
        <code>Revisión 1:1 vencida</code> en Hoy, junto al resto de lo que te necesita. Para no
        agobiar, no vuelve a dejarte proponer al mismo atleta en <b>14 días</b>.
      </p>

      <h3>Tú propones, tu atleta elige el hueco</h3>
      <p>
        Tú solo pulsas <b>Proponer revisión</b>. Tu atleta recibe un aviso en la app{' '}
        (<em className="em">«<CoachSubject /> te propone una revisión»</em>) y <b>reserva él</b> el hueco que
        mejor le venga, de tu disponibilidad real. Cero ida y vuelta por WhatsApp para cuadrar día y
        hora.
      </p>

      <h3>Se agenda sola: cita, Meet y recordatorio</h3>
      <p>
        Al reservar, la revisión queda <b>auto-aceptada</b>, con su <b>Google Meet</b> y su
        recordatorio 24h: reutiliza tu sistema de citas tal cual, sin tocar el embudo de leads.
        Después de la llamada la cierras como un <b>parte de seguimiento</b>, con tus notas y los
        próximos pasos.
      </p>

      <DocNote variant="cue" title="Default mensual, opt-out">
        <p>
          La cadencia arranca en <b>Mensual</b> para cada atleta nuevo: en un coaching 1:1 premium de
          alto contacto, el repaso mensual es lo esperable. Si un atleta lleva otro ritmo, lo bajas a
          trimestral o lo pones en <code>Sin revisiones</code>: tú mandas.
        </p>
      </DocNote>

      <DocNote variant="log" title="Un atleta pausado no genera avisos">
        <p>
          Mientras un atleta está <b>en pausa</b> o de baja, la señal de revisión se calla sola: no
          te llena el Hoy de avisos de alguien que no está entrenando. Vuelve cuando el atleta
          vuelve.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Reutiliza tus citas y tu Meet">
        <p>
          Una revisión es una cita con sujeto atleta: sale de los <b>mismos huecos</b>, crea el{' '}
          <b>mismo Google Meet</b> y manda el <b>mismo recordatorio</b> que tus videollamadas de
          captación. No hay un sistema paralelo que aprender, y <b>no toca tu embudo de leads</b>. En
          dobles, la revisión es <b>individual</b>: una por atleta, no por pareja.
        </p>
      </DocNote>

      <MovilBand
        title="Cómo la agenda tu atleta"
        subtitle={
          <>
            Tu atleta no cuadra agendas contigo: recibe tu propuesta, <b>elige un hueco</b> y ve su
            próxima sesión con el botón para <b>unirse</b> a la videollamada.
          </>
        }
      >
        {/* PHONE 1: propuesta + selector de hueco */}
        <PhoneMockup
          caption={
            <>
              <b>La propuesta.</b> Le llega en su Inicio; toca un <b>hueco</b> de tu disponibilidad y
              lo reserva. Sin mensajes de ida y vuelta.
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
          <div className="kick">Miércoles 14 ene</div>
          <div className="ph-title">Hola, Marc</div>

          <div className="hero">
            <div className="row">
              <span className="slot">Revisión</span>
              <span className="hk">Tu coach te propone veros</span>
            </div>
            <div className="ht">
              <CoachSubject /> te propone una revisión
            </div>
            <div className="meta">Elige el hueco que mejor te venga para la videollamada.</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '7px',
                marginBottom: '12px',
              }}
            >
              <Slot>mar 8 · 18:00</Slot>
              <Slot sel>mié 9 · 19:30</Slot>
              <Slot>jue 10 · 18:30</Slot>
              <Slot>vie 11 · 17:00</Slot>
            </div>
            <div className="cta">Reservar hueco</div>
          </div>

          <div className="row-card">
            <div className="ca">
              <CoachInitial />
            </div>
            <div className="tx">
              <div className="e">Tu coach</div>
              <div className="m">Repasamos el bloque y ajustamos</div>
            </div>
            <div className="chev">›</div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: revisión agendada + unirse */}
        <PhoneMockup
          caption={
            <>
              <b>Agendada.</b> Al reservar, ve su <b>próxima sesión<WithCoach /></b> con el enlace de{' '}
              <b>Meet</b>, y le llega el recordatorio 24h antes.
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
          <div className="kick">Revisión</div>
          <div className="ph-title">Todo listo</div>

          <div className="hero">
            <div className="row">
              <span className="slot" style={{ background: 'var(--okSoft)', color: 'var(--ok)' }}>
                Agendada
              </span>
              <span className="hk">
                Tu próxima sesión<WithCoach />
              </span>
            </div>
            <div className="ht">Revisión mensual</div>
            <div className="meta num">Miércoles 9 · 19:30 · 30 min · Google Meet</div>
            <div className="cta">Unirse a la videollamada</div>
          </div>

          <div className="row-card">
            <div className="ca">🔔</div>
            <div className="tx">
              <div className="e">Recordatorio</div>
              <div className="m">Te avisamos 24 h antes</div>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        La revisión 1:1 convierte «tengo que hablar con Marc» en algo que el sistema te{' '}
        <b>recuerda y agenda por ti</b>. Tú pones la cara; el resto lo lleva el panel.
      </p>
    </DocSection>
  );
}
