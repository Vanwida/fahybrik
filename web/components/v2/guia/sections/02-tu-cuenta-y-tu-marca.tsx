// GUÍA · 02 Tu cuenta y tu marca — área "Empezar". The coach's identity: the
// editable profile (Ajustes) on the panel, and how the coach's name + photo land
// in the athlete app (chat author/title + the "tu coach" card on Inicio). BUILT.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { CSSProperties } from 'react';
import type { GuiaSection } from '../config';

// Canonical modality hue (only one used here, for the sample plan attribution).
const MOD = { carrera: 'var(--v2-mod-carrera)' } as const;

// Inline styles for the few bits with no dedicated guia.css class. They read the
// frame-local vars (--fg/--muted/--hair…) so they never drift from the live app.
const FIELD_LABEL: CSSProperties = {
  fontSize: '9px',
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};
const FIELD_VALUE: CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--fg)' };
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '3px' };

const CHAT_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '7px',
  marginBottom: '9px',
};
const BUBBLE_BASE: CSSProperties = {
  maxWidth: '78%',
  padding: '8px 11px',
  fontSize: '12px',
  lineHeight: 1.35,
  borderRadius: '14px',
};
const BUBBLE_IN: CSSProperties = {
  ...BUBBLE_BASE,
  background: 'var(--elev)',
  color: 'var(--fg)',
  borderBottomLeftRadius: '4px',
};
const BUBBLE_OUT: CSSProperties = {
  ...BUBBLE_BASE,
  background: 'var(--acc)',
  color: 'var(--accOn)',
  borderBottomRightRadius: '4px',
  marginLeft: 'auto',
};

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Antes de montar nada, deja claro <b>quién eres</b>. Tu perfil de entrenador (tu nombre, tu
          foto, tu box) es lo que tu atleta ve como la persona que está detrás de su plan. No es
          relleno: tu <b>nombre</b> es la firma que aparece en su móvil, en cada mensaje y en cada
          semana que publicas.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Tu identidad dentro de la app: <b>nombre</b>, foto, box o estudio, ubicación, una bio y
            tus especialidades. Todo vive en un único sitio, <b>Ajustes</b>.
          </>
        }
        como={
          <>
            Arriba a la derecha, tu <b>avatar</b> abre tu cuenta; desde ahí entras a{' '}
            <b>Ajustes y perfil</b>. Rellenas los campos y pulsas <b>Guardar cambios</b> una vez: se
            guarda todo junto.
          </>
        }
        porque={
          <>
            Porque tu atleta no entrena con una app anónima: entrena <em className="em">contigo</em>.
            Ver tu nombre y tu cara convierte un plan en algo personal, y la confianza es la mitad
            de la adherencia.
          </>
        }
      />

      <h3>1 · Tu perfil, en un solo sitio</h3>
      <p>
        En <code>Ajustes</code> tienes un único formulario con todo tu perfil: <b>foto</b>,{' '}
        <b>nombre</b>, <b>box o estudio</b>, <b>ubicación</b>, una <b>bio</b> corta, y tus{' '}
        <b>especialidades</b> y <b>certificaciones</b> como etiquetas. Editas lo que quieras y un solo
        botón <code>Guardar cambios</code> lo persiste todo de golpe: no hay que guardar campo a
        campo.
      </p>

      <DocNote variant="cue" title="Dos detalles prácticos">
        <ul>
          <li>
            Tu <b>email</b> aparece bloqueado con un candado: es el que usas para entrar, no se cambia
            desde aquí.
          </li>
          <li>
            La <b>foto</b> admite JPG, PNG o WEBP hasta 4 MB. Si no subes ninguna, tu atleta ve tus{' '}
            <b>iniciales</b> sobre un avatar de color.
          </li>
        </ul>
      </DocNote>

      {/* Dashboard mockup: the Ajustes profile form */}
      <DashboardMockup url="tu-panel / ajustes">
        <div className="ath-hd">
          <div className="av">S</div>
          <div className="nm">
            Sara Vidal<small>Tu perfil de entrenadora</small>
          </div>
          <span className="btn pri" style={{ marginLeft: 'auto' }}>
            Guardar cambios
          </span>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}
        >
          <div style={FIELD}>
            <span style={FIELD_LABEL}>Nombre · lo ve el atleta</span>
            <span style={FIELD_VALUE}>Sara Vidal</span>
          </div>
          <div style={FIELD}>
            <span style={FIELD_LABEL}>Email</span>
            <span style={{ ...FIELD_VALUE, color: 'var(--muted)', fontWeight: 500 }}>
              🔒 sara@tubox.com
            </span>
          </div>
          <div style={FIELD}>
            <span style={FIELD_LABEL}>Box / estudio</span>
            <span style={FIELD_VALUE}>Hybrid Club Barcelona</span>
          </div>
          <div style={FIELD}>
            <span style={FIELD_LABEL}>Ubicación</span>
            <span style={FIELD_VALUE}>Barcelona, España</span>
          </div>
        </div>

        <div style={{ ...FIELD, marginTop: '12px' }}>
          <span style={FIELD_LABEL}>Bio</span>
          <span style={{ ...FIELD_VALUE, color: 'var(--muted)', fontWeight: 500 }}>
            Especialista en híbrido y HYROX. Diez años preparando atletas para competir.
          </span>
        </div>

        <div style={{ ...FIELD, marginTop: '12px' }}>
          <span style={FIELD_LABEL}>Especialidades</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="chip">HYROX</span>
            <span className="chip">Híbrido</span>
            <span className="chip">Fuerza</span>
          </div>
        </div>
      </DashboardMockup>

      <h3>2 · Tu nombre es lo que ve tu atleta</h3>
      <p>
        El campo <code>Nombre</code> lleva la coletilla <em className="em">lo ve el atleta</em> a
        propósito: es tu firma pública. Cuando tu atleta abre la app, tú eres{' '}
        <b>«su entrenador»</b> en el saludo, el remitente de cada mensaje del chat, y el nombre que
        firma la semana que le has publicado. No hay un «coach» genérico: hay un nombre, el tuyo.
      </p>

      <DocNote variant="log" title="“Tu marca” = tu sello, no un logo blanco">
        <p>
          La app se llama <b>FAHYBRID</b> para tu atleta, y eso no cambia. Tu marca aquí es otra cosa
          y más valiosa: tu <b>nombre</b>, tu <b>cara</b> y tu <b>box</b> puestos delante de su
          entrenamiento. Eso es lo que hace que sienta que entrena contigo, no con un software.
        </p>
      </DocNote>

      <MovilBand
        title="Tu nombre y tu cara, en su móvil"
        subtitle={
          <>
            Lo que rellenas en Ajustes no se queda en el panel. Tu <b>foto</b> es el avatar de tu
            atleta cada vez que le escribes, y tu <b>nombre</b> encabeza la conversación y firma su
            plan.
          </>
        }
      >
        {/* PHONE 1: Inicio — el atleta ve a su entrenador */}
        <PhoneMockup
          caption={
            <>
              <b>Inicio.</b> Tu foto y tu nombre presiden la tarjeta de <b>tu coach</b>; su plan de la
              semana aparece firmado <em>por ti</em>.
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
            <div className="ph-mark">FAHYBRID</div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Miércoles 14 ene</div>
          <div className="ph-title">Hola, Marc</div>

          <div className="row-card" style={{ marginTop: '14px' }}>
            <div className="ca">S</div>
            <div className="tx">
              <div className="e">Tu entrenadora · Sara Vidal</div>
              <div className="m">Buen trabajo en la tirada del lunes</div>
            </div>
            <div className="chev">›</div>
          </div>

          <div className="foco-strip" style={{ marginTop: '14px' }}>
            <span className="l">TU SEMANA</span>
            <span className="v">Firmada por Sara</span>
          </div>
          <div className="day today">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Series 6×800</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">JUE</span>
            <span className="mdot" style={{ background: 'var(--faint)' }} />
            <span className="dt rest">Descanso</span>
          </div>
        </PhoneMockup>

        {/* PHONE 2: Chat — la conversación lleva tu nombre */}
        <PhoneMockup
          caption={
            <>
              <b>Chat.</b> La conversación se titula con <b>tu nombre</b> y cada mensaje tuyo lleva tu
              avatar. Tu atleta habla contigo, no con un buzón anónimo.
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
              Sara Vidal
            </div>
            <div className="avatar">S</div>
          </div>
          <div
            className="num"
            style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' }}
          >
            Tu entrenadora
          </div>

          <div style={CHAT_ROW}>
            <div className="avatar">S</div>
            <div style={BUBBLE_IN}>¿Cómo fueron las series de hoy?</div>
          </div>
          <div style={CHAT_ROW}>
            <div style={BUBBLE_OUT}>Bien, las dos últimas con piernas cargadas.</div>
          </div>
          <div style={CHAT_ROW}>
            <div className="avatar">S</div>
            <div style={BUBBLE_IN}>Perfecto, es justo el estímulo que buscábamos.</div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
