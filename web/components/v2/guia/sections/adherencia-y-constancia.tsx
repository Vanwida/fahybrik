// GUÍA · Entrenos hechos y adherencia — lo que vuelve: el atleta marca cada
// entreno (hecho, a medias, sin hacer) y registra con honestidad; tú lo ves en su
// calendario (prescrito contra hecho) y como adherencia DEBIDA con su ventana
// (shared/domain/coach/adherence: solo cuenta lo que ya le tocaba). Sube a Hoy
// con tu umbral. El puente: cómo marca y registra en su móvil.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Badge } from '../doc';
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
          Montar el plan es la mitad. La otra mitad es <b>lo que vuelve</b>: tu atleta entrena, marca
          con honestidad cómo le fue y tú lo ves en el panel, entreno a entreno y como{' '}
          <b>adherencia</b>. No necesitas perseguir a nadie para saber si cumplió.
        </>
      }
    >
      <h3>Tu atleta marca, con honestidad</h3>
      <p>
        En su plan, cada día dice su estado: <span style={OK}>hecho</span>,{' '}
        <span style={WARN}>a medias</span>, <span style={DNG}>sin hacer</span> o pendiente. Si entrena
        con el cronómetro de la app, se guarda lo medido (tiempo, pulso, zonas); si lo hizo por su
        cuenta, lo registra a mano: duración, resultado, <b>RPE</b> (esfuerzo del 1 al 10) y notas.
        Marcar a medias o sin hacer es tan fácil como marcar hecho, y lo que no se midió no se
        inventa.
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

      <h3>Tú lo ves, entreno a entreno</h3>
      <p>
        En su ficha, cada entreno pasado lleva su marca en el calendario; al abrirlo ves lo{' '}
        <b>prescrito contra lo hecho</b>, bloque a bloque, con sus tiempos y su esfuerzo.
      </p>
      <PanelFigure>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok" label="Hecho" />
          <Badge tone="warn" label="Hecho a medias" />
          <Badge tone="danger" label="Sin hacer" />
          <Badge tone="neutral" label="Saltado" />
          <Badge tone="neutral" label="Pendiente" />
        </div>
      </PanelFigure>

      <h3>La adherencia: de lo que ya le tocaba, cuánto hizo</h3>
      <p>
        Se cuenta sobre los entrenos <b>debidos</b>: los de días ya pasados, y los de hoy solo si ya
        los hizo. Los de mañana nunca la bajan. Hecho y a medias cuentan como hechos. Y siempre va con
        su <b>ventana</b>: «Adh. 14 d», o en la ficha «13 de 15 debidas hechas en 14 d». Si en la
        ventana no le tocaba nada, verás un <b>—</b>, no un 0 %.
      </p>
      <ul className="clean">
        <li>
          La ves en <b>Atletas</b> (columna <b>Adh. 14 d</b>), en su <b>ficha</b> (bajo su nombre y
          encima del calendario), en su vistazo y en el contexto de <b>Mensajes</b>. Es el mismo
          número en todas partes.
        </li>
        <li>
          Sube a <b>Hoy</b> cuando acumula entrenos sin hacer en 7 días (cuántos, lo decides en{' '}
          <b>Ajustes › Método</b>), con la prueba: «2 de 4 debidas sin hacer».
        </li>
      </ul>

      <DocNote variant="log" title="Lo que no depende de él no cuenta en contra">
        <ul>
          <li>
            Los días <span className="k">en pausa</span> quedan fuera del cálculo (ver{' '}
            <b>Pausas y bajas</b>).
          </li>
          <li>
            Con una lesión, un día de <span className="k">reposo</span> no cuenta como fallo, y un
            entreno <span className="k">sustituido</span> o <span className="k">suavizado</span> cuenta
            por lo que haga (ver <b>Lesiones</b>).
          </li>
        </ul>
      </DocNote>
    </DocSection>
  );
}
