// GUÍA · 05 Tu metodología y tus fases — área "Tu biblioteca". BUILT.
// Real flow: Periodización es 100% dato del coach. Niveles (athlete_levels:
// código + etiqueta + descripción) = eje "quién". Una secuencia (nivel × días) es
// una lista ORDENADA de programas; el ORDEN es la periodización (no hay entidad
// "fase"). El NOMBRE del programa es la fase que ve el atleta. Sin catálogo
// hardcodeado, sin nombres impuestos. Doc kit en '../doc'; hues var(--v2-mod-*).

import {
  DocSection,
  QCWTriad,
  Principle,
  DocNote,
  MovilBand,
  PhoneMockup,
} from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
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
          Aquí no hay un método impuesto. En <b>Ajustes › Método</b> cuentas <b>cómo entrenas</b> (siete
          capítulos de casillas y un párrafo que lo resume), cómo llamas a tu clasificación de atletas
          y qué te tiene que avisar. Y el nombre que le pones a cada programa es la <b>fase</b> que tu
          atleta lee en su móvil.
        </>
      }
    >
      <Principle>
        <p>
          <b>Nosotros damos la palanca, tú pones el método.</b> Si entrenas por “Acumulación ·
          Transformación · Realización”, escribes eso. Si usas otro lenguaje, escribes el tuyo. No
          hay fases prefijadas ni jerga obligatoria.
        </p>
      </Principle>

      <QCWTriad
        que={
          <>
            Tu método por escrito (la entrevista y su párrafo, que leen el plan, el chat y el
            conector), tu <b>clasificación</b> de atletas y tus <b>grupos</b> (en qué orden encadenas
            los programas). El orden es tu periodización.
          </>
        }
        como={
          <>
            En <b>Ajustes › Método</b> respondes la entrevista y corriges el párrafo. En{' '}
            <b>Programar › Grupos</b> colocas los programas en orden. El nombre de cada uno será su
            fase.
          </>
        }
        porque={
          <>
            Porque cada entrenador periodiza distinto. En vez de encerrarte en un modelo, te damos el
            sitio donde escribir el tuyo, y que llegue intacto al atleta.
          </>
        }
      />

      <h3>1 · Cómo entrenas, en un párrafo</h3>
      <p>
        La entrevista son siete capítulos de casillas: a qué te dedicas, cómo partes el tiempo, la
        semana, qué se ve en un entreno, de dónde salen los números, cómo avanza y cómo se lo dices.
        Cada casilla reescribe el párrafo de arriba, y tú lo corriges a mano si algo no suena a ti.
        Ese párrafo es lo que leen el plan, el chat y el conector cuando te ayudan.
      </p>

      <h3>2 · Tu clasificación y tus avisos</h3>
      <p>
        Si agrupas a tus atletas por nivel (o por objetivo, o por turno), el nombre de esa
        clasificación lo pones tú. Y qué cuenta como aviso (cuánto cae un readiness, cuántos
        entrenos sin hacer, cuántas horas esperando un mensaje) son números tuyos, con el valor por
        defecto a la vista y «Restaurar valores por defecto».
      </p>

      <DocNote variant="log" title="Agnóstico de verdad">
        <p>
          El panel no impone ningún modelo: tus niveles, tus programas y tus nombres son datos
          tuyos. Cambia las palabras y cambian en todo, empezando por la pantalla de tu atleta.
        </p>
      </DocNote>

      <MovilBand
        title="Tu fase, en su teléfono"
        subtitle={
          <>
            El nombre que le diste al programa encabeza la semana del atleta como su <b>fase</b>.
            Lo que escribes es exactamente lo que él lee.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su semana.</b> La fase es lo primero que ve: el nombre de tu programa, tal cual lo
              escribiste.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '6px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tu semana
            </div>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M8 6h12M8 12h12M8 18h12" />
              </svg>
            </div>
          </div>

          {/* Phase banner — the programa name */}
          <div
            style={{
              background: 'var(--accSoft)',
              border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc)' }}>
              Fase
            </div>
            <div className="ph-title sm" style={{ margin: '2px 0 0' }}>
              Acumulación
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Semana 2 de 5
            </div>
          </div>

          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Base aeróbica</span>
          </div>

          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Tirada larga Z2</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Remo Z2</span>
            <span className="stg pend">›</span>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
