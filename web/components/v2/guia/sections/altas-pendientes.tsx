// GUÍA · Altas pendientes — el cuestionario de entrada de cada atleta nuevo:
// dónde espera (Hoy › Altas, «Revisar en fila»), la revisión (sus respuestas +
// evento, tests de la semana 1, avisos, bienvenida) y «Asignar plan». El puente:
// cómo lo responde en el móvil.

import { DocSection, MovilBand, PhoneMockup } from '../doc';
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
          Antes de montarle nada, sabes quién es. Cada atleta nuevo responde su{' '}
          <b>cuestionario de entrada</b> en el móvil (objetivo, experiencia, lesiones, días
          disponibles, marcas) y te llega como <b>alta pendiente</b>. Tú lo lees, decides su primera
          semana y le das el plan.
        </>
      }
    >
      <h3>Dónde te esperan</h3>
      <p>
        En <b>Hoy</b>, la fila <b>N altas pendientes</b> de <b>Afecta a varios</b> y el chip{' '}
        <b>Altas</b>, con la más antigua primero y cuánto lleva esperando. <b>Revisar alta</b> abre
        una; <b>Revisar en fila</b> te lleva de una a la siguiente. En Atletas salen con el estado{' '}
        <b>Alta pendiente</b>, y su ficha enseña la revisión en lugar del calendario.
      </p>

      <h3>La revisión</h3>
      <p>
        A un lado, <b>sus respuestas</b>: objetivos (y si son alcanzables en el plazo que dice),
        estado de partida (sueño, estrés, compromiso), experiencia en carrera y fuerza, lesiones con
        su zona y severidad, disponibilidad, marcas, instalación y dispositivos. Al otro, lo que
        decides tú, por pasos:
      </p>
      <ul className="clean">
        <li>
          <b>Evento objetivo</b>: su carrera principal, si tiene.
        </li>
        <li>
          <b>Tests de la semana 1</b>: los <b>pasivos</b> se calculan solos con lo que entrena; los{' '}
          <b>programados</b> son un entreno de test que le pones en su primera semana. Solo entran los
          que marcas.
        </li>
        <li>
          <b>Avisos por confirmar</b>: lo que sus respuestas levantan (una lesión, poca experiencia)
          y que confirmas antes de seguir.
        </li>
        <li>
          <b>Bienvenida y notas</b>: el mensaje con el que le recibes.
        </li>
      </ul>
      <p>
        Cuando no queda nada por resolver, <b>Asignar plan</b> le da su primer programa y el alta
        deja de estar pendiente.
      </p>

      <MovilBand
        title="Lo que respondió, lo que va a probar"
        subtitle={
          <>
            A la izquierda, el cuestionario tal y como tu atleta lo rellena en su móvil. A la derecha,
            un <b>test programado</b> que elegiste: aparece en su semana 1 como una sesión más, con su
            color de modalidad.
          </>
        }
      >
        {/* PHONE 1: cuestionario */}
        <PhoneMockup
          caption={
            <>
              <b>Cuestionario.</b> Objetivo, experiencia, lesiones, días y marcas. Esto es lo que tú
              lees en la columna de respuestas.
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
              Cuéntanos de ti
            </div>
            <div className="num" style={{ fontSize: '11px', color: 'var(--muted)' }}>
              3 / 6
            </div>
          </div>
          <div className="logcard">
            <div className="lh">¿Cuál es tu objetivo?</div>
            <div className="day today" style={{ marginTop: '2px' }}>
              <span className="mdot" style={{ background: 'var(--acc)' }} />
              <span className="dt">Mejorar mi marca de HYROX</span>
              <span className="stg done">✓</span>
            </div>
            <div className="day">
              <span className="mdot" style={{ background: 'var(--faint)' }} />
              <span className="dt rest">Primer HYROX</span>
            </div>
            <div className="day">
              <span className="mdot" style={{ background: 'var(--faint)' }} />
              <span className="dt rest">Completar y disfrutar</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">¿Cómo duermes? · del 1 al 10</div>
            <div className="rpe">
              <span className="r">4</span>
              <span className="r">5</span>
              <span className="r">6</span>
              <span className="r sel">7</span>
              <span className="r">8</span>
              <span className="r">9</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Días que puedes entrenar</div>
            <div className="legend-mini" style={{ marginTop: '2px' }}>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />L
              </span>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />X
              </span>
              <span>
                <span className="d" style={{ background: 'var(--acc)' }} />V
              </span>
              <span>
                <span className="d" style={{ background: 'var(--faint)' }} />M J S D
              </span>
            </div>
          </div>
          <div className="cta">Siguiente</div>
        </PhoneMockup>

        {/* PHONE 2: test en la semana 1 */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 1.</b> El test que programaste aparece como una sesión más, marcada para que
              tu atleta sepa que esa va de medir.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Semana 1 · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Tomar referencias</span>
          </div>
          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">
              Test · umbral de carrera <span className="slotmini">TEST</span>
            </span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">VIE</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">DOM</span>
            <span className="mdot" style={{ background: 'var(--faint)' }} />
            <span className="dt rest">Descanso</span>
          </div>
          <div className="prog">
            <span className="l">De qué va esta semana</span>
            <div className="cap" style={{ marginTop: '4px' }}>
              Medimos tu punto de partida para ajustar ritmos y cargas.
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
