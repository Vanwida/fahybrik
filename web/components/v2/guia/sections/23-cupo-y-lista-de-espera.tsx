// GUÍA · 23 Cupo y lista de espera — área "Tu negocio". El grupo tiene un tope de
// plazas; cuando se llena, los leads nuevos no se pierden — entran en una cola FIFO y
// pasan por orden al liberarse una plaza. Dos protagonistas visuales: el panel
// "Disponibilidad y cupo" con la cola (dashboard) y la pantalla de lista de espera del
// onboarding (móvil). Verificado contra lib/coach/capacity.ts, lib/leads/waitlist.ts,
// components/v2/citas/AvailabilityEditor.tsx y components/onboarding/screens.tsx.

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

/** One row of the coach's FIFO waitlist (dashboard frame — reads the .guia-win vars). */
function QRow({
  pos,
  initial,
  name,
  meta,
  wait,
  released = false,
}: {
  pos: number;
  initial: string;
  name: string;
  meta: string;
  wait: string;
  released?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '9px 4px',
        borderTop: '1px solid var(--hair)',
      }}
    >
      <span
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 800,
          background: released ? 'var(--sunken)' : 'var(--accSoft)',
          color: released ? 'var(--faint)' : 'var(--acc)',
        }}
        className="num2"
      >
        {pos}
      </span>
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 800,
          background: 'var(--accSoft)',
          color: 'var(--acc)',
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{name}</div>
        <div style={{ fontSize: '10px', color: 'var(--faint)' }}>{meta}</div>
      </div>
      <span className="num2" style={{ fontSize: '10px', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
        {wait}
      </span>
      {released ? (
        <span className="chip" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
          ✓ Avisado
        </span>
      ) : (
        <span className="btn" style={{ flexShrink: 0 }}>
          Liberar plaza
        </span>
      )}
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
          Pablo entrena a un <b>grupo reducido</b> para poder seguir cada plan de cerca. Por eso su
          cupo tiene un tope. Cuando se llena, los leads nuevos <b>no se pierden</b>: entran en una{' '}
          <b>lista de espera</b> y pasan por orden al liberarse una plaza. Y esa escasez, bien
          contada, <em className="em">suma</em> — no resta.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'El grupo se llena' },
          { label: 'El lead termina el onboarding', app: true },
          { label: 'Entra en lista de espera', app: true },
          { label: 'Se libera una plaza' },
          { label: 'Avisa al primero de la cola' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Un <b>cupo</b> (máximo de atletas) y una <b>cola de espera</b>. Cuando los atletas activos
            llegan al cupo, el grupo pasa a <b>completo</b> y los leads nuevos entran en la cola por
            orden de llegada.
          </>
        }
        como={
          <>
            Fijas el cupo en <b>Disponibilidad y cupo</b>. A partir de ahí es automático: al llenarse,
            el onboarding termina en lista de espera; al liberarse una plaza, avisa al primero. Y
            tienes el botón <b>Liberar plaza</b> para saltarte el orden.
          </>
        }
        porque={
          <>
            Porque un buen seguimiento no escala infinito. El tope protege tu calidad — y para el lead,
            un grupo con lista de espera se lee como <b>club exclusivo</b>, no como puerta cerrada.
          </>
        }
      />

      <h3>1 · El cupo y el borde exacto</h3>
      <p>
        El cupo es tu <b>máximo de atletas</b>, y lo fijas en <code>Disponibilidad y cupo</code>.
        Dejarlo <b>vacío = sin límite</b>: la lista de espera es <em className="em">opt-in</em>, solo
        existe si defines un número. El grupo se llena en el <b>borde exacto</b>: en cuanto los{' '}
        <b>atletas activos igualan el cupo</b> (24 de 24), pasa a completo y el siguiente lead entra
        en espera. Las <b>plazas libres</b> son el cupo menos los activos. Una <b>pareja de dobles</b>{' '}
        cuenta como 2 atletas; una <b>pausa o baja</b> libera una plaza.
      </p>

      <h3>2 · La lista de espera es una cola por orden de llegada</h3>
      <p>
        Estar «en espera» es un <b>flag del lead</b>, no un estado de tu embudo: el lead sigue siendo
        un lead normal, solo que marcado en la cola. Se ordena por <b>orden de llegada</b> — el más
        antiguo, primero (FIFO) — y así lo ves tú y así se respeta al avisar.
      </p>

      <h3>3 · Liberar una plaza: automático + tu override</h3>
      <p>
        El sistema es <b>híbrido</b>. Cuando se abre una plaza —porque subes el cupo, o porque un
        atleta se da de baja o pausa— avisa <b>solo</b> al más antiguo de la cola por email, con su
        enlace de reserva. Y si quieres saltarte el orden, el botón <code>Liberar plaza</code> te deja
        avisar a quien quieras ahora mismo. Un lead ya avisado <b>retiene su plaza</b> hasta que
        reserva, así que nunca se libera de más.
      </p>

      {/* Dashboard mockup: panel "Disponibilidad y cupo" + cola FIFO */}
      <DashboardMockup url="tu-panel / disponibilidad">
        <div className="wk-head">
          <div className="wk-title">Disponibilidad y cupo</div>
        </div>

        {/* Panel cupo */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '11px',
            padding: '14px 15px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: '3px',
                }}
              >
                Atletas activos / cupo
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span
                  className="num2"
                  style={{
                    fontFamily: 'var(--v2-font-display)',
                    fontStyle: 'italic',
                    fontWeight: 900,
                    fontSize: '30px',
                    letterSpacing: '-0.03em',
                    color: 'var(--fg)',
                  }}
                >
                  24
                </span>
                <span className="num2" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--faint)' }}>
                  / 24
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '7px' }}>
              <span
                className="chip"
                style={{ color: 'var(--dng)', borderColor: 'var(--dng)', background: 'var(--dngSoft)' }}
              >
                ● Completo
              </span>
              <span className="btn">Editar cupo</span>
            </div>
          </div>
          <div
            style={{
              height: '10px',
              borderRadius: '99px',
              background: 'var(--sunken)',
              overflow: 'hidden',
              margin: '12px 0 7px',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: '100%',
                background: 'linear-gradient(90deg, var(--acc), color-mix(in srgb, var(--acc) 72%, transparent))',
              }}
            />
          </div>
          <div className="num2" style={{ fontSize: '11px', color: 'var(--muted)' }}>
            <b style={{ color: 'var(--fg)' }}>0 plazas libres</b> · 24 activos ·{' '}
            <b style={{ color: 'var(--fg)' }}>3</b> en lista de espera
          </div>
        </div>

        {/* Panel lista de espera */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '11px',
            padding: '12px 15px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>Lista de espera · 3</span>
            <span className="chip" style={{ color: 'var(--faint)' }}>
              orden de llegada
            </span>
          </div>
          <QRow pos={1} initial="M" name="Marcos Vidal" meta="Su primer HYROX · intermedio · Barcelona" wait="en espera 2 días" />
          <QRow pos={2} initial="L" name="Laura Feng" meta="Mejorar su marca · avanzado · online" wait="en espera 5 días" />
          <QRow pos={3} initial="D" name="Dídac Roca" meta="Podio / competir · competidor · Barcelona" wait="en espera 6 días" />
          <div
            style={{
              fontSize: '10px',
              color: 'var(--faint)',
              marginTop: '11px',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              lineHeight: 1.5,
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '99px', background: 'var(--ok)', marginTop: '5px', flexShrink: 0 }} />
            <span>
              <b style={{ color: 'var(--fg)' }}>Automático:</b> cuando se libera una plaza avisamos al
              primero de la cola. «Liberar plaza» se salta el orden.
            </span>
          </div>
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Se llena en el borde exacto">
        <ul>
          <li>
            En cuanto los <span className="k">atletas activos igualan el cupo</span> el grupo pasa a
            completo y el siguiente lead entra en espera.
          </li>
          <li>
            <span className="k">Vacío = sin límite</span> (opt-in): la lista de espera solo se activa
            si defines un cupo. Una pareja de dobles cuenta como 2; una pausa o baja libera plaza.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="cue" title="FIFO automático + tu override">
        <ul>
          <li>
            Al abrirse una plaza el sistema avisa <span className="k">solo al más antiguo</span> con su
            enlace de reserva. Plazas para liberar = <code>cupo − activos − ya avisados sin reservar</code>.
          </li>
          <li>
            <span className="k">«Liberar plaza»</span> es tu botón para saltarte el orden. Un lead ya
            avisado retiene su plaza hasta que reserva.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="cue" title="Club exclusivo, no error">
        <p>
          El lead no ve un «no hay sitio» frío. Ve <b>«Ahora mismo no quedan plazas»</b> con el mensaje
          de grupo reducido y sitio guardado. La escasez, bien contada, refuerza el posicionamiento en
          vez de restarle.
        </p>
      </DocNote>

      <MovilBand
        title="Cuando el grupo está lleno"
        subtitle={
          <>
            Si el grupo está completo al terminar el onboarding, el lead <b>no ve la reserva de cita</b>
            : ve esta pantalla de lista de espera, con su número en la cola. Copy de plazas limitadas,
            nunca de puerta cerrada.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Lista de espera.</b> El onboarding termina aquí en vez de ofrecer hueco. Le decimos su{' '}
              <b>número</b> y que le avisamos por email en cuanto se libere una plaza.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '10px' }}>
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div />
          </div>

          <div style={{ padding: '18px 4px 8px', textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                background: 'var(--accSoft)',
                border: '1px solid color-mix(in srgb, var(--acc) 35%, transparent)',
                borderRadius: '99px',
                padding: '5px 12px',
              }}
            >
              Lista de espera
            </span>
            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                fontSize: '22px',
                lineHeight: 1.1,
                color: 'var(--fg)',
                margin: '16px 6px 0',
              }}
            >
              Ahora mismo no quedan plazas.
            </div>
            <p style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--muted)', margin: '12px 6px 0' }}>
              Pablo entrena a un grupo reducido para cuidar cada plan al detalle, Marcos — y justo ahora
              está completo. Te hemos guardado sitio en la lista: en cuanto se libere una plaza te
              avisamos por email, por orden de llegada.
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: '7px',
                background: 'var(--elev)',
                border: '1px solid var(--v2-border)',
                borderRadius: '10px',
                padding: '11px 18px',
                margin: '20px auto 0',
              }}
            >
              <span
                className="num"
                style={{ fontSize: '24px', fontWeight: 900, color: 'var(--acc)' }}
              >
                nº 3
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>en la lista</span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--faint)', margin: '18px 6px 0' }}>
              Te hemos enviado un email a <b style={{ color: 'var(--muted)' }}>marcos@correo.com</b>.
            </p>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
