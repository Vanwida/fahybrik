// GUÍA · 20 Leads: tu embudo de entrada — área "Tu negocio". Cada visita que deja su
// email en la web se vuelve un lead tuyo (aunque abandone a mitad). La sección Leads es
// tu embudo: el estado de cada persona, forward-only, y el «convertido» honesto (solo al
// reclamar la cuenta). El puente: el lead aún NO tiene la app — vive el funnel en la web.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Pipeline hues from the live tokens (mirrors LEAD_STATUS_META tones — never drift):
// nuevo=accent, contactado=info, agendado/convertido=ok, parcial/descartado=faint.
const HUE = {
  nuevo: 'var(--v2-accent)',
  contactado: 'var(--v2-info)',
  agendado: 'var(--v2-ok)',
  convertido: 'var(--v2-ok)',
  parcial: 'var(--v2-faint)',
} as const;

/** A status pill — mirrors the dashboard `.sp` chip. Resolves in both the doc body and
 *  the mockup (uses --v2-* base tokens, available in every scope). */
function StatusPill({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '3px 9px',
        borderRadius: '99px',
        whiteSpace: 'nowrap',
        color,
        border: `1px solid ${color}`,
        opacity: dim ? 0.6 : 1,
      }}
    >
      {label}
    </span>
  );
}

