// GUÍA · 31 Objetivo y predicción — área "Herramientas". El "camino al objetivo":
// el tiempo meta de la carrera objetivo repartido en los 10 tramos de HYROX
// (correr + 8 estaciones + roxzone) como PRESUPUESTO, la predicción de lo que
// costará cada tramo desde el historial del atleta, y el HUECO (predicho − meta).
// Athlete-facing (el gap board vive en su móvil) + el coach fija la meta en la
// carrera objetivo. Honestidad: ningún número sin su origen (observado/estimado/
// sin datos), y la predicción se CONGELA antes de la carrera para el "predicho vs
// real". Fase 3 / #5.

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

// ── Un tramo del gap board: presupuesto vs predicho + su desvío. ──────────────
type Tier = 'observado' | 'estimado' | 'sin_datos';
const TIER: Record<Tier, { label: string; fg: string; bg: string }> = {
  observado: { label: 'Observado', fg: 'var(--v2-ok)', bg: 'var(--v2-ok-soft)' },
  estimado: { label: 'Estimado', fg: 'var(--v2-info)', bg: 'var(--v2-info-soft)' },
  sin_datos: { label: 'Sin datos', fg: 'var(--muted)', bg: 'var(--sunken)' },
};

function TierTag({ tier }: { tier: Tier }) {
  const m = TIER[tier];
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: m.fg,
        background: m.bg,
        padding: '2px 6px',
        borderRadius: '99px',
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

/** One gap-board row: tramo · presupuesto → predicho · desvío (chip). */
function GapRow({
  label,
  budget,
  pred,
  delta,
  tier,
}: {
  label: string;
  budget: string;
  pred: string | null;
  delta: string | null;
  tier: Tier;
}) {
  // Positive delta (over budget) reads danger; on/under budget reads ok.
  const over = delta != null && delta.startsWith('+');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fg)' }}>{label}</div>
        <div style={{ marginTop: '3px' }}>
          <TierTag tier={tier} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
          meta {budget} · {pred ?? '—'}
        </div>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 800,
            color: delta == null ? 'var(--faint)' : over ? 'var(--dng)' : 'var(--ok)',
          }}
        >
          {delta ?? 'puerta abierta'}
        </div>
      </div>
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
          El <b>camino al objetivo</b>: fijas un tiempo meta para la carrera objetivo y la app lo
          reparte en los <b>10 tramos</b> de HYROX —correr, las 8 estaciones y la roxzone— como un{' '}
          <b>presupuesto</b>. Enfrente, la <b>predicción</b> de lo que costará cada tramo con el
          historial real del atleta. La diferencia es el <b>hueco</b>: dónde se gana o se pierde el
          objetivo, tramo a tramo.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Un <b>gap board</b>: el objetivo descompuesto en 10 tramos con dos cifras por tramo —{' '}
            <b>presupuesto</b> (lo que debe costar para llegar) y <b>predicho</b> (lo que costará
            según su historial)— y el <b>desvío</b> entre ambas. Arriba, el hueco total contra la
            meta.
          </>
        }
        como={
          <>
            El coach fija el <b>tiempo meta</b> en la carrera objetivo. El presupuesto sale de una{' '}
            <b>cohorte</b> de carreras singles cercanas a esa meta (misma división/género) o, si no
            hay suficientes, de <b>la última carrera del propio atleta</b> escalada. El atleta lo lee
            en su móvil.
          </>
        }
        porque={
          <>
            Porque «bajar de 60» es abstracto: <b>dónde</b> sacas esos minutos, no. Repartir la meta
            en tramos convierte un número lejano en un plan concreto —y enseña si el objetivo es
            realista con lo que hoy entrena.
          </>
        }
      />

      <h3>1 · El presupuesto siempre cierra</h3>
      <p>
        El objetivo se reparte por las <b>proporciones reales</b> de una carrera comparable, nunca a
        ojo ni dividiendo entre diez. Si hay al menos <b>cinco</b> carreras singles cerca de la meta
        (±10 %) con tu división y género, se usa la <b>fracción media</b> de cada tramo; si no llega,
        se cae a la <b>última carrera del propio atleta</b>, escalada al objetivo. Los diez tramos{' '}
        <b>suman exactamente la meta</b> —correr + 8 estaciones + roxzone—: el presupuesto cierra
        siempre.
      </p>

      <h3>2 · La predicción, con su origen a la vista</h3>
      <p>
        Cada tramo predicho lleva <b>de dónde sale</b>, y nunca aparece un número sin etiqueta:
      </p>
      <ul>
        <li>
          <b>Observado</b> — el split de su <b>última carrera reciente</b> (menos de 6 meses). Es la
          prueba más fuerte: ya ocurrió.
        </li>
        <li>
          <b>Estimado</b> — sin carrera reciente, se parte de su <b>nivel entrenado</b> (del cruce
          entrenamiento × carrera) llevado a split completo y ajustado por su{' '}
          <b>factor de transferencia personal</b> —cuánto más lento compite que entrena—.
        </li>
        <li>
          <b>Sin datos</b> — ni carrera ni entreno para ese tramo: se muestra la <b>puerta abierta</b>{' '}
          (como en el mockup), no un cero inventado. Para el total, ese tramo se mantiene en su
          presupuesto.
        </li>
      </ul>

      <DocNote variant="log" title="Nunca un número sin su tier">
        <p>
          El motor jamás fabrica una cifra: un tramo del que no sabemos nada muestra su estado
          honesto, no un dato de relleno. El hueco total lo dice en claro —{' '}
          <span className="k">predicho vs meta</span>— sin esconder la incertidumbre.
        </p>
      </DocNote>

      <MovilBand
        title="En el móvil del atleta"
        subtitle={
          <>
            El atleta abre su <b>camino al objetivo</b> y ve el hueco tramo a tramo: dónde va sobrado
            y dónde pierde el tiempo que le separa de la meta.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Camino al Sub-60.</b> El objetivo repartido en tramos, con lo que debe costar cada
              uno y lo que la app predice. En rojo, donde hoy pierde tiempo.
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
              Camino al Sub-60
            </div>
            <div style={{ width: '24px' }} />
          </div>

          {/* Hueco total */}
          <div
            className="logcard"
            style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <div>
              <div className="lh">Predicho</div>
              <div className="num" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)' }}>
                1:02:10
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="lh">Hueco vs meta</div>
              <div className="num" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--dng)' }}>
                +2:10
              </div>
            </div>
          </div>

          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Por tramo</div>
            <GapRow label="Carrera a pie" budget="30:02" pred="31:20" delta="+1:18" tier="observado" />
            <GapRow label="SkiErg 1km" budget="4:00" pred="4:12" delta="+0:12" tier="observado" />
            <GapRow label="Sled push" budget="1:52" pred="2:04" delta="+0:12" tier="estimado" />
            <GapRow label="Wall ball 100" budget="4:41" pred="4:41" delta="±0:00" tier="observado" />
            <GapRow label="Sandbag lunge 200m" budget="2:32" pred={null} delta={null} tier="sin_datos" />
            <GapRow label="Roxzone" budget="2:52" pred="3:11" delta="+0:19" tier="estimado" />
          </div>
          <div className="cta">Ver el plan para cerrar el hueco</div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · Predicho vs real: la predicción se congela</h3>
      <p>
        Para que el <b>predicho vs real</b> sea honesto, la predicción se{' '}
        <b>guarda antes de la carrera</b> —una foto del día, no un recálculo con el resultado ya
        sabido—. Cuando el atleta importa el resultado (o hace una simulación), la app compara esa
        foto contra los <b>splits reales</b>, tramo a tramo, con una <b>precisión</b> y una frase
        directa desde el mayor desvío (<em className="em">«El sled push perdió 0:20 más de lo
        previsto»</em>). Sin resultado previo o sin foto anterior, lo dice en claro: no compara al
        aire.
      </p>

      <DocNote variant="cue" title="Una foto por día, congelada">
        <p>
          Cada vez que el atleta abre su camino al objetivo se guarda la predicción del día (una por
          día). Esa es la que, ya pasada la carrera, se enfrenta al resultado real — así el «predicho»
          es de verdad un pronóstico, no una revancha con las cartas vistas.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Con esto el objetivo deja de ser un número en el aire: el atleta ve <b>dónde</b> está el
        tiempo que le falta y tú, en su ficha, sabes qué tramo priorizar. El sistema{' '}
        <b>solo reparte y predice</b> con datos reales; el plan para cerrar el hueco sigue siendo
        tuyo.
      </p>
    </DocSection>
  );
}
