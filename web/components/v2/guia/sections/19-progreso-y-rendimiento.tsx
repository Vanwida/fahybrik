// GUÍA · 19 Progreso y rendimiento — área "Seguimiento". La progresión de tests y
// marcas en el tiempo (Antes → Ahora → Δ) + las señales del reloj. Bridge: el
// atleta repite un test en el móvil → su nueva marca alimenta tu progresión.

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
          Aquí cierra el círculo: ¿está mejorando? El <b>histórico</b> de tu atleta compara su primer
          test con el más reciente y te enseña el salto (en kilos, en tiempo, en lo que mida cada
          test). Y la <b>biometría</b> del reloj te dice si ese progreso lo tolera bien o le está
          pasando factura.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            La <b>progresión de tests</b>: cada test repetido en una fila (<b>Antes → Ahora → Δ</b>)
            con el salto en verde si mejora y en rojo si retrocede. Más la biometría de fondo (VFC,
            sueño, FC en reposo) y los programas ya completados.
          </>
        }
        como={
          <>
            No rellenas nada: la progresión se construye sola cuando tu atleta <b>repite un test</b> y
            registra su resultado. Tú la lees en la pestaña <b>Histórico</b> de su ficha.
          </>
        }
        porque={
          <>
            Porque las sensaciones engañan y los números no. Ver el progreso real (y la carga que lo
            sostiene) es lo que te deja decidir cuándo apretar, cuándo soltar y qué funcionó.
          </>
        }
      />

      <h3>1 · Mejorar, en números honestos</h3>
      <p>
        La progresión necesita al menos <b>dos tomas</b> del mismo test: compara la primera con la
        última y te muestra la diferencia. Mientras solo haya una, te lo dice en claro: nunca se
        inventa un avance. Y son tests <b>de verdad</b> (una fuerza máxima, un tiempo de referencia),
        no parciales sueltos de un entreno leídos como si fueran una marca.
      </p>

      <h3>2 · El cuerpo detrás del número</h3>
      <p>
        Junto al rendimiento, la <b>biometría</b> resume lo que llega del reloj: variabilidad
        cardíaca, frecuencia en reposo, sueño y peso, con su tendencia de 30 días. Si aparecen señales
        a vigilar (caídas de VFC, pulso en reposo al alza) te lo avisa, para que el progreso no se
        convierta en sobrecarga.
      </p>
      <p>
        Esa misma carga la ve tu atleta en su móvil, en dos lecturas honestas y sin tecnicismos:{' '}
        <b>Forma</b> (si llega fresco o cargado, la frescura que resulta de cruzar la condición que ha
        construido con la fatiga reciente) y <b>Carga semanal</b>: cuánto ha entrenado cada semana
        según duración y esfuerzo (RPE). Es el <em className="em">mismo motor de carga</em> que tú
        lees; si aún no anota el esfuerzo de sus entrenos, se lo decimos en claro en vez de inventar
        una cifra.
      </p>

      <DocNote variant="log" title="Sin datos, lo decimos; no lo rellenamos">
        <p>
          Si tu atleta aún no ha repetido tests o no sincroniza el reloj, verás estados honestos{' '}
          (<span className="k">Aún sin tests repetidos</span>, <span className="k">Sin señales todavía</span>)
          en lugar de gráficos vacíos o cifras de relleno. El hueco visible vale más que un dato
          falso.
        </p>
      </DocNote>


      <MovilBand
        title="Cuando repite un test, en su móvil"
        subtitle={
          <>
            La progresión no la tecleas tú: nace cuando tu atleta <b>repite un test</b> y registra su
            marca. Ese número se convierte en el nuevo <em className="em">Ahora</em> de tu tabla.
          </>
        }
      >
        {/* PHONE: athlete logging a test result */}
        <PhoneMockup
          caption={
            <>
              <b>Su nueva marca.</b> Tu atleta repite el test y registra el resultado. Mejora sobre la
              anterior, y eso alimenta tu progresión.
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

      <h3>3 · La pestaña Rendimiento: el diagnóstico completo</h3>
      <p>
        Junto al <b>Histórico</b>, su ficha tiene la pestaña <b>Rendimiento</b>: el diagnóstico
        entero, que se carga <b>bajo demanda</b> al entrar. Reúne paneles de <b>diagnóstico</b>{' '}
        (readiness compuesta, polarización 80/0/20, mejores tiempos por ejercicio) y de{' '}
        <b>fisiología</b> (economía de carrera, umbral de lactato, capacidad anaeróbica, predicción
        HYROX). Como en todo el panel, cada sección tiene su estado honesto: si aún no hay datos, lo
        dice <span className="em">«Sin datos de rendimiento todavía»</span> en vez de dibujar una
        gráfica vacía.
      </p>
      <p>
        Cuando la carrera llega con más señal (del reloj o de la cinta) el diagnóstico la aprovecha:
        la <b>cadencia media</b> aparece en el detalle de cada tramo, con su <b>tendencia semanal</b>{' '}
        (más barra, más cadencia), y la <b>inclinación</b> se ve <b>tramo a tramo</b>. Mientras no
        haya cadencia registrada, el panel lo dice en claro en vez de dibujar una barra vacía.
      </p>

      <h3>4 · Evaluar semana: el sistema propone, tú decides</h3>
      <p>
        Arriba de esa pestaña vive <b>Evaluar semana</b>. El sistema mira la semana anterior y{' '}
        <b>propone</b> un ajuste con un <b>veredicto</b> (<em className="em">Requiere ajuste</em> /{' '}
        <em className="em">Semana correcta</em>) y una recomendación (mantener, suavizar, cambiar…). Y
        te enseña los <b>disparadores</b> que lo motivan, con sus números reales. Tú <b>apruebas</b> o{' '}
        <b>rechazas</b>: nada se aplica solo. Si la semana está correcta, se cierra sin tocar el plan.
      </p>


      <DocNote variant="cue" title="El sistema propone, tú firmas">
        <ul>
          <li>
            El veredicto llega con sus <span className="k">disparadores</span> a la vista (los números
            que lo motivan), nunca como una caja negra.
          </li>
          <li>
            Nada se aplica a tus espaldas: hasta que no pulsas <span className="k">Aprobar</span>, el
            plan de tu atleta no cambia. Y una semana correcta se resuelve sola, sin tocar nada.
          </li>
        </ul>
      </DocNote>

      <p style={{ marginTop: '18px' }}>
        Con esto se cierra el seguimiento entero: <b>cómo llega</b> (readiness), <b>cuánto cumple</b>{' '}
        (adherencia), <b>hacia dónde</b> (carreras) y <b>cuánto mejora</b> (progreso). Cuatro
        lecturas, un mismo círculo, y siempre los dos lados: lo que tu atleta hace en su móvil, lo
        que tú decides en tu panel.
      </p>
    </DocSection>
  );
}
