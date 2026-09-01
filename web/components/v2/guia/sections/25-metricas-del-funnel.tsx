// GUÍA · 25 Métricas del funnel — área "Tu negocio". De la visita al alta: dónde
// entra la gente y dónde se cae, con el % de conversión en cada salto, la tendencia
// semanal y el desglose por objetivo. Todo derivado de datos reales (leads,
// appointments, session_reports, invitaciones + un contador de visitas cookieless).
// Esta pieza NO tiene cara en el móvil del atleta: es una vista interna de negocio.

import { DocSection, QCWTriad, DocNote, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

/** One funnel stage: label + a proportional bar + count and conversion. Server-safe. */
function FunnelStage({
  name,
  def,
  count,
  conv,
  width,
  tone,
}: {
  name: string;
  def: string;
  count: string;
  /** Conversión desde la etapa anterior (omitida en la primera). */
  conv?: string;
  /** Ancho de la barra, proporcional a las visitas (la etapa de arriba = 100%). */
  width: string;
  tone: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '132px 1fr',
        alignItems: 'center',
        gap: '12px',
        padding: '5px 0',
      }}
    >
      <div>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fg)' }}>{name}</div>
        <div style={{ fontSize: '9px', color: 'var(--faint)' }}>{def}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            flex: 1,
            height: '28px',
            background: 'var(--sunken)',
            borderRadius: '7px',
            overflow: 'hidden',
          }}
        >
          <div style={{ width, height: '100%', background: tone, borderRadius: '7px' }} />
        </div>
        <div style={{ minWidth: '68px', textAlign: 'right' }}>
          <div className="num2" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)' }}>
            {count}
          </div>
          {conv ? (
            <div className="num2" style={{ fontSize: '9px', color: 'var(--faint)' }}>
              {conv}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Uppercase micro section header (echoes section 19). */
const microHead = {
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: '10px',
} as const;

// Weekly Altas — 8 ISO weeks, ascending (heights as % of the tallest bar).
const WEEKLY = [44, 56, 44, 67, 78, 89, 78, 100];

// Conversión por objetivo (alta / onboarding). Bar width relative to the best.
const BY_OBJETIVO = [
  { name: 'Su primer HYROX', pct: '18%', w: '78%' },
  { name: 'Mejorar su marca', pct: '17%', w: '71%' },
  { name: 'Podio / competir', pct: '23%', w: '100%' },
];

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          De la <b>visita</b> al <b>alta</b>: cuánta gente entra en cada escalón y, lo importante,{' '}
          <b>dónde se cae</b>. Con el % de conversión en cada salto sabes qué parte del embudo
          arreglar: la web, el onboarding o la oferta. Todo sale de <b>datos reales</b>, nada
          inventado.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Un <b>embudo</b> de cuatro escalones (visitas → leads → citas → altas) con su tasa de
            conversión, una <b>tendencia semanal</b> y el desglose <b>por objetivo</b> (a qué vienen
            tus atletas).
          </>
        }
        como={
          <>
            No rellenas nada: el embudo se construye solo siguiendo a cada lead por sus etapas. Eliges
            el <b>rango</b> (7 días, 30 días o todo) y lees dónde está la fuga.
          </>
        }
        porque={
          <>
            Porque con un número global (“12 altas”) no sabes qué mejorar. Ver <b>dónde</b> se pierde
            la gente te dice si el problema es tráfico, formulario o cierre, y por dónde empezar.
          </>
        }
      />

      <h3>1 · El embudo, salto a salto</h3>
      <p>
        Cada escalón es una condición sobre el lead: ¿dejó su email?, ¿reservó cita?, ¿se dio de alta?
        El % que ves es la <b>conversión desde la etapa anterior</b>. Un salto que se desploma es tu
        siguiente palanca, mucho más útil que el total del final.
      </p>

      <h3>2 · Visitas sin cookies ni rastreo</h3>
      <p>
        El primer escalón (las <b>visitas</b>) se cuenta en el servidor, <b>sin cookies ni PII</b>:
        nunca se guarda la IP, solo un hash con una sal que <b>cambia cada día</b> (así no se puede
        rastrear a nadie entre días), agregado a una tabla diaria. Cumple RGPD sin banner. Empezó a
        contar el <b>8 jul</b>, el día que se instrumentó. Antes no hay histórico, y lo decimos claro.
      </p>

      {/* Dashboard mockup: Métricas — embudo + tendencia + por objetivo */}
      <DashboardMockup url="tu-panel / metricas">
        <div className="wk-head">
          <div className="wk-title">
            Métricas del funnel&nbsp; <small>últimos 30 días</small>
          </div>
        </div>
        <div className="wk-sum" style={{ marginBottom: '16px' }}>
          <span className="chip" style={{ color: 'var(--muted)' }}>
            % = conversión desde la etapa anterior
          </span>
        </div>

        {/* EMBUDO — 4 escalones, barras decrecientes */}
        <div style={microHead}>El embudo · dónde se cae</div>
        <div style={{ marginBottom: '20px' }}>
          <FunnelStage
            name="Visitas a la web"
            def="landing fahybrid.com"
            count="420"
            width="100%"
            tone="var(--muted)"
          />
          <FunnelStage
            name="Leads"
            def="dejan su email"
            count="96"
            conv="· 23%"
            width="23%"
            tone="var(--acc)"
          />
          <FunnelStage
            name="Citas"
            def="videollamada agendada"
            count="41"
            conv="· 43%"
            width="10%"
            tone="var(--acc)"
          />
          <FunnelStage
            name="Altas"
            def="atleta activo en la app"
            count="12"
            conv="· 29%"
            width="3%"
            tone="var(--ok)"
          />
        </div>

        {/* Tendencia semanal + por objetivo, lado a lado */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
            <div style={microHead}>Altas · últimas 8 semanas</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '46px' }}>
              {WEEKLY.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    minHeight: '4px',
                    background: i === WEEKLY.length - 1 ? 'var(--acc)' : 'var(--accSoft)',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--faint)', marginTop: '6px' }}>
              semana a semana · tendencia al alza
            </div>
          </div>

          <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
            <div style={microHead}>Por objetivo · a qué vienen</div>
            {BY_OBJETIVO.map((o) => (
              <div
                key={o.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 46px 40px',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '5px 0',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--fg)' }}>{o.name}</span>
                <div
                  style={{
                    height: '6px',
                    background: 'var(--sunken)',
                    borderRadius: '99px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{ width: o.w, height: '100%', background: 'var(--acc)', borderRadius: '99px' }}
                  />
                </div>
                <span
                  className="num2"
                  style={{ fontSize: '11px', fontWeight: 700, textAlign: 'right', color: 'var(--fg)' }}
                >
                  {o.pct}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Métrica honesta: convertido solo al reclamar">
        <p>
          Un lead cuenta como <b>alta</b> únicamente cuando <b>reclama su invitación</b> y entra en la
          app, no cuando le envías el alta. Así el número del final es real, no optimista: mide gente
          dentro, no correos enviados.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Visitas sin cookies ni PII · desde el 8 jul">
        <p>
          El contador de visitas arrancó el 8 jul, así que las primeras semanas la cifra sube desde
          cero (todo lo demás sí tiene historia real). Y las <b>cohortes recientes</b> aún maduran: un
          lead de ayer no ha tenido tiempo de reservar ni darse de alta, por eso el último tramo del
          embudo se llena con los días.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Esta pieza es solo tuya: <b>no tiene cara en el móvil del atleta</b>. Es la vista de negocio
        que te dice, sin adornos, por dónde entra tu gente y por dónde se te escapa.
      </p>
    </DocSection>
  );
}
