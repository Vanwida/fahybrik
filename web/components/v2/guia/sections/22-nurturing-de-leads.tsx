// GUÍA · 22 Recupera leads fríos — área "Tu negocio". El nurturing automático: los
// leads que se estancan (email a medias, sin cita, no-show, se lo piensan) se
// reenganchan solos por email, sin que el coach mueva un dedo. Dos protagonistas
// visuales: la ficha del lead con el timeline de la secuencia (dashboard) y el email
// de reenganche real, tal cual cae en la bandeja del lead. Todo verificado contra el
// código: shared/domain/leads/nurture.ts + lib/leads/nurture*.ts.

import {
  DocSection,
  QCWTriad,
  DocFlow,
  DocNote,
  MovilBand,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Email palette — LITERALS on purpose: these mirror lib/leads/email-shell.ts, which
// inlines them because mail clients strip CSS custom properties. Keep them in sync with
// that file (BRAND_INK / BRAND_ORANGE) so the mockup reads exactly like the real send.
const MAIL = {
  ink: '#0a0a0a',
  orange: '#F06A2A',
  paper: '#ffffff',
  faint: '#9a9a9a',
  hair: '#eceae6',
  band: '#f6f5f2',
} as const;

/** One row of the ficha's nurture timeline (dashboard frame — reads the .guia-win vars). */
function TlStep({
  color,
  title,
  time,
  note,
  last = false,
}: {
  color: string;
  title: string;
  time: string;
  note?: string;
  last?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span
          style={{ width: '9px', height: '9px', borderRadius: '99px', background: color, marginTop: '3px' }}
        />
        {last ? null : (
          <span style={{ flex: 1, width: '1px', background: 'var(--hair)', marginTop: '2px' }} />
        )}
      </div>
      <div style={{ paddingBottom: last ? 0 : '12px', minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
        {note ? (
          <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '1px' }}>{note}</div>
        ) : null}
        <div className="num2" style={{ fontSize: '9.5px', color: 'var(--faint)', marginTop: '2px' }}>
          {time}
        </div>
      </div>
    </div>
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
          No todos los que dejan su email llegan hasta la llamada: uno se queda a mitad del
          cuestionario, otro lo termina pero no reserva, otro no se presenta. En vez de perseguirlos
          a mano, el sistema los <b>reengancha solos por email</b>, con un toque suave, en el momento
          justo, y sin que tú toques nada.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Un lead se enfría' },
          { label: 'El cron diario lo detecta' },
          { label: 'Email de reenganche · máx. 2' },
          { label: 'Vuelve a tu funnel' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Recordatorios automáticos por email a los leads que se <b>estancan</b>. Cuatro secuencias,
            una por cada punto donde se puede caer un lead: <b>email a medias</b>, <b>sin cita</b>,{' '}
            <b>no-show</b> y <b>se lo piensa</b>.
          </>
        }
        como={
          <>
            No configuras <b>nada</b>. Un <b>cron diario</b> revisa los leads y le manda a cada uno el
            toque que le toca. Tú solo los ves avanzar de estado en tu lista de <b>Leads</b>.
          </>
        }
        porque={
          <>
            Porque con muchos leads no puedes acordarte de cada uno que se quedó a medias. Recuperas
            los fríos <b>sin trabajo</b> y <b>sin saturar</b> a nadie: como mucho dos toques por
            secuencia.
          </>
        }
      />

      <h3>1 · Cuatro secuencias, según dónde se quedó</h3>
      <p>
        El toque que recibe cada lead depende de en qué punto del embudo se enfrió. La cadencia es
        siempre la misma y vive en un único sitio del sistema, así que nunca se descuadra:
      </p>
      <ul>
        <li>
          <b>Email a medias</b>: dejó el email pero no terminó el cuestionario. Toque a{' '}
          <code>+1 día</code> y otro a <code>+3 días</code>: «termina tu solicitud».
        </li>
        <li>
          <b>Sin cita</b>: completó el cuestionario pero no reservó la llamada. Toque a{' '}
          <code>+1 día</code> y otro a <code>+4 días</code>: «reserva tu llamada».
        </li>
        <li>
          <b>No-show</b>: no se presentó a la videollamada. Un toque de <b>re-reserva</b> en cuanto
          pasa el hueco.
        </li>
        <li>
          <b>Se lo piensa</b>: hubo llamada pero sigue decidiendo. Un toque a <code>+3 días</code>{' '}
          para resolver dudas.
        </li>
      </ul>
      <p>
        En total son cuatro secuencias y seis toques posibles, pero <b>ningún lead recibe más de dos</b>{' '}
        por secuencia. Cada toque se manda <b>una sola vez</b>: aunque el cron corra a diario, nunca
        repite el mismo email a la misma persona.
      </p>

      <h3>2 · Lo que ve el sistema por debajo</h3>
      <p>
        Tú no operas el nurturing: ocurre solo. Pero para que veas la mecánica, así se lee la ficha de
        un lead que completó el cuestionario y se quedó <em className="em">sin reservar</em>: el
        sistema le ha mandado el primer toque y tiene el segundo en cola.
      </p>

      {/* Dashboard mockup: la ficha del lead + el timeline de la secuencia (automático) */}
      <DashboardMockupFicha />

      <MovilBand
        title="En la bandeja de tu lead"
        subtitle={
          <>
            El nurturing no es una pantalla de la app: es un <b>email</b>, corto y en tono cercano, que
            aterriza en la bandeja del lead. Este es el primero de la secuencia «sin cita», tal cual
            sale desde <b>hello@fahybrid.com</b>.
          </>
        }
      >
        <EmailCard />
      </MovilBand>

      <DocNote variant="cue" title="Máximo 2 toques, con ventana">
        <ul>
          <li>
            Como mucho <span className="k">2 toques por secuencia</span>: nunca se satura a un lead.
          </li>
          <li>
            Solo entra un lead con un <span className="k">evento reciente</span>: no perseguimos a
            nadie de hace un mes, y al arrancar el sistema no dispara un <em className="em">blast</em>{' '}
            de todo el histórico. Cada toque tiene su ventana y caduca.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="bad" title="Nunca a quien no toca">
        <ul>
          <li>
            Queda fuera todo lead <span className="k">descartado</span>, ya{' '}
            <span className="k">convertido</span>, quien pidió <span className="k">baja</span> de emails
            (<code>no_contactar</code>) y quien está <span className="k">en lista de espera</span>:
            ese aún no puede reservar, así que no se le empuja a hacerlo.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="log" title="RGPD: baja en un clic">
        <p>
          Cada email lleva su enlace <code>«cancela aquí»</code>. Un clic marca al lead como{' '}
          <b>no_contactar</b> y detiene <b>todo</b> el nurturing para esa persona, para siempre. Sin
          formularios ni pasos: baja limpia, en un toque.
        </p>
      </DocNote>
    </DocSection>
  );
}

// ── Dashboard: ficha del lead con el timeline de la secuencia ──────────────────────────
function DashboardMockupFicha() {
  return (
    <DashboardMockup url="tu-panel / leads / marc-vidal">
      <div className="ath-hd">
        <div className="av">M</div>
        <div className="nm">
          Marc Vidal
          <small>Lead · completó el cuestionario · sin reservar cita</small>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className="chip" style={{ color: 'var(--acc)', borderColor: 'var(--acc)' }}>
            Nurturing activo
          </span>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hair)',
          borderRadius: '11px',
          padding: '13px 15px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Nurturing automático · en segundo plano
          </span>
          <span className="num2" style={{ fontSize: '10px', color: 'var(--faint)' }}>
            próximo toque en 1 día · máx. 2
          </span>
        </div>

        <TlStep color="var(--faint)" title="Lead creado" note="Dejó su email en la landing" time="hace 4 días" />
        <TlStep color="var(--ok)" title="Completó el cuestionario" note="Objetivo: su primer HYROX · intermedio" time="hace 3 días" />
        <TlStep
          color="var(--acc)"
          title="Toque 1 enviado · «Reserva tu llamada»"
          note="Secuencia «sin cita» · +1 día"
          time="hace 2 días"
        />
        <TlStep
          color="var(--faint)"
          title="Toque 2 programado · recordatorio"
          note="Secuencia «sin cita» · +4 días · último toque"
          time="en 1 día"
          last
        />
      </div>

      <div
        className="num2"
        style={{
          fontSize: '10px',
          color: 'var(--faint)',
          marginTop: '10px',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        <span style={{ width: '5px', height: '5px', borderRadius: '99px', background: 'var(--ok)' }} />
        Automático: tú no envías nada. Solo ves al lead avanzar de estado en tu lista de Leads.
      </div>
    </DashboardMockup>
  );
}

// ── El email de reenganche real (secuencia «sin cita», toque 1) — copy literal de
//    lib/leads/nurture-email.ts (nuevo_t1) + el shell de lib/leads/email-shell.ts. ────────
function EmailCard() {
  return (
    <figure style={{ margin: 0, maxWidth: '380px', width: '100%' }}>
      <div
        style={{
          background: MAIL.paper,
          color: MAIL.ink,
          borderRadius: '14px',
          overflow: 'hidden',
          border: `1px solid ${MAIL.hair}`,
          boxShadow: '0 24px 56px -28px rgba(0,0,0,0.6)',
          fontFamily: 'var(--v2-font-sans)',
        }}
      >
        {/* Inbox header: remitente + asunto */}
        <div style={{ background: MAIL.band, padding: '13px 16px', borderBottom: `1px solid ${MAIL.hair}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: MAIL.orange,
                color: MAIL.paper,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontStyle: 'italic',
                fontSize: '15px',
                flexShrink: 0,
              }}
            >
              F
            </span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700 }}>
                FAHYBRID{' '}
                <span style={{ fontWeight: 400, color: MAIL.faint }}>&lt;hello@fahybrid.com&gt;</span>
              </div>
              <div style={{ fontSize: '11px', color: MAIL.faint }}>para marc@correo.com</div>
            </div>
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 800, marginTop: '10px' }}>
            Reserva tu llamada con Pablo
          </div>
        </div>

        {/* Cuerpo del email — brandShell real (blanco, tinta, naranja) */}
        <div style={{ padding: '18px 18px 20px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: MAIL.orange,
              marginBottom: '10px',
            }}
          >
            FAHYBRID
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '10px' }}>
            El siguiente paso es una llamada
          </div>
          <p style={{ fontSize: '12.5px', lineHeight: 1.55, margin: '0 0 9px' }}>Hola Marc,</p>
          <p style={{ fontSize: '12.5px', lineHeight: 1.55, margin: '0 0 9px', color: '#33322f' }}>
            Ya tenemos tus respuestas. El siguiente paso es una videollamada de 30 minutos con Pablo
            para ver tu caso y cómo enfocar tu plan.
          </p>
          <p style={{ fontSize: '12.5px', lineHeight: 1.55, margin: '0 0 14px', color: '#33322f' }}>
            Elige el hueco que mejor te venga:
          </p>
          <span
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              background: MAIL.orange,
              color: MAIL.ink,
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '12.5px',
            }}
          >
            Reservar mi llamada
          </span>
          <p style={{ fontSize: '12px', color: '#6a6a6a', margin: '18px 0 0' }}>Pablo · FAHYBRID</p>
          <p style={{ fontSize: '11px', color: MAIL.faint, margin: '14px 0 0' }}>
            Si no quieres más recordatorios,{' '}
            <span style={{ textDecoration: 'underline' }}>cancela aquí</span>.
          </p>
        </div>
      </div>
      <figcaption className="guia-phone-cap">
        El email real de la secuencia «sin cita». Tono cercano, CTA a reservar, y{' '}
        <b>siempre</b> la baja RGPD al pie.
      </figcaption>
    </figure>
  );
}
