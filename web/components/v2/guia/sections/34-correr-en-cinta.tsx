// GUÍA · 34 Correr en cinta — área "Carrera". Breve, del lado del atleta, para que
// el coach sepa qué existe: el atleta conecta la app a una cinta compatible por
// Bluetooth (estándar FTMS) y corre el tramo con ritmo en vivo contra objetivo,
// pulso del reloj/banda y avance automático de tramos. El coach no marca nada:
// prescribe como siempre y la ejecución vuelve sola. Verificado contra
// ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDView.swift (chips "Cinta ·
// buscando/sin señal" y "Pulso · banda/reloj", "Tramo N de M", "Objetivo …",
// Velocidad km/h, Inclinación %, progreso de distancia/tiempo del tramo) y
// ios/FAHYBRIK/Workout/WorkoutLiveHUDs.swift (#60: se ofrece en cada tramo de
// carrera; sin cinta compatible cae al stepper manual de distancia recorrida).

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

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cuando tu atleta entrena en cinta, no tiene por qué ir a ciegas. Conecta la app a una{' '}
          <b>cinta compatible</b> por Bluetooth y corre el tramo con el <b>ritmo en vivo contra tu
          objetivo</b>, su pulso e inclinación a la vista, y los tramos que <b>avanzan solos</b>. Tú
          no tienes que hacer nada distinto: prescribes la carrera como siempre.
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
            En cualquier tramo de carrera, tu atleta toca <b>«cinta»</b> y elige la suya. Ve el{' '}
            <b>ritmo en vivo</b> junto al <b>objetivo</b>, su <b>pulso</b> del reloj o banda, y cuando
            completa el tramo <b>pasa solo</b> al siguiente.
          </>
        }
        porque={
          <>
            Porque la cinta es donde más fácil se pierde el objetivo de vista. Con el ritmo delante,
            tu atleta <b>clava la banda</b> — y tú recibes una ejecución <b>real</b>, no una
            estimación a ojo.
          </>
        }
      />

      <h3>1 · Se conecta a la cinta, no la sustituye</h3>
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
