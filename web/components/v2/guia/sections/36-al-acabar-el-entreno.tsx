// GUÍA · 36 Al acabar el entreno — área "Carrera". Qué pasa cuando el atleta cierra
// un entreno: la app le detecta los récords personales CORRIENDO (1k/3k/5k) con una
// celebración y una tarjeta compartible, y le recoge el feedback que te llega a TI —
// cómo ha ido vs lo prescrito y una molestia física —, que ves en la actividad del
// día, en el deep-dive y en el detalle de la sesión; una molestia levanta una señal
// «Vigilar» para que no se pierda. Verificado contra:
//   ios/FAHYBRIK/Workout/PostWorkout/PersonalRecord.swift
//     (prs: run_1k = ritmo s/km, run_3k/run_5k = tiempo total; primera marca vs mejora;
//      headline "Tu 5 km más rápido corriendo" / "Tu primera marca de 3 km corriendo";
//      SIEMPRE marca corriendo, nunca un test)
//   ios/FAHYBRIK/Workout/PostWorkout/PRCelebrationView.swift
//     (celebración oro sobre oscuro, medalla "PR", ShareLink; WorkoutShareCard: wordmark,
//      badge "PR · 5 km", tiempo grande, RITMO/ZONA/RPE, fahybrid.com — solo muestra lo real)
//   ios/FAHYBRIK/Workout/PostWorkout/SessionFeedbackCard.swift
//     ("Cómo ha ido" · "Le llega a tu coach"; dificultad Fácil de más/Como debía/Duro de
//      más = perceived_difficulty; "Molestia física" → PainArea + nota corta ≤500; SOLO
//      en sesión prescrita)
//   web/lib/dashboard/coach/activity-today.ts
//     (glance "Actividad de hoy": atleta · sesión · resultado + perceived_difficulty +
//      pain_area + pain_note; la banda de adherencia es no_detail hoy — no la afirmamos)
//   web/lib/coach/attention/evaluators/biometric.ts (discomfortReportedEvaluator:
//     severity 'warning' = tier Vigilar; label "Molestia · <área>"; dentro de la ventana
//     discomfort_recent_days) + shared/domain/coach/signals.ts (tiers Crítico → Vigilar)
//   ios/FAHYBRIK/Profile/AppFeedbackSheet.swift + web/app/api/athlete/app-feedback/route.ts
//     (buzón "Enviar sugerencia o error" → equipo del producto, hello@fahybrid.com; NO al
//      coach. OJO: el copy iOS dice "le llega a tu coach" — contradice al backend, flageado)

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// El oro de la celebración es fijo (un momento nocturno), no sale de los tokens.
const GOLD = '#EDC96B';
const GOLD_DEEP = '#C79A3D';

