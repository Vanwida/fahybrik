// GUÍA · 30 Importar entrenos del Excel — área "Herramientas". Una mano de
// extracción TIPADA: el coach crea el microciclo vacío, señala un rango del Excel
// en lenguaje natural + la variante, y la IA convierte SOLO esas filas en sesiones
// tipadas — el resto del Excel se ignora. Revisión verde/ámbar/rojo (= el editor de
// día pre-poblado) y gate tipado (.strict) al confirmar. Herramienta SOLO del coach:
// no tiene cara en el móvil del atleta (como Métricas del funnel) → sin MovilBand.

import { DocSection, QCWTriad, DocFlow, DocNote, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// ── Estado de revisión (verde/ámbar/rojo/gris) — misma paleta que el resto de la
//    app. Un solo componente para la rejilla y las filas «crudo → tipado» (DRY).
type ReviewState = 'tipado' | 'revisar' | 'ejercicio' | 'resolver' | 'fuera';
const REVIEW: Record<ReviewState, { label: string; fg: string; bg: string }> = {
  tipado: { label: 'Tipado', fg: 'var(--v2-ok)', bg: 'var(--v2-ok-soft)' },
  revisar: { label: 'Revisar', fg: 'var(--v2-warn)', bg: 'var(--v2-warn-soft)' },
  ejercicio: { label: 'Ejercicio?', fg: 'var(--v2-danger)', bg: 'var(--v2-danger-soft)' },
  resolver: { label: 'Resolver', fg: 'var(--v2-danger)', bg: 'var(--v2-danger-soft)' },
  fuera: { label: 'No entra', fg: 'var(--muted)', bg: 'var(--sunken)' },
};

function Tag({ state }: { state: ReviewState }) {
  const m = REVIEW[state];
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: m.fg,
        background: m.bg,
        padding: '2px 7px',
        borderRadius: '99px',
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

/** One day of the review week: title + review status (topbar + tag). Server-safe. */
function ReviewCell({
  day,
  title,
  state,
}: {
  day: string;
  title?: string;
  /** Undefined = descanso (sin estado). */
  state?: Exclude<ReviewState, 'resolver'>;
}) {
  const color = state ? REVIEW[state].fg : undefined;
  return (
    <div className="col">
      {color ? <span className="topbar" style={{ background: color }} /> : null}
      <div className="cd">{day}</div>
      {title ? (
        <div
          className="ch"
          style={
            state === 'fuera'
              ? { textDecoration: 'line-through', color: 'var(--faint)' }
              : undefined
          }
        >
          {title}
        </div>
      ) : (
        <div className="rest">Descanso</div>
      )}
      {state ? (
        <span style={{ position: 'absolute', bottom: '6px', left: '7px' }}>
          <Tag state={state} />
        </span>
      ) : null}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }}
      />
      <span style={{ color: 'var(--muted)' }}>{label}</span>
    </span>
  );
}

// Uppercase micro header inside the mockup (echoes sección 25).
const microHead = {
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  margin: '20px 0 10px',
} as const;