function Arrow() {
  return <span style={{ color: 'var(--v2-faint)', fontSize: '11px' }}>→</span>;
}

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cada visita que deja su email en tu web se vuelve un <b>lead tuyo</b> — aunque abandone a
          mitad del onboarding. La sección <b>Leads</b> es tu embudo: la lista de todas esas
          personas con el <b>estado</b> de cada una y lo que buscan, para que sepas a quién llamar
          primero.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una lista de todas las personas que han pasado por tu web y dejado su email. Cada una
            con su <b>estado</b> en el embudo, su <b>objetivo</b> y de cuándo es. Son{' '}
            <b>leads globales</b>: todos tuyos, sin reparto.
          </>
        }
        como={
          <>
            La lees de un vistazo, ordenada por lo más accionable. Un clic abre la ficha con todo lo
            que contó en el onboarding. Mueves su estado a mano{' '}
            <em className="em">solo hacia adelante</em>: contactado, cita agendada o descartado.
          </>
        }
        porque={
          <>
            Porque un email dejado a medias sigue siendo una oportunidad. Si no lo capturas y lo
            ordenas, se pierde. Aquí no se pierde ninguno — y ves de un golpe dónde está cada uno.
          </>
        }
      />

      <h3>1 · Cada email que entra es un lead tuyo</h3>
      <p>
        El lead hace tu onboarding en la web. En cuanto deja su email —{' '}
        <em className="em">aunque no termine el resto</em> — ya cuenta como lead y aparece en la
        lista como <code>Sin terminar</code>. No se espera a que rellene todo: el email es la puerta
        de entrada, y esa puerta no se cierra.
      </p>

      <h3>2 · El estado solo avanza, nunca retrocede</h3>
      <p>
        El estado de un lead se mueve hacia adelante por el embudo. El sistema pone{' '}
        <code>Sin terminar</code> y <code>Nuevo</code> solos; tú marcas <code>Contactado</code>,{' '}
        <code>Cita agendada</code> o <code>Descartado</code>. No hay marcha atrás — la única
        excepción es reabrir un descartado por error (vuelve a <code>Nuevo</code>).
      </p>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', margin: '2px 0 6px' }}
      >
        <StatusPill label="Sin terminar" color={HUE.parcial} dim />
        <Arrow />
        <StatusPill label="Nuevo" color={HUE.nuevo} />
        <Arrow />
        <StatusPill label="Contactado" color={HUE.contactado} />
        <Arrow />
        <StatusPill label="Cita agendada" color={HUE.agendado} />
        <Arrow />
        <StatusPill label="Convertido" color={HUE.convertido} />
      </div>

      {/* Dashboard mockup: el embudo — cabecera con contadores + tabla de leads */}
      <DashboardMockup url="tu-panel / leads">
        <div className="wk-head">
          <div className="wk-title">
            Leads&nbsp; <small>tu embudo de entrada</small>
          </div>
          <div className="wk-tools">
            <span className="btn">Filtrar</span>
          </div>
        </div>
        <div className="wk-sum">
          <span className="chip" style={{ color: HUE.nuevo, borderColor: HUE.nuevo }}>
            8 nuevos
          </span>
          <span className="chip" style={{ color: HUE.agendado, borderColor: HUE.agendado }}>
            3 citas
          </span>
          <span className="chip" style={{ color: 'var(--muted)' }}>
            2 sin terminar
          </span>
        </div>

        <table className="sesstbl">
          <tbody>
            <tr>
              <th>Nombre</th>
              <th>Objetivo</th>
              <th>Estado</th>
              <th>Origen</th>
              <th>Cuándo</th>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Nora Vidal</td>
              <td>Primera HYROX</td>
              <td>
                <StatusPill label="Nuevo" color={HUE.nuevo} />
              </td>
              <td className="n">Onboarding web</td>
              <td className="n">hace 2 h</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Marc Puig</td>
              <td>Bajar de 1h en 10K</td>
              <td>
                <StatusPill label="Contactado" color={HUE.contactado} />
              </td>
              <td className="n">Onboarding web</td>
              <td className="n">ayer</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Júlia Roca</td>
              <td>Dobles con su pareja</td>
              <td>
                <StatusPill label="Cita agendada" color={HUE.agendado} />
              </td>
              <td className="n">Onboarding web</td>
              <td className="n">hace 3 d</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Bruno Sáez</td>
              <td>Volver a competir</td>
              <td>
                <StatusPill label="Nuevo" color={HUE.nuevo} />
              </td>
              <td className="n">Onboarding web</td>
              <td className="n">hace 5 h</td>
            </tr>
            <tr>
              <td>
                <span style={{ color: 'var(--faint)' }}>laura@gmail.com</span>
              </td>
              <td>
                <span style={{ color: 'var(--faint)' }}>Primera HYROX</span>
              </td>
              <td>
                <StatusPill label="Sin terminar" color={HUE.parcial} dim />
              </td>
              <td className="n">Onboarding web</td>
              <td className="n">hace 40 min</td>
            </tr>
          </tbody>
        </table>
      </DashboardMockup>

      <DocNote variant="log" title="Convertido = solo al reclamar la cuenta">
        <p>
          Un lead pasa a <b>Convertido</b> únicamente cuando la persona <b>reclama su cuenta</b>{' '}
          (canjea la invitación y, con cobro, completa el pago). Darlo de alta desde su ficha{' '}
          <em className="em">no</em> lo convierte todavía. Así tu contador de conversiones dice la
          verdad: cuenta atletas de verdad, no invitaciones enviadas.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Leads globales — todos tuyos">
        <p>
          Al ser un único entrenador, no hay reparto de leads entre coaches: todos los que entran
          son tuyos. En el menú lateral, la entrada <b>Leads</b> lleva un contador con los{' '}
          <b>nuevos</b> sin tocar, para que sepas cuántos te esperan sin abrir la sección.
        </p>
      </DocNote>

      <MovilBand
        title="Lo que vive tu futuro atleta"
        subtitle={
          <>
            Ojo: el lead todavía <b>no tiene la app</b>. Vive el funnel en la <b>web</b>, respondiendo
            un onboarding tap-first. El momento clave es cuando deja su email: ahí, y no antes, se
            vuelve un lead en tu panel.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Onboarding web.</b> En cuanto deja su email ya es un lead en tu panel — aunque no
              termine el resto. Ahí aparece como <b>«Sin terminar»</b>.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '10px' }}>
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div />
          </div>

          {/* Progreso del onboarding */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: '3px',
                  borderRadius: '99px',
                  background: i < 2 ? 'var(--acc)' : 'var(--hair)',
                }}
              />
            ))}
          </div>

          <div className="kick">Paso 2 de 7</div>
          <div className="ph-title sm" style={{ marginBottom: '12px' }}>
            ¿Cuál es tu objetivo?
          </div>

          {/* Opciones tap — una seleccionada */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                padding: '12px 13px',
                borderRadius: '11px',
                border: '1px solid var(--acc)',
                background: 'var(--accSoft)',
                color: 'var(--fg)',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              <span style={{ color: 'var(--acc)', fontWeight: 900 }}>✓</span> Mi primera HYROX
            </div>
            {['Bajar mi tiempo', 'Competir en dobles', 'Volver a entrenar en serio'].map((o) => (
              <div
                key={o}
                style={{
                  padding: '12px 13px',
                  borderRadius: '11px',
                  border: '1px solid var(--hair)',
                  color: 'var(--muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {o}
              </div>
            ))}
          </div>

          {/* El momento del email — aquí se vuelve lead */}
          <div
            style={{
              border: '1px solid var(--acc)',
              borderRadius: '13px',
              padding: '13px',
              background: 'var(--accSoft)',
            }}
          >
            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                marginBottom: '8px',
              }}
            >
              Déjanos tu email
            </div>
            <div
              style={{
                background: 'var(--sunken)',
                border: '1px solid var(--hair)',
                borderRadius: '9px',
                padding: '10px 11px',
                fontSize: '13px',
                color: 'var(--fg)',
              }}
            >
              laura@gmail.com
            </div>
            <div className="cta" style={{ marginTop: '9px' }}>
              Continuar
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        Ningún lead se pierde: cada email es una puerta que dejas abierta. Y los que se enfrían no
        dependen de que te acuerdes de ellos — el sistema los reengancha solo, como verás en la
        sección siguiente.
      </p>
    </DocSection>
  );
}
