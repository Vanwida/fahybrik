// GUÍA · 37 Dobles en pareja: en vivo y juntos — área "Dobles". La capa EN DIRECTO
// de dobles, encima del emparejamiento y el reparto de la sección 29: cuando uno
// entrena una sesión compartible el otro lo ve en vivo (franja azul con ejercicio,
// progreso y pulso, refresco ~5 s), el relevo de la simulación va DIRIGIDO estación
// a estación con el reparto pactado (doble háptica en el Apple Watch al entrar) y,
// al acabar los dos, un resumen lado a lado + tarjeta de pareja + racha. Dos honras
// que el coach lee: lo marcado privado NUNCA se emite (y si lo marca a media sesión
// desaparece al instante), y cada atleta apunta SUS reps —prescrito 60 · hecho 60—,
// nunca un falso "escalado". El coach no activa nada: sale de la pareja ya conectada
// (ver sección 29 · Entrenar en dobles).

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Colores de modalidad (nunca se desvían de los tokens v2 vivos). Las estaciones
// HYROX caen aquí: ergo (SkiErg / remo), fuerza (trineos, farmers, zancadas),
// circuito (burpees, wall balls). Las carreras entre estaciones = carrera.
const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

// El azul de "en pareja": el compañero y lo que hacéis juntos — distinto del naranja,
// que es siempre lo tuyo. La franja en vivo y el aro de pareja usan este mismo azul.
const PARTNER = 'var(--v2-info)';
const PARTNER_SOFT = 'var(--v2-info-soft)';