// Un chip de "Cómo ha ido" — la píldora del feedback del atleta (seleccionado = naranja).
function FeedbackPill({ label, selected, tone }: { label: string; selected?: boolean; tone?: string }) {
  const fill = tone ?? 'var(--acc)';
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: selected ? 700 : 500,
        color: selected ? 'var(--accOn)' : 'var(--fg)',
        background: selected ? fill : 'var(--surface)',
        border: `1px solid ${selected ? 'transparent' : 'var(--hair)'}`,
        borderRadius: '999px',
        padding: '5px 11px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// Una fila del glance "Actividad de hoy" del panel: atleta · sesión · resultado, con
// el feedback del atleta y, si reportó molestia, la señal Vigilar.
function ActivityRow({
  initial,
  name,
  session,
  result,
  difficulty,
  molestia,
}: {
  initial: string;
  name: string;
  session: string;
  result: string;
  difficulty: string;
  molestia?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderRadius: '9px',
        padding: '9px 11px',
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: 'var(--accSoft)',
          color: 'var(--acc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{name}</div>
        <div className="num" style={{ fontSize: '10px', color: 'var(--muted)' }}>
          {session} · {result}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <span
          className="chip"
          style={{ fontSize: '9px', color: 'var(--warn)', borderColor: 'var(--warn)' }}
        >
          {difficulty}
        </span>
        {molestia ? (
          <span
            className="chip"
            style={{ fontSize: '9px', color: 'var(--v2-danger)', borderColor: 'var(--v2-danger)' }}
          >
            Vigilar · {molestia}
          </span>
        ) : null}
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
          Cerrar el entreno no es el final: la app le <b>celebra los récords corriendo</b> y le
          recoge, en dos toques, <b>cómo ha ido</b> y si algo le <b>molesta</b>. Eso último no se
          queda en su móvil — <b>te llega a ti</b>, con una <b>molestia</b> marcada para que no se te
          pase.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>cierre premium</b> de una sesión: <b>récords personales corriendo</b> (1, 3 y 5 km)
            con celebración y <b>tarjeta compartible</b>, y un <b>feedback opcional</b> del atleta
            que viaja contigo.
          </>
        }
        como={
          <>
            Al guardar, si batió una marca la ve en grande y puede compartirla. Marca <b>cómo ha
            ido</b> frente a lo prescrito y, si toca, una <b>molestia</b> con su zona y una nota
            corta.
          </>
        }
        porque={
          <>
            Porque un récord bien celebrado engancha, y una molestia dicha a tiempo te deja{' '}
            <b>ajustar antes</b> de que sea lesión. El cierre te devuelve <b>señal</b>, no solo un
            «completado».
          </>
        }
      />

      <h3>1 · Los récords, al cerrar</h3>
      <p>
        Si el atleta ha corrido su <b>1, 3 o 5 km más rápido</b> hasta la fecha, la app lo detecta al
        sincronizar y se lo celebra antes de cerrar. Es siempre una <b>marca corriendo</b> —{' '}
        <i>no</i> el test de 5&nbsp;km, que es otra cosa: el 1&nbsp;km es su ritmo por kilómetro; el 3
        y el 5, el tiempo total. Le dice cuánto ha <b>recortado</b> sobre su marca anterior, o que es
        su <b>primera vez</b>. Y puede <b>compartir</b> una tarjeta con su tiempo, ritmo y zona.
      </p>

      <MovilBand
        title="El récord, en su móvil"
        subtitle={
          <>
            Su marca en grande, cuánto ha mejorado y un botón para <b>compartir</b> la tarjeta — todo
            lo que enseña es <b>real</b>, nada inventado.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>La celebración del récord.</b> «Tu 5 km más rápido corriendo», con lo que recortó y
              el botón de compartir.
            </>
          }
        >
          <div style={{ padding: '18px 6px 6px', textAlign: 'center' }}>
            {/* Medalla PR */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                margin: '0 auto 14px',
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DEEP})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 20px ${GOLD_DEEP}66`,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--v2-font-display)',
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: '22px',
                  color: 'rgba(0,0,0,0.72)',
                }}
              >
                PR
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--v2-font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '22px',
                color: 'var(--fg)',
              }}
            >
              ¡Nuevo récord!
            </div>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: GOLD,
                marginTop: '2px',
                marginBottom: '14px',
              }}
            >
              Récord personal
            </div>

            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Tu 5 km más rápido corriendo</div>
            <div
              className="num2"
              style={{ fontSize: '42px', fontWeight: 900, color: 'var(--fg)', lineHeight: 1.1 }}
            >
              21:48
            </div>
            <div style={{ fontSize: '11px', color: GOLD, marginBottom: '16px' }}>
              14 s más rápido que tu marca anterior
            </div>

            <div
              style={{
                height: '44px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DEEP})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                color: 'rgba(0,0,0,0.78)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '14px',
              }}
            >
              ↑ Compartir
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>2 · «Cómo ha ido»: te llega a ti</h3>
      <p>
        Junto al RPE, tu atleta marca en un toque <b>cómo le ha ido frente a lo que le pusiste</b> —{' '}
        <i>fácil de más</i>, <i>como debía</i> o <i>duro de más</i> — y, si algo le molesta, abre{' '}
        <b>«Molestia física»</b>, elige la <b>zona</b> (rodilla, tobillo, cadera, espalda, hombro u
        otra) y añade una <b>nota corta</b>. Todo es <b>opcional</b> y solo aparece en sesiones que{' '}
        <b>tú prescribiste</b> (una sesión libre no tiene contra qué compararse). Viaja en el mismo
        guardado del entreno.
      </p>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hair)',
          borderRadius: '12px',
          padding: '12px 14px',
          margin: '10px 0 2px',
        }}
      >
        <div
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          Cómo ha ido
        </div>
        <div style={{ fontSize: '11px', color: 'var(--faint)', marginBottom: '10px' }}>
          Le llega a tu coach.
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <FeedbackPill label="Fácil de más" />
          <FeedbackPill label="Como debía" />
          <FeedbackPill label="Duro de más" selected tone="var(--warn)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--acc)' }}>− Molestia física</span>
          <FeedbackPill label="Rodilla" selected tone="var(--v2-danger)" />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>«Pinchazo en la bajada»</span>
        </div>
      </div>

      <h3>3 · Dónde lo ves</h3>
      <p>
        Ese feedback te espera en tres sitios que ya usas: en <b>«Actividad de hoy»</b> (el vistazo de
        lo que ha entrenado tu gente), en el <b>deep-dive</b> del atleta y en el <b>detalle de la
        sesión</b>. Y hay una diferencia clave: una <b>molestia</b> no se queda como un dato pasivo —
        levanta una señal <b>«Vigilar»</b> en tu cola, con la zona y la nota, para que la veas aunque
        no abras la ficha.
      </p>

      <DashboardMockup url="tu-panel / hoy / actividad de hoy">
        <div style={{ display: 'grid', gap: '8px', padding: '2px' }}>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Actividad de hoy
          </div>
          <ActivityRow
            initial="M"
            name="Marta R."
            session="Intervalos · 13×800"
            result="42 min · RPE 8"
            difficulty="Duro de más"
            molestia="Molestia · Rodilla"
          />
          <ActivityRow
            initial="J"
            name="Jordi P."
            session="Rodaje Z2"
            result="55 min · RPE 5"
            difficulty="Como debía"
          />
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="No confundas «Cómo ha ido» con el buzón de la app">
        <p>
          El <b>«Cómo ha ido»</b> del entreno (dificultad y molestia) <b>te llega a ti</b>, el coach.
          Distinto es el <b>buzón de la app</b>: en <b>Perfil → «Enviar sugerencia o error»</b> tu
          atleta nos escribe a <b>nosotros</b> (el equipo de la app) para pedir una mejora o avisar de
          un fallo del propio software — eso <b>no pasa por ti</b>, lo llevamos nosotros.
        </p>
      </DocNote>
    </DocSection>
  );
}
