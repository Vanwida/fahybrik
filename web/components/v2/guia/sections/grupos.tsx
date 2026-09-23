// GUÍA · Grupos: un plan para muchos — Programar › Grupos: la lista y la página
// de un grupo (plan en fechas, la cadena ordenada de programas, sus atletas y la
// regla automática opcional de nivel × días). El puente: la fase que lee el
// atleta es el nombre del programa en el que va.

import { DocSection, DocNote, MovilBand, PhoneMockup } from '../doc';
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
          Un <b>grupo</b> son atletas que comparten plan: sus programas en orden, uno detrás de otro.
          Periodizar es eso, <b>nombrar tus fases y ponerlas en orden</b>; el grupo lo aplica a todos
          a la vez. Sin fases prefijadas ni jerga impuesta: el lenguaje y la progresión son tuyos.
        </>
      }
    >
      <h3>La lista</h3>
      <p>
        En <b>Programar › Grupos</b> ves cada grupo con sus atletas, su plan y cuántas semanas suma.{' '}
        <b>Nuevo grupo</b> le pone nombre; luego lo llenas.
      </p>

      <h3>La página de un grupo</h3>
      <ul className="clean">
        <li>
          <b>Plan</b>: los programas puestos en fechas, con las carreras de sus atletas marcadas y el
          volumen planificado de cada semana. Una línea discontinua marca hoy.
        </li>
        <li>
          <b>Programas</b>: la cadena. <b>Añadir programa…</b> la alarga y las flechas la reordenan.
          Ese orden <em className="em">es</em> la progresión; el nombre de cada programa es la fase
          que lee el atleta. Arriba dice qué pasa al terminar (por ejemplo, <b>se repite</b>).
        </li>
        <li>
          <b>Atletas</b>: quién está, en qué programa y semana va cada uno (<b>Ahora</b>) y hasta
          cuándo tiene plan. <b>Añadir atletas</b> los mete; seleccionados, <b>Sacar del grupo</b> (conservan
          el plan que ya tenían).
        </li>
        <li>
          <b>Asignar…</b> abre la previa de siempre con el grupo ya puesto (ver{' '}
          <b>Asigna y publica por semanas</b>). En <b>···</b>, cambiar el nombre o eliminar el grupo.
        </li>
      </ul>
      <p>
        Quien entra en un grupo recibe el programa y la semana en que va el grupo; quien ya hacía
        uno de sus programas, lo conserva. Un atleta está en un solo grupo: entrar en otro le saca del
        anterior sin perder lo que ya entrenó.
      </p>

      <h3>Una regla para que entren solos (opcional)</h3>
      <p>
        Si clasificas a tus atletas (por nivel u otra cosa: el nombre lo pones en{' '}
        <b>Ajustes › Método</b>) y por días por semana, un grupo puede llevar esa pareja como{' '}
        <b>Regla de pertenencia automática</b>. Quien la cumpla y aún no esté aparece en{' '}
        <b>Asignar a nuevos (n)</b>. Sin regla, lo llenas a mano.
      </p>

      <DocNote variant="log" title="Agnóstico de principio a fin">
        <p>
          La app no trae «las fases» de serie ni asume tres. Lee los programas que tú creas y los
          muestra en el orden que tú das. Si tu método cambia de lenguaje o de número de fases, no hay
          nada que reconfigurar.
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
