// GUÍA · Historial del atleta — Lo que tu atleta tiene en su
// app para mirar atrás: un calendario mensual donde cada día dice de un vistazo qué
// hizo —punto naranja = entreno hecho, aro azul = con la pareja, raya = descanso
// programado— y, al tocar un día, la sesión ENTERA: tiempos reales por bloque, splits
// con veredicto contra tu objetivo y la ruta si corrió al aire libre. El mismo detalle
// se abre desde las filas de sesión de Analíticas. Es una superficie del atleta que el
// coach lee aquí para saber qué ve el suyo (enlaza con la sección 33 · cumplimiento por
// serie y la 35 · correr al aire libre).

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';
import { MOD, PARTNER, CalCell, SplitRow, WEEKDAYS, MONTH, LegendItem } from './piezas/historial-del-atleta';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Tu atleta lleva <b>todo su historial en el bolsillo</b>: un <b>calendario del mes</b> donde
          cada día dice de un vistazo qué hizo, y donde <b>tocar un día abre la sesión entera</b> (con
          sus tiempos reales, sus splits juzgados contra tu objetivo y la ruta si corrió fuera). El
          mismo detalle se abre desde <b>Analíticas</b>. Cuando él puede revisar cómo fue, vuestra
          conversación arranca desde <b>lo que de verdad pasó</b>.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>historial</b> del atleta en su app: un <b>calendario mensual</b> (<b>punto naranja</b>{' '}
            entreno hecho, <b>aro azul</b> con la pareja, <b>raya</b> descanso programado) y, tocando un
            día, la <b>sesión completa</b>.
          </>
        }
        como={
          <>
            Abre <b>Historial</b> y ve el mes marcado. Toca un día y se despliega: <b>tiempos reales por
            bloque</b>, <b>splits con veredicto</b> contra tu objetivo y la <b>ruta</b> si fue al aire
            libre. Las filas de <b>Analíticas</b> abren ese mismo detalle.
          </>
        }
        porque={
          <>
            Porque la <b>constancia</b> se lee mejor en un calendario que en una lista, y porque revisar
            cómo fue <b>un martes</b> concreto (sin «¿qué hice?») alinea su <b>memoria</b> con tu{' '}
            <b>feedback</b>.
          </>
        }
      />

      <h3>El calendario del mes</h3>
      <p>
        La pantalla de arranque del historial es un <b>calendario mensual</b>. Cada día lleva una marca
        clara: <b>punto naranja</b> si <b>entrenó</b>, <b>aro azul</b> si esa sesión fue <b>con su
        pareja</b> de dobles, y una <b>raya</b> si tenía un <b>descanso programado</b>. Un día sin nada
        se queda limpio. De un vistazo, tu atleta ve su mes: dónde apretó, dónde descansó y cuándo
        entrenó acompañado.
      </p>

      <MovilBand
        title="El mes, de un vistazo"
        subtitle={
          <>
            Tres marcas y nada más: <b>hecho</b>, <b>con la pareja</b> o <b>descanso</b>. Lo que no pasó,
            no se pinta: el calendario no inventa actividad.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El calendario.</b> Punto naranja = entreno hecho, aro azul = con la pareja, raya =
              descanso programado. Toca un día para abrirlo.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Historial
            </div>
            <div className="avatar">L</div>
          </div>
          <div className="ph-title sm" style={{ marginBottom: '10px' }}>
            Julio
          </div>

          {/* Encabezados de día */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '4px' }}>
            {WEEKDAYS.map((w, i) => (
              <span
                key={i}
                style={{
                  textAlign: 'center',
                  fontSize: '8.5px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: 'var(--faint)',
                }}
              >
                {w}
              </span>
            ))}
          </div>

          {/* La rejilla del mes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
            {MONTH.map((c, i) => (
              <CalCell key={i} day={c.day} mark={c.mark} today={c.today} />
            ))}
          </div>

          {/* Leyenda */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'center',
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--hair)',
            }}
          >
            <LegendItem
              swatch={<span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--acc)' }} />}
              label="Hecho"
            />
            <LegendItem
              swatch={
                <span
                  style={{ width: '12px', height: '12px', borderRadius: '50%', border: `2px solid ${PARTNER}` }}
                />
              }
              label="Con la pareja"
            />
            <LegendItem
              swatch={<span style={{ width: '9px', height: '2px', borderRadius: '2px', background: 'var(--faint)' }} />}
              label="Descanso"
            />
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="cue" title="Tres marcas, cero ruido">
        <p>
          <b>Punto naranja</b> = entrenó, <b>aro azul</b> = lo hizo <b>con su pareja</b>, <b>raya</b> =
          tenía descanso programado. Un día vacío es un día sin nada previsto ni hecho: el calendario{' '}
          <b>no rellena</b> huecos con actividad que no existió.
        </p>
      </DocNote>

      <h3>Un día, la sesión entera</h3>
      <p>
        Al tocar un día con entreno, se abre la <b>sesión completa</b>: los <b>tiempos reales por
        bloque</b> (no el prescrito, lo que de verdad hizo), los <b>splits con su veredicto</b> contra
        tu objetivo, <em className="em">en banda</em>, <em className="em">se pasó</em> o{' '}
        <em className="em">se quedó corto</em>, con la misma lógica del cumplimiento por serie (sección
        33), y, si corrió <b>al aire libre</b>, el <b>mapa con la ruta</b> (sección 35). Es el detalle
        de una sesión, tal cual quedó registrada.
      </p>

      <MovilBand
        title="El día, abierto"
        subtitle={
          <>
            Tiempos reales por bloque, cada split <b>juzgado</b> contra tu objetivo, y la <b>ruta</b> si
            fue una salida al aire libre.
          </>
        }
      >
        {/* PHONE 1: el detalle de la sesión del día */}
        <PhoneMockup
          caption={
            <>
              <b>La sesión del día.</b> Bloques con su tiempo real, splits con veredicto y la traza si
              corrió fuera.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Sáb 12 · Rodaje + series
            </div>
            <div />
          </div>

          {/* Cabecera de la sesión */}
          <div
            className="logcard"
            style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}
          >
            <div>
              <div className="lh">Tiempo total</div>
              <div className="num" style={{ fontSize: '20px', fontWeight: 900, color: 'var(--fg)' }}>
                52:40
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="lh">RPE</div>
              <div className="num" style={{ fontSize: '20px', fontWeight: 900, color: 'var(--fg)' }}>
                7
              </div>
            </div>
          </div>

          {/* Tiempos reales por bloque */}
          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Por bloque · tiempo real</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '7px 2px',
                borderTop: '1px solid var(--hair)',
              }}
            >
              <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="mdot" style={{ background: MOD.carrera }} /> Calentamiento
              </span>
              <span className="num" style={{ color: 'var(--muted)' }}>
                12:10
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                padding: '7px 2px',
                borderTop: '1px solid var(--hair)',
              }}
            >
              <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="mdot" style={{ background: MOD.carrera }} /> Series · 6×800
              </span>
              <span className="num" style={{ color: 'var(--muted)' }}>
                34:20
              </span>
            </div>
          </div>

          {/* Splits con veredicto */}
          <div className="logcard">
            <div className="lh">Splits · contra tu objetivo</div>
            <SplitRow hue={MOD.carrera} label="800 #1" done="3:12" verdict="En banda" tone="var(--ok)" />
            <SplitRow hue={MOD.carrera} label="800 #3" done="3:19" verdict="Se pasó" tone="var(--warn)" />
            <SplitRow hue={MOD.carrera} label="800 #6" done="3:05" verdict="En banda" tone="var(--ok)" />
          </div>
        </PhoneMockup>

        {/* PHONE 2: una salida al aire libre → la ruta */}
        <PhoneMockup
          caption={
            <>
              <b>Si fue al aire libre.</b> El mismo día abre también el <b>mapa con la ruta</b> y el
              ritmo real de la salida.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Dom 6 · Salida larga
            </div>
            <div />
          </div>

          {/* Mapa con la traza */}
          <div
            style={{
              background: 'var(--sunken)',
              border: '1px solid var(--hair)',
              borderRadius: 'var(--v2-r-l)',
              height: '132px',
              marginTop: '6px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <svg viewBox="0 0 240 132" width="100%" height="100%" preserveAspectRatio="none">
              <path
                d="M20 104 C 50 60, 78 118, 108 74 S 168 30, 196 58 S 224 96, 222 30"
                fill="none"
                stroke={MOD.carrera}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="20" cy="104" r="4" fill={MOD.carrera} />
              <circle cx="222" cy="30" r="4" fill="var(--acc)" />
            </svg>
          </div>

          <div className="logcard" style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="lh">Distancia</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800 }}>
                14,2 km
              </div>
            </div>
            <div>
              <div className="lh">Ritmo medio</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800 }}>
                5:02 /km
              </div>
            </div>
            <div>
              <div className="lh">Tiempo</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800 }}>
                1:11:30
              </div>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="log" title="Sin objetivo, no hay veredicto inventado">
        <p>
          El <b>veredicto</b> de cada split existe porque hubo un <b>objetivo tuyo</b> contra el que
          medir. En una sesión <b>libre</b>, sin prescripción, el día muestra los <b>tiempos reales</b>{' '}
          igual, pero <b>no cuelga</b> un «en banda» o «se pasó» que no tendría contra qué compararse.
        </p>
      </DocNote>

      <h3>Desde Analíticas, el mismo detalle</h3>
      <p>
        No hace falta pasar por el calendario. En <b>Analíticas</b>, las <b>filas de sesión</b> ahora
        <b> abren ese mismo detalle</b> de un toque: los mismos bloques, los mismos splits, la misma
        ruta. Una <b>sola verdad</b> de «cómo fue esta sesión», se llegue desde donde se llegue.
      </p>

      <MovilBand
        title="La misma sesión, desde Analíticas"
        subtitle={
          <>
            Las filas de sesión de Analíticas son <b>puertas al mismo detalle</b>: no hay dos versiones
            de cómo fue un entreno.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Analíticas.</b> Cada fila de sesión abre el <b>mismo</b> detalle del día: tiempos,
              splits y ruta.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Analíticas
            </div>
            <div className="avatar">L</div>
          </div>
          <div className="ph-title sm" style={{ marginBottom: '10px' }}>
            Últimas sesiones
          </div>

          {[
            ['Sáb 12', 'Rodaje + series 6×800', '52:40', MOD.carrera],
            ['Vie 11', 'Fuerza · tren inferior', '48:15', MOD.fuerza],
            ['Mié 9', 'Simulación HYROX', '1:04:10', MOD.circuito],
            ['Dom 6', 'Salida larga · 14,2 km', '1:11:30', MOD.carrera],
          ].map(([día, título, t, hue]) => (
            <div
              key={título}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--surface)',
                border: '1px solid var(--hair)',
                borderRadius: '11px',
                padding: '10px 12px',
                marginBottom: '7px',
              }}
            >
              <span className="mdot" style={{ background: hue as string }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{título}</div>
                <div className="num" style={{ fontSize: '9.5px', color: 'var(--faint)' }}>
                  {día}
                </div>
              </div>
              <span className="num" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {t}
              </span>
              <span style={{ color: 'var(--faint)', fontSize: '15px' }}>›</span>
            </div>
          ))}
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        El historial no es una lista más: es la <b>memoria</b> de tu atleta, ordenada por días y abierta
        hasta el último split. Cuando él revisa <b>cómo fue de verdad</b>, tú no empiezas la revisión
        explicando qué pasó: empezáis los dos <b>mirando lo mismo</b>.
      </p>
    </DocSection>
  );
}