// La semana de revisión: casi todo tipado, un Fartlek a revisar, un WOD con un
// ejercicio fuera de catálogo y un miércoles que el coach deja fuera del import.
// Este es el protagonista de la sección.
const REVIEW_WEEK: { day: string; title?: string; state?: Exclude<ReviewState, 'resolver'> }[] = [
  { day: 'LUN', title: 'Fuerza inf.', state: 'tipado' },
  { day: 'MAR', title: 'Ergo interv.', state: 'tipado' },
  { day: 'MIÉ', title: 'Fuerza sup.', state: 'fuera' },
  { day: 'JUE', title: 'Fartlek', state: 'revisar' },
  { day: 'VIE', title: 'Largo Z2', state: 'tipado' },
  { day: 'SÁB', title: 'WOD denso', state: 'ejercicio' },
  { day: 'DOM' },
];

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Rellena un ciclo desde tu Excel <b>sin perder el control</b>: tú marcas el rango, la
          IA lo <b>tipa</b>, tú revisas lo dudoso. No subes el Excel y «aparece» el plan: el resto
          del archivo <b>ni se toca</b>. Es tu atajo para pasar tu hoja de cálculo a plan, con tu
          mano siempre encima.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Creas el ciclo con sus semanas vacías' },
          { label: '＋ Importar del Excel: subes el .xlsx y señalas rango + variante' },
          { label: 'La IA lee SOLO ese rango y lo tipa → revisión verde/ámbar/rojo' },
          { label: 'Eliges qué entra: dejas fuera el día o la semana que no quieras' },
          { label: 'Confirmas los días elegidos y entran en el ciclo' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Una <b>mano de extracción tipada</b>. Subes tu Excel, señalas un <b>rango</b> y la IA
            convierte esas filas en <b>sesiones tipadas</b> de tu ciclo. El resto del Excel se
            ignora: no reconstruye nada por su cuenta.
          </>
        }
        como={
          <>
            Creas el ciclo vacío, pulsas <b>Importar del Excel</b>, dices el rango en tu idioma
            (<em className="em">«de la semana 1 a la 4»</em>) y la <b>variante</b>. La IA lo tipa; tú
            revisas lo <b>verde/ámbar/rojo</b>, <b>eliges qué días entran</b> y confirmas.
          </>
        }
        porque={
          <>
            Porque <b>tú posees la planificación</b>. Te ahorra el tecleo manual sin cederte el
            mando: nada entra sin pasar por tu revisión y por el <b>gate tipado</b>. Rápido, pero sin
            dejar de ser tu plan.
          </>
        }
      />

      <h3>1 · Tú marcas el rango</h3>
      <p>
        La planificación la montas tú: creas el ciclo con sus <b>semanas vacías</b> bajo un
        nivel, y ya dentro de <code>microciclos/[id]</code> pulsas <code>＋ Importar del Excel</code>.
        Subes el <code>.xlsx</code> y <b>señalas el rango en lenguaje natural</b>{' '}
        (<em className="em">«de la semana 1 a la 4»</em>) más la <b>variante</b> del bloque (
        <code>Estándar</code> / <code>Fuerza</code> / <code>Resistencia</code>). La IA lee{' '}
        <b>solo ese rango</b>; todo lo demás de la hoja queda fuera.
      </p>

      <DocNote variant="cue" title="Tú posees la planificación">
        <p>
          La IA <b>solo extrae</b> el rango que tú señalas: no interpreta el resto del Excel ni
          «adivina» el plan. Tú decides qué semanas entran y con qué variante; ella hace el trabajo
          sucio de tipar esas filas, nada más.
        </p>
      </DocNote>

      <h3>2 · La IA lo tipa, tú revisas</h3>
      <p>
        Los <b>números</b> los saca una <b>gramática determinista</b> primero: los mismos patrones de
        tu notación (<code>10/10/8/8/6</code>, <code>60–75% RM</code>, <code>5×3&apos;</code>,{' '}
        <code>z2</code>, <code>c/2&apos;30&quot;</code>) con reglas exactas, no un modelo (un patrón no se
        inventa una cifra). La IA solo entra a apoyar en lo <b>denso o ambiguo</b> (un WOD, una
        simulación HYROX). El resultado es una <b>rejilla de la semana</b> con un estado por día:{' '}
        <b>verde = tipado</b> (se guarda tal cual), <b>ámbar = revisar</b> (propuesto, míralo) y{' '}
        <b>rojo = ejercicio fuera de tu catálogo</b> (elígelo o créalo). Esa revisión{' '}
        <b>es tu editor de día de siempre</b> (el mismo de «Monta la semana», ya pre-poblado): los
        verdes se guardan, los ámbar/rojos los tocas ahí mismo.
      </p>

      {/* Dashboard mockup: la pantalla de REVISIÓN del import (protagonista). */}
      <DashboardMockup url="tu-panel / microciclos / acumulación 1-4 · importar">
        <div className="wk-head" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div className="wk-title">
            Revisión del import&nbsp; <small>de tu Excel</small>
          </div>
          <div className="wk-tools" style={{ flexWrap: 'wrap' }}>
            <span className="chip" style={{ color: 'var(--acc)', borderColor: 'var(--acc)' }}>
              Semana 1–4 · Estándar
            </span>
            <span className="btn pri">Confirmar 5 días</span>
          </div>
        </div>

        <div className="wk-sum" style={{ marginBottom: '12px' }}>
          <LegendDot color="var(--v2-ok)" label="Tipado · se guarda tal cual" />
          <LegendDot color="var(--v2-warn)" label="Revisar" />
          <LegendDot color="var(--v2-danger)" label="Ejercicio fuera de catálogo" />
          <LegendDot color="var(--muted)" label="No entra · lo dejas fuera" />
        </div>

        {/* Rejilla de la semana — 7 días, estado por día */}
        <div className="cal">
          {REVIEW_WEEK.map((d) => (
            <ReviewCell key={d.day} day={d.day} title={d.title} state={d.state} />
          ))}
        </div>

        {/* Filas «del Excel (crudo) → tipado» */}
        <div style={microHead}>Del Excel · crudo → tipado</div>

        {/* Fila 1 — tipa limpio (verde) */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '11px 12px',
            marginBottom: '9px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '7px',
            }}
          >
            <span
              style={{
                fontSize: '8.5px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
              }}
            >
              LUN · Fuerza inf.
            </span>
            <Tag state="tipado" />
          </div>
          <div
            style={{
              fontFamily: 'var(--v2-font-mono)',
              fontSize: '10.5px',
              color: 'var(--muted)',
              background: 'var(--sunken)',
              border: '1px solid var(--hair)',
              borderRadius: '7px',
              padding: '8px 10px',
              lineHeight: 1.5,
              overflowWrap: 'anywhere',
            }}
          >
            FUERZA · 5 rounds Back Squat c/2&apos;30&quot;: 10/10/8/8/6 · 60/65/70/70/75% RM
          </div>
          <div style={{ textAlign: 'center', color: 'var(--acc)', fontSize: '13px', fontWeight: 800, margin: '5px 0' }}>
            ↓
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--fg)' }}>Back Squat</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>· 5 series</span>
            <span className="chip" style={{ color: 'var(--muted)' }}>
              reps 10/10/8/8/6
            </span>
            <span className="chip" style={{ color: 'var(--muted)' }}>
              %RM 60/65/70/70/75
            </span>
            <span className="chip" style={{ color: 'var(--muted)' }}>
              desc 150s
            </span>
          </div>
        </div>

        {/* Fila 2 — series ok, pero ejercicio fuera de catálogo (rojo → resolver) */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid color-mix(in srgb, var(--v2-danger) 35%, var(--hair))',
            borderRadius: '10px',
            padding: '11px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '7px',
            }}
          >
            <span
              style={{
                fontSize: '8.5px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
              }}
            >
              SÁB · WOD denso
            </span>
            <Tag state="resolver" />
          </div>
          <div
            style={{
              fontFamily: 'var(--v2-font-mono)',
              fontSize: '10.5px',
              color: 'var(--muted)',
              background: 'var(--sunken)',
              border: '1px solid var(--hair)',
              borderRadius: '7px',
              padding: '8px 10px',
              lineHeight: 1.5,
              overflowWrap: 'anywhere',
            }}
          >
            bar zercher jump bulgarian squat 12/10/8/8
          </div>
          <div style={{ textAlign: 'center', color: 'var(--acc)', fontSize: '13px', fontWeight: 800, margin: '5px 0' }}>
            ↓
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Series tipadas:</span>
            <span className="chip" style={{ color: 'var(--muted)' }}>
              reps 12/10/8/8
            </span>
          </div>
          <div
            style={{
              fontSize: '10.5px',
              color: 'var(--dng)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span>No está en tu catálogo, elígelo o créalo:</span>
            <span className="btn" style={{ fontSize: '10px', padding: '4px 9px' }}>
              Elegir del catálogo
            </span>
            <span className="btn" style={{ fontSize: '10px', padding: '4px 9px' }}>
              Crear ejercicio
            </span>
          </div>
        </div>
      </DashboardMockup>

      <DocNote variant="bad" title="Nada entra sin pasar el gate">
        <ul>
          <li>
            La revisión es <b>verde / ámbar / rojo</b> y <b>cero texto libre</b>: lo que la IA no
            tipe con confianza queda <b>para tu mano</b> (nunca se cuela en silencio).
          </li>
          <li>
            Al confirmar, <b>cada línea</b> pasa el mismo esquema tipado que valida cualquier entreno
            que guardas a mano (<code>.strict</code>). Si algo no es un ejercicio real de tu catálogo,
            no se guarda: lo resuelves antes <b>o dejas ese día fuera</b>.
          </li>
        </ul>
      </DocNote>

      <h3>3 · Tú eliges qué entra</h3>
      <p>
        No es todo o nada: cada día de la rejilla tiene un control para <b>dejarlo fuera</b>, y en
        la cabecera de cada semana puedes quitar <b>la semana entera</b> de una vez. Lo que dejas
        fuera se ve en gris y tachado (<b>«no entra»</b>) y no se guarda nada de ese día: ni la
        sesión ni lo que el importador hubiera aprendido de ella. El botón te dice siempre lo que va
        a pasar (<b>«Confirmar 5 días»</b>) y te avisa de cuántos se quedan fuera.
      </p>

      <DocNote variant="cue" title="Un rojo no te bloquea el resto">
        <p>
          Si un día trae algo raro que no quieres resolver ahora, <b>déjalo fuera y confirma el
          resto</b>: un ejercicio sin catálogo nunca te secuestra los demás días. Y una semana que
          dejas fuera <b>tampoco te pide destino</b>: se salta entera.
        </p>
      </DocNote>

      <h3>4 · Aprende tu notación</h3>
      <p>
        Cuando resuelves un ejercicio fuera de catálogo, esa decisión se <b>guarda en tu mapa de
        sinónimos</b> (por entrenador): el próximo import que traiga la misma abreviatura lo{' '}
        <b>resuelve solo</b>. El importador se afina con tu forma de escribir: cuanto más lo usas,
        menos rojos verás. Y es <b>idempotente</b>: re-importar el mismo rango al mismo ciclo{' '}
        <b>reemplaza</b> esos días (te lo pregunta antes), nunca los duplica.
      </p>

      <DocNote variant="log" title="Aprende tu notación">
        <p>
          Tu mapa de sinónimos es <b>tuyo, no global</b>: cada abreviatura que resuelves queda ligada
          a tu cuenta. La próxima vez que aparezca en un Excel, el importador la reconoce sin que
          tengas que volver a elegir.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Reemplaza, no duplica">
        <p>
          Si vuelves a importar el mismo rango sobre el mismo ciclo, el importador{' '}
          <b>sustituye</b> esos días en lugar de añadir copias, con una confirmación previa, para que
          no pierdas nada sin querer.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Esta herramienta es solo tuya: <b>no tiene cara en el móvil del atleta</b>. Es el puente entre
        tu Excel y tu ciclo: te quita el tecleo, pero el plan sigue siendo tuyo, línea a línea.
      </p>
    </DocSection>
  );
}
