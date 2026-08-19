// GUÍA · 27 Lesiones — área "Ciclo de vida". Cuando tu atleta se lesiona lo
// registras, se ve de un vistazo en el roster (badge) y adaptas su plan sin que
// esos días cuenten como fallo. Verificado contra lib/injuries/injuries.ts,
// shared/schema/injuries.ts, shared/domain/coach/injury-taxonomy.ts,
// injury-presentation.ts, InjuryPanel.tsx, use-injuries.ts y las rutas
// app/api/coach/athletes/[id]/injuries + app/api/athlete/injuries.
//
// Lado atleta (HONESTO): los endpoints /api/athlete/injuries (auto-parte, lectura y
// actualización) EXISTEN, pero la pantalla dentro de la app iOS aún no está — hoy
// registra el coach desde la ficha. Se refleja tal cual en el MovilBand.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

// Live v2 status hues (never drift from the app tokens).
const TONE = {
  ok: 'var(--v2-ok)',
  warn: 'var(--v2-warn)',
  danger: 'var(--v2-danger)',
} as const;

/** A roster row with an at-a-glance injury badge (open episodes only). */
function RosterRow({
  initial,
  name,
  sub,
  badge,
  color,
}: {
  initial: string;
  name: string;
  sub: string;
  badge?: string;
  color?: string;
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
          fontWeight: 800,
          fontSize: '10px',
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: '9.5px', color: 'var(--faint)' }}>{sub}</div>
      </div>
      {badge ? (
        <span className="chip" style={{ marginLeft: 'auto', color, borderColor: color }}>
          {badge}
        </span>
      ) : (
        <span className="chip" style={{ marginLeft: 'auto', color: 'var(--faint)' }}>
          Sin novedades
        </span>
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
          Cuando tu atleta se lesiona, lo <b>registras</b>, se ve <b>de un vistazo en tu roster</b> y{' '}
          <b>adaptas su plan sin perder el hilo</b>. Cada episodio es una ficha propia con su
          evolución, y los días de reposo o las sesiones adaptadas <b>no cuentan como fallo</b>.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una <b>lesión</b> es un episodio con su ficha: <b>zona</b>, <b>tipo</b>, <b>gravedad</b> (
            leve · moderada · severa) y <b>estado</b> (activa · en recuperación · resuelta), con la
            fecha de inicio y un <b>timeline</b> de evolución.
          </>
        }
        como={
          <>
            La registras tú o el atleta desde la ficha (<b>Registrar</b>). Mueves su estado según se
            recupera, <b>adaptas sesiones</b> y (si es severa o larga) <b>pausas el plan</b>. Todo
            queda en el mismo panel.
          </>
        }
        porque={
          <>
            Porque una lesión bien llevada no debe ensuciar sus métricas ni perderse de vista. El{' '}
            <b>badge en el roster</b> te dice quién está tocado sin abrir nada, y la adherencia deja de
            castigar lo que no dependía de él.
          </>
        }
      />

      <h3>1 · La ficha de la lesión</h3>
      <p>
        Cada episodio guarda <b>zona</b> (taxonomía canónica: rodilla, tobillo/pie, lumbar, isquios…),
        un <b>tipo</b> libre (p. ej. <em className="em">tendinitis rotuliana</em>), <b>gravedad</b>{' '}
        <code>leve · moderada · severa</code>, <b>estado</b> <code>activa · en recuperación · resuelta</code>,
        la <b>fecha de inicio</b> y un <b>retorno estimado</b> opcional. Cada cambio deja una entrada en
        el <b>timeline</b>, así que la evolución se lee de arriba abajo.
      </p>

      <h3>2 · El badge en el roster</h3>
      <p>
        Mientras una lesión esté <b>abierta</b>, el atleta lleva un badge en tu roster:{' '}
        <b style={{ color: TONE.danger }}>Lesión · Rodilla</b> si está activa,{' '}
        <b style={{ color: TONE.warn }}>En retorno · Isquios</b> si está en recuperación. Cuando la
        marcas <b>resuelta</b>, el badge desaparece y el episodio pasa al histórico, nada se borra.
      </p>

      {/* Dashboard mockup: la ficha con el InjuryPanel + el roster con el badge */}
      <DashboardMockup url="tu-panel / atletas / marc · lesiones">
        {/* Panel Lesiones */}
        <div className="wk-head">
          <div className="wk-title">Lesiones</div>
          <div className="wk-tools">
            <span className="btn">+ Registrar</span>
          </div>
        </div>

        {/* Tarjeta de lesión abierta */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderLeft: `3px solid ${TONE.danger}`,
            borderRadius: '10px',
            padding: '12px 13px',
            marginTop: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>
              Rodilla · tendinitis rotuliana
            </span>
            <span
              className="chip"
              style={{ background: 'var(--dngSoft)', color: TONE.danger, borderColor: 'transparent' }}
            >
              Activa
            </span>
            <span className="chip" style={{ color: TONE.warn, borderColor: TONE.warn }}>
              Moderada
            </span>
          </div>
          <div className="num2" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>
            Moderada · desde hace 8 d · retorno est. 17 jul
          </div>

          {/* Timeline */}
          <div
            style={{
              borderLeft: '1px solid var(--hair2)',
              paddingLeft: '12px',
              marginTop: '11px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span className="num2" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--faint)' }}>
                  3 jul · Atleta
                </span>
                <span className="chip" style={{ color: 'var(--muted)', fontSize: '9px' }}>
                  registrada
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Molestia en la rodilla al correr en bajada.
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span className="num2" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--faint)' }}>
                  5 jul · Coach
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Reposo de impacto una semana; cambiamos carrera por remo.
              </div>
            </div>
          </div>

          {/* Acciones del panel */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
            <span className="btn" style={{ color: TONE.warn }}>
              En recuperación
            </span>
            <span className="btn" style={{ color: TONE.ok }}>
              Marcar alta
            </span>
            <span className="btn">Añadir evolución</span>
            <span className="btn pri">Adaptar sesiones</span>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--faint)',
              marginTop: '10px',
              paddingTop: '9px',
              borderTop: '1px solid var(--hair)',
            }}
          >
            Las sesiones adaptadas no cuentan como fallo de adherencia.
          </div>
        </div>

        {/* El roster, con el badge de un vistazo */}
        <div
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            margin: '16px 0 8px',
          }}
        >
          En tu roster
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <RosterRow
            initial="M"
            name="Marc Vidal"
            sub="N3 · 4 días"
            badge="Lesión · Rodilla"
            color={TONE.danger}
          />
          <RosterRow
            initial="J"
            name="Júlia Roca"
            sub="N2 · 3 días"
            badge="En retorno · Isquios"
            color={TONE.warn}
          />
          <RosterRow initial="L" name="Leo Mas" sub="N3 · 5 días" />
        </div>
      </DashboardMockup>

      <DocNote variant="log" title="El badge sale solo, y el histórico se queda">
        <ul>
          <li>
            Solo las lesiones <span className="k">abiertas</span> muestran badge:{' '}
            <span className="k">Lesión · zona</span> (activa) o <span className="k">En retorno · zona</span>{' '}
            (en recuperación). Al marcarla <span className="k">resuelta</span>, el badge se va.
          </li>
          <li>
            Nada se borra: la lesión resuelta pasa al <span className="k">histórico</span> de la ficha,
            con su rango de fechas y su gravedad.
          </li>
        </ul>
      </DocNote>

      <DocNote variant="cue" title="Adaptar sesiones sin castigar la adherencia">
        <ul>
          <li>
            <span className="k">Reposo</span> → ese día se <b>excluye</b> del cálculo (igual que una
            pausa). <span className="k">Sustituida</span> por rehab y <span className="k">suavizada</span>{' '}
            siguen contando por lo que el atleta ejecuta. Nunca se marca como fallo.
          </li>
          <li>
            Si la lesión es <span className="k">severa</span> o el retorno queda lejos (más de 21 días),
            aparece <span className="k">Pausar plan</span>, que la enlaza con una pausa completa (ver{' '}
            <b>Pausas y bajas</b>).
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Del lado del atleta"
        subtitle={
          <>
            Hoy la lesión la <b>registras tú</b> desde la ficha (el atleta ya declara sus molestias en
            el onboarding). El <b>auto-parte desde la app</b> (que el propio atleta abra el episodio) ya
            tiene su backend listo; la pantalla dentro de la app llega muy pronto.
          </>
        }
      >
        <DocNote variant="cue" title="El parte desde la app llega pronto">
          <ul>
            <li>
              Los endpoints del atleta (<code>reportar</code>, <code>leer</code> y{' '}
              <code>actualizar</code> su propia lesión) ya están operativos; falta la{' '}
              <span className="k">pantalla en iOS</span>, que se activa próximamente.
            </li>
            <li>
              Lo que el atleta <b>sí ve hoy</b>: si una lesión severa congela su plan, aparece la
              tarjeta <span className="k">«Tu plan está en pausa»</span> (ver <b>Pausas y bajas</b>),
              sin sesiones caducadas y con su progreso guardado.
            </li>
          </ul>
        </DocNote>
      </MovilBand>
    </DocSection>
  );
}
