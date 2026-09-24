// GUÍA · Monta un programa — Programar › Programas: la lista, el editor de
// rejilla (todas las semanas × 7 días), la línea rápida con el ejercicio
// enlazado, el teclado, copiar/pegar/duplicar, «Progresar selección» y descanso
// como estado. El puente: el nombre es su fase y el foco encabeza su semana.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Keys } from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

// Canonical modality hues from the live v2 tokens (never drift from the app).
const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
  calent: 'var(--v2-mod-calentamiento)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Un programa se monta como una hoja de cálculo: todas sus semanas a la vista, una fila por
          semana y una columna por día. Escribes en la celda con una línea, copias y pegas semanas,
          y «Progresar» sube la carga de las siguientes. Cada cambio se guarda solo.
        </>
      }
    >
      <h3>Crear y abrir un programa</h3>
      <p>
        En <b>Programar › Programas</b> ves tus programas en una tabla (semanas, entrenos, nivel,
        cuántos atletas lo usan, en qué grupos y cuándo se editó). <b>Nuevo programa</b> pide el{' '}
        <b>nombre</b> (lo ve el atleta como su fase), las <b>semanas</b> y, si quieres, el{' '}
        <b>nivel</b>. Al abrirlo, arriba tienes <b>Vista atleta</b>, <b>Progresar selección…</b>,{' '}
        <b>Biblioteca</b>, <b>Asignar…</b> y <b>···</b> (nombre, nivel y etiquetas; importar;
        añadir semana; duplicar).
      </p>

      <h3>La rejilla</h3>
      <p>
        Cada fila es una semana, con su <b>foco</b> debajo del número (una frase que ve el atleta:
        «Carga base», «Descarga»). Cada celda es un día y enseña sus entrenos. La última columna suma
        lo planificado de esa semana. Te mueves con las flechas como en una hoja de cálculo; con{' '}
        <b>mayúsculas</b> amplías la selección a varios días o semanas.
      </p>

      <h3>Escribir en una celda: la línea rápida</h3>
      <p>
        <b>Enter</b> (o doble clic) abre la celda. Escribe como en tu libreta:{' '}
        <code>press banca 4x4 @78-80% r90</code> o <code>45&apos; carrera z2</code>. Mientras
        escribes, la línea reconoce la dosis y enlaza el ejercicio de tu catálogo; si duda entre
        varios, te los ofrece (<b>↑ ↓</b> para cambiar). Enter la convierte en un bloque; varias
        separadas por <code>·</code> son varios bloques. Lo que no entiende entero no entra: te dice
        qué falta. Para afinar lo que una línea no dice (RIR, descansos, series distintas, la nota
        para el atleta), <b>Detalle</b> (o <b>⌘ Enter</b>) abre el compositor completo a un lado, con
        la rejilla viva detrás.
      </p>

      <PanelFigure caption={<>La línea de abajo de la rejilla enseña siempre las teclas que valen para lo que tienes seleccionado.</>}>
        <Keys
          items={[
            [['↵'], 'Escribir en la celda'],
            [['⌘', '↵'], 'Detalle'],
            [['⇧', 'flechas'], 'Seleccionar'],
            [['⌘', 'C'], 'Copiar'],
            [['⌘', 'V'], 'Pegar'],
            [['⌘', 'D'], 'Duplicar abajo'],
            [['Supr'], 'Vaciar (con deshacer)'],
            [['⌘', 'Z'], 'Deshacer'],
          ]}
        />
      </PanelFigure>

      <h3>Copiar, arrastrar y progresar</h3>
      <ul className="clean">
        <li>
          <b>Copiar y pegar</b> vale para una celda, una semana o un rango. <b>⌘ D</b> duplica lo
          seleccionado en la semana de abajo.
        </li>
        <li>
          <b>Arrastrar</b>: mueve un entreno a otro día, o tráelo desde el panel <b>Biblioteca</b>.
        </li>
        <li>
          <b>Progresar selección…</b>: selecciona semanas y elige <b>Carga</b> (sube el % o los kilos
          cada semana), <b>Series</b> (añade una serie) o <b>Descarga</b> (menos volumen, misma
          intensidad). Los valores de partida son los tuyos de <b>Ajustes › Método</b>. RPE, RIR,
          zonas y ritmos no se tocan.
        </li>
        <li>
          El número de cada semana abre su menú: seleccionar, copiar, pegar, duplicar en la
          siguiente, progresar, descarga, vaciar o quitar la semana.
        </li>
      </ul>

      <DocNote variant="bad" title="Descanso es un estado, no un borrado">
        <ul>
          <li>
            Un día de descanso se marca con <span className="k">Marcar descanso</span> dentro de la
            celda. Si el día tenía entreno, te pregunta antes, y se puede deshacer.
          </li>
          <li>
            Una línea solo se guarda si apunta a un ejercicio de tu catálogo. Si no existe, créalo en{' '}
            <b>Biblioteca › Ejercicios</b>: la línea te lo dice.
          </li>
        </ul>
      </DocNote>

      <p>
        <b>Vista atleta</b> enseña el día seleccionado tal como lo leerá en su móvil. Cuando el
        programa esté listo, <b>Asignar…</b> se lo da a atletas o grupos (ver{' '}
        <b>Asigna y publica por semanas</b>).
      </p>

      <MovilBand
        title="Lo que montaste, en su teléfono"
        subtitle={
          <>
            El nombre del programa se convierte en su <b>fase</b>. El foco de la semana aparece
            bajo el saludo. Y los entrenos que rellenaste por día se vuelven su plan, uno cada
            mañana.
          </>
        }
      >
        {/* PHONE 1: INICIO */}
        <PhoneMockup
          caption={
            <>
              <b>Inicio.</b> Tu fase y tu foco encabezan el día; el entreno de hoy es la tarjeta
              grande con su botón <b>Empezar</b>.
            </>
          }
        >
          <div className="ph-hd">
            <div className="ico-btn">
              <span className="dot" />
              <svg viewBox="0 0 24 24">
                <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 21h4" />
              </svg>
            </div>
            <div className="ph-mark"><ClubMark /></div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Miércoles 14 ene</div>
          <div className="ph-title">Hola, Marc</div>
          <div className="focus-line">
            <span className="scope">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </span>
            <span className="ph">Acumulación</span>
            <span className="fo">· Foco: base aeróbica</span>
          </div>
          <div className="hero">
            <div className="row">
              <span className="slot">AM</span>
              <span className="hk">Carrera · sesión de hoy</span>
            </div>
            <div className="ht">Series 6×800</div>
            <div className="meta num">Mañana · ≈ 48 min · 3 bloques</div>
            <div className="cta">▶ Empezar</div>
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
              <span className="lbl">Próxima carrera</span>
              <div className="big num">
                26<small> días</small>
              </div>
              <div className="read">Construyendo motor</div>
            </div>
          </div>
          <div className="row-card">
            <div className="ca">P</div>
            <div className="tx">
              <div className="e">Tu coach</div>
              <div className="m">Buen trabajo en la tirada del lunes</div>
            </div>
            <div className="chev">›</div>
          </div>
          <div className="tabbar">
            <div className="tab on">
              <div className="pill">
                <svg viewBox="0 0 24 24">
                  <path d="M3 11l9-8 9 8" />
                  <path d="M5 10v10h14V10" />
                </svg>
              </div>
              <span className="tl">Inicio</span>
            </div>
            <div className="tab">
              <svg viewBox="0 0 24 24">
                <path d="M8 6h12M8 12h12M8 18h12" />
              </svg>
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

        {/* PHONE 2: PLAN */}
        <PhoneMockup
          caption={
            <>
              <b>Plan.</b> Cada día con su color de modalidad y su título. El foco que escribiste
              aparece arriba; abajo, el progreso real de la semana.
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
                <path d="M4 5h16v11H8l-4 4z" />
              </svg>
            </div>
          </div>
          <div className="ph-title sm" style={{ marginBottom: '2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            12–18 ene · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Base aeróbica</span>
          </div>
          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">
              Tirada larga Z2 <span className="slotmini">AM</span>
            </span>
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
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">SÁB</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Ergómetro Z2</span>
            <span className="stg pend">›</span>
          </div>
          <div className="prog">
            <span className="l">Progreso de la semana</span>
            <div className="v num">1 / 5</div>
            <div className="bar">
              <span style={{ width: '20%' }} />
            </div>
            <div className="cap">Te quedan 4 sesiones.</div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
