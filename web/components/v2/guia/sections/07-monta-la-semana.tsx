// GUÍA · 07 Monta la semana de tu atleta — área "El plan". BUILT reference section
// (ported from the approved prototype) — proves the doc kit + both mockups
// end-to-end and gives phase-2 agents a worked model.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

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
          Aquí construyes la unidad central del plan: una <b>semana</b> de entrenamiento. Le pones
          nombre a la fase, defines el foco, y rellenas las sesiones de cada día con sus ejercicios y
          la carga de cada uno. Todo lo que escribas con la etiqueta{' '}
          <em className="em">“lo ve el atleta”</em> aterriza tal cual en su móvil.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una semana = 7 días. Cada día tiene una o dos sesiones (mañana / tarde). La semana vive
            dentro de un <b>microciclo</b>, al que tú le das un nombre, y ese nombre es la{' '}
            <b>fase</b> que ve tu atleta.
          </>
        }
        como={
          <>
            Pones el <b>foco de la semana</b>, abres un día y añades sesiones. Dentro de cada sesión
            eliges <b>tipos de trabajo</b> (bloques), añades <b>ejercicios</b> de tu catálogo y
            ajustas su <b>carga e intensidad</b>.
          </>
        }
        porque={
          <>
            Porque tu atleta no quiere un Excel: quiere abrir el teléfono y saber qué toca hoy y por
            qué. Una semana bien montada se convierte en su día a día, sin que tú toques nada más.
          </>
        }
      />

      <h3>1 · El nombre del microciclo es la fase que ve tu atleta</h3>
      <p>
        Al abrir un microciclo, su título es editable: haz clic y escribe. El propio panel te lo
        recuerda: <code>El atleta ve este nombre como su fase</code>. No hay fases prefijadas ni
        jerga impuesta: si tu método se organiza en “Acumulación / Transformación / Realización”,
        escribes eso; si usas otro lenguaje, escribes el tuyo.{' '}
        <em className="em">La metodología es tuya; nosotros solo te damos dónde escribirla.</em>
      </p>

      <h3>2 · El foco de la semana</h3>
      <p>
        Cada semana tiene un campo <code>Foco de la semana</code> (con la coletilla{' '}
        <em className="em">· lo ve el atleta</em>). Es una frase corta, por ejemplo{' '}
        <code>Acumulación de base aeróbica</code>. Se guarda solo al salir del campo y es lo primero
        que orienta a tu atleta cuando abre la app.
      </p>

      <h3>3 · La semana ES el editor</h3>
      <p>
        No hay una pantalla aparte para “ver la semana” y otra para “editar el día”. Es un mismo
        lienzo: ves los 7 días a la vez y, al abrir uno, el resto se queda a la izquierda como una
        lista mientras editas a la derecha. Así nunca pierdes el contexto de la semana entera.
      </p>

      {/* Dashboard mockup: week canvas + master-detail */}
      <DashboardMockup url="tu-panel / microciclos / acumulación">
        <div className="wk-head">
          <div className="wk-title">
            Microciclo · «Acumulación»&nbsp; <small>✎ lo ve el atleta como su fase</small>
          </div>
          <div className="wk-tools">
            <span className="btn">Añadir semana</span>
            <span className="btn pri">Asignar a atleta</span>
          </div>
        </div>
        <div className="wk-sum">
          <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Semana 1 · base aeróbica</span>
          <span className="chip" style={{ color: MOD.carrera, borderColor: MOD.carrera }}>
            3 Carrera
          </span>
          <span className="chip" style={{ color: MOD.fuerza }}>
            1 Fuerza
          </span>
          <span className="chip" style={{ color: MOD.circuito }}>
            1 HYROX
          </span>
          <span className="chip" style={{ color: MOD.ergo }}>
            1 Ergómetro
          </span>
        </div>
        <div className="cal">
          <div className="col today">
            <span className="topbar" style={{ background: MOD.carrera }} />
            <div className="cd">LUN 12</div>
            <div className="ch">Tirada larga Z2</div>
            <div className="blk">
              Carrera · 14 km <span className="x">@ Z2</span>
            </div>
            <div className="foot">1 bl · 1 ej</div>
          </div>
          <div className="col">
            <span className="topbar" style={{ background: MOD.fuerza }} />
            <div className="cd">MAR 13</div>
            <div className="ch">Fuerza · tren inferior</div>
            <div className="blk">
              Sentadilla 4×5 <span className="x">75%</span>
            </div>
            <div className="blk">Peso muerto 3×5</div>
            <div className="foot">2 bl · 4 ej</div>
          </div>
          <div className="col">
            <span className="topbar" style={{ background: MOD.carrera }} />
            <div className="cd">MIÉ 14</div>
            <div className="ch">Series 6×800</div>
            <div className="blk">
              Intervalos <span className="x">@ Z4</span>
            </div>
            <div className="foot">1 bl · 1 ej</div>
          </div>
          <div className="col">
            <div className="cd">JUE 15</div>
            <div className="rest">Descanso</div>
          </div>
          <div className="col">
            <span className="topbar" style={{ background: MOD.circuito }} />
            <div className="cd">VIE 16</div>
            <div className="ch">Simulación HYROX</div>
            <div className="blk">4 estaciones</div>
            <div className="foot">3 bl · 6 ej</div>
          </div>
          <div className="col">
            <span className="topbar" style={{ background: MOD.ergo }} />
            <div className="cd">SÁB 17</div>
            <div className="ch">Ergómetro Z2</div>
            <div className="blk">
              Remo 40 min <span className="x">@ Z2</span>
            </div>
            <div className="foot">1 bl · 1 ej</div>
          </div>
          <div className="col">
            <span className="topbar" style={{ background: MOD.calent }} />
            <div className="cd">DOM 18</div>
            <div className="ch" style={{ color: MOD.calent }}>
              Movilidad
            </div>
            <div className="blk">Rutina 20 min</div>
            <div className="foot">1 bl · 5 ej</div>
          </div>
        </div>

        <div className="md">
          <div className="rail">
            <div className="rc on">
              <div className="d">LUN 12</div>Tirada larga Z2 <div className="s">Carrera · 1 ej</div>
            </div>
            <div className="rc">
              <div className="d">MAR 13</div>Fuerza <div className="s">tren inferior · 4 ej</div>
            </div>
            <div className="rc">
              <div className="d">MIÉ 14</div>Series 6×800 <div className="s">Carrera · 1 ej</div>
            </div>
            <div className="rc">
              <div className="d">JUE 15</div>
              <span style={{ color: 'var(--faint)' }}>Descanso</span>
            </div>
          </div>
          <div className="edit">
            <div className="ed-row">
              <span className="ed-slot">AM</span>
              <span className="ed-input">Tirada larga Z2</span>
              <span className="ed-ai">◌ Sugerir título</span>
            </div>
            <div className="ed-block">
              <div className="bt">
                <span className="mdot" style={{ background: MOD.carrera }} />
                Carrera continua / Z2
              </div>
              <table className="extbl">
                <tbody>
                  <tr>
                    <th>Tramo</th>
                    <th>Medida</th>
                    <th>Objetivo</th>
                  </tr>
                  <tr>
                    <td>Rodaje continuo</td>
                    <td className="n">14 km</td>
                    <td className="n">Z2 · 5:10–5:25/km</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              style={{
                fontSize: '9.5px',
                color: 'var(--faint)',
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                marginTop: '4px',
              }}
            >
              <span className="num2">Guardar día</span> · <span>Copiar día a…</span>
            </div>
          </div>
        </div>
      </DashboardMockup>

      <h3>4 · Dentro de la sesión: título, bloques, ejercicios y carga</h3>
      <p>
        Cada sesión tiene un <code>Título del entreno</code> editable (por ejemplo{' '}
        <em className="em">Tirada larga Z2</em>) que también ve tu atleta. Si te quedas en blanco,
        el botón <code>Sugerir título</code> te propone uno a partir del contenido (lo puedes editar
        antes de guardar). Luego añades <b>bloques</b> (eliges el tipo de trabajo: carrera, series,
        fuerza, HYROX, circuito, metcon, test, activación…), y dentro de cada bloque añades{' '}
        <b>ejercicios de tu catálogo</b> con su carga e intensidad.
      </p>

      <DocNote variant="cue" title="El catálogo y tus vídeos">
        <ul>
          <li>
            Al añadir un ejercicio lo buscas en tu catálogo; si no existe, lo creas al vuelo (
            <span className="k">Crear “…” como ejercicio nuevo</span>) y queda disponible para
            cualquier sesión.
          </li>
          <li>
            En tu versión del ejercicio puedes <span className="k">subir un vídeo</span> tuyo o pegar
            un <span className="k">enlace de YouTube</span>. Se reproduce ahí mismo, en el campo.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="bad" title="Guardado honesto: nada a medias">
        <ul>
          <li>
            Una línea solo es válida si apunta a un ejercicio real de tu catálogo. Si dejas una línea
            sin ejercicio, <span className="k">Guardar se desactiva</span> y verás el motivo exacto:{' '}
            <code>1 línea sin ejercicio. Elígelo del catálogo o bórrala para guardar.</code>
          </li>
          <li>
            Esto evita el viejo fallo de “Guardado” mentiroso que tiraba líneas a medias en silencio.
            Lo que se guarda es lo que tu atleta verá, sin sorpresas.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Lo que montaste, en su teléfono"
        subtitle={
          <>
            El nombre del microciclo se convierte en su <b>fase</b>. El foco de la semana aparece
            bajo el saludo. Y las sesiones que rellenaste por día se vuelven su plan, una sesión cada
            mañana.
          </>
        }
      >
        {/* PHONE 1: INICIO */}
        <PhoneMockup
          caption={
            <>
              <b>Inicio.</b> Tu fase y tu foco encabezan el día; la sesión de hoy es la tarjeta
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
            <div className="ph-mark">FAHYBRID</div>
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
