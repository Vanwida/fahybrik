// GUÍA · Asigna y publica por semanas — el panel de asignar (para, programa,
// lunes, entra en, entrega, si ya tiene programa, previa y deshacer) y la
// visibilidad por semanas: Visible / Oculta, retener y soltar, y Ajustes › Plan
// del atleta. El puente: lo que ve en su móvil de una semana visible.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Badge } from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

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
          <b>Asignar</b> pone un programa en el calendario de tus atletas; <b>publicar</b> decide qué
          semanas ven. No tienes que acordarte de publicar: cada semana se hace <b>visible sola</b>{' '}
          unos días antes de empezar. Tú solo retienes la que no quieras enseñar todavía.
        </>
      }
    >
      <h3>Asignar a uno, a varios o a un grupo</h3>
      <p>
        El mismo panel se abre desde donde estés: <b>Asignar…</b> en un programa o en un grupo,{' '}
        <b>Asignar programa</b> con varios atletas seleccionados, <b>+ Nuevo › Asignar programa…</b>{' '}
        o la fila de Hoy <b>Asignar a los N…</b>. Eliges:
      </p>
      <ul className="clean">
        <li>
          <b>Para</b>: atletas y grupos, mezclados.
        </li>
        <li>
          <b>Programa</b> y el <b>lunes</b> en que empieza. <b>Entra en</b> deja empezar por una semana
          que no sea la primera.
        </li>
        <li>
          <b>Entrega</b>: <b>Semana a semana</b> (cada semana se abre sola), <b>Todo visible</b> ya, u
          oculto hasta que lo publiques tú.
        </li>
        <li>
          <b>Si ya tiene programa</b>: <b>Encadenar detrás</b>, <b>Sustituir</b> o <b>Saltar</b> a ese
          atleta.
        </li>
      </ul>
      <p>
        La previa te dice, atleta por atleta, qué recibe y con quién choca («ya tiene Base hasta el 18
        oct»). Confirmas y se aplica a todos; el aviso trae <b>Deshacer</b>, que deja cada plan como
        estaba y nunca borra lo ya entrenado.
      </p>

      <h3>Cuándo lo ve: visible u oculta</h3>
      <PanelFigure
        caption={
          <>
            Cada semana de cada atleta está <b>Visible</b> (la ve en su app) u <b>Oculta</b> (existe en
            tu panel y él no la ve). Con candado: retenida, no se publica sola.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok" label="Visible" icon="eye" soft />
          <Badge tone="neutral" label="Oculta" icon="eye-off" soft />
          <Badge tone="warn" label="Oculta" icon="lock" soft />
        </div>
      </PanelFigure>
      <p>
        Con <b>Semana a semana</b>, cada semana se abre sola los días antes de su lunes que fijes en{' '}
        <b>Ajustes › Plan del atleta › Abrir cada semana</b>. En la ficha del atleta, el <b>···</b> de
        cada semana tiene <b>Publicar ya</b>, <b>Retener: no publicar sola</b> (o{' '}
        <b>Ocultar y retener</b> si ya era visible) y <b>Soltar: que se publique sola</b>. Para
        muchos a la vez: <b>Publicar semana</b> en Atletas o la fila de Hoy{' '}
        <b>N atletas no ven su semana › Publicar a los N</b>.
      </p>

      <DocNote variant="bad" title="Oculta = invisible. A propósito.">
        <ul>
          <li>
            Mientras una semana esté oculta, tu atleta <span className="k">no ve nada</span> de ella.
            Puedes montar, deshacer y rehacer sin que se entere. Una semana visible, en cambio, la ve
            al momento: lo que cambies le llega ya.
          </li>
          <li>
            En <b>Ajustes › Plan del atleta › Cuánto puede mirar por delante</b> decides, de las
            semanas visibles, cuántas puede ver por adelantado.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Antes y después de publicar"
        subtitle={
          <>
            A la izquierda, lo que ve tu atleta mientras su semana está oculta: nada todavía, solo
            la espera. A la derecha, el momento en que se hace visible: su semana aparece, lista
            para empezar.
          </>
        }
      >
        {/* PHONE 1: esperando (semana oculta) */}
        <PhoneMockup
          caption={
            <>
              <b>Oculta.</b> Su cuenta está activa, pero la semana aún no existe para él. Solo ve
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
            <div className="ph-mark"><ClubMark /></div>
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
              <b>Visible.</b> Llegó su día (o pulsaste «Publicar semana») y su semana aterriza, día a día,
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
