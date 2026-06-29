// GUÍA · 16 Readiness y check-in — área "Seguimiento". Cómo el check-in de la
// mañana del atleta + las señales de su reloj se convierten en un readiness que tú
// lees en el Pulso del equipo. Bridge: su check-in → tu pulso.

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
          Cada mañana tu atleta responde un <b>check-in</b> de medio minuto: cómo durmió, cómo tiene
          las piernas, con qué ánimo y energía se levanta. Eso, junto a lo que mide su reloj, se
          resume en un número — el <b>readiness</b> — que te dice de un vistazo a quién llega listo y
          a quién conviene dar margen, sin preguntárselo uno a uno.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Tu atleta hace su check-in', app: true },
          { label: 'Su reloj suma señales', app: true },
          { label: 'Se calcula su readiness' },
          { label: 'Tú lo lees en el Pulso del equipo' },
        ]}
      />

      <QCWTriad
        que={
          <>
            El <b>readiness</b> es un 0–100 de cómo llega tu atleta hoy. Combina su check-in
            subjetivo con señales del reloj — <b>variabilidad cardíaca, sueño y frecuencia en
            reposo</b> — y lo modula con su constancia reciente.
          </>
        }
        como={
          <>
            Tú no rellenas nada: tu atleta hace el check-in en su móvil. Tú lees el resultado por
            atleta y, en conjunto, en el <b>Pulso del equipo</b> de tu pantalla del día.
          </>
        }
        porque={
          <>
            Porque ajustar la carga a cómo llega cada uno es la diferencia entre progresar y
            romperse. El readiness te da esa señal <b>antes</b> de la sesión, no cuando ya falló.
          </>
        }
      />

      <h3>1 · Tres tramos, un vistazo</h3>
      <p>
        El número cae en uno de tres tramos, siempre con su color: <span style={OK}>Listo</span>{' '}
        (67 o más), <span style={WARN}>con cautela</span> (45–66) y <span style={DNG}>en rojo</span>{' '}
        (por debajo de 45). No tienes que interpretar datos sueltos: el color ya te dice si empujar,
        mantener o aligerar.
      </p>

      <h3>2 · Sin inventar números</h3>
      <p>
        Si tu atleta no ha hecho el check-in ni su reloj ha sincronizado nada, no verás un readiness
        de relleno: verás un honesto <code>Sin datos · haz tu check-in</code>. Preferimos el hueco
        visible a un número falso que te haría confiar en algo que no se midió.
      </p>

      <DocNote variant="log" title="El check-in que no llega también es una señal">
        <p>
          Si pasan más de 48 h sin check-in, tu atleta aparece marcado con un{' '}
          <span className="k">Check-in 2d</span> en tu lista de atención. Un silencio largo suele
          contar tanto como un mal dato — y aquí no se te escapa.
        </p>
      </DocNote>

      <MovilBand
        title="El check-in de la mañana, en su móvil"
        subtitle={
          <>
            A la izquierda, lo que responde tu atleta en medio minuto. A la derecha, el readiness que
            le devuelve la app — y el mismo número que tú lees en tu panel.
          </>
        }
      >
        {/* PHONE 1: check-in */}
        <PhoneMockup
          caption={
            <>
              <b>Su check-in.</b> Cuatro toques: sueño, piernas, ánimo y energía. Rápido a propósito —
              para que lo haga cada día.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Check-in de hoy
            </div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Miércoles 14 ene</div>
          <div className="ph-title sm" style={{ marginBottom: '12px' }}>
            ¿Cómo te levantas?
          </div>

          <div className="logcard">
            <div className="lh">¿Cómo dormiste?</div>
            <div className="rpe">
              <span className="r">Mal</span>
              <span className="r">—</span>
              <span className="r sel">Bien</span>
              <span className="r">—</span>
              <span className="r">Genial</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Piernas / agujetas</div>
            <div className="rpe">
              <span className="r">Cargadas</span>
              <span className="r sel">Normal</span>
              <span className="r">Frescas</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Ánimo y energía</div>
            <div className="rpe">
              <span className="r">Bajo</span>
              <span className="r">—</span>
              <span className="r sel">Bien</span>
              <span className="r">—</span>
              <span className="r">Alto</span>
            </div>
          </div>
          <div className="cta">Guardar check-in</div>
        </PhoneMockup>

        {/* PHONE 2: readiness result on Inicio */}
        <PhoneMockup
          caption={
            <>
              <b>Su readiness.</b> El check-in + el reloj se vuelven un número con su lectura clara.
              Es el mismo dato que tú ves de su lado.
            </>
          }
        >
          <div className="kick">Tu mañana</div>
          <div className="ph-title sm" style={{ marginBottom: '14px' }}>
            Hola, Marc
          </div>
          <div className="tiles">
            <div className="tile">
              <span className="lbl">Readiness</span>
              <div className="big num">
                72<small> /100</small>
              </div>
              <div className="read" style={{ color: 'var(--ok)' }}>
                Recuperado y listo
              </div>
            </div>
            <div className="tile">
              <span className="lbl">Sueño</span>
              <div className="big num">
                7,4<small> h</small>
              </div>
              <div className="read">Buena noche</div>
            </div>
          </div>
          <div className="logcard" style={{ marginTop: '2px' }}>
            <div className="lh">Cómo se calcula</div>
            <div className="field">
              <span className="fl">Tu check-in</span>
              <span className="fv num" style={{ fontSize: '12px', color: 'var(--ok)' }}>
                Bien
              </span>
            </div>
            <div className="field">
              <span className="fl">Variabilidad (VFC)</span>
              <span className="fv num" style={{ fontSize: '12px' }}>
                +6%
              </span>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="fl">FC en reposo</span>
              <span className="fv num" style={{ fontSize: '12px' }}>
                48 ppm
              </span>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · Y tú lo ves del equipo entero</h3>
      <p>
        En tu pantalla del día, el <b>Pulso del equipo</b> reparte a todos tus atletas en los tres
        tramos de un vistazo. Y quien llega flojo o lleva días sin check-in sube solo a{' '}
        <em className="em">Necesitan atención</em>, con el motivo en claro — para que sepas con quién
        empezar la mañana.
      </p>

      {/* Dashboard mockup: Pulso del equipo */}
      <DashboardMockup url="tu-panel / hoy">
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '10px',
          }}
        >
          Pulso del equipo · readiness
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[
            { n: 9, l: 'Listos', c: 'var(--ok)' },
            { n: 3, l: 'Con cautela', c: 'var(--warn)' },
            { n: 1, l: 'En rojo', c: 'var(--dng)' },
            { n: 2, l: 'Sin dato', c: 'var(--faint)' },
          ].map((b) => (
            <div
              key={b.l}
              style={{
                flex: 1,
                background: 'var(--surface)',
                border: '1px solid var(--hair)',
                borderRadius: '9px',
                padding: '11px 12px',
              }}
            >
              <div
                className="num2"
                style={{ fontSize: '24px', fontWeight: 800, color: b.c, lineHeight: 1 }}
              >
                {b.n}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginTop: '5px',
                }}
              >
                {b.l}
              </div>
            </div>
          ))}
        </div>

        <div className="lane" style={{ marginTop: 0 }}>
          <div className="lh" style={{ color: 'var(--warn)' }}>
            ⚑ Necesitan atención
          </div>
          <div className="ac" style={{ marginBottom: '7px' }}>
            <div className="av">L</div>
            <div className="nm">Laia</div>
            <div className="rs" style={{ color: 'var(--dng)' }}>
              Readiness 38%
            </div>
          </div>
          <div className="ac">
            <div className="av">J</div>
            <div className="nm">Jordi</div>
            <div className="rs" style={{ color: 'var(--warn)' }}>
              Check-in 2d
            </div>
          </div>
        </div>
      </DashboardMockup>

      <p style={{ marginTop: '18px' }}>
        Su check-in de la mañana se vuelve tu radar del equipo. Lo que aquí es{' '}
        <b>cómo llega hoy</b>, en la siguiente sección se vuelve <b>cómo cumple en el tiempo</b>: la
        adherencia.
      </p>
    </DocSection>
  );
}