// Una fila del reparto ejecutado en el panel: estación + lo prescrito y lo hecho de
// cada atleta. La clave honesta: hecho = lo que ESE atleta apuntó, no el total.
function ExecRow({
  hue,
  station,
  who,
  prescrito,
  hecho,
}: {
  hue: string;
  station: string;
  who: string;
  prescrito: string;
  hecho: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 62px 90px',
        gap: '8px',
        alignItems: 'center',
        padding: '8px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11.5px',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span className="mdot" style={{ background: hue }} />
        <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {station}
        </span>
      </span>
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--muted)' }}>{who}</span>
      <span className="num" style={{ textAlign: 'right', fontSize: '10.5px', color: 'var(--muted)' }}>
        {prescrito} · <b style={{ color: 'var(--ok)' }}>{hecho}</b>
      </span>
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
          Una pareja de dobles ya no es <b>dos planes a la vez</b>: ahora entrenan <b>conectados en
          directo</b>. Cuando uno arranca una sesión compartible, el otro lo ve en vivo; en la
          simulación, la app <b>dirige el relevo</b> estación a estación; y al acabar los dos, tienen
          un <b>resumen juntos</b>. Y tú lees lo de siempre: números <b>honestos</b>, nunca inflados
          por lo que hizo el compañero.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            La capa <b>en directo</b> de dobles: uno entrena y el otro lo <b>ve en vivo</b>; el{' '}
            <b>relevo dirigido</b> en la simulación HYROX; y, al terminar los dos, un{' '}
            <b>resumen lado a lado</b>, una <b>tarjeta de pareja</b> y una <b>racha</b>.
          </>
        }
        como={
          <>
            Tú no activas nada: sale de la <b>pareja ya conectada</b> (sección 29). En la sesión, el
            compañero ve una <b>franja azul</b> con el ejercicio, el progreso y el pulso; el relevo usa
            el <b>reparto</b> que fijasteis en la carrera; y cada uno apunta <b>solo lo suyo</b>.
          </>
        }
        porque={
          <>
            Porque una pareja entrena como equipo pero se mide como dos. Verse en vivo los <b>engancha
            juntos</b>, y el registro honesto (<b>prescrito 60 · hecho 60</b>, nunca un falso
            «escalado») mantiene <b>limpia</b> tu analítica.
          </>
        }
      />

      <h3>1 · En vivo: cuando uno entrena, el otro lo ve</h3>
      <p>
        Cuando un atleta de la pareja arranca una sesión <b>compartible</b>, en la app del otro aparece{' '}
        <em className="em">«Marc está entrenando ahora»</em> con un botón para <b>unirse</b>. Durante
        el entreno, una <b>franja azul</b> muestra el <b>ejercicio actual</b> del compañero, su{' '}
        <b>progreso</b> y su <b>pulso</b>, que se refrescan cada <b>~5&nbsp;segundos</b>. Es honesta:
        si se <b>corta la señal</b>, lo dice (no congela un dato falso). Y tú no tienes que tocar nada:
        va sobre la pareja de dobles que <b>ya está conectada</b>.
      </p>

      <MovilBand
        title="En directo, mientras tu pareja entrena"
        subtitle={
          <>
            La presencia del compañero y su <b>franja en vivo</b> viven en la app del atleta,{' '}
            <b>solo lo que existe de verdad</b>: ejercicio, progreso, pulso, y un aviso claro si la
            señal se corta.
          </>
        }
      >
        {/* PHONE 1: "Marc está entrenando ahora" — la tarjeta de presencia */}
        <PhoneMockup
          caption={
            <>
              <b>Está entrenando ahora.</b> Aparece en el inicio del compañero en cuanto el otro
              arranca una sesión <b>compartible</b>. Un toque para <b>unirse</b>.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark">FAHYBRID</div>
            <div className="avatar">L</div>
          </div>
          <div className="kick" style={{ color: PARTNER }}>
            En pareja
          </div>
          <div className="ph-title">Hoy</div>

          <div
            className="hero"
            style={{ borderColor: PARTNER, background: PARTNER_SOFT }}
          >
            <div className="row">
              <span className="slot" style={{ background: PARTNER_SOFT, color: PARTNER }}>
                En vivo
              </span>
              <span className="hk" style={{ color: PARTNER }}>
                ● Ahora
              </span>
            </div>
            <div className="ht">Marc está entrenando ahora</div>
            <div className="meta">Simulación HYROX Dobles · lleva 18 min. Puedes seguirle en directo.</div>
            <div className="cta" style={{ background: PARTNER, color: '#fff' }}>
              Unirme
            </div>
          </div>
        </PhoneMockup>

        {/* PHONE 2: la franja azul en vivo durante tu propia sesión */}
        <PhoneMockup
          caption={
            <>
              <b>La franja en vivo.</b> Sobre tu propio entreno, el ejercicio, el progreso y el pulso
              de tu pareja, al día cada <b>~5&nbsp;s</b>.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tu sesión
            </div>
            <div />
          </div>
          <div className="ph-title sm">Fuerza · tren inferior</div>

          {/* La franja azul del compañero */}
          <div
            style={{
              background: PARTNER_SOFT,
              border: `1px solid ${PARTNER}`,
              borderRadius: 'var(--v2-r-l)',
              padding: '11px 13px',
              margin: '10px 0 12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: PARTNER }}>
                ● Marc, en vivo
              </span>
              <span className="num" style={{ fontSize: '9px', color: 'var(--faint)' }}>
                hace 3 s
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)', marginBottom: '9px' }}>
              SkiErg · 1 km
            </div>
            <div style={{ display: 'flex', gap: '18px' }}>
              <div>
                <div className="lbl">Progreso</div>
                <div className="num" style={{ fontSize: '17px', fontWeight: 800 }}>
                  640 m
                </div>
              </div>
              <div>
                <div className="lbl">Pulso</div>
                <div className="num" style={{ fontSize: '17px', fontWeight: 800, color: PARTNER }}>
                  162
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '10.5px', color: 'var(--faint)', textAlign: 'center' }}>
            Tu serie: Sentadilla 5×5 · 80% · 96 kg
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="cue" title="Tú no activas nada">
        <p>
          La capa en directo <b>no se enciende</b> desde el panel: sale de la <b>pareja de dobles</b>{' '}
          que ya está enlazada (sección 29 · <i>Entrenar en dobles</i>). En cuanto uno arranca una
          sesión compartible, el otro la ve. Cero configuración para ti.
        </p>
      </DocNote>

      <DocNote variant="bad" title="Lo privado nunca se emite">
        <p>
          Las sesiones que el atleta marca <b>privadas</b> <b>no se emiten jamás</b> a su pareja. Y si
          las marca privadas <b>a media sesión</b>, desaparecen de la app del compañero <b>al
          instante</b>. La presencia en vivo es un permiso del atleta, no algo que le impongamos.
        </p>
      </DocNote>

      <DocNote variant="log" title="Si se corta la señal, lo dice">
        <p>
          La franja en vivo se refresca cada <b>~5&nbsp;s</b>. Si la conexión del compañero se cae, la
          franja lo <b>avisa</b> en vez de dejar clavado un número viejo. Nunca finge que sigue en
          directo.
        </p>
      </DocNote>

      <h3>2 · El relevo, dirigido estación a estación</h3>
      <p>
        En una <b>simulación HYROX de pareja</b>, la app <b>dirige el relevo</b> con el <b>reparto que
        pactasteis</b> en la vista de carrera: te dice cuándo entras, cuánto te toca y quién sigue:{' '}
        <em className="em">«Te toca a ti · 60 de 100 · luego Marc 40»</em>. Al entrar, el{' '}
        <b>Apple Watch</b> te avisa con una <b>doble háptica</b>, para que no tengas que mirar la
        pantalla. Y el <b>registro respeta el pacto</b>: cada atleta apunta <b>sus reps</b>, no el
        total. En tu panel verás <b>prescrito 60 · hecho 60</b>, nunca un falso «escalado» que infle a
        uno con el trabajo del otro.
      </p>

      <MovilBand
        title="El relevo te dice cuándo entras"
        subtitle={
          <>
            Con el reparto pactado, la simulación <b>dirige</b> cada relevo: cuánto te toca, quién
            sigue, y una <b>doble háptica</b> en la muñeca al entrar.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Te toca a ti.</b> Cuánto haces tú, cuánto el compañero después, y el aviso de muñeca
              al entrar. Apuntas <b>solo tus reps</b>.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Simulación HYROX · Dobles
            </div>
            <div />
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: `1px solid ${PARTNER}`,
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
              Te toca a ti
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
              Wall Balls
            </div>
            <div className="num" style={{ fontSize: '26px', fontWeight: 900, color: 'var(--fg)', margin: '4px 0 2px' }}>
              60 <span style={{ fontSize: '13px', color: 'var(--muted)' }}>de 100</span>
            </div>
            <div style={{ fontSize: '11.5px', color: PARTNER, marginBottom: '14px' }}>
              luego Marc · 40
            </div>

            <div className="cta" style={{ background: 'var(--acc)' }}>
              Empezar mis 60
            </div>
            <div style={{ fontSize: '9.5px', color: 'var(--faint)', marginTop: '9px' }}>
              ⌚ Doble toque en tu Apple Watch al entrar
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      {/* Panel: el reparto EJECUTADO — prescrito vs hecho por atleta, sin inflar */}
      <DashboardMockup url="tu-panel / atletas / marc + laia · simulación dobles">
        <div className="wk-head">
          <div className="wk-title">Simulación HYROX Dobles · ejecutada</div>
          <div className="wk-sum">
            <span className="chip" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
              Registro honesto
            </span>
          </div>
        </div>

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
              display: 'grid',
              gridTemplateColumns: '1fr 62px 90px',
              gap: '8px',
              padding: '0 2px 2px',
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
            }}
          >
            <span>Estación</span>
            <span>Quién</span>
            <span style={{ textAlign: 'right' }}>Prescrito · hecho</span>
          </div>
          <ExecRow hue={MOD.circuito} station="Wall Balls" who="Laia" prescrito="60" hecho="60" />
          <ExecRow hue={MOD.circuito} station="Wall Balls" who="Marc" prescrito="40" hecho="40" />
          <ExecRow hue={MOD.fuerza} station="Sled Push 50 m" who="Marc" prescrito="50 m" hecho="50 m" />
          <ExecRow hue={MOD.ergo} station="SkiErg 1 km" who="Laia" prescrito="1 km" hecho="1 km" />
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Cada uno apunta lo suyo">
        <p>
          El reparto pactado manda también en el <b>registro</b>: si a Laia le tocaban <b>60</b> wall
          balls, su ficha marca <b>prescrito 60 · hecho 60</b> (no las 100 de la estación). Así la
          carga de cada atleta se mide <b>de verdad</b>, sin que un relevo infle a nadie.
        </p>
      </DocNote>

      <h3>3 · Al acabar, juntos</h3>
      <p>
        Cuando <b>los dos</b> registran la sesión, la app les monta un <b>resumen lado a lado</b>:
        tiempo, RPE, <b>kg movidos</b> si hubo cargas y cualquier <b>récord</b> del día. Encima, una{' '}
        <b>tarjeta de pareja compartible</b> para presumir del entreno juntos. Y en la vista{' '}
        <b>Dobles</b> del atleta, una <b>racha</b>: cuántas sesiones habéis hecho <b>juntos este
        mes</b> y cuántas <b>semanas seguidas</b> entrenando en pareja.
      </p>

      <MovilBand
        title="El cierre, en pareja"
        subtitle={
          <>
            El resumen de los dos <b>lado a lado</b>, una <b>tarjeta compartible</b> de pareja y la{' '}
            <b>racha</b> que os mantiene enganchados semana a semana.
          </>
        }
      >
        {/* PHONE 1: resumen lado a lado + tarjeta compartible */}
        <PhoneMockup
          caption={
            <>
              <b>El resumen juntos.</b> Tiempo, RPE, kg movidos y récords de los dos, con un botón para{' '}
              <b>compartir</b> la tarjeta de pareja.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Sesión completada · Dobles
            </div>
            <div />
          </div>

          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--v2-font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: '18px',
              color: 'var(--fg)',
              margin: '6px 0 12px',
            }}
          >
            Lo habéis hecho juntos
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px', marginBottom: '12px' }}>
            {[
              ['L', 'Laia', '58:20', 'RPE 8', '4 200 kg'],
              ['M', 'Marc', '58:20', 'RPE 7', '5 100 kg'],
            ].map(([ini, nm, t, rpe, kg]) => (
              <div
                key={nm}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hair)',
                  borderRadius: '11px',
                  padding: '11px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '9px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: PARTNER_SOFT,
                      color: PARTNER,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '11px',
                    }}
                  >
                    {ini}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--fg)' }}>{nm}</span>
                </div>
                <div className="num" style={{ fontSize: '19px', fontWeight: 900, color: 'var(--fg)' }}>
                  {t}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                  {rpe} · {kg}
                </div>
              </div>
            ))}
          </div>

          <div className="cta" style={{ background: PARTNER, color: '#fff' }}>
            ↑ Compartir tarjeta de pareja
          </div>
        </PhoneMockup>

        {/* PHONE 2: la racha en la vista Dobles */}
        <PhoneMockup
          caption={
            <>
              <b>La racha.</b> En la vista <b>Dobles</b>: sesiones juntos este mes y semanas seguidas
              entrenando en pareja.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Dobles
            </div>
            <div className="avatar">L</div>
          </div>
          <div className="kick" style={{ color: PARTNER }}>
            Marc + Laia
          </div>
          <div className="ph-title">Vuestra racha</div>

          <div
            className="logcard"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              borderColor: PARTNER,
            }}
          >
            <div>
              <div className="lh">Juntos este mes</div>
              <div className="num" style={{ fontSize: '26px', fontWeight: 900, color: 'var(--fg)' }}>
                9 <span style={{ fontSize: '12px', color: 'var(--muted)' }}>sesiones</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="lh">Semanas seguidas</div>
              <div className="num" style={{ fontSize: '26px', fontWeight: 900, color: PARTNER }}>
                6
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '5px',
              marginTop: '11px',
              justifyContent: 'center',
            }}
          >
            {[1, 1, 1, 1, 1, 1].map((_, i) => (
              <span
                key={i}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  border: `2px solid ${PARTNER}`,
                  background: PARTNER_SOFT,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--faint)', textAlign: 'center', marginTop: '9px' }}>
            El aro azul marca los entrenos que hicisteis en pareja.
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        La pareja ya no solo comparte plan y reparto: <b>se acompaña en directo</b>, se <b>reparte el
        relevo</b> sin mirar el móvil y <b>celebra junta</b> al acabar. Tú no mueves un dedo para
        encenderlo, y sigues leyendo a cada uno por separado, con los <b>números que de verdad
        hizo</b>.
      </p>
    </DocSection>
  );
}
