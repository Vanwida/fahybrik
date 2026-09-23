// GUÍA · 12 Asigna y publica por semanas — área «Asignar y empezar».
// Un programa se asigna a un atleta, a varios o a un grupo (previa + deshacer);
// cada semana es Visible u Oculta al atleta y se abre sola N días antes de su
// lunes (Ajustes › Plan del atleta). Retener una semana = dejarla oculta.

import { DocSection, QCWTriad, DocFlow, DocNote, MovilBand, PhoneMockup } from '../doc';
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
          Asignar pone un programa en el calendario de tus atletas; <b>publicar</b> decide qué semanas
          ven. No tienes que acordarte de publicar: cada semana se hace <b>visible sola</b> unos días
          antes de empezar. Tú solo retienes la que no quieras enseñar todavía.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Eliges programa y atletas' },
          { label: 'Ves la previa y confirmas' },
          { label: 'Cada semana se abre sola N días antes' },
          { label: 'Aparece en su móvil', app: true },
        ]}
      />

      <QCWTriad
        que={
          <>
            Cada semana de cada atleta está <b>Visible</b> u <b>Oculta</b>. Visible = la ve en su app.
            Oculta = existe en tu panel y él no la ve.
          </>
        }
        como={
          <>
            <b>Asignar…</b> desde un programa, desde Atletas (varios a la vez) o desde un grupo. Eliges
            el lunes de inicio y qué hacer si alguien ya tiene plan: encadenar, sustituir u omitir.
          </>
        }
        porque={
          <>
            Dar un programa a veinte atletas son unos pocos clics con previa, y si te equivocas,{' '}
            <b>Deshacer</b> deja cada plan exactamente como estaba (nunca borra lo ya entrenado).
          </>
        }
      />

      <h3>1 · Asignar a uno, a varios o a un grupo</h3>
      <p>
        La previa te dice, atleta por atleta, qué recibe y con quién choca («ya tiene Base 4 semanas
        hasta el 18 oct»). Confirmas y se aplica a todos; el aviso final lleva su <b>Deshacer</b>. Al
        entrar en un grupo, el atleta recibe el programa y la semana en que está el grupo.
      </p>

      <h3>2 · Cuándo lo ve: la publicación por semanas</h3>
      <p>
        Al asignar eliges cómo se entrega: <b>automático</b> (cada semana se abre sola), todo{' '}
        <b>visible</b> ya, o todo <b>oculto</b> hasta que lo publiques tú. El automático abre cada
        semana los días antes de su lunes que tengas en <b>Ajustes › Plan del atleta</b> (por defecto,
        el sábado anterior).
      </p>
      <p>
        En la ficha del atleta, cada semana lleva su <span className="k">Visible</span> /{' '}
        <span className="k">Oculta</span>. <b>Publicar semana</b> la enseña ya; <b>Retener</b> la
        mantiene oculta aunque le llegue su día. En Hoy, si muchos no ven su semana, una sola fila te
        deja publicarla a todos.
      </p>

      <DocNote variant="bad" title="Oculta = invisible. A propósito.">
        <ul>
          <li>
            Mientras una semana esté oculta, tu atleta <span className="k">no ve nada</span> de ella.
            Puedes montar, deshacer y rehacer sin que se entere.
          </li>
          <li>
            Aparte, en <b>Ajustes › Plan del atleta</b> decides cuánto puede mirar por delante entre
            las semanas ya visibles (solo la actual, la siguiente, dos o cuatro).
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
