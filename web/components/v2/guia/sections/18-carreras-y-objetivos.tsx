// GUÍA · 18 Carreras y objetivos — área "Seguimiento". La carrera objetivo que
// ancla la periodización + el historial de resultados. Bridge: el atleta fija la
// carrera objetivo → tú la ves en su ficha y él ve la cuenta atrás en el móvil.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
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
          ancla la periodización, marca la cuenta atrás y ordena el resto del trabajo. Tu atleta la
          fija desde su app; aquí ves sus objetivos y consultas el historial de lo que ya ha corrido,
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
            En la pestaña <b>Carreras</b> de la ficha ves los objetivos que el atleta ha fijado en su
            app (cuenta atrás incluida). Las pasadas llegan solas cuando importa su historial de HYROX.
          </>
        }
        porque={
          <>
            Porque sin fecha no hay periodización: el plan se construye <b>hacia</b> algo. La cuenta
            atrás le da sentido a cada semana: para ti al programar y para tu atleta al entrenar.
          </>
        }
      />

      <h3>1 · La carrera que ancla el plan</h3>
      <p>
        Cuando el atleta fija su carrera objetivo, la cuenta atrás aparece en su ficha y en su móvil, y
        la periodización se ordena hacia esa fecha. Puede <b>cambiarla</b> o sumar carreras{' '}
        <b>intermedias</b> desde su app cuando el calendario cambie.
      </p>

      <h3>2 · El historial, sin inventar nada</h3>
      <p>
        Las <b>carreras pasadas</b> no se teclean a mano: llegan cuando tu atleta importa su historial
        oficial de HYROX (individuales y dobles). De cada una ves el <b>tiempo</b>, el{' '}
        <b>percentil</b> (top %), su puesto, y los <b>parciales</b> de carreras y estaciones. En
        dobles, los tiempos son del equipo, y así te lo decimos en claro.
      </p>

      <DocNote variant="log" title="Próximas y pasadas, separadas por el tiempo">
        <p>
          La pestaña <span className="k">Carreras</span> de la ficha tiene dos mitades:{' '}
          <b>Próximas · objetivos</b> con la cuenta atrás de lo que viene, y <b>Pasadas · resultados</b>{' '}
          con lo ya corrido. La misma estructura que ve tu atleta en su hub: nunca veis cosas
          distintas.
        </p>
      </DocNote>


      <MovilBand
        title="Su cuenta atrás, en su móvil"
        subtitle={
          <>
            En cuanto fijas la carrera, tu atleta la ve: la cuenta atrás en su inicio y, en su pestaña{' '}
            <b>Carreras</b>, el mismo hub de próximas y pasadas que tú, con los parciales de cada una.
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
