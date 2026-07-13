// GUÍA · 39 Remo y ergómetros a fondo — área "Aparatos y sensores". Del lado del
// atleta, para que el coach sepa qué existe: con el monitor PM5 de Concept2 enlazado
// (remo, SkiErg, bici), la app registra CADA split entero —tiempo, distancia, ritmo
// /500m, paladas (spm), vatios, descanso, drag factor, calorías y cal/h—, lo pinta en
// una tabla estilo ErgData en el resumen del atleta Y en el detalle de sesión del
// coach, y saca analíticas nuevas de potencia y calorías con tendencia. El PM5 se
// conecta desde la misma card "Dispositivos" que la cinta (sección 34): lista por
// nombre, se toca el suyo, desconectar/olvidar a mano. El coach no marca nada.
// Requiere PM5 físico en rango para poblar datos reales. Verificado contra:
//   ios/FAHYBRIK/Devices/PM5/PM5Constants.swift (GATT propio Concept2 CE06…, NO FTMS)
//   ios/FAHYBRIK/Devices/PM5/PM5Service.swift + PM5ConnectionStore.swift (CoreBluetooth
//     scan/connect/disconnect; simulador = stream mock)
//   ios/FAHYBRIK/Devices/DeviceConnectCard.swift (chip .pm5 en la card "Dispositivos")
//     → ios/FAHYBRIK/Devices/PM5/PM5LiveStreamView.swift (LISTA store.discovered por
//     nombre + RSSI; "Desconectar" + "Olvidar dispositivo")
//   ios/FAHYBRIK/Devices/PM5/PM5DataParser.swift (struct PM5Split: timeSeconds,
//     distanceMeters, restTimeSeconds/restDistanceMeters, avgPaceSecPer500m,
//     strokeRateSpm, avgPowerWatts, totalCalories, avgCaloriesPerHour, avgDragFactor,
//     avgHeartRateBpm; PM5LiveSample lleva el ritmo medio /500m del monitor)
//   ios/FAHYBRIK/Workout/ExecutedWorkoutView.swift (ergIntervalsCard #33 "ErgData-style":
//     # | Tiempo | Dist | /500m | s/m | Cal) + ios/FAHYBRIK/Plan/AssignmentDetail.swift
//     (ErgSplitActual)
//   web/components/v2/atleta-detalle/SessionDetailDrawer.tsx (SplitsTable coach:
//     # | Tiempo | m | /500m | spm | W | Desc. + dragFactor + calPerHour) ←
//     web/lib/execution/erg-splits.ts + web/lib/dashboard/coach/session-actuals.ts
//     (parseErgDetail sobre raw_lap_data_json; una sola verdad atleta↔coach)
//   web/lib/athlete/analytics/ergo.ts (buildPowerCard: línea de vatios sobre las
//     últimas ≤8 sesiones; buildVolumeCard: calorías; needs ≥2 sesiones para 'real')
//     expuesto en /api/athlete/analytics/sections/ergo, pintado por AnalyticsCardView
//   infra/migrations/0045_segment_execution_modality.sql (modality/pace/power/stroke;
//     el array de splits + drag + cal/h viajan en raw_lap_data_json, sin columnas nuevas)

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// El color de ergo (nunca se desvía de los tokens v2 vivos): remo / SkiErg / bici.
const ERGO = 'var(--v2-mod-ergo)';

// Una fila de la tabla ErgData del atleta: # | Tiempo | Dist | /500m | s/m | Cal.
// Faithful a ergIntervalsCard (ExecutedWorkoutView). El descanso va como sub-línea.
function ErgRow({
  n,
  time,
  dist,
  pace,
  spm,
  cal,
  rest,
}: {
  n: string;
  time: string;
  dist: string;
  pace: string;
  spm: string;
  cal: string;
  rest?: string;
}) {
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '15px 1fr 1fr 1fr 28px 28px',
          gap: '4px',
          alignItems: 'center',
          padding: '7px 2px',
          borderTop: '1px solid var(--hair)',
          fontSize: '10px',
        }}
        className="num"
      >
        <span style={{ color: ERGO, fontWeight: 800 }}>{n}</span>
        <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{time}</span>
        <span style={{ color: 'var(--muted)' }}>{dist}</span>
        <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{pace}</span>
        <span style={{ color: 'var(--muted)', textAlign: 'right' }}>{spm}</span>
        <span style={{ color: 'var(--muted)', textAlign: 'right' }}>{cal}</span>
      </div>
      {rest ? (
        <div
          className="num"
          style={{ fontSize: '8.5px', color: 'var(--faint)', padding: '0 2px 3px 19px' }}
        >
          descanso {rest}
        </div>
      ) : null}
    </>
  );
}

