// GUÍA · Rendimiento — la pestaña Rendimiento de la ficha: una sola página
// ordenada por preguntas (Zonas y tests · Running con tiempo en zonas y carga
// CTL/ATL/TSB · Fuerza · Fisiología · Carreras), secciones vacías en una línea, y
// «Evaluar semana» (en el ··· de cada semana del Plan): el sistema propone, tú
// apruebas. El puente: cuando repite un test en el móvil.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Chips } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          ¿Está mejorando, y lo tolera bien? La pestaña <b>Rendimiento</b> de su ficha responde en una
          sola página, ordenada por preguntas. Lo que todavía no tiene datos se queda en una línea
          que dice qué falta y de dónde llegará, nunca en una gráfica vacía.
        </>
      }
    >
      <PanelFigure caption={<>Los chips de arriba saltan a cada sección.</>}>
        <Chips
          items={[
            { label: 'Zonas y tests' },
            { label: 'Running' },
            { label: 'Fuerza' },
            { label: 'Fisiología' },
            { label: 'Carreras' },
          ]}
        />
      </PanelFigure>

      <h3>Zonas y tests</h3>
      <p>
        Sus zonas y de qué test salen, sus tests con fecha y resultado, y dos acciones:{' '}
        <b>Apuntar un resultado</b> y <b>Programar test</b> (ver <b>Tests</b>). Sin test, dice «sin
        zonas todavía» y de dónde saldrían.
      </p>

      <h3>Running y carga</h3>
      <p>
        Sus carreras de las últimas semanas y el <b>tiempo en zonas</b> (3 meses, 6 meses o un año;
        todo o por modalidad; <b>Comparar</b> dos periodos). Si no tiene umbral, te avisa y enlaza a
        programarle el test: sin umbral no hay zonas donde repartir.
      </p>
      <p>
        La <b>carga</b> resume toda la actividad registrada en cuatro números, cada uno con su frase:{' '}
        <b>Fitness · CTL</b> (lo que aguanta de normal, 42 días), <b>Fatiga · ATL</b> (lo que ha
        metido estos días, 7 días), <b>Forma · TSB</b> (fitness menos fatiga; negativo es cargado) y{' '}
        <b>ACWR</b> (fatiga entre fitness; por encima de 1 sube más de lo habitual), con la curva de
        los últimos 90 días.
      </p>

      <h3>Fuerza, fisiología y carreras</h3>
      <ul className="clean">
        <li>
          <b>Fuerza</b>: sus 1RM por levantamiento y sus tests cronometrados.
        </li>
        <li>
          <b>Fisiología</b>: VFC, pulso en reposo, sueño y VO₂ máx estimado con su tendencia, cuando
          conecta su reloj o hace sus check-ins.
        </li>
        <li>
          <b>Carreras</b>: las próximas (objetivos, con cuenta atrás) y las pasadas con su resultado
          (ver <b>Carreras y objetivos</b>).
        </li>
      </ul>

      <MovilBand
        title="Cuando repite un test, en su móvil"
        subtitle={
          <>
            La progresión no la tecleas tú: nace cuando tu atleta <b>repite un test</b> y registra su
            marca. Ese número pasa a su pestaña Rendimiento y a tus marcadores.
          </>
        }
      >
        {/* PHONE: athlete logging a test result */}
        <PhoneMockup
          caption={
            <>
              <b>Su nueva marca.</b> Tu atleta repite el test y registra el resultado. Mejora sobre la
              anterior, y así lo ves tú.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </div>
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Test · 5 km
            </div>
            <div className="stg done" style={{ width: '24px', height: '24px', fontSize: '13px' }}>
              ✓
            </div>
          </div>
          <div className="num" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            Test de referencia · ritmo
          </div>

          <div className="logcard">
            <div className="lh">Tu resultado</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="fl">Tiempo en 5 km</span>
              <span className="fv num" style={{ color: 'var(--ok)' }}>20:18</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Frente a tu última marca</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="fl">Anterior · 21:40</span>
              <span className="fv num" style={{ color: 'var(--ok)', fontSize: '13px' }}>−1:22 ▾</span>
            </div>
          </div>
          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Notas</div>
            <div style={{ fontSize: '11px', color: 'var(--fg)' }}>
              Salí algo rápido pero aguanté bien el último km.
            </div>
          </div>
          <div className="cta">Guardar marca</div>
        </PhoneMockup>
      </MovilBand>

      <h3>Evaluar semana: el sistema propone, tú decides</h3>
      <p>
        En la pestaña Plan, el <b>···</b> de cada semana tiene <b>Evaluar semana</b>. El sistema mira
        esa semana y <b>propone</b>: un veredicto (<em className="em">Requiere ajuste</em> o{' '}
        <em className="em">Semana correcta</em>), una recomendación y los <b>disparadores</b> que lo
        motivan, con sus números reales y los cambios concretos que haría. Tú <b>Apruebas</b> o{' '}
        <b>Rechazas</b>: nada se aplica solo. Una semana correcta se cierra sin tocar el plan.
      </p>

      <DocNote variant="log" title="Sin datos, lo decimos; no lo rellenamos">
        <p>
          Si tu atleta aún no ha repetido tests o no sincroniza el reloj, cada sección lo dice en una
          línea. Un hueco visible vale más que un número inventado.
        </p>
      </DocNote>
    </DocSection>
  );
}
