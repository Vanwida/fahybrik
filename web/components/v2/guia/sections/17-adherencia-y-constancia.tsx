// GUÍA · 17 Adherencia y constancia — área "Seguimiento". La adherencia (% de lo
// programado que cumple) y su tendencia semana a semana. Bridge: el atleta marca
// sus sesiones → su % de adherencia + el Pulso semanal del equipo.

import {
  DocSection,
  QCWTriad,
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

const OK = { color: 'var(--v2-ok)', fontWeight: 700 } as const;
const WARN = { color: 'var(--v2-warn)', fontWeight: 700 } as const;
const DNG = { color: 'var(--v2-danger)', fontWeight: 700 } as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          La <b>adherencia</b> es la respuesta a una sola pregunta: de lo que le programaste, ¿cuánto
          cumplió? Es un porcentaje que sale solo de las sesiones que tu atleta marca, sin que tú
          lleves la cuenta. Y su <b>tendencia</b> —si sube o baja semana a semana— suele decir más
          que cualquier dato puntual.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Adherencia = <b>sesiones completadas ÷ sesiones programadas</b>. Un número por atleta y
            por semana. Si una semana no tiene nada programado, no hay porcentaje: verás un{' '}
            <b>—</b>, no un cero injusto.
          </>
        }
        como={
          <>
            No la calculas: se actualiza cada vez que tu atleta marca una sesión. La ves en su ficha,
            en el listado de atletas y, del equipo entero, en el <b>Pulso</b> de tu pantalla del día.
          </>
        }
        porque={
          <>
            Porque un plan perfecto que no se cumple no entrena a nadie. La adherencia te dice dónde
            está el problema real —constancia, no programación— y a quién acompañar antes de que se
            descuelgue.
          </>
        }
      />

      <h3>1 · El color ya te dice cómo va</h3>
      <p>
        Cada porcentaje lleva su color, igual en todas las pantallas: <span style={OK}>verde</span>{' '}
        de 75 para arriba, <span style={WARN}>ámbar</span> entre 60 y 74, y <span style={DNG}>rojo</span>{' '}
        por debajo de 60. Junto al color siempre va el número — el color nunca es la única señal — así
        que un barrido por tu lista de atletas basta para ver quién va sobrado y quién flojea.
      </p>

      <h3>2 · La constancia se mide en semanas, no en días</h3>
      <p>
        Un día malo no es nada; tres semanas a la baja sí. Por eso el <b>Pulso del equipo</b> muestra
        el cumplimiento de la semana día a día y, al lado, la <b>tendencia frente a la semana
        anterior</b> (+/− puntos). Y quien falla sesiones cae solo en la cola{' '}
        <em className="em">Falló sesiones</em>, sin que tengas que buscarlo.
      </p>

      <DocNote variant="cue" title="La constancia queda en el histórico">
        <p>
          Cuando un microciclo termina del todo, pasa a <span className="k">Microciclos completados</span>{' '}
          en su histórico con su cumplimiento medio. Así ves de un vistazo si tu atleta es de los que
          rematan los bloques o de los que se diluyen al final.
        </p>
      </DocNote>

      <MovilBand
        title="Lo que tu atleta cumple, en su móvil"
        subtitle={
          <>
            Él no ve un porcentaje frío: ve su <b>semana</b> y cuánto le queda. Cada sesión que marca
            mueve su barra de progreso — y esa misma señal es tu adherencia.
          </>
        }
      >
        {/* PHONE: su semana + progreso */}
        <PhoneMockup
          caption={
            <>
              <b>Su semana.</b> Hechas en verde, perdidas en rojo, lo que falta en gris. Abajo, el
              progreso real: lo que cumple es tu adherencia.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            12–18 ene · por tu coach
          </div>
          <div className="day">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Tirada larga Z2</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg done">✓</span>
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
          <div className="day">
            <span className="dl">VIE</span>
            <span className="mdot" style={{ background: MOD.circuito }} />
            <span className="dt">Simulación HYROX</span>
            <span className="stg miss">✕</span>
          </div>
          <div className="day">
            <span className="dl">SÁB</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="prog">
            <span className="l">Progreso de la semana</span>
            <div className="v num">2 / 5</div>
            <div className="bar">
              <span style={{ width: '40%' }} />
            </div>
            <div className="cap">Te quedan 3 sesiones.</div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · Y tú lo ves del equipo</h3>
      <p>
        Lo que cada uno marca se suma en tu <b>Pulso del equipo</b>: la media de la semana, su
        tendencia, y quién está fallando. Una sola pantalla te dice si el grupo va fino o si toca
        intervenir.
      </p>

      {/* Dashboard mockup: adherencia del equipo + Falló sesiones */}
      <DashboardMockup url="tu-panel / hoy">
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '12px',
          }}
        >
          Pulso del equipo · cumplimiento
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '11px',
            padding: '14px 16px',
            marginBottom: '14px',
          }}
        >
          <div>
            <div className="num2" style={{ fontSize: '30px', fontWeight: 800, color: 'var(--ok)', lineHeight: 1 }}>
              78%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
              media de la semana
            </div>
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--ok)',
              background: 'var(--okSoft)',
              borderRadius: '7px',
              padding: '4px 9px',
            }}
          >
            ▲ +6 pts vs semana pasada
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: '4px', height: '40px' }}>
            {[62, 80, 71, 90, 78, 0, 0].map((h, i) => (
              <div
                key={i}
                style={{
                  width: '9px',
                  height: h ? `${h}%` : '8%',
                  borderRadius: '3px',
                  background: h ? 'var(--acc)' : 'var(--hair2)',
                  opacity: h ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>

        <div className="lane" style={{ marginTop: 0 }}>
          <div className="lh">⚑ Falló sesiones</div>
          <div className="ac" style={{ marginBottom: '7px' }}>
            <div className="av">M</div>
            <div className="nm">Marc</div>
            <div className="rs">1 perdida · 67%</div>
          </div>
          <div className="ac">
            <div className="av">P</div>
            <div className="nm">Pol</div>
            <div className="rs">2 perdidas · 54%</div>
          </div>
        </div>
      </DashboardMockup>

      <p style={{ marginTop: '18px' }}>
        Readiness te dice cómo llega; adherencia, cuánto cumple. La siguiente pieza pone rumbo a todo
        eso: la <b>carrera objetivo</b> que ordena el plan.
      </p>
    </DocSection>
  );
}
