// GUÍA · 12 Asigna el plan: borrador → publicado — área "Asignar y empezar". BUILT.
// Real flow: AssignBar (gate "Listo para asignar": Evento/Nivel/Estructura/Avisos/
// Bienvenida → "Asignar plan") materializa el primer microciclo en BORRADOR →
// PlanTab muestra el estado (sin publicar / N de M publicadas) y el
// botón "Publicar microciclo" lo pone en el móvil del atleta. Strings reales.

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

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Este es el paso que conecta tu trabajo con su teléfono. Primero <b>asignas</b>, y el plan
          nace en <b>borrador</b>, solo para ti, para que lo revises con calma. Cuando estás conforme,
          lo <b>publicas</b> y, en ese instante, aparece en el móvil de tu atleta. Nada le llega hasta
          que tú lo decides.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Pasas el gate' },
          { label: 'Asignas → borrador' },
          { label: 'Lo revisas' },
          { label: 'Publicas → en su móvil', app: true },
        ]}
      />

      <QCWTriad
        que={
          <>
            Dos estados claros. <b>Borrador</b>: el plan existe en tu panel pero tu atleta no lo ve.{' '}
            <b>Publicado</b>: la semana ya está en su móvil. El paso entre uno y otro es deliberado y
            es tuyo.
          </>
        }
        como={
          <>
            Cuando el gate <code>Listo para asignar</code> está en verde, pulsas <code>Asignar plan</code>{' '}
            y se crea el primer ciclo en borrador. Lo repasas, y cuando esté, pulsas{' '}
            <code>Publicar ciclo</code>.
          </>
        }
        porque={
          <>
            Porque nadie quiere que su atleta vea un plan a medio montar. El borrador te da margen para
            revisar sin prisa; publicar es un acto consciente, no un accidente.
          </>
        }
      />

      <h3>1 · El gate: cinco puntos en verde</h3>
      <p>
        Asignar no se desbloquea hasta que todo cuadra. La barra <code>Listo para asignar</code> te
        muestra los puntos: <b>Evento</b> (la carrera objetivo tiene que estar anclada: el plan se
        construye hacia atrás desde esa fecha), <b>Nivel</b>, <b>Estructura</b>, <b>Avisos</b> por
        confirmar y <b>Bienvenida</b>. En rojo o pendiente, el botón sigue bloqueado y te dice cuántos
        puntos quedan. En verde, <code>Asignar plan</code> se enciende.
      </p>

      <h3>2 · Asignar crea el borrador</h3>
      <p>
        Al pulsar <code>Asignar plan</code>, el panel te lo dice tal cual:{' '}
        <em className="em">«Se creará el primer ciclo en borrador para que lo revises antes de
        publicar»</em>. Aterrizas en el plan del atleta con la semana ya montada, pero en borrador,
        invisible para él. Aquí ajustas lo que quieras sin que nadie lo vea.
      </p>

      <h3>3 · Publicar lo pone en su móvil</h3>
      <p>
        En la ficha del atleta, una etiqueta honesta te dice en qué estado está:{' '}
        <span className="k">N de M publicadas</span> y el carril
        <span className="k">Visible</span> / <span className="k">Borrador</span> por semana. Mientras haya borrador,
        verás el botón <code>Publicar ciclo</code>. Lo pulsas y todas las semanas en borrador
        pasan a publicadas: tu atleta abre su app y ahí está su semana.
      </p>

      {/* Dashboard mockup: ficha del atleta — estado borrador + botón publicar */}
      <DashboardMockup url="tu-panel / atletas / marta · plan">
        <div className="wk-head">
          <div className="wk-title">
            Ciclo «Acumulación»&nbsp;{' '}
            <small style={{ color: 'var(--warn)' }}>● borrador · aún no lo ve el atleta</small>
          </div>
          <div className="wk-tools">
            <span className="btn pri">Publicar ciclo</span>
          </div>
        </div>
        <div className="wk-sum">
          <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Semana 1 · base aeróbica</span>
          <span className="chip" style={{ color: MOD.carrera, borderColor: MOD.carrera }}>
            3 Carrera
          </span>
          <span className="chip" style={{ color: MOD.fuerza }}>
            1 Fuerza
          </span>
          <span className="chip" style={{ color: MOD.ergo }}>
            1 Ergómetro
          </span>
        </div>
        <div className="savegate">
          Revísalo con calma. Nada llega a su móvil hasta que pulses «Publicar ciclo».
        </div>
      </DashboardMockup>

      <DocNote variant="bad" title="Borrador = invisible. A propósito.">
        <ul>
          <li>
            Mientras el ciclo esté en borrador, tu atleta <span className="k">no ve nada</span>{' '}
            de esa semana. Puedes montar, deshacer y rehacer sin que se entere.
          </li>
          <li>
            Publicar es el único acto que se lo enseña. Si el badge no llega a
            <span className="k">M de M publicadas</span>, quedan semanas en
            <span className="k">Borrador</span>: el botón sigue ahí.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Antes y después de publicar"
        subtitle={
          <>
            A la izquierda, lo que ve tu atleta mientras el plan está en borrador: nada todavía, solo
            la espera. A la derecha, el instante en que pulsas <b>Publicar</b>: su semana aparece, lista
            para empezar.
          </>
        }
      >
        {/* PHONE 1: esperando (borrador) */}
        <PhoneMockup
          caption={
            <>
              <b>En borrador.</b> Su cuenta está activa, pero la semana aún no existe para él. Solo ve
              que su coach está en ello.
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
          <div className="ph-title">Hola, Marta</div>
          <div className="hero" style={{ marginTop: '16px' }}>
            <div className="row">
              <span className="hk">Tu plan</span>
            </div>
            <div className="ht">Aún no disponible</div>
            <div className="meta">Tu coach está montando tu primera semana.</div>
          </div>
          <div className="row-card" style={{ marginTop: '14px' }}>
            <div className="ca">P</div>
            <div className="tx">
              <div className="e">Tu coach</div>
              <div className="m">Bienvenida, te preparo el plan estos días</div>
            </div>
            <div className="chev">›</div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: publicado */}
        <PhoneMockup
          caption={
            <>
              <b>Publicado.</b> Pulsaste «Publicar ciclo» y su semana entera aterriza, día a día,
              lista para entrenar.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            12–18 ene · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Base aeróbica</span>
          </div>
          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Tirada larga Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Series 6×800</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">VIE</span>
            <span className="mdot" style={{ background: MOD.circuito }} />
            <span className="dt">Simulación HYROX</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">SÁB</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="prog">
            <span className="l">Progreso de la semana</span>
            <div className="v num">0 / 5</div>
            <div className="bar">
              <span style={{ width: '0%' }} />
            </div>
            <div className="cap">Tu plan está listo. Empieza cuando quieras.</div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
