// GUÍA · 35 Correr al aire libre, en vivo — área "Carrera". Del lado del atleta,
// para que el coach sepa qué existe: sale a correr con el GPS del móvil y ve el
// rodaje en vivo (mapa con traza, ritmo GPS contra objetivo, tramos que cierran
// solos), se pausa solo en el semáforo, sigue en la pantalla bloqueada + Isla
// Dinámica, la app le habla (avisos de voz) y, si prefiere no llevar móvil, lo
// corre desde el reloj. El coach no marca nada: prescribe la carrera como siempre.
// Verificado contra:
//   ios/FAHYBRIK/Workout/Outdoor/OutdoorRunHUDView.swift + OutdoorRunHUDModel.swift
//     (header "AL AIRE LIBRE", mapa ~38% con RunRouteMapView, "Ritmo GPS" coloreado
//      vs banda con palabra dentro/rápido/lento, celdas Distancia·Tiempo·Pulso, barra
//      del tramo, auto-pausa "sin movimiento / se reanuda solo", cierre automático GPS
//      SOLO en tramo de distancia estructurado, botones PAUSA/REANUDAR + TRAMO HECHO,
//      botón de voz en el header; auto-pausa OFF dentro de un tramo de tiempo/recuperación)
//   ios/FAHYBRIK/Workout/Outdoor/RunLiveActivityController.swift + RunActivityAttributes
//     (Live Activity: pace, "Tramo N/M", distancia, tiempo, "Z3", pausado; degrada en
//      silencio si está desactivada)
//   ios/FAHYBRIK/Workout/Audio/{AudioCoach,RunCueEngine,CoachSpeech,CoachCue}.swift
//     (frases es-ES reales: entrada de tramo, recuperación, "Vas 15 segundos rápido" /
//      "Aprieta un poco", "Kilómetro 3. 4 minutos 42 segundos", "10 segundos", cierre;
//      anti-pesadez: dwell 10 s + 30 s entre correcciones + no repetir dirección;
//      prioridad transición > ritmo > parcial; toggle "Avisos de voz" en Perfil, ON)
//   ios/FAHYBRIKWatch/Views/StructuredRunLiveView.swift
//     ("TRAMO 3 DE 13 · 800 m", ritmo, banda objetivo, barra, tira de zona HR, "Luego ·",
//      háptica al salirse de banda, cierre por distancia, "Tramo hecho / Saltar descanso")

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

