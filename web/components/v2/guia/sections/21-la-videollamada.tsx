// GUÍA · 21 La videollamada con tu lead — área "Tu negocio". El lead reserva un hueco de
// tu disponibilidad y la cita queda confirmada al instante, con Google Meet automático —
// cero ida y vuelta. Tras la llamada, dejas el parte 1:1 (notas, precio acordado, próximos
// pasos) que enlaza con el alta. El puente: el lead reserva y confirma desde la WEB.

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

/** A bookable slot chip inside the phone (web booking). Frame aliases resolve in the
 *  `.guia-phone` scope where this is rendered. */
function Slot({ time, selected }: { time: string; selected?: boolean }) {
  return (
    <span
      style={{
        fontFamily: 'var(--v2-font-mono)',
        fontSize: '12px',
        fontWeight: 700,
        padding: '8px 12px',
        borderRadius: '9px',
        border: `1px solid ${selected ? 'var(--acc)' : 'var(--hair)'}`,
        background: selected ? 'var(--acc)' : 'var(--sunken)',
        color: selected ? 'var(--accOn)' : 'var(--muted)',
      }}
    >
      {time}
    </span>
  );
}

const DAY_LABEL = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
  margin: '0 0 7px',
} as const;

const FIELD_LABEL = {
  fontSize: '9px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--faint)',
  width: '82px',
  flexShrink: 0,
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          El lead elige <b>videollamada o presencial</b>, reserva un hueco de <b>tu disponibilidad</b>{' '}
          y la cita queda <b>confirmada al instante</b>, con Google Meet (vídeo) o la dirección de tu
          box (presencial). Cero ida y vuelta. Después dejas el <b>parte 1:1</b> y ya puedes darle de
          alta.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Pones tu disponibilidad' },
          { label: 'El lead reserva un hueco', app: true },
          { label: 'Se crea la cita + Meet' },
          { label: 'Haces la llamada y registras el parte 1:1' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Un sistema de reservas atado a tu <b>disponibilidad</b>. Tú marcas tus huecos; el lead
            elige uno y la cita nace <b>confirmada</b>, con su enlace de vídeo y un email de
            confirmación.
          </>
        }
        como={
          <>
            Pones tu disponibilidad semanal una vez (huecos de <b>30 min</b>). El lead abre su
            enlace, elige día y hora y reserva. Tú lo ves en <b>«Próximas llamadas»</b> y te unes con
            un clic.
          </>
        }
        porque={
          <>
            Porque el ping-pong de <em className="em">«¿cuándo te va bien?»</em> mata leads. Un
            calendario que se confirma solo hace la primera llamada fácil, y una primera llamada
            fácil es la que convierte.
          </>
        }
      />

      <h3>1 · Tú pones los huecos, el lead elige</h3>
      <p>
        Defines tu disponibilidad semanal en <b>dos horarios independientes</b> (videollamadas y
        presencial, que puedes solapar) y el sistema la trocea en <b>huecos de 30 minutos</b> para los
        próximos 14 días, en <b>hora de Madrid</b>. El lead elige la modalidad y solo ve los huecos de
        ESE horario que estén libres. El servidor revalida cada reserva (nunca se fía del navegador) y
        una reserva bloquea esa hora en los <b>dos</b> horarios: no puedes estar en dos sitios a la
        vez.
      </p>

      <h3>2 · Reservar es confirmar</h3>
      <p>
        No hay un paso de aprobación tuyo: cuando el lead reserva, la cita ya está{' '}
        <b>confirmada</b> y el lead avanza a <code>Cita agendada</code>. Al instante recibe el email
        de confirmación con el archivo <b>.ics</b> para su calendario, el enlace de <b>Google Meet</b>{' '}
        y un <b>recordatorio 24 h antes</b>.
      </p>

      {/* Dashboard mockup: Próximas llamadas + el parte 1:1 post-llamada */}
      <DashboardMockup url="tu-panel / leads">
        {/* Próximas llamadas — confirmadas, la más próxima primero */}
        <div className="lane" style={{ maxWidth: 'none', marginTop: 0, marginBottom: '14px' }}>
          <div className="lh" style={{ color: 'var(--acc)' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '99px',
                background: 'var(--v2-accent)',
              }}
            />
            Próximas llamadas
          </div>
          <div className="ac" style={{ marginBottom: '7px' }}>
            <div className="av">N</div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>Nora Vidal</span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--v2-font-mono)' }}>
                hoy · 18:30 · 30 min
              </span>
            </div>
            <span className="btn pri" style={{ marginLeft: 'auto' }}>
              ▶ Unirse a Meet
            </span>
          </div>
          <div className="ac">
            <div className="av">B</div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>Bruno Sáez</span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--v2-font-mono)' }}>
                mañana · 09:00 · 30 min
              </span>
            </div>
            <span className="btn pri" style={{ marginLeft: 'auto' }}>
              ▶ Unirse a Meet
            </span>
          </div>
        </div>

        {/* El parte 1:1 — se abre solo al marcar la cita «Completada» */}
        <div style={{ border: '1px solid var(--hair)', borderRadius: '11px', padding: '13px' }}>
          <div className="ath-hd" style={{ marginBottom: '12px' }}>
            <div className="av">N</div>
            <div className="nm">
              Parte 1:1 · Nora Vidal
              <small>tras la videollamada · se abre al marcar «Completada»</small>
            </div>
          </div>
          <div className="ed-row">
            <span style={FIELD_LABEL}>Notas</span>
            <span className="ed-input">
              Viene de CrossFit, 2 años. Quiere su primera HYROX en noviembre. 4 días/semana.
            </span>
          </div>
          <div className="ed-row">
            <span style={FIELD_LABEL}>Precio/mes</span>
            <span className="ed-input">95 €</span>
          </div>
          <div className="ed-row" style={{ marginBottom: 0 }}>
            <span style={FIELD_LABEL}>Próximos</span>
            <span className="ed-input">Le monto el plan base y le mando la invitación esta semana.</span>
          </div>
        </div>
      </DashboardMockup>

      <h3>3 · Tras la llamada: el parte 1:1</h3>
      <p>
        Al marcar la cita como <b>Completada</b>, el parte se abre solo{' '}
        <em className="em">en caliente</em>, para que lo hablado no se pierda: dejas las{' '}
        <b>notas</b>, el <b>precio acordado</b> y los <b>próximos pasos</b>. Ese precio es el mismo
        que nace luego en el alta: el parte es el puente directo a convertir al lead en atleta.
      </p>

      <DocNote variant="log" title="Se confirma al instante">
        <p>
          Cuando el lead reserva, la cita nace <b>confirmada</b>, sin cola de aprobación. Con tu
          Google conectado, el enlace de <b>Meet</b> se crea solo en tu calendario; si no lo tienes,
          pegas tú el enlace en la cita antes de la llamada. <b>Cancelar</b> borra el evento del
          calendario, sin cabos sueltos.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Sin disponibilidad, lo decimos">
        <p>
          Si no tienes huecos abiertos (o los tienes todos ocupados) el lead no se topa con un
          calendario vacío y confuso: ve un mensaje honesto de que ahora mismo no hay huecos. En
          cuanto abres disponibilidad, vuelven a aparecer.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Videollamada o presencial">
        <p>
          Llevas <b>dos horarios</b>: uno de videollamadas y otro presencial (los pintas por separado
          y pueden solaparse). El lead elige cómo quiere la sesión y solo ve los huecos de ese tipo. En{' '}
          <b>vídeo</b> la cita crea el enlace de Meet como siempre; en <b>presencial</b>, en vez de
          Meet, el email y el <b>.ics</b> llevan la <b>dirección de tu box</b> (la de tu perfil) con
          enlace a Google Maps. Mismo calendario, misma confirmación al instante.
        </p>
      </DocNote>

      <MovilBand
        title="Cómo lo reserva tu lead"
        subtitle={
          <>
            El lead reserva desde la <b>web</b>, con el enlace que recibió al terminar el onboarding.
            Elige hueco, confirma, y todo lo demás (Meet, calendario, recordatorio) le llega solo.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Reserva web.</b> Elige hueco y confirma. Al instante recibe el email con el{' '}
              <b>.ics</b> para su calendario, el enlace de <b>Google Meet</b> y un{' '}
              <b>recordatorio 24 h</b> antes.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div />
          </div>

          <div className="kick">30 min con Pablo</div>
          <div className="ph-title sm" style={{ marginBottom: '2px' }}>
            Reserva tu videollamada
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Elige cómo y cuándo · hora de Madrid
          </div>

          {/* #40: el lead elige modalidad → solo ve los huecos de ese horario */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <span
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                padding: '7px 0',
                borderRadius: '9px',
                background: 'var(--acc)',
                color: 'var(--accOn)',
              }}
            >
              📹 Videollamada
            </span>
            <span
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                padding: '7px 0',
                borderRadius: '9px',
                background: 'var(--sunken)',
                color: 'var(--muted)',
                border: '1px solid var(--hair)',
              }}
            >
              📍 Presencial
            </span>
          </div>

          <div style={DAY_LABEL}>Jueves 10 jul</div>
          <div style={{ display: 'flex', gap: '7px', marginBottom: '13px', flexWrap: 'wrap' }}>
            <Slot time="09:00" />
            <Slot time="09:30" selected />
            <Slot time="10:00" />
          </div>

          <div style={DAY_LABEL}>Viernes 11 jul</div>
          <div style={{ display: 'flex', gap: '7px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <Slot time="18:00" />
            <Slot time="18:30" />
          </div>

          <div className="cta">Reservar · jue 10, 09:30</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textAlign: 'center', marginTop: '9px' }}>
            Se confirma al instante · Google Meet + recordatorio
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        La videollamada es la bisagra del embudo: entra un lead y sale un atleta. El precio que
        acordáis aquí es el que nace en el alta, con o sin cobro por Stripe, que verás en las
        secciones siguientes.
      </p>
    </DocSection>
  );
}
