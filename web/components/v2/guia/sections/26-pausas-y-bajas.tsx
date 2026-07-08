// GUÍA · 26 Pausas y bajas — área "Ciclo de vida". La vida real interrumpe (un
// viaje, una lesión, una baja definitiva). Una PAUSA congela el plan sin castigar
// la adherencia y retoma limpio el próximo lunes; una BAJA cierra la relación
// conservando TODO el historial y liberando una plaza del cupo. Verificado contra
// lib/coach/athlete-lifecycle.ts, adherence-pause-filter.ts, athlete-lifecycle-plan.ts
// (re-anchor "next Monday"), LifecycleControl/Banner y el iOS PlanView (paused card).

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

// Live v2 status hues (never drift from the app tokens).
const TONE = {
  ok: 'var(--v2-ok)',
  warn: 'var(--v2-warn)',
  danger: 'var(--v2-danger)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          La vida real interrumpe: un viaje, una lesión, un parón. Una <b>pausa</b> congela el plan{' '}
          <b>sin castigar la adherencia</b> — esos días se excluyen del cálculo, no cuentan como 0% —
          y lo retoma limpio el próximo lunes. Una <b>baja</b> cierra la relación{' '}
          <b>conservando todo el historial</b> y liberando una plaza de tu cupo. Ambas reversibles.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Activo' },
          { label: 'Pausado · plan congelado', app: true },
          { label: 'Reactivar · retoma el próximo lunes' },
          { label: 'o Baja · historial conservado' },
        ]}
      />

      <QCWTriad
        que={
          <>
            El <b>ciclo de vida</b> del atleta: <code>Activo</code>, <code>Pausado</code> o{' '}
            <code>Baja</code>. Un estado único que dice si lo estás entrenando ahora mismo —
            independiente de lo que haga la facturación.
          </>
        }
        como={
          <>
            Desde su ficha: <b>Pausar</b> (motivo + fecha de vuelta opcional) o <b>Dar de baja</b>.
            La pausa también puede pedirla el atleta y tú la <b>confirmas</b> — nunca es automática.{' '}
            <b>Reactivar</b> lo devuelve a activo; <b>Re-alta</b> recupera a uno de baja.
          </>
        }
        porque={
          <>
            Porque parar no puede significar “fallaste”. Una pausa protege sus métricas y su plaza; una
            baja no borra su historia — si vuelve, lo recuperas entero. Nada se pierde por hacer una
            pausa a tiempo.
          </>
        }
      />

      <h3>1 · La pausa: congela el plan y no penaliza</h3>
      <p>
        La pausa la inicias tú desde la ficha, o la <b>pide el atleta desde su app</b> y te llega como
        una solicitud que <b>confirmas o rechazas</b> — el sistema nunca pausa a nadie solo. Al
        confirmarla, su plan se <b>congela</b> y esos días quedan <b>fuera del cálculo de adherencia</b>{' '}
        (se excluyen del denominador; no cuentan como semanas falladas). Además se{' '}
        <b>pausa el cobro</b> mientras dure.
      </p>
      <p>
        Cuando pulsas <b>Reactivar</b>, el plan no arrastra días caducados: se re-ancla y{' '}
        <b>retoma en el próximo lunes</b>, justo donde iba la secuencia. Reactivación limpia, sin
        sesiones muertas por medio.
      </p>

      <h3>2 · La baja: cierra conservando todo</h3>
      <p>
        La baja congela el plan, <b>factura hasta fin del periodo</b> (no corta el acceso de golpe),
        conserva el <b>historial completo en solo-lectura</b> y <b>libera una plaza</b> de tu cupo, que
        pasa al siguiente de la lista de espera. No es un borrado de datos: si el atleta vuelve, un{' '}
        <b>re-alta</b> lo recupera entero (y te avisa si con eso superas tu cupo, pero te deja
        continuar). En <b>dobles</b>, la baja <b>disuelve la pareja</b> conservando el historial de los
        dos.
      </p>

      {/* Dashboard mockup: la ficha con el control de ciclo de vida (activo → pausado) */}
      <DashboardMockup url="tu-panel / atletas / marc · ciclo de vida">
        {/* Estado actual: Activo, con las dos acciones válidas */}
        <div className="ath-hd">
          <div className="av">M</div>
          <div className="nm">
            Marc Vidal<small>N3 · 4 días/semana</small>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="chip" style={{ color: TONE.ok, borderColor: TONE.ok }}>
              ● Activo
            </span>
            <span className="btn">Pausar</span>
            <span className="btn" style={{ color: TONE.danger, borderColor: TONE.danger }}>
              Dar de baja
            </span>
          </div>
        </div>

        {/* Aviso honesto de la pausa */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            color: 'var(--muted)',
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '9px',
            padding: '9px 12px',
            marginBottom: '14px',
          }}
        >
          <span style={{ color: TONE.ok, fontWeight: 800 }}>✓</span>
          La pausa <b style={{ color: 'var(--fg)' }}>no penaliza la adherencia</b>: esos días se
          excluyen del cálculo, no cuentan como 0%.
        </div>

        {/* Ejemplo · el mismo atleta, ya pausado */}
        <div
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            margin: '2px 0 8px',
          }}
        >
          Cuando lo pausas
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: 'var(--warnSoft)',
            border: `1px solid color-mix(in srgb, ${TONE.warn} 30%, transparent)`,
            borderRadius: '11px',
            padding: '11px 13px',
          }}
        >
          <span style={{ color: TONE.warn, fontSize: '15px', lineHeight: 1 }}>⏸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--fg)' }}>
              En pausa desde el 3 jul · Lesión · vuelve el 17 jul
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Su plan está congelado y estos días no cuentan para la adherencia.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px', flexShrink: 0 }}>
            <span className="btn pri">Reactivar</span>
            <span className="btn" style={{ color: TONE.danger, borderColor: TONE.danger }}>
              Dar de baja
            </span>
          </div>
        </div>

        {/* Qué implica la baja */}
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '12px' }}>
          <span className="chip" style={{ color: 'var(--muted)' }}>
            Baja → factura a fin de periodo
          </span>
          <span className="chip" style={{ color: TONE.ok, borderColor: TONE.ok }}>
            Libera una plaza del cupo
          </span>
          <span className="chip" style={{ color: 'var(--muted)' }}>
            Historial conservado · re-alta lo recupera
          </span>
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="La pausa no penaliza">
        <ul>
          <li>
            El rango pausado se <span className="k">excluye del cálculo</span> de adherencia — no
            genera semanas falladas ni cae al 0%. Si toda una ventana está pausada, la adherencia se
            muestra como <code>—</code>, no como cero.
          </li>
          <li>
            Mientras dura, se <span className="k">pausa el cobro</span> y su plan queda congelado: el
            atleta no ve sesiones caducadas.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="cue" title="Reactivar retoma el próximo lunes">
        <p>
          Al reactivar, el plan se re-ancla en el <span className="k">próximo lunes</span> desde la
          posición exacta de la secuencia — sin días muertos por medio. Vuelve limpio, como si no
          hubiera parado.
        </p>
      </DocNote>

      <DocNote variant="log" title="La baja conserva el historial">
        <ul>
          <li>
            Baja no es borrar: el historial queda <span className="k">en solo-lectura</span> y un{' '}
            <span className="k">re-alta</span> lo recupera entero (te avisa si superas el cupo, pero
            te deja continuar).
          </li>
          <li>
            <span className="k">Libera una plaza</span> de tu cupo hacia la lista de espera y{' '}
            <span className="k">cancela la factura a fin de periodo</span>. En dobles, disuelve la
            pareja conservando el historial de ambos.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Su app en pausa"
        subtitle={
          <>
            Cuando pausas a tu atleta, su app no se rompe ni se vacía a lo bruto: muestra una tarjeta
            calmada en <b>Plan</b> y en <b>Hoy</b>. Nada que registrar, nada que se pierda — su
            progreso está guardado.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Plan en pausa.</b> En lugar de la lista de días, el atleta ve una tarjeta clara:{' '}
              <b>«Tu plan está en pausa»</b>. Al reactivarlo, sus sesiones reaparecen desde el próximo
              lunes.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '6px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tu semana
            </div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Jueves 3 jul</div>
          <div className="ph-title sm" style={{ marginBottom: '14px' }}>
            Tu semana
          </div>

          {/* Paused card — copy tal cual iOS PlanView.pausedPlanState */}
          <div
            style={{
              background: 'var(--surface)',
              border: `1px solid color-mix(in srgb, ${TONE.warn} 32%, var(--hair))`,
              borderRadius: 'var(--v2-r-l)',
              padding: '18px 16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'var(--warnSoft)',
                color: TONE.warn,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                margin: '0 auto 12px',
              }}
            >
              ⏸
            </div>
            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '19px',
                letterSpacing: '-0.02em',
                marginBottom: '8px',
              }}
            >
              Tu plan está en pausa
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5, margin: '0 auto' }}>
              Pablo lo ha pausado mientras te recuperas. Retomamos en cuanto estés listo — tu progreso
              está guardado.
            </p>
            <div
              className="num"
              style={{
                marginTop: '12px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: TONE.warn,
              }}
            >
              En pausa desde el 3 jul
            </div>
          </div>

          <div className="tabbar">
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M3 11l9-8 9 8" />
                <path d="M5 10v10h14V10" />
              </svg>
              <span className="tl">Inicio</span>
            </div>
            <div className="tab on">
              <div className="pill">
                <svg viewBox="0 0 24 24">
                  <path d="M8 6h12M8 12h12M8 18h12" />
                </svg>
              </div>
              <span className="tl">Plan</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
              </svg>
              <span className="tl">Carreras</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M4 5h16v11H8l-4 4z" />
              </svg>
              <span className="tl">Chat</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              <span className="tl">Perfil</span>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
