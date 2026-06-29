// GUÍA · 18 Carreras y objetivos — área "Seguimiento". La carrera objetivo que
// ancla la periodización + el historial de resultados. Bridge: tú fijas la carrera
// objetivo → el atleta ve la cuenta atrás y su hub de carreras en el móvil.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Todo plan necesita un <b>para qué</b>. La <b>carrera objetivo</b> es esa fecha: la que
          ancla la periodización, marca la cuenta atrás y ordena el resto del trabajo. Aquí la fijas,
          añades carreras intermedias, y consultas el historial de lo que tu atleta ya ha corrido —
          con sus tiempos, su percentil y sus parciales.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Una <b>carrera objetivo</b> (la principal) más, si quieres, carreras <b>secundarias</b> e{' '}
            <b>intermedias</b>. Cada una con su fecha, su categoría y un tiempo objetivo opcional. Y
            un historial de <b>carreras pasadas</b> ya disputadas.
          </>
        }
        como={
          <>
            En la ficha del atleta, <b>Fijar carrera objetivo</b> te deja buscarla y fijarla. Quitas
            un objetivo con una confirmación. Las pasadas llegan solas cuando tu atleta importa su
            historial de HYROX.
          </>
        }
        porque={
          <>
            Porque sin fecha no hay periodización: el plan se construye <b>hacia</b> algo. La cuenta
            atrás le da sentido a cada semana — para ti al programar y para tu atleta al entrenar.
          </>
        }
      />

      <h3>1 · La carrera que ancla el plan</h3>
      <p>
        Al fijar la carrera objetivo le das un destino al plan: la cuenta atrás aparece en su ficha y
        en su móvil, y la periodización se ordena hacia esa fecha. Puedes <b>cambiarla</b> cuando el
        calendario cambie, y sumar carreras <b>intermedias</b> que sirvan de ensayo en el camino.
      </p>

      <h3>2 · El historial, sin inventar nada</h3>
      <p>
        Las <b>carreras pasadas</b> no se teclean a mano: llegan cuando tu atleta importa su historial
        oficial de HYROX —individuales y dobles—. De cada una ves el <b>tiempo</b>, el{' '}
        <b>percentil</b> (top %), su puesto, y los <b>parciales</b> de carreras y estaciones. En
        dobles, los tiempos son del equipo, y así te lo decimos en claro.
      </p>

      <DocNote variant="log" title="Próximas y pasadas, separadas por el tiempo">
        <p>
          La pestaña <span className="k">Carreras</span> de la ficha tiene dos mitades:{' '}
          <b>Próximas · objetivos</b> con la cuenta atrás de lo que viene, y <b>Pasadas · resultados</b>{' '}
          con lo ya corrido. La misma estructura que ve tu atleta en su hub — nunca veis cosas
          distintas.
        </p>
      </DocNote>

      {/* Dashboard mockup: la pestaña Carreras del coach */}
      <DashboardMockup url="tu-panel / atletas / marc · carreras">
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '10px',
          }}
        >
          Próximas · objetivos
        </div>
        <div
          style={{
            position: 'relative',
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '11px',
            padding: '14px 16px',
            marginBottom: '18px',
            maxWidth: '320px',
            overflow: 'hidden',
          }}
        >
          <span className="topbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--acc)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc)' }}>
              Próxima carrera
            </span>
            <span className="chip" style={{ color: 'var(--acc)', borderColor: 'var(--acc)' }}>
              Objetivo
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
            <span className="num2" style={{ fontSize: '30px', fontWeight: 800, color: 'var(--acc)', lineHeight: 1 }}>
              26
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>días</span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>HYROX Barcelona</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Individual · Pro · Masculino</div>
          <div className="num2" style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '5px', fontWeight: 700 }}>
            ◎ Objetivo 1:05:00
          </div>
        </div>

        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '10px',
          }}
        >
          Pasadas · resultados
        </div>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '11px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)' }}>HYROX Valencia</span>
              <span className="chip">Individual</span>
            </div>
            <div className="num2" style={{ fontSize: '10px', color: 'var(--faint)', marginTop: '2px' }}>
              18 nov · Pro · Masculino
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>↓ Ver splits</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num2" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)' }}>1:08:42</div>
            <div className="num2" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--acc)' }}>Top 12%</div>
            <div className="num2" style={{ fontSize: '10px', color: 'var(--faint)' }}>#84 de 712</div>
          </div>
        </div>
      </DashboardMockup>

      <MovilBand
        title="Su cuenta atrás, en su móvil"
        subtitle={
          <>
            En cuanto fijas la carrera, tu atleta la ve: la cuenta atrás en su inicio y, en su pestaña{' '}
            <b>Carreras</b>, el mismo hub de próximas y pasadas que tú — con los parciales de cada una.
          </>
        }
      >
        {/* PHONE: hub de carreras del atleta */}
        <PhoneMockup
          caption={
            <>
              <b>Sus carreras.</b> La objetivo arriba con su cuenta atrás; debajo, lo ya corrido con
              tiempo y percentil. Mismo dato que tu ficha.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '6px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Carreras
            </div>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
              </svg>
            </div>
          </div>

          <div className="hero">
            <div className="row">
              <span className="slot">OBJETIVO</span>
              <span className="hk">Tu próxima carrera</span>
            </div>
            <div className="ht">HYROX Barcelona</div>
            <div className="meta num">Individual · Pro · ◎ 1:05:00</div>
            <div
              className="num"
              style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '2px' }}
            >
              <span style={{ fontSize: '30px', fontWeight: 800, color: 'var(--acc)', lineHeight: 1 }}>26</span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>días</span>
            </div>
          </div>

          <div className="lbl" style={{ margin: '4px 0 8px' }}>
            Pasadas
          </div>
          <div className="row-card">
            <div className="ca">
              <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', stroke: 'var(--muted)', fill: 'none', strokeWidth: 1.7 }}>
                <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
              </svg>
            </div>
            <div className="tx">
              <div className="e">HYROX Valencia</div>
              <div className="m">1:08:42 · Top 12%</div>
            </div>
            <div className="chev">›</div>
          </div>
          <div className="row-card">
            <div className="ca">
              <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', stroke: 'var(--muted)', fill: 'none', strokeWidth: 1.7 }}>
                <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
              </svg>
            </div>
            <div className="tx">
              <div className="e">HYROX Madrid · Dobles</div>
              <div className="m">1:14:05 · equipo</div>
            </div>
            <div className="chev">›</div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        La carrera fija el rumbo; los resultados pasados dicen de dónde sale. La última sección une
        ambos en el tiempo: cómo <b>progresa</b> tu atleta tests y marcas.
      </p>
    </DocSection>
  );
}
