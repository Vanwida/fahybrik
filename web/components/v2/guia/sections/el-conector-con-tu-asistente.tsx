// GUÍA · El conector con tu asistente — El conector MCP del
// coach: enlaza su cuenta del panel con su asistente (Claude hoy) y desde el chat
// mira su club, le toca el plan y publica. Herramienta SOLO del coach en su
// origen, pero SÍ tiene cara en el móvil del atleta cuando la semana ya está
// publicada (por eso lleva MovilBand, a diferencia del importador de la 30).
//
// COPY: cero jerga (nada de MCP, OAuth, tokens ni tool calls: se llama "el
// conector") y CERO guiones largos en el texto visible, por encargo.
//
// Verificado contra:
//   web/app/api/[transport]/route.ts (POST /api/mcp, Streamable HTTP)
//   web/lib/mcp/tools.ts (registerCoachTools: las 16 capacidades vivas)
//     lectura: get_briefing, list_athletes, get_athlete (tools.ts) + get_plan,
//       get_session (tools-plan) + get_races (tools-races) + search_library,
//       search_methodology (tools-library) + list_communications (tools-comms)
//     escritura del día: create_session, edit_day, move_session (tools-write)
//     publicar y avisar: publish_week, publish_communication, send_message,
//       add_note (tools-publish)
//   web/lib/mcp/auth.ts (NOT_A_COACH_MESSAGE: entrar con la cuenta del panel)
//   web/lib/mcp/shape-write.ts (visibilityOf + writeResumen/moveResumen: la
//     lectura de vuelta y la frase de visibilidad real; sin fila en weekly_plans
//     la semana SE VE, solo un 'draft' explícito la esconde)
//   web/lib/mcp/write-content.ts (los tres portones: Zod del dominio, catálogo
//     del coach, completitud; lo 'advisory' vuelve como aviso, no como error)
//   web/lib/mcp/tools-write.ts (ambiguousDay: dos sesiones el mismo día y no
//     toca nada) + infra/migrations/0165_audit_log_channel.sql (canal 'mcp')
//   docs/mcp-conector-coach.html (plan v1: fases, alcance y lo que queda fuera)

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';
import { cardBase, CONECTOR_URL, MOD, AjustesConector, GrupoFrases, Turno, PidePermiso, LecturaVuelta, MIRAR, TOCAR, DECIR } from './piezas/el-conector-con-tu-asistente';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Tu club también responde por chat. El conector enlaza tu cuenta del panel con el asistente
          que ya llevas en el móvil, y desde ahí le preguntas cómo va un atleta, le tocas el plan y
          publicas, hablando como hablas en el gym. Es el <b>mismo dato y las mismas reglas</b> que el
          panel: no hay una segunda verdad.
        </>
      }
    >

      <QCWTriad
        que={
          <>
            Un <b>conector</b> que enseña tu club a tu asistente. Le das acceso una vez y desde el chat
            ve lo mismo que ves tú: tu día, tus atletas, la ficha de uno, su plan, una sesión, sus
            carreras, tu biblioteca, tu método y lo que le has comunicado. Y si se lo pides,{' '}
            <b>escribe</b>.
          </>
        }
        como={
          <>
            Lo añades una vez en los ajustes de tu asistente con la dirección del conector y entras con{' '}
            <b>tu cuenta del panel</b>. A partir de ahí le hablas normal, de pie en el box, con el
            móvil en la mano.
          </>
        }
        porque={
          <>
            Porque cuando tu atleta te pregunta algo estás en el gym, no delante del portátil. Decir{' '}
            <b>«añádele un rodaje suave el miércoles»</b> es más rápido que abrir el panel, y acaba
            exactamente en el mismo sitio.
          </>
        }
      />

      <h3>Se conecta una vez</h3>
      <p>
        En tu asistente vas a <code>Ajustes</code> › <code>Conectores</code> ›{' '}
        <code>Añadir conector personalizado</code>. Le pones el nombre que quieras (por ejemplo{' '}
        <b>
          <ClubMark />
        </b>
        ) y esta dirección: <code>{CONECTOR_URL}</code>. Pulsas <b>Conectar</b>, entras
        con tu cuenta y autorizas el acceso. Ya está. No hay nada que instalar ni claves que copiar.
      </p>

      <AjustesConector />

      <DocNote variant="cue" title="Con la cuenta del panel, no con otra">
        <p>
          Autoriza con <b>la misma cuenta con la que llevas a tus atletas</b>. Si entras con otra, el
          asistente te lo dirá tal cual: esa cuenta no lleva ningún club, así que no verá nada. Y si un
          día dejas de ser miembro del club, el conector deja de responder en la siguiente pregunta,
          no en la siguiente sesión.
        </p>
      </DocNote>

      <DocNote variant="log" title="En el móvil no configuras nada más">
        <p>
          Los conectores viajan con tu cuenta del asistente: si lo añades en el ordenador,{' '}
          <b>aparece solo en el móvil</b>. Lo añades una vez y lo tienes en las dos pantallas.
        </p>
      </DocNote>

      <h3>Qué le puedes pedir</h3>
      <p>
        Le hablas como le hablarías a alguien de tu equipo que tiene el panel abierto delante. No hay
        comandos ni palabras mágicas: se dice y ya. Estas son frases reales, de las que se dicen en el
        box.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
          margin: '18px 0 4px',
        }}
      >
        <GrupoFrases titulo="Mirar" frases={MIRAR} />
        <GrupoFrases titulo="Tocar el plan" frases={TOCAR} />
        <GrupoFrases titulo="Decirle y publicar" frases={DECIR} />
      </div>

      <h3>La conversación, tal cual</h3>
      <p>
        Así se ve una de verdad: preguntas, te responde con el dato, le pides el cambio y{' '}
        <b>te pide permiso antes de escribir</b>. Cuando confirmas, te devuelve la frase exacta de lo
        que ha quedado.
      </p>

      <div
        style={{
          ...cardBase,
          padding: '18px',
          margin: '18px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
        }}
      >
        <Turno tu>¿Cómo va Marc esta semana?</Turno>
        <Turno>
          Va bien de constancia (5 de 6 sesiones) pero llega justo: readiness baja desde el lunes y
          ayer te reportó las piernas cargadas. El miércoles lo tiene libre.
        </Turno>
        <Turno tu>Pues añádele un rodaje suave de 45 minutos en Z2 el miércoles.</Turno>
        <PidePermiso />
        <LecturaVuelta>
          Marc · 13 de agosto · creada «Rodaje suave»: 1 bloque, 1 línea. Publicado: lo ve ya en su
          app.
        </LecturaVuelta>
      </div>

      <h3>Te pide permiso, y te lo lee de vuelta</h3>
      <p>
        El asistente <b>no toca nada por su cuenta</b>. Antes de escribir te enseña qué va a hacer y
        espera tu confirmación, así que lo que apruebas es lo que va a quedar, no una promesa vaga. Y
        en cuanto lo hace te lo repite: <b>de quién</b>, <b>qué día</b>, <b>qué se ha escrito</b> y,
        lo importante, <b>si el atleta ya lo ve</b>.
      </p>
      <p>
        Esa última parte no se la inventa. Va a mirar en qué estado tienes esa semana y te lo dice con
        la frase que corresponde. Si te suena raro lo que te lee de vuelta, es que había algo que no
        sabías, y por eso se lee antes de dar por bueno el cambio.
      </p>

      <h3>Visible u oculta: te lo dice</h3>
      <p>
        Tocar el plan y publicarlo siguen siendo dos cosas distintas, igual que en el panel. Si esa
        semana <b>ya es visible</b>, lo que cambies le llega al atleta <b>al momento</b>, lo mismo
        que si lo hubieras cambiado con el ratón. Si está <b>oculta</b>, no lo ve hasta que
        publiques, y te lo dice: sigue guardado para ti. Y si esa semana era de las que{' '}
        <b>se abren solas unos días antes</b>, también te lo avisa, para que no la publiques a mano sin
        querer.
      </p>
      <p>
        Cuando le digas <em className="em">«publícale la semana»</em>, publica y le manda{' '}
        <b>un solo aviso</b>, exactamente como el botón del panel. Publicar no cambia el contenido:
        solo cambia quién lo ve.
      </p>

      <DocNote variant="bad" title="Ojo con esto, que es lo que más sorprende">
        <ul>
          <li>
            Una semana que <b>no está oculta ya la ve tu atleta</b>. No hace falta
            volver a publicarla: si le tocas el miércoles, el miércoles le cambia.
          </li>
          <li>
            Si no tienes claro en qué estado está, <b>pregúntale por la semana antes de tocarla</b>.
            Te dice el estado real, no el que se supone.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="El cambio, en su semana"
        subtitle={
          <>
            La semana de Marc ya era visible, así que el rodaje del miércoles le aparece{' '}
            <b>al momento</b>, con su dosis y su color, como cualquier otra sesión que le montas desde
            el panel.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su semana.</b> El <b>miércoles</b> ya no está vacío: el rodaje suave entra con los 45
              minutos y la zona puestos. Tu atleta no ve de dónde salió la orden, solo su entreno.
            </>
          }
        >
          <div className="ph-title sm" style={{ margin: '6px 0 2px' }}>
            Tu semana
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            11 al 17 ago · por tu coach
          </div>
          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Acumulación</span>
          </div>
          <div className="day">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Remo 4×500 m</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day today">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">
              Rodaje suave <small>45:00 · Z2</small>
            </span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">JUE</span>
            <span className="mdot" style={{ background: MOD.circuito }} />
            <span className="dt">Circuito de estaciones</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">SÁB</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Series 6×800</span>
            <span className="stg pend">›</span>
          </div>
          <div className="prog">
            <span className="l">Progreso de la semana</span>
            <div className="v num">2 / 5</div>
            <div className="bar">
              <span style={{ width: '40%' }} />
            </div>
            <div className="cap">Te ha entrado un entreno nuevo el miércoles.</div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>Lo que no hace, y es a propósito</h3>
      <p>
        El conector es una boca para lo que ya existe, no una puerta trasera. Escribe por los mismos
        sitios y con los mismos filtros que el panel, y donde el panel te pide criterio, te lo pide a
        ti también.
      </p>

      <DocNote variant="bad" title="Los límites, claros">
        <ul>
          <li>
            <b>No escribe dosis a bulto.</b> Cada línea lleva un ejercicio <b>de tu catálogo</b> y su
            dosis completa, y pasa el mismo listón que el editor del panel. Si algo no es ejecutable,
            no entra y te dice qué falta. Lo que es criterio tuyo (un ritmo que no declaraste) te
            vuelve como aviso, no como error.
          </li>
          <li>
            <b>Si hay dudas, no adivina.</b> Un día con dos sesiones y sin decirle cuál se queda sin
            tocar: te pregunta cuál era y no cambia nada mientras tanto.
          </li>
          <li>
            <b>Solo tu club.</b> Un atleta que no es tuyo no existe para el conector, ni para leerlo ni
            para escribirle.
          </li>
          <li>
            <b>No borra ni asigna bloques enteros.</b> Borrar sesiones, montar programas, leads,
            citas y pagos siguen siendo del panel. Esto es para lo del día, de pie.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="log" title="Queda constancia de que salió del chat">
        <p>
          Cada cambio que hagas por el conector queda registrado como tal, con tu nombre. Siempre
          puedes distinguir lo que tocaste desde el chat de lo que tocaste desde el panel, que es la
          pregunta que aparece cuando algo no cuadra.
        </p>
      </DocNote>

      <h3>Privacidad, dicha claro</h3>
      <p>
        Lo que le preguntas <b>pasa por tu asistente</b>, igual que cuando le pegas un texto para que
        te lo resuma. Los datos de tus atletas salen solo cuando tú los pides: el conector no manda
        nada por su cuenta, y solo responde a la cuenta que autorizaste. Vale la pena tenerlo presente
        con lo que es sensible, como una lesión o el pulso de alguien.
      </p>

      <p style={{ marginTop: '18px' }}>
        El conector <b>se activa club por club</b>. Si lo quieres en el tuyo, dínoslo y lo enchufamos a
        tu cuenta.
      </p>
    </DocSection>
  );
}
