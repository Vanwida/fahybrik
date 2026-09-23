// GUÍA · 09 Grupos: un plan para muchos — área «El plan». Un grupo es un
// conjunto de atletas con su plan: una cadena ORDENADA de programas (ese orden
// es la periodización; no hay fases fijas). Nivel y días son una regla opcional
// de pertenencia automática. Cada programa se llama como la fase que lee el atleta.

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  circuito: 'var(--v2-mod-circuito)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Un <b>grupo</b> son atletas que comparten plan: una cadena de programas en orden. Periodizar
          es eso, <b>nombrar tus fases y ponerlas en orden</b>; el grupo lo aplica a todos a la vez.
          Sin fases prefijadas ni jerga impuesta: el lenguaje y la progresión son tuyos.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            En <b>Programar › Grupos</b>, cada grupo tiene nombre, sus miembros y su cadena de
            programas: el primero, el segundo, el tercero… Ese orden <em className="em">es</em> la
            progresión.
          </>
        }
        como={
          <>
            Creas el grupo, ordenas sus programas y añades atletas. Quien entra recibe el programa y
            la semana en que va el grupo; quien ya hacía uno de la cadena, lo conserva.
          </>
        }
        porque={
          <>
            Porque la mayoría de tus atletas siguen unos pocos caminos. Un grupo te ahorra asignar
            atleta a atleta y te deja cambiar el camino de todos en un sitio.
          </>
        }
      />

      <h3>1 · El orden de la cadena es la periodización</h3>
      <p>
        No existe una entidad «fase» suelta: el nombre de cada programa es la <b>fase</b> que ve tu
        atleta, y su posición en la cadena es cuándo le toca. Reordenar la cadena reordena la
        progresión de quien aún no ha llegado a ese punto.
      </p>

      <h3>2 · Nivel y días: una regla opcional</h3>
      <p>
        Si clasificas a tus atletas (por nivel u otra cosa: el nombre lo pones en{' '}
        <b>Ajustes › Método</b>) y por días por semana, un grupo puede llevar esa pareja como regla: los
        atletas que la cumplen entran solos. Si no, lo llenas a mano. Un atleta está en un solo grupo:
        entrar en otro le saca del anterior sin perder lo que ya entrenó.
      </p>

      <DocNote variant="log" title="Agnóstico de principio a fin">
        <p>
          La app no trae «las fases» de serie ni asume tres. Lee las que tú creas y las muestra en
          el orden que tú das. Si tu método cambia de lenguaje o de número de fases, no hay nada que
          reconfigurar: tu periodización es dato tuyo, no una regla del sistema.
        </p>
      </DocNote>

      <MovilBand
        title="La progresión, como la vive tu atleta"
        subtitle={
          <>
            Tu atleta no ve la secuencia entera de golpe: ve <b>su fase actual</b> encabezando el
            día. A medida que el plan avanza por tu orden, esa etiqueta cambia con él.
          </>
        }
      >
        {/* PHONE 1: principio de la secuencia */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 2.</b> Al principio del plan, su fase es la primera de tu secuencia.
            </>
          }
        >
          <PhaseHeader
            kick="Miércoles 14 ene"
            name="Marc"
            phase="Acumulación"
            foco="Foco: base aeróbica"
          />
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">Carrera · sesión de hoy</span>
            </div>
            <div className="ht">Rodaje largo Z2</div>
            <div className="meta num">Mañana · ≈ 70 min · 1 bloque</div>
            <div className="cta">▶ Empezar</div>
          </div>
          <div className="prog">
            <span className="l">Tu fase</span>
            <div className="v num" style={{ fontSize: '15px' }}>
              Semana 2 de 5
            </div>
            <div className="bar">
              <span style={{ width: '40%' }} />
            </div>
            <div className="cap">Construyendo base.</div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: final de la secuencia */}
        <PhoneMockup
          caption={
            <>
              <b>Semana 10.</b> La misma app, más adelante: tu orden lo ha llevado a la última fase.
            </>
          }
        >
          <PhaseHeader
            kick="Lunes 9 mar"
            name="Marc"
            phase="Realización"
            foco="Foco: ritmo de carrera"
          />
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">HYROX · sesión de hoy</span>
            </div>
            <div className="ht">Simulación a ritmo</div>
            <div className="meta num">Mañana · ≈ 55 min · 4 estaciones</div>
            <div className="cta">▶ Empezar</div>
          </div>
          <div className="prog">
            <span className="l">Tu fase</span>
            <div className="v num" style={{ fontSize: '15px' }}>
              Semana 2 de 3
            </div>
            <div className="bar">
              <span style={{ width: '66%', background: MOD.circuito }} />
            </div>
            <div className="cap">Afinando para competir.</div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// ── Athlete phone: the Inicio header showing the current fase ────────────────
function PhaseHeader({
  kick,
  name,
  phase,
  foco,
}: {
  kick: string;
  name: string;
  phase: string;
  foco: string;
}) {
  return (
    <>
      <div className="kick" style={{ marginTop: '6px' }}>
        {kick}
      </div>
      <div className="ph-title">Hola, {name}</div>
      <div className="focus-line">
        <span className="scope">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </span>
        <span className="ph">{phase}</span>
        <span className="fo">· {foco}</span>
      </div>
    </>
  );
}
