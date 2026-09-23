// GUÍA · 02 Tu cuenta y tu marca — área "Empezar". The coach's identity: the
// editable profile (Ajustes) on the panel, and how the coach's name + photo land
// in the athlete app (chat author/title + the "tu coach" card on Inicio). BUILT.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
} from '../doc';
import type { CSSProperties } from 'react';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

// Canonical modality hue (only one used here, for the sample plan attribution).
const MOD = { carrera: 'var(--v2-mod-carrera)' } as const;

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
            Dos paneles en Ajustes. <b>Tu perfil</b>: la persona (nombre, foto, bio, especialidades,
            titulaciones). <b>Tu club</b>: la marca (nombre del club, logo, color, box, dirección y el
            correo que recibe los avisos).
          </>
        }
        como={
          <>
            Desde tu avatar, arriba a la derecha: <b>Tu perfil</b> o <b>Tu club</b>. Escribes y sales
            del campo: se guarda solo y te dice «Guardado». No hay botón de guardar.
          </>
        }
        porque={
          <>
            Porque tu atleta no entrena con una app anónima: entrena <em className="em">contigo</em>.
            Tu nombre, tu cara y tu club delante del plan hacen que sea personal.
          </>
        }
      />

      <h3>1 · Tu perfil: la persona</h3>
      <p>
        Tu <b>nombre</b> es tu firma pública: el saludo de su app, el remitente de cada mensaje y
        quien firma su semana. La <b>foto</b> se guarda al elegirla; sin ella, tu atleta ve tus
        iniciales. El <b>correo de acceso</b> no se cambia aquí: está en <b>Ajustes › Cuenta</b>.
      </p>

      <h3>2 · Tu club: la marca</h3>
      <p>
        El <b>nombre del club</b> y el <b>logo</b> sustituyen a los de la app en el móvil de tus
        atletas y en sus correos. El <b>color</b> va en tres sitios del panel (el botón principal, el
        anillo de foco y tu logo) y en la app de tus atletas; la vista previa te enseña cómo queda en
        claro y en oscuro, y si hay que ajustarlo para que se lea, te lo dice. Si se parece a un color
        que ya significa algo (rojo, ámbar, verde, azul), te avisa.
      </p>

      <DocNote variant="cue" title="Un campo, un sitio">
        <p>
          El nombre del box y la dirección de las sesiones presenciales viven solo en Tu club: son los
          que salen en el correo y el calendario de quien reserva.
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
            <div className="ph-mark"><ClubMark /></div>
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
