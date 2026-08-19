// GUÍA · 29 Entrenar en dobles — área "Dobles". Dos atletas, una pareja: comparten
// sesión, se reparten las estaciones HYROX y compiten a la vez — y el coach lo lee
// todo desde un sitio. Verificado contra lib/partner/invitations.ts (estados),
// lib/athlete/dobles-simulation-edit.ts (reparto pair-owned, edita cualquiera),
// lib/athlete/dobles-session.ts ("Entrenar a la vez"), lib/stripe/prices.ts +
// checkout.ts (un solo cobro por pareja) e iOS Workout (el relevo no cuenta como
// volumen propio — LiveFlowView "relay never counts as the athlete's work volume").

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Canonical modality hues (never drift from the live v2 tokens). The 8 HYROX
// stations map onto these: ergo (SkiErg / remo), fuerza (trineos, farmers, zancadas),
// circuito (burpees, wall balls). Runs between stations = carrera.
const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

// One reparto row inside the dashboard: modality dot + station + who carries it.
function StationRow({
  hue,
  station,
  who,
  whoColor,
}: {
  hue: string;
  station: string;
  who: string;
  whoColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11.5px',
      }}
    >
      <span className="mdot" style={{ background: hue }} />
      <span style={{ flex: 1, color: 'var(--fg)' }}>{station}</span>
      <span style={{ fontWeight: 700, color: whoColor ?? 'var(--muted)' }}>{who}</span>
    </div>
  );
}

