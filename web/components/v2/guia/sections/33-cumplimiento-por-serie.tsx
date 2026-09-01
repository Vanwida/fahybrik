// GUÍA · 33 Cumplimiento por serie — área "Carrera". En el detalle de una sesión
// ejecutada, el coach ve cada tramo prescrito contra lo que hizo el atleta, con un
// veredicto por tramo y el % de la sesión que cayó en banda. Verificado contra
// components/v2/atleta-detalle/SessionDetailDrawer.tsx (tile "Cumplimiento por
// tramo": {dentro} de {evaluable} en banda · más rápido/más lento · pct_dentro%;
// Prescrito vs Hecho por ejercicio; "sin registro" cuando no hay actual) y
// shared/domain/adherence/run-compliance.ts (veredictos: dentro="En banda",
// fuera_rapido="Más rápido", fuera_lento="Más lento", sin_dato="Sin dato";
// out-of-band = ámbar, señal no fallo; sin_dato no pinta chip; bordes de banda
// inclusivos; el veredicto usa la MISMA banda que resolvió la prescripción del
// atleta).

import { DocSection, QCWTriad, DocNote, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// Un veredicto por tramo, con el color que le toca (verde en banda, ámbar fuera,
// atenuado sin dato).
function Verdict({ kind }: { kind: 'dentro' | 'rapido' | 'lento' | 'sin' }) {
  const map = {
    dentro: { label: 'En banda', color: 'var(--ok)' },
    rapido: { label: 'Más rápido', color: 'var(--warn)' },
    lento: { label: 'Más lento', color: 'var(--warn)' },
    sin: { label: 'Sin dato', color: 'var(--faint)' },
  } as const;
  const v = map[kind];
  return (
    <span
      className="chip"
      style={{ color: v.color, borderColor: v.color, fontSize: '9.5px', padding: '2px 7px' }}
    >
      {v.label}
    </span>
  );
}

// Una fila prescrito/hecho de un tramo, con su veredicto.
function TramoRow({
  prescrito,
  hecho,
  verdict,
}: {
  prescrito: string;
  hecho?: string;
  verdict: 'dentro' | 'rapido' | 'lento' | 'sin';
}) {
  return (
    <div style={{ padding: '9px 2px', borderTop: '1px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <span
          style={{
            fontSize: '8.5px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            width: '54px',
            flexShrink: 0,
          }}
        >
          Prescrito
        </span>
        <span className="num" style={{ flex: 1, fontSize: '11px', color: 'var(--muted)' }}>
          {prescrito}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '8.5px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: hecho ? 'var(--ok)' : 'var(--muted)',
            width: '54px',
            flexShrink: 0,
          }}
        >
          Hecho
        </span>
        {hecho ? (
          <span className="num" style={{ flex: 1, fontSize: '11px', color: 'var(--fg)' }}>
            {hecho}
          </span>
        ) : (
          <span style={{ flex: 1, fontSize: '11px', color: 'var(--faint)' }}>sin registro</span>
        )}
        {hecho ? <Verdict kind={verdict} /> : null}
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
          Prescribir un ritmo por tramo solo sirve si luego puedes leer si se cumplió. En el detalle
          de una sesión ya hecha, cada tramo de carrera aparece <b>prescrito contra hecho</b> con un{' '}
          <b>veredicto</b> (en banda, más rápido, más lento) y arriba, el <b>% de la sesión</b> que
          cayó donde tocaba. Todo con la <b>misma banda</b> que vio tu atleta al correr.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>cumplimiento por tramo</b>: en la sesión ejecutada, cada tramo lleva su veredicto:{' '}
            <b>En banda</b>, <b>Más rápido</b>, <b>Más lento</b> o <b>Sin dato</b>, y una cabecera con{' '}
            <b>cuántos tramos</b> cayeron en banda y el <b>porcentaje</b> de la sesión.
          </>
        }
        como={
          <>
            No configuras nada: abres el <b>detalle del entreno</b> desde la ficha del atleta y ahí
            está. Cada tramo enseña lo <b>prescrito</b> junto a lo que <b>hizo de verdad</b>, y el
            veredicto sale de comparar los dos.
          </>
        }
        porque={
          <>
            Porque «lo hizo» no es lo mismo que «lo hizo como tocaba». Ver el ritmo real tramo a tramo
            te dice si <b>ajustar la banda</b>, si tu atleta <b>fue sobrado</b> o si <b>se pasó de
            frenada</b>, con datos, no con sensaciones.
          </>
        }
      />

      <h3>1 · El veredicto de cada tramo</h3>
      <p>
        Cada tramo con objetivo se juzga contra su banda: <b>En banda</b> (verde) si cayó dentro,{' '}
        <b>Más rápido</b> o <b>Más lento</b> (ámbar) si se salió por arriba o por abajo, y{' '}
        <b>Sin dato</b> cuando no hay con qué comparar (un tramo libre, o uno del que no llegó el
        ritmo). Los bordes de la banda <b>cuentan como dentro</b>: justo en el límite es En banda, no
        fuera.
      </p>

      <DocNote variant="cue" title="El ámbar es una señal, no un suspenso">
        <p>
          Salirse de la banda (por rápido o por lento) se pinta en <b>ámbar</b>, nunca en rojo: es{' '}
          <b>información para ti</b>, no una falta del atleta. A veces significa que tu banda iba corta
          y toca ampliarla; a veces, que el día pedía otra cosa. Tú decides qué hacer con la señal.
        </p>
      </DocNote>

      <h3>2 · La cabecera: cuánto de la sesión cayó en banda</h3>
      <p>
        Arriba del detalle, una línea resume la carrera entera: <b>cuántos tramos</b> de los
        evaluables cayeron en banda, cuántos se fueron <b>más rápido</b> y cuántos <b>más lento</b>, y
        un <b>porcentaje</b> con el color de la adherencia. Si la sesión no trae ritmo suficiente para
        juzgarla, lo dice tal cual: <b>«Sin datos de ritmo suficientes»</b>, en vez de inventarse un
        número.
      </p>

      {/* Dashboard mockup: el detalle de sesión con la cabecera de cumplimiento + tramos */}
      <DashboardMockup url="tu-panel / atletas / nora · detalle del entreno">
        <div className="wk-head" style={{ marginBottom: '12px' }}>
          <div className="wk-title">
            Series · pista&nbsp; <small>completada · 38 min</small>
          </div>
        </div>

        {/* Cabecera "Cumplimiento por tramo" */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '11px 13px',
            marginBottom: '13px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '3px',
              }}
            >
              Cumplimiento por tramo
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              9 de 12 tramos en banda · 2 más rápido · 1 más lento
            </div>
          </div>
          <span className="num2" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ok)' }}>
            75%
          </span>
        </div>

        {/* Un ejercicio con sus tramos prescrito/hecho + veredicto */}
        <div
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '2px',
          }}
        >
          Principal · 4 × 400 m
        </div>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '2px 13px 8px',
          }}
        >
          <TramoRow prescrito="400 m · 4:00/km" hecho="400 m · 3:58/km" verdict="dentro" />
          <TramoRow prescrito="400 m · 4:00/km" hecho="400 m · 3:49/km" verdict="rapido" />
          <TramoRow prescrito="400 m · 4:00/km" hecho="400 m · 4:12/km" verdict="lento" />
          <TramoRow prescrito="400 m · 4:00/km" verdict="sin" />
        </div>
      </DashboardMockup>

      <h3>3 · Los tramos sin registro no desaparecen</h3>
      <p>
        Si tu atleta no dejó datos de un tramo, el tramo <b>sigue ahí</b>: ves lo que estaba
        prescrito con un <b>«sin registro»</b> atenuado, nunca un número inventado para cuadrar. El
        hueco visible es más honesto que un dato de relleno, y te dice exactamente dónde falta
        captura.
      </p>

      <DocNote variant="log" title="La misma banda que vio tu atleta">
        <p>
          El veredicto no usa una vara distinta a la del atleta: es <b>la misma banda</b> que su app
          resolvió a partir de tu prescripción cuando corrió. Lo que él vio en vivo y lo que tú lees
          después <b>coinciden</b>: no hay dos criterios.
        </p>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Así se cierra el círculo de la carrera: la <b>prescribes</b> tramo a tramo, tu atleta la{' '}
        <b>corre</b>, y aquí la <b>lees</b> con el mismo rasero. Sin frases sueltas, sin números
        inventados: solo lo prescrito contra lo hecho, y qué hacer con la diferencia.
      </p>
    </DocSection>
  );
}