// Una celda de dato del HUD (distancia / tiempo / pulso), como en la sección de cinta.
function HudCell({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
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
        <span className="num2" style={{ fontSize: '16px', fontWeight: 800, color: color ?? 'var(--fg)' }}>
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

// El mapa del rodaje: superficie de vistazo con la traza recorrida y el punto vivo.
// No es el foco (los números de abajo llevan el coaching); aquí solo se sugiere.
function MapGlance() {
  return (
    <div
      style={{
        position: 'relative',
        height: '96px',
        borderRadius: 'var(--v2-r-l, 14px)',
        border: '1px solid var(--hair)',
        background: 'var(--surface)',
        overflow: 'hidden',
        marginBottom: '10px',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 260 96" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="18,74 52,58 74,66 104,40 140,50 168,26 206,34 236,18"
          fill="none"
          stroke="var(--acc)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        <circle cx="236" cy="18" r="5" fill="var(--acc)" />
        <circle cx="236" cy="18" r="9" fill="none" stroke="var(--acc)" strokeWidth="1.5" opacity="0.4" />
      </svg>
      <span
        className="chip"
        style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '9px' }}
      >
        GPS · buena señal
      </span>
    </div>
  );
}

// Una frase que dice la app en voz alta, con su etiqueta de prioridad.
function VozLine({ tag, text }: { tag: string; text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '10px',
      }}
    >
      <span
        style={{
          fontSize: '8px',
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          width: '62px',
          flexShrink: 0,
        }}
      >
        {tag}
      </span>
      <span style={{ fontSize: '12.5px', color: 'var(--fg)' }}>
        «{text}»
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
          Cuando tu atleta sale a la calle, no corre a ciegas. El <b>GPS del móvil</b> le pinta el
          rodaje en vivo — mapa con su traza, <b>ritmo contra tu objetivo</b>, y los tramos que{' '}
          <b>cierran solos</b> — se <b>pausa en el semáforo</b>, sigue en la pantalla bloqueada y{' '}
          <b>la app le habla</b>. Tú prescribes la carrera como siempre; correr fuera o en cinta no
          cambia tu trabajo.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>modo al aire libre</b>: tu atleta toca <b>«correr fuera»</b> en cualquier tramo de
            carrera y el móvil lee su <b>ritmo, distancia y traza</b> por GPS, tramo a tramo, contra
            lo que prescribiste.
          </>
        }
        como={
          <>
            Ve el <b>ritmo GPS</b> junto al objetivo (verde dentro, ámbar fuera), su pulso y la barra
            del tramo. Un tramo de distancia <b>se cierra solo</b> al cubrirla; entre medias, la app
            le <b>avisa por voz</b> sin ser pesada.
          </>
        }
        porque={
          <>
            Porque en la calle es fácil perder el ritmo de vista. Con el objetivo delante y al oído,
            tu atleta <b>clava la banda</b> — y a ti te vuelve una ejecución <b>real</b>, con su
            recorrido, no una estimación a ojo.
          </>
        }
      />

      <h3>1 · El rodaje con el mapa, en vivo</h3>
      <p>
        El mapa es una <b>superficie de vistazo</b>, no el foco: arriba la traza que va dejando;
        debajo, lo que de verdad guía. El <b>ritmo GPS</b> (suavizado, sin saltos) manda grande junto
        a tu objetivo y se pinta <b>verde si va dentro</b> de la banda y <b>ámbar si se sale</b>, con
        la palabra justa — <i>dentro</i>, <i>rápido</i> o <i>lento</i>. Debajo, distancia, tiempo y
        pulso, y la barra del tramo que se llena sola.
      </p>

      <MovilBand
        title="El rodaje al aire libre, en su móvil"
        subtitle={
          <>
            Mapa con la traza, ritmo GPS contra objetivo, pulso y la barra del tramo — cuando lo
            completa, <b>salta al siguiente</b> sin tocar el móvil.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El HUD al aire libre.</b> «Tramo 3 de 13», ritmo GPS en banda y el progreso de la
              distancia. El botón del altavoz silencia la voz al vuelo.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Al aire libre
            </div>
            <div />
          </div>

          <MapGlance />

          <div className="num" style={{ fontSize: '10px', color: 'var(--acc)', marginBottom: '2px', fontWeight: 800 }}>
            Tramo 3 de 13
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
            800 m · ritmo
          </div>

          {/* Ritmo GPS vs objetivo — en banda (verde) */}
          <div
            style={{
              background: 'var(--surface)',
              border: '2px solid var(--ok)',
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
              Ritmo GPS
            </div>
            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '30px',
                letterSpacing: '-0.02em',
                color: 'var(--ok)',
              }}
            >
              4:03<span style={{ fontSize: '15px', color: 'var(--faint)' }}>/km</span>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
              Objetivo 4:00 – 4:10/km · <span style={{ color: 'var(--ok)', fontWeight: 700 }}>DENTRO</span>
            </div>

            <div
              style={{
                height: '6px',
                borderRadius: '3px',
                background: 'var(--hair)',
                marginTop: '12px',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '64%', height: '100%', background: 'var(--acc)' }} />
            </div>
            <div style={{ fontSize: '9px', color: 'var(--faint)', marginTop: '5px', textAlign: 'left' }}>
              Distancia del tramo · 512 / 800 m
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <HudCell label="Distancia" value="4,1" unit="km" />
            <HudCell label="Tiempo" value="17:04" />
            <HudCell label="Pulso" value="164" unit="bpm" color="var(--warn)" />
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>2 · Se pausa en el semáforo y cierra los tramos solo</h3>
      <p>
        Si tu atleta se para — un semáforo, un cruce — la app lo detecta y <b>congela el rodaje</b>{' '}
        con un aviso sobrio («Auto-pausa · sin movimiento»); en cuanto vuelve a moverse, <b>se reanuda
        solo</b>. Y en un tramo de distancia, cuando cubre los metros prescritos, el tramo <b>pasa al
        siguiente por sí mismo</b> por el GPS — igual que en la muñeca. Si prefiere cerrarlo antes,{' '}
        <b>«Tramo hecho»</b> siempre está.
      </p>

      <DocNote variant="log" title="La auto-pausa no regala descanso">
        <p>
          En un tramo <b>a tiempo</b> o en una <b>recuperación cronometrada</b>, la auto-pausa está{' '}
          <b>desactivada</b> a propósito: ahí manda el reloj de la sesión, y congelarlo le regalaría
          un descanso que no prescribiste. Solo actúa donde tiene sentido — el rodaje continuo y los
          tramos por distancia.
        </p>
      </DocNote>

      <h3>3 · En la pantalla bloqueada y la Isla Dinámica</h3>
      <p>
        Puede guardar el móvil en el bolsillo: el rodaje sigue vivo en la <b>pantalla bloqueada</b> y
        en la <b>Isla Dinámica</b> del iPhone — ritmo, tramo, distancia, tiempo y su zona, de un
        vistazo y sin abrir la app. El GPS sigue grabando la traza en segundo plano. Si tu atleta
        tiene las Actividades en Directo desactivadas, no pasa nada: el rodaje no se ve afectado.
      </p>

      {/* La Isla Dinámica es siempre negra (chrome del iPhone) → texto claro fijo, no tokens de tema. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#000',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '18px',
          padding: '12px 16px',
          margin: '10px 0 2px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--v2-font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: '20px',
            color: 'var(--acc)',
            letterSpacing: '-0.01em',
          }}
        >
          4:03
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>/km</span>
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>Tramo 3/13</span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>4,1 km</span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>17:04</span>
        <span
          className="chip"
          style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          Z4
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '4px' }}>
        La Actividad en Directo, tal cual la ve en la pantalla bloqueada.
      </p>

      <h3>4 · La app le habla: avisos de voz</h3>
      <p>
        Sin mirar la pantalla, tu atleta <b>oye</b> lo que toca: la entrada de cada tramo con su
        objetivo, un empujón cuando se sale de ritmo, los <b>parciales por kilómetro</b> en un rodaje
        continuo, la cuenta atrás de los últimos segundos de un tramo a tiempo y el cierre del
        entreno. Habla en <b>español natural</b> y <b>sin ser pesada</b>: solo corrige si lleva rato
        fuera de banda, no repite el mismo aviso seguido, y si se juntan varias cosas, primero lo
        importante — el cambio de tramo manda sobre un ajuste de ritmo, y este sobre un parcial.
      </p>

      <div style={{ display: 'grid', gap: '6px', margin: '10px 0 2px' }}>
        <VozLine tag="Tramo" text="Tramo 3 de 13. 800 metros, ritmo 4 minutos." />
        <VozLine tag="Ritmo" text="Vas 15 segundos rápido." />
        <VozLine tag="Parcial" text="Kilómetro 3. 4 minutos 42 segundos." />
        <VozLine tag="Recuperar" text="Recuperación. Trote suave." />
      </div>

      <DocNote variant="cue" title="El interruptor lo tiene tu atleta">
        <p>
          Los <b>«Avisos de voz»</b> se activan en <b>Perfil</b> (vienen puestos de fábrica) y hay un{' '}
          <b>altavoz en la pantalla del entreno</b> para silenciarlos al vuelo sin salir. Funcionan
          en cualquier carrera, <b>fuera o en cinta</b>. Tú no configuras nada de esto.
        </p>
      </DocNote>

      <h3>5 · Y en la muñeca, sin móvil</h3>
      <p>
        Si prefiere no llevar el teléfono, tu atleta corre la <b>misma serie desde el reloj</b>: un
        tramo cada vez — «Tramo 3 de 13 · 800 m», el ritmo grande, la <b>banda del objetivo</b>{' '}
        coloreada dentro/fuera, la barra del tramo y una tira de su zona de pulso. Cuando se sale de
        ritmo, un <b>toque en la muñeca</b> se lo avisa; un tramo de distancia <b>se cierra solo</b> y
        con «Tramo hecho» lo pasa a mano. Lo mismo que ve en el móvil, en la muñeca.
      </p>

      <DocNote variant="cue" title="Tú no marcas nada">
        <p>
          Correr al aire libre, en cinta o en el reloj no cambia tu prescripción: la montas una vez en
          el <b>editor de carrera</b> y la ejecución vuelve a tu panel del mismo modo, lista para el{' '}
          <b>cumplimiento por tramo</b>.
        </p>
      </DocNote>
    </DocSection>
  );
}
