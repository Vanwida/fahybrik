// GUÍA · 14 El estado de cada entreno — área "El día a día". BUILT reference
// section (ported from the approved prototype) — the "marcar → ver" loop, with the
// coach back-view dashboard mockup + the athlete marking/logging phones.

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
          Montar la semana es solo la mitad. La otra mitad es <b>lo que vuelve</b>: tu atleta
          entrena, marca con honestidad cómo le fue, y tú lo ves en el panel como adherencia y
          estado. Este es el círculo completo, y por qué no necesitas perseguir a nadie por WhatsApp
          para saber si cumplió.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Tú montas la semana' },
          { label: 'Tu atleta entrena', app: true },
          { label: 'Marca: hecha · parcial · no hecha', app: true },
          { label: 'Tú ves adherencia y estado' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Cada sesión tiene un estado. Tu atleta lo marca desde su móvil; tú lo recibes en el
            panel. Sin partes de texto, sin “creo que lo hizo”.
          </>
        }
        como={
          <>
            Él entrena (con cronómetro o “ya lo hice”), registra esfuerzo y notas, y marca el
            resultado. Tú lo ves por sesión y como <b>% de adherencia</b>.
          </>
        }
        porque={
          <>
            Porque un plan sin respuesta es ir a ciegas. El estado honesto te dice a quién empujar, a
            quién progresar y a quién dar margen, hoy, no la semana que viene.
          </>
        }
      />

      <h3>1 · Tu atleta marca con honestidad</h3>
      <p>
        En su Plan, cada día muestra un estado claro: <span style={OK}>hecha</span>,{' '}
        <span style={WARN}>parcial</span>, <span style={DNG}>no hecha</span> o pendiente. Puede
        corregirlo desde un menú por sesión, y si deshace algo que ya tenía trabajo registrado, la
        app le avisa de que se borrará. Está pensado a propósito: marcar a medias o no hecho es tan
        fácil como marcar hecho.
      </p>

      <h3>2 · Registro honesto, sin adornos</h3>
      <p>
        Hay dos caminos, ambos válidos. Si entrena con el cronómetro, la app guarda lo medido
        (tiempo, pulso, zonas). Si lo hizo por su cuenta, usa{' '}
        <code>Ya lo hice · registrar sin cronómetro</code> y lo anota a mano: duración, resultado,{' '}
        <b>RPE (esfuerzo del 1 al 10)</b> y notas. No se inflan datos que no existen: lo que no se
        midió, no se inventa.
      </p>

      <MovilBand
        title="Cómo marca y registra"
        subtitle="A la izquierda, los estados de cada día y el menú de corrección. A la derecha, el registro honesto cuando entrenó sin cronómetro."
      >
        {/* PHONE 3: estados + menú */}
        <PhoneMockup
          caption={
            <>
              <b>Marcar.</b> ✓ hecha, ◑ parcial, ✕ no hecha. El menú “···” deja corregir el estado en
              un toque, con aviso si ya había trabajo registrado.
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
            <span className="stg part">◑</span>
          </div>
          <div className="ctx">
            <div className="mi">
              <span className="g">✓</span>Marcar como hecha
            </div>
            <div className="mi">
              <span className="g">✎</span>Completar ahora
            </div>
            <div className="mi dest">
              <span className="g">↺</span>Deshacer hecho
            </div>
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
          <div className="legend-mini">
            <span>
              <span className="d" style={{ background: 'var(--ok)' }} />
              Hecha
            </span>
            <span>
              <span className="d" style={{ background: 'var(--warn)' }} />
              Parcial
            </span>
            <span>
              <span className="d" style={{ background: 'var(--dng)' }} />
              No hecha
            </span>
          </div>
        </PhoneMockup>

        {/* PHONE 4: registrar */}
        <PhoneMockup
          caption={
            <>
              <b>Registrar.</b> Cuando entrenó sin reloj, anota lo que sí sabe (duración, RPE, notas)
              y deja en blanco lo que no midió. Sin inventar nada.
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
              Registrar entreno
            </div>
            <div className="stg done" style={{ width: '24px', height: '24px', fontSize: '13px' }}>
              ✓
            </div>
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Series 6×800 · sin cronómetro
          </div>
          <div className="logcard">
            <div className="lh">Duración</div>
            <div className="field">
              <span className="fl">Tiempo total</span>
              <span className="fv num">46:30</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">RPE · esfuerzo percibido</div>
            <div className="rpe">
              <span className="r">3</span>
              <span className="r">4</span>
              <span className="r">5</span>
              <span className="r">6</span>
              <span className="r sel">7</span>
              <span className="r">8</span>
              <span className="r">9</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Frecuencia cardiaca</div>
            <div style={{ fontSize: '10px', color: 'var(--faint)', marginBottom: '7px' }}>
              Sin pulsómetro. Anótala a mano si la conoces.
            </div>
            <div className="field">
              <span className="fl">FC media</span>
              <span className="fv num" style={{ color: 'var(--faint)' }}>
                — ppm
              </span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Notas</div>
            <div style={{ fontSize: '11px', color: 'var(--fg)' }}>
              Las dos últimas series con piernas cargadas.
            </div>
          </div>
          <div className="cta">Guardar</div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · Y tú lo ves de vuelta</h3>
      <p>
        Todo eso vuelve a ti sin que tu atleta tenga que escribirte. En su ficha, la pestaña{' '}
        <b>Plan</b> muestra cada sesión con su estado (<span style={OK}>Completada</span>,{' '}
        <span style={WARN}>Pendiente</span>, <span style={DNG}>Perdida</span>) y su RPE. Arriba, un{' '}
        <b>% de adherencia</b> resume su constancia. Y en tu pantalla <code>/hoy</code>, quien falla
        sesiones aparece solo en la cola <em className="em">“Falló sesiones”</em>, para que sepas a
        quién atender primero.
      </p>

      <DocNote variant="log" title="Un detalle honesto sobre quién marca">
        <p>
          Hoy el panel es tu <b>ventana de lectura</b>: ves los resultados, pero quien marca y
          corrige cada sesión es el atleta desde su móvil. Tú interpretas y decides (a quién
          progresar, a quién empujar); él lo registra. Es a propósito: el dato es suyo, la lectura
          es tuya.
        </p>
      </DocNote>

      {/* Dashboard mockup: coach back-view */}
      <DashboardMockup url="tu-panel / atletas / marc · plan">
        <div className="ath-hd">
          <div className="av">M</div>
          <div className="nm">
            Marc<small>Acumulación · semana 1</small>
          </div>
          <div className="adh">
            <div className="l">Adherencia</div>
            <div className="v" style={{ color: 'var(--warn)' }}>
              67%
            </div>
            <div className="adhbar">
              <span style={{ width: '67%', background: 'var(--warn)' }} />
            </div>
          </div>
        </div>
        <table className="sesstbl">
          <tbody>
            <tr>
              <th>Sesión</th>
              <th>Día</th>
              <th>Estado</th>
              <th>RPE</th>
            </tr>
            <tr>
              <td>Tirada larga Z2</td>
              <td className="n">Lun 12</td>
              <td>
                <span className="sp done">● Completada</span>
              </td>
              <td className="n">7</td>
            </tr>
            <tr>
              <td>Fuerza · tren inferior</td>
              <td className="n">Mar 13</td>
              <td>
                <span className="sp done">● Completada</span>
              </td>
              <td className="n">8</td>
            </tr>
            <tr>
              <td>Series 6×800</td>
              <td className="n">Mié 14</td>
              <td>
                <span className="sp pend">● Pendiente</span>
              </td>
              <td className="n">—</td>
            </tr>
            <tr>
              <td>Simulación HYROX</td>
              <td className="n">Vie 16</td>
              <td>
                <span className="sp miss">● Perdida</span>
              </td>
              <td className="n">—</td>
            </tr>
          </tbody>
        </table>

        <div className="lane">
          <div className="lh">⚑ Falló sesiones</div>
          <div className="ac">
            <div className="av">M</div>
            <div className="nm">Marc</div>
            <div className="rs">1 perdida · 67%</div>
          </div>
        </div>
      </DashboardMockup>

      <p style={{ marginTop: '18px' }}>
        Ese es el círculo entero: <b>tú montas → tu atleta hace y marca → tú ves y decides</b>. El
        resto de la guía aplica esta misma lógica de “los dos lados” a cada parte del panel, desde
        tu biblioteca hasta las carreras.
      </p>
    </DocSection>
  );
}
