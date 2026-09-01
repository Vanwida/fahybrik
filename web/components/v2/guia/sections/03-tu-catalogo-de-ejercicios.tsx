// GUÍA · 03 Tu catálogo de ejercicios — área "Tu biblioteca". BUILT.
// Real flow: ExercisePicker command-sheet (buscar · crear · editar tu versión) +
// el vídeo (subido o de YouTube) y las indicaciones que el atleta ve en el detalle
// del ejercicio. Modalidad intrínseca al ejercicio (mig 0053). Doc kit en
// '../doc'; hues canónicos var(--v2-mod-*).

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

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cada ejercicio que pones en una sesión sale de tu <b>catálogo</b>: un movimiento con su
          nombre, su tipo y, si quieres, tu <b>vídeo</b> y tus indicaciones. No escribes texto suelto:
          eliges del catálogo, y eso es lo que tu atleta abre en el móvil para ver cómo se hace.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una lista de movimientos lista para usar. Cada uno trae su <b>modalidad</b> (carrera,
            fuerza, ergómetro…) de fábrica, así que al elegirlo la sesión ya sabe de qué tipo de
            trabajo es.
          </>
        }
        como={
          <>
            Al añadir un ejercicio se abre un buscador: filtras por tipo, ves tus <b>recientes</b> y
            eliges. Si no existe, lo <b>creas al vuelo</b>; y a cualquiera puedes ponerle{' '}
            <b>tu vídeo</b> e indicaciones.
          </>
        }
        porque={
          <>
            Porque tu atleta no debería adivinar un ejercicio por su nombre. Con tu vídeo y tus cues,
            abre el móvil y ve exactamente cómo lo quieres hecho.
          </>
        }
      />

      <h3>1 · Eliges del catálogo, no escribes texto suelto</h3>
      <p>
        Cuando añades un ejercicio a una sesión, se abre un <b>buscador</b>: escribes el nombre,
        filtras por tipo (<code>Fuerza</code>, <code>Cardio</code>, <code>HYROX</code>,{' '}
        <code>Core</code>, <code>Movilidad</code>…) y eliges. Arriba aparecen tus{' '}
        <em className="em">Recientes</em>, los que más usas. Cada movimiento ya trae su modalidad, y
        al elegirlo la línea de la sesión queda enganchada a un ejercicio real: nada de nombres
        sueltos que se pierden al guardar.
      </p>

      <h3>2 · Si no existe, lo creas al vuelo</h3>
      <p>
        ¿No encuentras el ejercicio? La última opción del buscador es{' '}
        <code>Crear “…” como ejercicio nuevo</code>: le pones nombre, eliges el tipo de movimiento y,
        si quieres, le cuelgas ya el vídeo. Queda guardado en tu catálogo y disponible para cualquier
        sesión futura.
      </p>

      <h3>3 · Tu vídeo y tus indicaciones</h3>
      <p>
        En cualquier ejercicio puedes editar <b>tu versión</b>: ponerle el vídeo, escribir tus{' '}
        <em className="em">indicaciones (cues)</em> y una descripción. El vídeo tiene dos caminos y
        vale cualquiera de los dos: <code>Subir vídeo</code>, con un fichero tuyo del ordenador o del
        móvil, o pegar un <code>enlace de YouTube</code>. Se reproduce en el propio campo, así que
        ves lo que has puesto sin abrir otra pestaña. Lo que dejes en blanco hereda el contenido
        base; lo que escribas, lo verán <b>tus</b> atletas.
      </p>

      {/* Dashboard mockup: the exercise picker command-sheet */}
      <DashboardMockup url="tu-panel / sesión / añadir ejercicio">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div className="wk-title" style={{ fontSize: '15px' }}>
            Añadir ejercicio <small>· Fuerza principal</small>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--sunken)',
            border: '1px solid var(--hair)',
            borderRadius: '8px',
            padding: '8px 11px',
            marginBottom: '10px',
            fontSize: '12px',
            color: 'var(--faint)',
          }}
        >
          ⌕ Buscar ejercicio…
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span className="chip pri-chip" style={{ background: 'var(--acc)', color: 'var(--accOn)', borderColor: 'var(--acc)' }}>
            Todo
          </span>
          <span className="chip">Fuerza</span>
          <span className="chip">Cardio</span>
          <span className="chip">HYROX</span>
          <span className="chip">Core</span>
        </div>

        <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', margin: '0 0 6px' }}>
          Recientes
        </div>
        <ExRow color={MOD.fuerza} name="Sentadilla trasera" sub="Barra · cuádriceps" tag="Fuerza" hasVideo />
        <ExRow color={MOD.fuerza} name="Peso muerto rumano" sub="Barra · isquios" tag="Fuerza" />
        <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', margin: '10px 0 6px' }}>
          Catálogo
        </div>
        <ExRow color={MOD.fuerza} name="Zancada búlgara" sub="Mancuerna · glúteo" tag="Fuerza" hasVideo />
        <ExRow color={MOD.circuito} name="Wall ball" sub="Balón · full body" tag="Funcional" />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderTop: '1px solid var(--hair)',
            marginTop: '8px',
            paddingTop: '10px',
            fontSize: '12px',
            color: 'var(--muted)',
          }}
        >
          <span style={{ color: 'var(--acc)', fontWeight: 800 }}>+</span>
          Crear “<b style={{ color: 'var(--fg)' }}>Hip thrust</b>” como ejercicio nuevo
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Tu versión, no la de todos">
        <p>
          El vídeo y las indicaciones que editas son <b>tuyos</b>: solo los ven tus atletas. El mismo
          ejercicio puede tener tu cue particular sin pisar el contenido base. Si lo dejas vacío, el
          atleta ve el contenido base, nunca un hueco.
        </p>
      </DocNote>

      <MovilBand
        title="El ejercicio, en su teléfono"
        subtitle={
          <>
            Cuando tu atleta abre un ejercicio de la sesión, ve tu <b>vídeo</b> de demostración y tus{' '}
            <b>indicaciones</b>. Cero ambigüedad sobre cómo lo quieres hecho.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Detalle del ejercicio.</b> Tu vídeo arriba, tus cues debajo. Lo que escribiste en el
              panel aterriza aquí tal cual.
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
              Ejercicio
            </div>
            <div style={{ width: '30px' }} />
          </div>

          {/* Video card */}
          <div
            style={{
              position: 'relative',
              height: '128px',
              borderRadius: '14px',
              background: 'var(--elev)',
              border: '1px solid var(--hair)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '8px',
                left: '10px',
                fontSize: '8px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
              }}
            >
              Demostración
            </span>
            <span
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--acc)',
                color: 'var(--accOn)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                paddingLeft: '3px',
              }}
            >
              ▶
            </span>
          </div>

          <div className="ph-title sm" style={{ marginBottom: '4px' }}>
            Sentadilla trasera
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <span className="slot" style={{ background: 'var(--v2-mod-fuerza-soft)', color: MOD.fuerza }}>
              Fuerza
            </span>
            <span className="slot" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              Barra
            </span>
          </div>

          <div className="logcard">
            <div className="lh">Indicaciones de tu coach</div>
            <div style={{ fontSize: '12px', color: 'var(--fg)', lineHeight: 1.55 }}>
              · Pecho alto, mirada al frente.
              <br />· Baja controlado hasta romper paralelo.
              <br />· Empuja con el suelo, rodillas hacia fuera.
            </div>
          </div>
          <div className="logcard" style={{ marginBottom: 0 }}>
            <div className="lh">Descripción</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
              Patrón base de tren inferior. Si dudas del peso, quédate corto y sube la próxima.
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// Small catalog row used inside the dashboard picker mock.
function ExRow({
  color,
  name,
  sub,
  tag,
  hasVideo,
}: {
  color: string;
  name: string;
  sub: string;
  tag: string;
  hasVideo?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 4px',
        borderRadius: '7px',
      }}
    >
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--fg)' }}>{name}</span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--faint)' }}>{sub}</span>
      </span>
      <span
        style={{
          fontSize: '9px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          padding: '2px 7px',
          borderRadius: '99px',
          background: 'var(--surface)',
          color: 'var(--muted)',
          border: '1px solid var(--hair)',
        }}
      >
        {tag}
      </span>
      <span style={{ color: hasVideo ? 'var(--acc)' : 'var(--faint)', fontSize: '13px', width: '16px', textAlign: 'center' }}>
        {hasVideo ? '▶' : '✎'}
      </span>
    </div>
  );
}
