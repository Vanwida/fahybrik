// GUÍA · 34 Correr en cinta — área "Carrera". Breve, del lado del atleta, para que
// el coach sepa qué existe: el atleta conecta la app a una cinta compatible por
// Bluetooth (estándar FTMS) y corre el tramo con ritmo en vivo contra objetivo,
// pulso del reloj/banda y avance automático de tramos. La conexión se hace ANTES de
// empezar (card "Dispositivos" en la pantalla previa, también en el entreno libre),
// eligiendo la máquina POR NOMBRE de una lista (nunca se engancha sola a la primera
// que pilla), con desconectar siempre a mano; los metros del cinturón quedan
// registrados en el historial/analíticas; y el Apple Watch pinta lo mismo que el
// móvil (ritmo + metros del tramo). El coach no marca nada. Verificado contra:
//   ios/FAHYBRIK/Devices/DeviceConnectCard.swift (card "Dispositivos",
//     "Conecta antes de empezar — opcional"; chip por dispositivo; long-press =
//     desconectar) usada en ios/FAHYBRIK/Workout/PreWorkoutBriefView.swift:152 y
//     ios/FAHYBRIK/Workout/FreeWorkoutBuilderView.swift:252 (entreno libre);
//     elegibilidad en ios/FAHYBRIK/Devices/PreWorkoutDevices.swift (chip "Cinta"
//     solo si la sesión tiene tramo de carrera)
//   ios/FAHYBRIK/Devices/DevicePickerSheet.swift (LISTA por nombre + señal, se toca
//     la propia; botón "DESCONECTAR") + ios/FAHYBRIK/Devices/DeviceConnection.swift
//     (ScanDecisionEngine.decide: auto-conecta SOLO si hay 1 candidato y es el
//     recordado; cualquier otro caso → picker, nunca "la primera que aparezca")
//   ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDView.swift (chip de cabecera para
//     cambiar/soltar la máquina en marcha; chips "Cinta"/"Pulso", "Tramo N de M",
//     Velocidad km/h, Inclinación %, progreso del tramo)
//   ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDModel.swift → sampleTreadmillDistance
//     → WorkoutSession.lapBeltDistanceMeters → LapRecord.distanceCoveredMeters →
//     SegmentExecutionDTO.distance_meters (PostWorkoutSummaryView) →
//     /api/sync/workout-execution → web/lib/sync/ingest-execution-segments.ts
//     (columna distance_meters): los metros del cinturón SÍ persisten
//   ios/FAHYBRIKWatch/Views/MirrorHUDView.swift (treadmillContent: ritmo grande /km +
//     barra de progreso de metros + metros cubiertos/objetivo; el móvil lleva el
//     Bluetooth y se lo espeja al reloj)
//   ios/FAHYBRIK/Devices/Treadmill/TreadmillConstants.swift (FTMS: Fitness Machine
//     Service 1826 / Treadmill Data 2ACD)

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

// Una celda de dato del HUD de cinta (velocidad / inclinación / tiempo…).
function HudCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '9px',
        padding: '9px 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
        <span className="num2" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--fg)' }}>
          {value}
        </span>
        {unit ? (
          <span className="num2" style={{ fontSize: '9px', color: 'var(--faint)' }}>
            {unit}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: '8px',
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginTop: '3px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Barritas de señal (RSSI) de un aparato en la lista del selector.
function SignalBars({ strength }: { strength: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '13px' }}>
      {[6, 9, 12].map((h, i) => (
        <span
          key={i}
          style={{
            width: '3px',
            height: `${h}px`,
            borderRadius: '1px',
            background: i < strength ? 'var(--acc)' : 'var(--hair)',
          }}
        />
      ))}
    </span>
  );
}

