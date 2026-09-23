// GUÍA · Invita a tus atletas — Atletas › Invitar atletas / Importar lista:
// uno o una lista (CSV), con nivel, grupo y modalidad para todos, previa línea a
// línea y un enlace de un solo uso por atleta. El puente: cómo activa su cuenta y
// su primer día en la app.

import { DocSection, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Das de alta a tus atletas con su nombre y su email, uno a uno o una lista entera, y cada uno
          recibe un <b>enlace de invitación</b> para activar su cuenta. Sin tiendas de apps ni
          contraseñas que recordar.
        </>
      }
    >
      <h3>Invitar a uno o a una lista</h3>
      <p>
        En <b>Atletas</b>, <b>Invitar atletas</b> (o <b>+ Nuevo › Invitar atleta</b>). Arriba eliges{' '}
        <b>Uno</b> (nombre y apellidos, email) o <b>Varios (lista o CSV)</b>: pegas una persona por
        línea, «nombre, email», copiada de una hoja de cálculo o de tu correo, o subes un CSV.{' '}
        <b>Importar lista</b> abre directamente esta opción.
      </p>
      <p>
        Para todos a la vez eliges tu <b>nivel</b> (con el nombre que le diste), un <b>grupo</b> si
        quieres que empiecen con su plan, y la <b>modalidad</b>: Individual, Dobles o Pro · Elite.
        Antes de invitar ves la previa línea a línea: quién entra y por qué no entra lo demás (un email
        mal escrito, uno que ya está en tu lista).
      </p>

      <h3>Los enlaces</h3>
      <p>
        Al terminar tienes la lista con un <b>Copiar enlace</b> por atleta. Es su llave: de un solo
        uso y caduca. Se lo mandas por donde quieras (mensaje, email…); al abrirlo, crea su acceso y
        entra en la app de tu club.
      </p>

      <DocNote variant="cue" title="Tres caminos para llegar a atleta">
        <ul>
          <li>
            <b>Invitarle tú</b>, como aquí: acceso completo desde el primer minuto, sin cobro.
          </li>
          <li>
            <b>Convertir en atleta</b> a un lead después de la videollamada (si tienes Negocio): fijas
            el precio acordado y es el <b>pago</b> lo que activa su acceso.
          </li>
          <li>
            En los dos casos, al entrar responde su <b>cuestionario de entrada</b> y te llega como{' '}
            <b>alta pendiente</b> (ver <b>Altas pendientes</b>).
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
            <div className="ph-mark"><ClubMark /></div>
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

      <MovilBand
        title="Su primer día en la app"
        subtitle={
          <>
            Nada más activar su cuenta (ya de pago o de cortesía), el primer arranque es una{' '}
            <b>bienvenida de ~30 segundos</b>, no un cuestionario: su perfil ya viajó desde el
            formulario de entrada, así que aquí solo lo <b>confirma</b> antes de aterrizar en Inicio.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su primer día.</b> Le saluda por su nombre y le devuelve el objetivo que puso en el
              formulario. El perfil ya está cargado: solo confirma. Los números finos los medirán sus{' '}
              <b>tests de la semana 1</b>, sin formularios.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark"><ClubMark /></div>
            <div className="avatar">M</div>
          </div>
          <div className="kick" style={{ marginTop: '18px' }}>
            Tu primer día · te damos la bienvenida
          </div>
          <div className="ph-title">Hola, Marta</div>
          <div className="hero" style={{ marginTop: '14px' }}>
            <div className="row">
              <span className="hk">Tu objetivo</span>
            </div>
            <div className="ht">Completar tu primer HYROX</div>
            <div className="meta">Lo dijiste al empezar · lo tienes delante desde hoy</div>
          </div>
          <div className="logcard">
            <div className="lh">Tu perfil, ya cargado · confírmalo</div>
            <div className="field">
              <span className="fl">Nivel</span>
              <span className="fv">Intermedio</span>
            </div>
            <div className="field">
              <span className="fl">Días / semana</span>
              <span className="fv num">4</span>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="fl">Modalidad</span>
              <span className="fv">Individual</span>
            </div>
          </div>
          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Tu punto de partida · semana 1</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
              HYROX half-sim · 5 km · batería 1RM · remo 2K. Tus tests miden lo preciso, no hace
              falta que lo teclees.
            </div>
          </div>
          <div className="cta">Confirmar y entrar</div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="log" title="Su primer día, sin preguntas repetidas">
        <ul>
          <li>
            El primer día no vuelve a preguntar lo que ya contestó: nombre, objetivo, nivel y días ya
            llegaron con el alta. Solo confirma.
          </li>
          <li>
            Conectar Apple Health es <span className="k">saltable</span> y nunca bloquea; si lo deja
            para luego, sigue con captura manual y lo conecta después desde Perfil.
          </li>
          <li>
            Se muestra <span className="k">una sola vez</span>. Y en <span className="k">Dobles</span>,
            un paso extra confirma el emparejamiento con su pareja.
          </li>
        </ul>
      </DocNote>
    </DocSection>
  );
}