// Cabecera de columnas de la tabla ErgData (comparte layout con ErgRow).
function ErgHead({ cols }: { cols: string[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '15px 1fr 1fr 1fr 28px 28px',
        gap: '4px',
        padding: '0 2px 3px',
        fontSize: '8px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--faint)',
      }}
    >
      <span>{cols[0]}</span>
      <span>{cols[1]}</span>
      <span>{cols[2]}</span>
      <span>{cols[3]}</span>
      <span style={{ textAlign: 'right' }}>{cols[4]}</span>
      <span style={{ textAlign: 'right' }}>{cols[5]}</span>
    </div>
  );
}

// Una fila de la tabla del COACH (panel): # | Tiempo | m | /500m | spm | W | Desc.
function CoachErgRow({
  n,
  time,
  m,
  pace,
  spm,
  w,
  rest,
}: {
  n: string;
  time: string;
  m: string;
  pace: string;
  spm: string;
  w: string;
  rest: string;
}) {
  return (
    <div
      className="num"
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr 1fr 1fr 42px 42px 52px',
        gap: '8px',
        alignItems: 'center',
        padding: '8px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11px',
      }}
    >
      <span style={{ color: ERGO, fontWeight: 800 }}>{n}</span>
      <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{time}</span>
      <span style={{ color: 'var(--muted)' }}>{m}</span>
      <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{pace}</span>
      <span style={{ color: 'var(--muted)', textAlign: 'right' }}>{spm}</span>
      <span style={{ color: 'var(--fg)', fontWeight: 700, textAlign: 'right' }}>{w}</span>
      <span style={{ color: 'var(--faint)', textAlign: 'right' }}>{rest}</span>
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
          El remo y el SkiErg no son «cardio de relleno»: son estaciones de HYROX que se ganan o se
          pierden por vatios. Con el <b>monitor PM5 de Concept2</b> enlazado, la app deja de estimar y
          registra <b>cada intervalo entero</b> —ritmo <b>/500m</b>, paladas, <b>vatios</b>, drag y
          calorías—, te lo enseña en una <b>tabla estilo ErgData</b> a ti y a tu atleta, y saca{' '}
          <b>analíticas de potencia y calorías con tendencia</b>. Tú prescribes el ergo como siempre.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>ergo a fondo</b>: con el <b>PM5</b> conectado (remo, SkiErg o bici Concept2), la app
            lee <b>cada split</b> del monitor —tiempo, distancia, <b>/500m</b>, paladas, <b>vatios</b>,
            descanso, <b>drag factor</b> y calorías— y lo guarda con la sesión.
          </>
        }
        como={
          <>
            Tu atleta enlaza el PM5 desde <b>«Dispositivos»</b> (como la cinta), rema, y al cerrar ve
            su <b>tabla de intervalos</b>. Tú abres el <b>detalle de la sesión</b> y ves la misma
            tabla, más su <b>potencia y calorías por sesiones</b>.
          </>
        }
        porque={
          <>
            Porque «2000 m de remo» dice poco: lo que entrena de verdad es a <b>cuántos vatios</b> y a
            qué <b>ritmo /500m</b>. Con el dato real puedes <b>ajustar la carga</b> y tu atleta puede{' '}
            <b>pacing</b> como en competición, no a ojo.
          </>
        }
      />

      <h3>1 · Enlaza el PM5, y elige el tuyo</h3>
      <p>
        El PM5 se conecta desde la <b>misma tarjeta «Dispositivos»</b> que la cinta (sección 34), antes
        de empezar o en un entreno libre. La app <b>busca los monitores cercanos y los lista por
        nombre</b> con su señal; tu atleta <b>toca el suyo</b> —nunca se engancha sola al primero, que
        en una sala con cuatro remos importa—. Desde ahí ve el stream en vivo, y tiene siempre a mano{' '}
        <b>«Desconectar»</b> y <b>«Olvidar dispositivo»</b>. Habla el <b>perfil propio del PM5</b> de
        Concept2 (no el FTMS de la cinta), así que lee lo que el monitor calcula, sin inventar nada.
      </p>

      <DocNote variant="cue" title="Un monitor, tres ergos">
        <p>
          El mismo PM5 monta el <b>remo</b>, el <b>SkiErg</b> y la <b>BikeErg</b> de Concept2 — la app
          los trata igual: se conecta, lee los splits y los guarda con la <b>modalidad</b> de la
          estación. Lo que prescribas como remo, ski o bici <b>casa solo</b> con el aparato que enlaza
          tu atleta.
        </p>
      </DocNote>

      <h3>2 · Cada split, entero</h3>
      <p>
        Con el PM5 conectado, cada intervalo que marca el monitor entra <b>completo</b>: su{' '}
        <b>tiempo</b> y <b>distancia</b>, el <b>ritmo /500m</b> (la unidad del remo, no /km), las{' '}
        <b>paladas por minuto</b>, los <b>vatios medios</b>, las <b>calorías</b> y el <b>descanso</b>{' '}
        entre series. Y dos que solo da el monitor: el <b>drag factor</b> —la resistencia real del
        ventilador, para comparar de un día a otro— y las <b>calorías/hora</b>. Tu atleta lo ve al
        cerrar, en una tabla como la de <b>ErgData</b>.
      </p>

      <MovilBand
        title="La tabla de intervalos, en su móvil"
        subtitle={
          <>
            Al cerrar la sesión, cada split con su <b>/500m</b>, paladas y calorías —y el descanso
            entre series—, tal cual lo dio el PM5. Nada estimado.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Resumen del atleta.</b> La tabla estilo ErgData: intervalo a intervalo, con el drag
              factor y las cal/h de la sesión arriba.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Remo · 4×500 m
            </div>
            <div />
          </div>

          {/* Resumen de sesión: drag + cal/h + ritmo medio del monitor */}
          <div
            className="logcard"
            style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}
          >
            <div>
              <div className="lh">Drag factor</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800, color: 'var(--fg)' }}>
                118
              </div>
            </div>
            <div>
              <div className="lh">Cal / hora</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800, color: 'var(--fg)' }}>
                926
              </div>
            </div>
            <div>
              <div className="lh">Ritmo medio</div>
              <div className="num" style={{ fontSize: '17px', fontWeight: 800, color: ERGO }}>
                1:47<span style={{ fontSize: '9px', color: 'var(--faint)' }}>/500</span>
              </div>
            </div>
          </div>

          {/* Tabla ErgData del atleta */}
          <div className="logcard">
            <div className="lh" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="mdot" style={{ background: ERGO }} /> Intervalos
            </div>
            <ErgHead cols={['#', 'Tiempo', 'Dist', '/500m', 's/m', 'Cal']} />
            <ErgRow n="1" time="1:45" dist="500 m" pace="1:45" spm="30" cal="9" rest="1:30" />
            <ErgRow n="2" time="1:47" dist="500 m" pace="1:47" spm="29" cal="9" rest="1:30" />
            <ErgRow n="3" time="1:48" dist="500 m" pace="1:48" spm="29" cal="8" rest="1:30" />
            <ErgRow n="4" time="1:46" dist="500 m" pace="1:46" spm="31" cal="9" />
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · La misma tabla, en tu panel</h3>
      <p>
        No hay «versión del atleta» y «versión tuya»: es <b>el mismo registro</b>. En el <b>detalle de
        la sesión</b> de tu atleta ves su tabla de intervalos con una columna más de <b>vatios</b>, el{' '}
        <b>drag factor</b> y las <b>cal/h</b> de la sesión. Es lo que necesitas para decidir si la
        próxima vez subes la carga, aprietas el pacing o bajas el drag.
      </p>

      <DashboardMockup url="tu-panel / atletas / laia · remo 4×500 m">
        <div className="wk-head">
          <div className="wk-title">
            Remo · 4×500 m <small>· ejecutada con PM5</small>
          </div>
          <div className="wk-sum">
            <span className="chip" style={{ color: ERGO, borderColor: ERGO }}>
              Drag 118 · 926 cal/h
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
            className="num"
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr 1fr 1fr 42px 42px 52px',
              gap: '8px',
              padding: '0 2px 3px',
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
            }}
          >
            <span>#</span>
            <span>Tiempo</span>
            <span>m</span>
            <span>/500m</span>
            <span style={{ textAlign: 'right' }}>spm</span>
            <span style={{ textAlign: 'right' }}>W</span>
            <span style={{ textAlign: 'right' }}>Desc.</span>
          </div>
          <CoachErgRow n="1" time="1:45" m="500" pace="1:45" spm="30" w="248" rest="1:30" />
          <CoachErgRow n="2" time="1:47" m="500" pace="1:47" spm="29" w="236" rest="1:30" />
          <CoachErgRow n="3" time="1:48" m="500" pace="1:48" spm="29" w="230" rest="1:30" />
          <CoachErgRow n="4" time="1:46" m="500" pace="1:46" spm="31" w="242" rest="—" />
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="Una sola verdad, atleta y coach">
        <p>
          La tabla de tu atleta y la tuya salen del <b>mismo dato</b> que mandó el PM5 con la sesión —
          no se recalcula ni se redondea distinto en cada lado. Si a él le sale 236 W en la serie 2, a
          ti también.
        </p>
      </DocNote>

      <h3>4 · Potencia y calorías, con tendencia</h3>
      <p>
        Cuando hay varias sesiones de ergo, la app le arma a tu atleta —en su pestaña de{' '}
        <b>Analíticas</b>, con selector <b>Remo / SkiErg / Bici</b>— dos cosas nuevas: la{' '}
        <b>tendencia de potencia</b> (los vatios medios de las últimas sesiones, en una línea) y el{' '}
        <b>volumen de calorías</b>. Es la lectura que faltaba: no «hice remo», sino <b>si mis vatios
        suben</b> semana a semana. Necesita al menos <b>dos sesiones</b> con PM5 para dibujar la línea;
        antes de eso, te lo dice en vez de inventar una tendencia.
      </p>

      <MovilBand
        title="La potencia, sesión a sesión"
        subtitle={
          <>
            En Analíticas del atleta: los vatios medios subiendo (o no) por las últimas sesiones de
            remo, y las calorías acumuladas. Con <b>≥2 sesiones</b> reales.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Tendencia de potencia.</b> Vatios medios por sesión de remo — la señal de que el motor
              mejora, no solo de que entrenó.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Analíticas · Remo
            </div>
            <div className="avatar">L</div>
          </div>

          <div
            className="logcard"
            style={{ marginTop: '6px' }}
          >
            <div className="lh" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="mdot" style={{ background: ERGO }} /> Tendencia · potencia
            </div>

            {/* Gráfico de línea de vatios */}
            <div style={{ position: 'relative', height: '104px', marginTop: '4px' }}>
              <svg width="100%" height="100%" viewBox="0 0 240 104" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points="12,80 46,72 80,74 114,58 148,52 182,40 216,34"
                  fill="none"
                  stroke={ERGO}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {[
                  [12, 80],
                  [46, 72],
                  [80, 74],
                  [114, 58],
                  [148, 52],
                  [182, 40],
                  [216, 34],
                ].map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="2.6" fill={ERGO} />
                ))}
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <span style={{ fontSize: '9px', color: 'var(--faint)' }}>hace 7 sesiones</span>
              <span className="num" style={{ fontSize: '11px', fontWeight: 800, color: ERGO }}>
                242 W
              </span>
            </div>
          </div>

          {/* Calorías acumuladas */}
          <div className="logcard" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="lh">Calorías · últimas 8</div>
              <div className="num" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--fg)' }}>
                1 840 <span style={{ fontSize: '10px', color: 'var(--muted)' }}>kcal</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="lh">Media / sesión</div>
              <div className="num" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--fg)' }}>
                230
              </div>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="bad" title="Sin PM5, sin datos inventados">
        <p>
          Todo esto vive del <b>PM5 físico en rango</b>: es él quien calcula vatios, drag y /500m. Sin
          monitor conectado, tu atleta registra el ergo <b>a mano</b> como siempre (distancia o tiempo)
          y esas tablas y tendencias <b>no aparecen</b> — la app no rellena splits ni potencia que no
          midió. Si no ves la tabla, es que esa sesión no se corrió con PM5.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Tú no marcas nada">
        <p>
          Prescribes el remo, el ski o la bici como cualquier ergo en el editor. Conectar el PM5 es
          cosa del atleta; la ejecución vuelve a tu panel con todo el detalle, lista para leer y para
          decidir la <b>siguiente carga</b>.
        </p>
      </DocNote>
    </DocSection>
  );
}