// Una fila del selector de aparatos: nombre + señal, o el estado conectado.
function DeviceRow({
  name,
  strength,
  connected,
}: {
  name: string;
  strength: number;
  connected?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        background: connected ? 'var(--accSoft)' : 'var(--surface)',
        border: `1px solid ${connected ? 'var(--acc)' : 'var(--hair)'}`,
        borderRadius: '11px',
        marginBottom: '7px',
      }}
    >
      <span
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '7px',
          background: 'var(--sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          flexShrink: 0,
        }}
      >
        🏃
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{name}</div>
        <div style={{ fontSize: '9.5px', color: connected ? 'var(--acc)' : 'var(--faint)' }}>
          {connected ? 'Conectada' : 'Cerca'}
        </div>
      </div>
      {connected ? (
        <span className="chip" style={{ fontSize: '9px', color: 'var(--acc)', borderColor: 'var(--acc)' }}>
          Desconectar
        </span>
      ) : (
        <SignalBars strength={strength} />
      )}
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
          Cuando tu atleta entrena en cinta, no tiene por qué ir a ciegas. <b>Antes de empezar</b>{' '}
          enlaza la app a su <b>cinta compatible</b> por Bluetooth —eligiéndola <b>por su nombre</b> de
          una lista, no la primera que pilla— y corre el tramo con el <b>ritmo en vivo contra tu
          objetivo</b>, su pulso e inclinación a la vista, y los tramos que <b>avanzan solos</b>. Tú no
          tienes que hacer nada distinto: prescribes la carrera como siempre.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>modo cinta</b> del atleta: la app se enlaza a la cinta por el estándar{' '}
            <b>Bluetooth FTMS</b> y lee su <b>velocidad, inclinación y distancia</b> en tiempo real,
            tramo a tramo, contra lo que prescribiste.
          </>
        }
        como={
          <>
            Antes de arrancar, abre <b>«Dispositivos»</b>, ve la <b>lista de cintas por nombre</b> y
            toca <b>la suya</b>. Ya en marcha ve el <b>ritmo en vivo</b> junto al <b>objetivo</b>, su{' '}
            <b>pulso</b>, y cuando completa el tramo <b>pasa solo</b> al siguiente.
          </>
        }
        porque={
          <>
            Porque la cinta es donde más fácil se pierde el objetivo de vista —y, en un gimnasio con
            varias máquinas, engancharse a la de al lado. Eligiendo la suya y con el ritmo delante, tu
            atleta <b>clava la banda</b>, y a ti te vuelve una ejecución <b>real</b>.
          </>
        }
      />

      <h3>1 · La conectas antes de empezar, y eliges tu máquina</h3>
      <p>
        En la pantalla <b>previa</b> al entreno (y también al montar un <b>entreno libre</b>) aparece
        una tarjeta <b>«Dispositivos»</b> con un lema honesto: <em className="em">«Conecta antes de
        empezar — opcional»</em>. Al tocar la cinta, la app <b>busca las que hay cerca y las lista por
        nombre</b> con su intensidad de señal; tu atleta <b>toca la suya</b>. No se engancha sola a la
        primera que aparece —clave en un gimnasio con seis cintas en fila—: solo se autoconecta si
        reconoce <b>exactamente la que usó la última vez</b>. Y el botón <b>«Desconectar»</b> está
        siempre a mano, tanto en la lista como en la cabecera del entreno, por si latió con la de al
        lado.
      </p>

      <MovilBand
        title="Elegir la cinta, antes de arrancar"
        subtitle={
          <>
            La tarjeta <b>Dispositivos</b> en la pantalla previa: las cintas cercanas <b>por nombre</b>,
            se toca la propia y queda conectada — con <b>desconectar</b> siempre visible.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El selector de aparatos.</b> Lista por nombre y señal; nunca se conecta sola a la
              primera. Una vez enlazada, «Desconectar» queda a un toque.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Antes de empezar
            </div>
            <div />
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hair)',
              borderRadius: 'var(--v2-r-l, 14px)',
              padding: '13px 13px 6px',
              marginTop: '6px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>Dispositivos</div>
            <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginBottom: '12px' }}>
              Conecta antes de empezar — opcional
            </div>

            <DeviceRow name="Technogym · Run 03" strength={3} connected />
            <DeviceRow name="Woodway 4Front" strength={2} />
            <DeviceRow name="Life Fitness · T5" strength={1} />
          </div>

          <div style={{ fontSize: '9.5px', color: 'var(--faint)', textAlign: 'center', marginTop: '9px' }}>
            Puedes empezar sin conectar nada — la cinta solo suma.
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>2 · Se conecta a la cinta, no la sustituye</h3>
      <p>
        La app <b>lee</b> la cinta por Bluetooth (el estándar FTMS que traen la mayoría de cintas de
        gimnasio y muchas de casa): coge su velocidad y su inclinación y las convierte en <b>ritmo</b>{' '}
        y <b>distancia</b> del tramo. Tu atleta sigue manejando la cinta con sus botones; la app solo
        <b> mide</b> y le enseña si va en objetivo.
      </p>

      <MovilBand
        title="El tramo en la cinta, en su móvil"
        subtitle={
          <>
            Ritmo en vivo contra objetivo, pulso, velocidad e inclinación, y la barra del tramo que
            se llena sola — cuando termina, <b>salta al siguiente</b>.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El HUD de cinta.</b> «Tramo 2 de 8», ritmo en vivo junto al objetivo y el progreso de
              la distancia — sin tocar el móvil mientras corre.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              En cinta
            </div>
            <div />
          </div>

          {/* Chips de dispositivo: cinta + pulso */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <span className="chip" style={{ fontSize: '9.5px' }}>
              Cinta · conectada
            </span>
            <span className="chip" style={{ fontSize: '9.5px' }}>
              Pulso · banda
            </span>
          </div>

          <div className="num" style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '8px' }}>
            Tramo 2 de 8 · 400 m
          </div>

          {/* Ritmo en vivo vs objetivo */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hair)',
              borderRadius: 'var(--v2-r-l, 14px)',
              padding: '14px 16px',
              textAlign: 'center',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                marginBottom: '6px',
              }}
            >
              Ritmo en vivo
            </div>
            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '30px',
                letterSpacing: '-0.02em',
                color: 'var(--fg)',
              }}
            >
              3:58<span style={{ fontSize: '15px', color: 'var(--faint)' }}>/km</span>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
              Objetivo 4:00/km
            </div>

            {/* Barra de progreso del tramo */}
            <div
              style={{
                height: '6px',
                borderRadius: '3px',
                background: 'var(--hair)',
                marginTop: '12px',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '62%', height: '100%', background: 'var(--acc)' }} />
            </div>
            <div style={{ fontSize: '9px', color: 'var(--faint)', marginTop: '5px', textAlign: 'left' }}>
              Distancia del tramo · 248 / 400 m
            </div>
          </div>

          {/* Celdas: pulso, velocidad, inclinación */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <HudCell label="Pulso" value="162" unit="bpm" />
            <HudCell label="Velocidad" value="15,1" unit="km/h" />
            <HudCell label="Inclinación" value="1,0" unit="%" />
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>3 · Los metros del cinturón quedan registrados</h3>
      <p>
        Los metros que va marcando la <b>cinta</b> ya no se quedan en la pantalla: entran en el{' '}
        <b>registro de la sesión</b> como la distancia real del tramo y viajan a tu panel con el resto
        de la ejecución. De ahí alimentan su <b>historial</b> y sus <b>analíticas de carrera</b> —
        volumen, ritmos, evolución— igual que una salida al aire libre. Correr en cinta cuenta{' '}
        <b>tanto como correr fuera</b>: no es un entreno «de segunda» que se pierde.
      </p>

      <DocNote variant="log" title="La cinta pesa como la calle">
        <p>
          Cuando el atleta cierra la sesión, la distancia del cinturón se guarda como los <b>metros
          hechos</b> de cada tramo. Eso es lo que ve el <b>cumplimiento por tramo</b> (sección 33), lo
          que suma su <b>historial</b> (sección 38) y lo que mueven sus <b>analíticas</b>. Un rodaje de
          cinta y uno de calle entran por la misma puerta.
        </p>
      </DocNote>

      <h3>4 · Y en la muñeca, lo mismo que en el móvil</h3>
      <p>
        Si tu atleta lleva <b>Apple Watch</b>, no ve una versión pobre: la muñeca pinta <b>lo mismo que
        el móvil</b> para el tramo de cinta — el <b>ritmo</b> grande, la <b>barra de metros</b> que se
        llena y los <b>metros cubiertos</b> sobre el objetivo. El teléfono es quien lleva la conexión
        Bluetooth con la cinta y se lo <b>espeja</b> al reloj, para que el atleta pueda mirar la muñeca
        sin sacar el móvil.
      </p>

      {/* Mock de reloj: el chrome del watchOS es siempre negro → texto claro fijo, no tokens de tema. */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 2px' }}>
        <div
          style={{
            width: '188px',
            background: '#000',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '34px',
            padding: '18px 18px 20px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
              marginBottom: '6px',
            }}
          >
            Tramo 2 de 8
          </div>
          <div
            style={{
              fontFamily: 'var(--v2-font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: '40px',
              letterSpacing: '-0.02em',
              color: 'var(--acc)',
              lineHeight: 1,
            }}
          >
            3:58
            <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}>/km</span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.14)',
              margin: '14px 0 7px',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: '62%', height: '100%', background: 'var(--acc)' }} />
          </div>
          <div className="num2" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)' }}>
            248 / 400 m
          </div>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '4px' }}>
        El tramo de cinta en el Apple Watch: ritmo, la barra de metros y los metros cubiertos.
      </p>

      <DocNote variant="log" title="Sin cinta compatible, no se rompe nada">
        <p>
          Si no aparece ninguna cinta compatible, la app lo dice sin dramas y tu atleta sigue con el{' '}
          <b>registro manual</b> de siempre: apunta la distancia que ha cubierto y el tramo produce su
          ritmo real igual. El modo cinta <b>suma cuando está</b>, nunca es un requisito.
        </p>
      </DocNote>

      <DocNote variant="cue" title="Tú no marcas nada">
        <p>
          El modo cinta es cosa del atleta: tú <b>prescribes la carrera como siempre</b> en el editor.
          Correr en cinta o al aire libre no cambia tu trabajo — la ejecución vuelve a tu panel del
          mismo modo, lista para el <b>cumplimiento por tramo</b>.
        </p>
      </DocNote>
    </DocSection>
  );
}