// One athlete column in the side-by-side pair view.
function PairCol({
  initial,
  name,
  level,
  adherence,
  adhColor,
  mark,
}: {
  initial: string;
  name: string;
  level: string;
  adherence: string;
  adhColor: string;
  mark: string;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '10px',
        padding: '12px 13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: 'var(--accSoft)',
            color: 'var(--acc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '12px',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>{name}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>{level}</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          Adherencia
        </span>
        <span
          className="num2"
          style={{ fontSize: '18px', fontWeight: 800, color: adhColor }}
        >
          {adherence}
        </span>
      </div>
      <div style={{ fontSize: '10.5px', color: 'var(--faint)' }}>Última: {mark}</div>
    </div>
  );
}

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Dos atletas, una pareja. Comparten sesión, se <b>reparten las estaciones</b> y compiten a
          la vez, y tú lo lees todo desde un sitio. El sistema los trata como <b>una unidad</b> donde
          entrenan juntos, sin dejar de medir a cada uno por separado donde toca.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El modo <b>HYROX Dobles</b>: dos atletas emparejados. Cada uno mantiene su semana a su
            intensidad, y en la simulación conjunta se <b>reparten las 8 estaciones</b>. Una sola{' '}
            <b>suscripción</b> cubre a los dos.
          </>
        }
        como={
          <>
            Los emparejas desde el panel (o se invitan entre ellos). Ves a la pareja{' '}
            <b>lado a lado</b> y editas el <b>reparto</b> de estaciones con un botón. En su móvil,
            entrenan «a la vez» con la carga de cada uno y un <b>relevo</b> mientras el otro trabaja.
          </>
        }
        porque={
          <>
            Porque una pareja de dobles entrena como equipo pero rinde como dos. Necesitas verlos
            juntos <b>sin perder</b> el detalle de cada uno, y ellos, saber quién hace qué en cada
            estación.
          </>
        }
      />

      <h3>1 · Una pareja de verdad: emparejamiento por invitación</h3>
      <p>
        Un atleta <b>invita</b> a su pareja con un enlace, o acepta la invitación que recibe. La
        invitación pasa por estados honestos: <code>pendiente</code>, <code>aceptada</code>,{' '}
        <code>caducada</code>, <code>cancelada</code>, <code>rechazada</code>; y, al aceptarse, la
        pareja queda enlazada por ambos lados. Esa pareja es la <b>fuente de verdad</b>: gobierna el
        entreno, las cuentas y la facturación. Deshacer el par <b>conserva el historial</b> de los
        dos.
      </p>

      <h3>2 · El reparto de estaciones es de la pareja</h3>
      <p>
        El reparto sale de la <b>simulación de dobles</b> que montas tú: quién hace cada una de las 8
        estaciones. Pero es <b>de la pareja</b>, no solo tuyo: tú lo recomiendas con el botón{' '}
        <code>Reparto</code>, y <b>cualquiera de los dos atletas</b> puede ajustarlo desde su app
        (gana el último cambio). Cada surface muestra <em className="em">quién lo tocó</em>:{' '}
        <em className="em">«Propuesta de Pablo»</em> o <em className="em">«Ajustado por Laia»</em>.
      </p>

      <h3>3 · El relevo no es tu volumen</h3>
      <p>
        En el entreno conjunto, mientras tu compañero trabaja su estación tú ves la pantalla de{' '}
        <b>RELEVO</b>: recuperas y sigues su cronómetro. Ese tiempo <b>nunca cuenta como tu volumen</b>:
        el motor no registra nada ahí; solo tu mitad del trabajo es tuya. Así la analítica de cada
        atleta sigue siendo honesta aunque la sesión sea a dos.
      </p>

      {/* Dashboard mockup: la pareja lado a lado + el reparto de estaciones + botón Reparto */}
      <DashboardMockup url="tu-panel / atletas / marc + laia · dobles">
        <div className="wk-head">
          <div className="wk-title">Pareja · HYROX Dobles</div>
          <div className="wk-tools">
            <span className="btn">Reparto</span>
            <span className="btn pri">Asignar plan a los dos</span>
          </div>
        </div>
        <div className="wk-sum">
          <span className="chip">N3 · 4 días</span>
          <span className="chip" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
            Un cobro · 115€/mes
          </span>
        </div>

        {/* Lado a lado: los dos atletas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <PairCol
            initial="M"
            name="Marc Vidal"
            level="N3 · 4 días"
            adherence="94%"
            adhColor="var(--ok)"
            mark="HYROX sim · 1:04:10"
          />
          <PairCol
            initial="L"
            name="Laia Roca"
            level="N3 · 4 días"
            adherence="88%"
            adhColor="var(--ok)"
            mark="HYROX sim · 1:04:10"
          />
        </div>

        {/* El reparto de estaciones (con colores de modalidad) */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '10px 13px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '2px',
            }}
          >
            <span
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Reparto de estaciones · simulación HYROX
            </span>
            <span style={{ fontSize: '9.5px', color: 'var(--faint)' }}>Propuesta de Pablo</span>
          </div>
          <StationRow hue={MOD.ergo} station="SkiErg 1 km" who="Marc" whoColor="var(--fg)" />
          <StationRow hue={MOD.fuerza} station="Sled Push 50 m" who="Laia" whoColor="var(--fg)" />
          <StationRow hue={MOD.fuerza} station="Sled Pull 50 m" who="Marc" whoColor="var(--fg)" />
          <StationRow hue={MOD.circuito} station="Burpee Broad Jump 80 m" who="Laia" whoColor="var(--fg)" />
          <StationRow hue={MOD.ergo} station="Remo 1 km" who="Marc" whoColor="var(--fg)" />
          <StationRow hue={MOD.fuerza} station="Farmers Carry 200 m" who="50 · 50" />
          <StationRow hue={MOD.fuerza} station="Sandbag Lunges 100 m" who="Laia" whoColor="var(--fg)" />
          <StationRow hue={MOD.circuito} station="Wall Balls ×100" who="Marc" whoColor="var(--fg)" />
        </div>
      </DashboardMockup>

      <DocNote variant="cue" title="El reparto lo edita cualquiera de los dos (y tú)">
        <p>
          Tú recomiendas el reparto con <code>Reparto</code>, pero es de la pareja: <b>Marc o Laia</b>{' '}
          pueden reajustarlo desde su app cuando les convenga. Gana el último cambio, y siempre queda
          registrado quién lo tocó, así nadie edita a espaldas del otro.
        </p>
      </DocNote>

      <DocNote variant="log" title="El relevo no cuenta como volumen propio">
        <p>
          La pantalla de <b>relevo</b> (cuando descansas mientras tu pareja trabaja su estación) no
          registra trabajo. Solo tu mitad computa como tuya. La carga de cada atleta se mide de
          verdad, no inflada por lo que hizo el otro.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Un cobro por pareja">
        <p>
          Dobles es <b>una sola suscripción</b> que cubre las dos cuentas (~115€/mes): paga uno en el
          checkout y el otro se enlaza después con la invitación. Stripe solo ve <b>un cobro</b>. Si
          se cancela, los dos pierden el acceso a fin de periodo.
        </p>
      </DocNote>

      <MovilBand
        title="Los dos, en su móvil"
        subtitle={
          <>
            El emparejamiento, el entreno a la vez y el relevo viven en la app de cada atleta:{' '}
            <b>solo lo que existe de verdad</b>, sin inventos.
          </>
        }
      >
        {/* PHONE 1: aceptar la invitación (redeem) */}
        <PhoneMockup
          caption={
            <>
              <b>La invitación.</b> Llega por enlace; al <b>aceptar</b>, quedan emparejados y comparten
              plan, reparto y suscripción.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div className="avatar">L</div>
          </div>
          <div className="kick">Invitación</div>
          <div className="ph-title">Entrenar en dobles</div>

          <div className="hero">
            <div className="row">
              <span className="slot">Pareja</span>
              <span className="hk">Te han invitado</span>
            </div>
            <div className="ht">Marc te invita a su pareja</div>
            <div className="meta">
              Compartiréis plan, reparto de estaciones y una suscripción. Podrás entrenar «a la vez».
            </div>
            <div className="cta">Aceptar y emparejar</div>
            <div className="cta ghost" style={{ marginTop: '7px' }}>
              Ahora no
            </div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: "Entrenar a la vez" — carga por atleta */}
        <PhoneMockup
          caption={
            <>
              <b>Entrenar a la vez.</b> La misma sesión con la <b>carga de cada uno</b>: cada % se
              resuelve sobre el 1RM propio.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Entrenar a la vez
            </div>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 21h4" />
              </svg>
            </div>
          </div>
          <div className="ph-title sm">Fuerza · tren inferior</div>
          <div
            className="num"
            style={{ fontSize: '10.5px', color: 'var(--muted)', margin: '2px 0 12px' }}
          >
            Marc SQ 1RM 120 · Laia SQ 1RM 96
          </div>

          {/* Cabecera de columnas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 64px 64px',
              gap: '6px',
              padding: '0 2px 6px',
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
            }}
          >
            <span>Ejercicio</span>
            <span style={{ textAlign: 'right' }}>Marc</span>
            <span style={{ textAlign: 'right' }}>Laia</span>
          </div>

          {[
            ['Sentadilla', '5×5', '80% · 96kg', '80% · 77kg'],
            ['Peso muerto', '3×5', '82% · 148kg', '82% · 115kg'],
            ['Zancadas', '3×10', '24kg', '16kg'],
          ].map(([ex, sr, self, partner]) => (
            <div
              key={ex}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 64px',
                gap: '6px',
                alignItems: 'baseline',
                padding: '9px 2px',
                borderTop: '1px solid var(--hair)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--fg)' }}>
                {ex}
                <span style={{ color: 'var(--faint)' }}> · {sr}</span>
              </span>
              <span
                className="num"
                style={{ textAlign: 'right', fontSize: '10.5px', color: 'var(--muted)' }}
              >
                {self}
              </span>
              <span
                className="num"
                style={{ textAlign: 'right', fontSize: '10.5px', color: 'var(--muted)' }}
              >
                {partner}
              </span>
            </div>
          ))}
        </PhoneMockup>

        {/* PHONE 3: la pantalla de relevo */}
        <PhoneMockup
          caption={
            <>
              <b>El relevo.</b> Mientras Marc hace su estación, Laia recupera. <b>Nada se registra</b>{' '}
              aquí; «Relevo ▸» pasa a su siguiente estación.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Simulación HYROX
            </div>
            <div />
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hair)',
              borderRadius: 'var(--v2-r-l)',
              padding: '18px 16px',
              textAlign: 'center',
              marginTop: '6px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                marginBottom: '10px',
              }}
            >
              Relevo
            </div>
            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '20px',
                letterSpacing: '-0.02em',
                marginBottom: '4px',
              }}
            >
              Marc hace SkiErg
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginBottom: '14px' }}>
              Tú recuperas. Este tiempo no cuenta como tu volumen.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '18px', marginBottom: '16px' }}>
              <div>
                <div className="lbl">Recuperando</div>
                <div className="num" style={{ fontSize: '26px', fontWeight: 800 }}>
                  1:12
                </div>
              </div>
              <div>
                <div className="lbl">FC</div>
                <div className="num" style={{ fontSize: '26px', fontWeight: 800 }}>
                  148
                </div>
              </div>
            </div>

            <div className="cta">Relevo ▸</div>
          </div>

          <div style={{ fontSize: '10px', color: 'var(--faint)', textAlign: 'center', marginTop: '10px' }}>
            Siguiente tuya · Sled Push 50 m
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>4 · La carrera de dobles: predicho contra meta, tramo a tramo</h3>
      <p>
        Cuando la carrera objetivo es de dobles y el atleta tiene <b>pareja activa</b>, el mismo
        camino al objetivo se convierte en un <b>board de pareja</b>: el predicho total de los dos
        contra la meta, tramo a tramo, con el mismo origen honesto de cada cifra: <b>observado</b>,{' '}
        <b>estimado</b> o <b>sin datos</b>. La diferencia es que cada tramo dice además{' '}
        <em className="em">quién lo hace</em>. En las dos carreras y en la <b>RoxZone</b> van siempre{' '}
        <b>juntos</b>: manda el más lento, porque ahí no hay reparto que valga. En las 8 estaciones
        manda el <b>reparto</b> que fijasteis: uno de los dos entero, o <b>repartida</b> entre
        ambos según su share. Un tramo sin datos de ninguno de los dos se queda en{' '}
        <b>sin datos</b>, nunca en un número inventado para cuadrar el total.
      </p>

      <h3>5 · Los consejos de dobles son tuyos</h3>
      <p>
        Debajo del board (y de la simulación conjunta) el atleta lee unos <b>consejos</b> que son
        tuyos: los editas desde <b>Atletas → Dobles</b>, en dos bloques separados (uno para el{' '}
        <b>día de carrera</b>, otro para la <b>simulación</b>), hasta ocho frases por bloque.
        Mientras no los toques, la pareja ve un <b>default con sentido</b> (ritmo, roles del relevo,
        repasar el reparto la víspera), nunca una pantalla vacía. En cuanto editas uno, ese pasa a
        ser el que ve tu pareja. El otro bloque sigue con su propio default hasta que también lo
        edites.
      </p>

      <MovilBand
        title="El board de carrera, en su móvil"
        subtitle={
          <>
            Con la meta puesta en la carrera de dobles, la pareja ve su <b>predicho contra meta</b>{' '}
            y quién hace cada tramo: <b>juntos</b>, <b>repartida</b> o, si toca, <b>sin datos</b>{' '}
            todavía.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El board de carrera.</b> Arriba, el predicho de la pareja contra la meta; abajo,
              cada tramo con quién lo hace.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Camino a meta · Dobles
            </div>
            <div />
          </div>

          <div
            className="logcard"
            style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <div>
              <div className="lh">Predicho pareja</div>
              <div className="num" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)' }}>
                1:04:10
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="lh">Hueco vs meta</div>
              <div className="num" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--dng)' }}>
                +4:10
              </div>
            </div>
          </div>

          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Por tramo</div>
            <StationRow hue={MOD.carrera} station="Carrera 1 · 1 km" who="Juntos · manda el más lento" />
            <StationRow hue={MOD.fuerza} station="Sled Push 50 m" who="42% Marc · 58% Laia" />
            <StationRow
              hue={MOD.circuito}
              station="Wall Balls ×100"
              who="Sin datos"
              whoColor="var(--faint)"
            />
          </div>

          <div className="cta">Ver el reparto completo</div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="log" title="Sin datos, nunca inventado">
        <p>
          Si a la pareja le falta historial en un tramo (propio o del compañero) el board lo dice
          tal cual: <b>sin datos</b>. El total mantiene ese tramo en su presupuesto en vez de
          rellenarlo con un número que no existe.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Ponle un objetivo a la carrera de dobles">
        <p>
          El board solo aparece con la carrera objetivo <b>marcada como meta</b> y la pareja{' '}
          <b>activa</b>. En cuanto la pongas, la pareja ve su reparto contra meta en minutos: sin
          ella, no hay contra qué medir.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Dobles no es «dos planes a la vez»: es <b>una pareja</b> que entrena junta, con el reparto
        compartido y la carga de cada uno intacta. Tú los ves como un equipo; el sistema sigue
        midiéndolos como dos.
      </p>
    </DocSection>
  );
}
