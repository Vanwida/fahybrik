// GUÍA · 10 Da de alta e invita — área "Asignar y empezar". BUILT.
// Real flow: AddAthleteModal (POST /api/coach/athletes → crea, +/invite → enlace
// de un solo uso) + el atleta reclama su cuenta desde el enlace e inicia sesión.
// Strings tomados del componente real (no inventados).

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

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Todo empieza aquí: das de alta a tu atleta con su nombre y su email, y el panel te devuelve
          un <b>enlace de invitación</b> para que active su cuenta. Tú captas; él entra. Sin tiendas
          de apps, sin contraseñas, sin fricción.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Lo das de alta' },
          { label: 'Copias su enlace' },
          { label: 'Se lo envías' },
          { label: 'Activa su cuenta', app: true },
        ]}
      />

      <QCWTriad
        que={
          <>
            Un atleta tuyo en el panel: <b>nombre</b>, <b>email</b> y <b>modalidad</b> (Individual,
            Dobles o Pro · Elite). Tiene acceso completo desde el primer minuto.
          </>
        }
        como={
          <>
            Pulsas <b>Agregar atleta</b>, rellenas los tres campos y le das a{' '}
            <code>Crear e invitar</code>. El panel genera un <b>enlace de un solo uso</b> que copias
            y le mandas por donde quieras (mensaje, email…).
          </>
        }
        porque={
          <>
            Porque quieres controlar tú quién entra y que entrar sea inmediato. El atleta no busca
            nada en una tienda: abre tu enlace y ya está dentro, listo para recibir su plan.
          </>
        }
      />

      <h3>1 · Lo das de alta en tres campos</h3>
      <p>
        En tu lista de atletas, <code>Agregar atleta</code> abre una ficha breve:{' '}
        <code>Nombre completo</code>, <code>Email</code> y <code>Modalidad</code>. El email se valida
        al vuelo — si no es válido, el botón no se activa. Eliges la modalidad con un toque y pulsas{' '}
        <code>Crear e invitar</code>. Eso crea su sitio en tu panel con acceso completo, sin cobros.
      </p>

      <h3>2 · El enlace de invitación, una sola vez</h3>
      <p>
        Tras crearlo, el panel te muestra el mensaje <em className="em">«Atleta creado»</em> y un{' '}
        enlace listo para <code>Copiar</code>. Es la llave de su cuenta: un solo uso y caduca. Si se
        pierde o expira, lo <b>vuelves a generar</b> desde el perfil del atleta — nunca te quedas sin
        forma de invitar.
      </p>

      {/* Dashboard mockup: el modal Agregar atleta en su estado de éxito */}
      <DashboardMockup url="tu-panel / atletas / agregar atleta">
        <div className="wk-head">
          <div className="wk-title">
            Atleta creado&nbsp; <small>acceso completo · sin cobros</small>
          </div>
        </div>
        <div className="ath-hd">
          <div className="av">M</div>
          <div className="nm">
            Marta Ruiz<small>Individual · ya está en tu lista</small>
          </div>
        </div>
        <div className="savegate">
          Envíale este enlace para que active su cuenta:
        </div>
        <div className="ed-row">
          <span className="ed-input" style={{ flex: 1 }}>
            fahybrid.com/activar/9f3a-…-c1
          </span>
          <span className="btn pri">Copiar</span>
        </div>
        <div
          style={{
            fontSize: '9.5px',
            color: 'var(--faint)',
            marginTop: '6px',
          }}
        >
          Enlace de un solo uso. Caduca; puedes regenerarlo desde el perfil del atleta.
        </div>
      </DashboardMockup>

      <DocNote variant="cue" title="Modalidad: qué eliges y por qué">
        <ul>
          <li>
            <span className="k">Individual</span> — compite solo. <span className="k">Dobles</span> —
            corre en pareja (los splits son del equipo). <span className="k">Pro · Elite</span> —
            categoría de máximo nivel.
          </li>
          <li>
            La modalidad orienta cómo lees sus carreras y resultados más adelante; siempre la puedes
            cambiar desde su perfil.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="El enlace, en sus manos"
        subtitle={
          <>
            Tu atleta abre el enlace que le mandaste, <b>activa su cuenta</b> e inicia sesión con
            Apple. Sin registros largos: en dos toques está dentro, con tu nombre arriba y su plan en
            camino.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Activar.</b> El enlace lo lleva directo a esta pantalla. Un toque en{' '}
              <b>Continuar con Apple</b> y su cuenta queda lista.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div />
          </div>
          <div className="kick" style={{ marginTop: '20px' }}>
            Te invita tu entrenador
          </div>
          <div className="ph-title">Activa tu cuenta</div>
          <div className="hero" style={{ marginTop: '16px' }}>
            <div className="row">
              <span className="hk">Tu sitio ya está creado</span>
            </div>
            <div className="ht">Marta Ruiz</div>
            <div className="meta">Individual · invitado por tu coach</div>
          </div>
          <div className="cta" style={{ marginTop: '18px' }}>
             Continuar con Apple
          </div>
          <div className="cta ghost" style={{ marginTop: '10px' }}>
            ¿Ya tienes cuenta? Inicia sesión
          </div>
          <div
            className="num"
            style={{
              fontSize: '10px',
              color: 'var(--faint)',
              textAlign: 'center',
              marginTop: '16px',
            }}
          >
            Enlace de un solo uso · caduca pronto
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
