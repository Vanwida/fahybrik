// GUÍA · 32 Editor de carrera — área "Carrera". Cómo prescribes un rodaje o unas
// series de verdad: fases (calentamiento · principal · vuelta), secuencia
// trabajo/recuperación, "Repetir ×N" anidado y un objetivo tipado por tramo.
// Verificado contra shared/domain/prescription/run-structure.ts (gramática: 1-3
// fases orden fijo, medida distancia|tiempo, objetivo ritmo|zona de ritmo|zona FC|
// RPE con banda, inclinación 0-15%, cadencia 120-220 spm, recuperación
// trote|caminar|parado, Repetir 2-20 anidable 2 niveles) y
// components/v2/editor/archetype-forms/run-structure/archetype-prefills.ts
// (arquetipos Series · Progresivo · Fartlek · Cuestas · Pirámide y sus hints). El
// bloque antiguo se abre sin pérdida: `structure` es opcional dentro de
// prescription_json (cero migración) y run-structure-convert.ts conserva los
// campos planos que ya decodifica el iOS instalado.

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
} as const;

// Un arquetipo en la fila de prefills del editor.
function Archetype({ name, hint, active }: { name: string; hint: string; active?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: active ? 'var(--accSoft)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--acc)' : 'var(--hair)'}`,
        borderRadius: '9px',
        padding: '8px 9px',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 800, color: active ? 'var(--acc)' : 'var(--fg)' }}>
        {name}
      </div>
      <div style={{ fontSize: '8.5px', color: 'var(--faint)', marginTop: '2px', lineHeight: 1.35 }}>
        {hint}
      </div>
    </div>
  );
}

// Una fila de tramo dentro de una fase: punto de modalidad + medida + objetivo.
function Leg({
  measure,
  target,
  extra,
  kind = 'work',
}: {
  measure: string;
  target?: string;
  extra?: string;
  kind?: 'work' | 'recovery';
}) {
  const recovery = kind === 'recovery';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '9px',
        padding: '7px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11.5px',
      }}
    >
      <span
        className="mdot"
        style={{ background: recovery ? 'var(--faint)' : MOD.carrera, alignSelf: 'center' }}
      />
      <span style={{ flex: 1, color: recovery ? 'var(--muted)' : 'var(--fg)' }}>
        {measure}
        {extra ? <span style={{ color: 'var(--faint)' }}> · {extra}</span> : null}
      </span>
      {target ? (
        <span className="num" style={{ fontSize: '10.5px', color: recovery ? 'var(--faint)' : 'var(--muted)' }}>
          {target}
        </span>
      ) : null}
    </div>
  );
}

// Cabecera de una fase (calentamiento · principal · vuelta).
function PhaseHead({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: '9px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        margin: '2px 0',
      }}
    >
      {label}
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
          Una carrera no es «6 series y ya». Es una <b>secuencia por fases</b> —un calentamiento, la
          parte principal, una vuelta a la calma— donde cada tramo lleva su <b>trabajo</b> (metros o
          tiempo) y su <b>objetivo</b> (un ritmo, una zona, un pulso, un esfuerzo). El editor te deja
          montarla entera <b>sin escribir una sola frase suelta</b>: todo es tipado, todo se mide.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            El <b>editor de carrera</b>: montas el rodaje tramo a tramo. Cada tramo es{' '}
            <b>trabajo o recuperación</b>, medido en <b>metros</b> o <b>tiempo</b>, con un objetivo
            claro. Las series se agrupan en un <b>«Repetir ×N»</b> — y un repetir puede llevar otro
            dentro, para un <b>3×(4×400)</b>.
          </>
        }
        como={
          <>
            Arrancas de un <b>arquetipo</b> (Series, Progresivo, Fartlek, Cuestas, Pirámide) que te
            deja la parte principal ya montada, y lo ajustas. Añades el <b>calentamiento</b> y la{' '}
            <b>vuelta</b> si quieres, marcas el objetivo de cada tramo y, en cinta o cuesta,{' '}
            <b>inclinación</b> y <b>cadencia</b>.
          </>
        }
        porque={
          <>
            Porque un ritmo escrito «a mano» no lo puede leer la app: no se mide, no se compara, no se
            adapta. Prescrito así, cada tramo <b>se juzga solo</b> contra lo que hizo tu atleta — y esa
            es la base del cumplimiento por tramo.
          </>
        }
      />

      <h3>1 · Tres fases, en orden</h3>
      <p>
        Toda carrera se ordena en hasta tres fases, siempre en el mismo sentido:{' '}
        <b>Calentamiento → Principal → Vuelta a la calma</b>. La <b>principal</b> es obligatoria (es
        el meollo del entreno); el calentamiento y la vuelta son <b>opcionales</b> — los pones cuando
        aportan. No hay forma de dejarlas desordenadas: el editor solo admite ese orden.
      </p>

      <h3>2 · Cada tramo: qué se mide y contra qué</h3>
      <p>
        Un tramo es <b>trabajo</b> o <b>recuperación</b>. Eliges cómo se mide —por <b>distancia</b>{' '}
        (metros) o por <b>tiempo</b> (segundos)— y qué objetivo persigue: un <b>ritmo exacto</b>{' '}
        (4:00/km) o una <b>banda</b> (4:00–4:10), una <b>zona de ritmo</b> (Z1–Z5), una <b>zona de
        pulso</b> (Z1–Z5), un <b>RPE</b> (punto o banda, 1–10) o <b>libre</b> (sin objetivo, un rodaje
        por sensaciones). En cinta o cuesta añades <b>inclinación</b> (0–15 %); y si trabajas técnica,
        una <b>cadencia</b> objetivo (120–220 spm). La recuperación además dice cómo se toma —{' '}
        <b>trote</b>, <b>caminar</b> o <b>parado</b> (esta última, medida en tiempo)—.
      </p>

      <h3>3 · «Repetir ×N», y repeticiones dentro de repeticiones</h3>
      <p>
        Las series no se copian y pegan: envuelves los tramos en un <b>«Repetir ×N»</b> (de 2 a 20) y
        el bloque se repite entero. Y un repetir puede llevar <b>otro dentro</b> —hasta dos niveles—,
        que es exactamente como se escribe un <b>3×(4×400)</b>: tres bloques, cada uno con cuatro
        cuatrocientos y sus micro-recuperaciones, con una pausa más larga entre bloques.
      </p>

      {/* Dashboard mockup: el editor con arquetipos + las tres fases + un 3×(4×400) anidado */}
      <DashboardMockup url="tu-panel / semana / editor de carrera">
        <div className="wk-head">
          <div className="wk-title">Editor de carrera</div>
          <div className="wk-tools">
            <span className="btn">Vista previa</span>
            <span className="btn pri">Guardar tramo</span>
          </div>
        </div>

        {/* Fila de arquetipos que prefillan la fase principal */}
        <div style={{ display: 'flex', gap: '7px', marginBottom: '14px' }}>
          <Archetype name="Series" hint="N × distancia @ ritmo + recuperación" active />
          <Archetype name="Progresivo" hint="Tramos que suben de zona" />
          <Archetype name="Fartlek" hint="Cambios fuerte/suave por RPE" />
          <Archetype name="Cuestas" hint="Repes en pendiente, bajada andando" />
          <Archetype name="Pirámide" hint="Distancias que suben y bajan" />
        </div>

        {/* Calentamiento */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '9px 13px 11px',
            marginBottom: '9px',
          }}
        >
          <PhaseHead label="Calentamiento" />
          <Leg measure="10 min" target="Z1 suave" />
        </div>

        {/* Principal: 3×(4×400) anidado */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '9px 13px 11px',
            marginBottom: '9px',
          }}
        >
          <PhaseHead label="Principal" />
          <div
            style={{
              border: '1px solid var(--hair)',
              borderRadius: '8px',
              padding: '4px 10px 8px',
              marginTop: '4px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--acc)', padding: '5px 0 1px' }}>
              Repetir ×3
            </div>
            <div
              style={{
                border: '1px solid var(--hair)',
                borderRadius: '8px',
                padding: '4px 10px 8px',
                marginTop: '2px',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--acc)', padding: '5px 0 1px' }}>
                Repetir ×4
              </div>
              <Leg measure="400 m" target="4:00/km" />
              <Leg measure="60 s" extra="trote" kind="recovery" />
            </div>
            <Leg measure="3 min" extra="caminar" kind="recovery" />
          </div>
        </div>

        {/* Vuelta a la calma */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '9px 13px 11px',
          }}
        >
          <PhaseHead label="Vuelta a la calma" />
          <Leg measure="10 min" target="Z1 suave" />
        </div>

        {/* Chips de objetivo disponibles por tramo */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '13px' }}>
          <span className="chip">Ritmo exacto o banda</span>
          <span className="chip">Zona de ritmo Z1–Z5</span>
          <span className="chip">Zona de pulso Z1–Z5</span>
          <span className="chip">RPE 1–10</span>
          <span className="chip">Inclinación 0–15 %</span>
          <span className="chip">Cadencia 120–220 spm</span>
        </div>
      </DashboardMockup>

      <DocNote variant="cue" title="Empieza por un arquetipo, no de cero">
        <p>
          Elegir <b>Series</b>, <b>Progresivo</b>, <b>Fartlek</b>, <b>Cuestas</b> o <b>Pirámide</b> te
          deja la parte principal <b>ya montada</b> con números sensatos, en el idioma del deporte —y
          totalmente editable—. No son plantillas cerradas: siembran la misma estructura para que
          arranques de algo con sentido y lo ajustes a tu atleta.
        </p>
      </DocNote>

      <DocNote variant="log" title="Tus bloques de siempre se abren sin perder nada">
        <p>
          Los entrenos de carrera que ya tenías se abren <b>en este mismo editor</b> sin tocar nada:
          lo que era plano se lee como su estructura equivalente y sigues desde ahí. Y la app del
          atleta que ya está instalada <b>nunca se rompe</b> — cada carrera viaja también en su forma
          simple, así que el móvil siempre muestra un entreno coherente.
        </p>
      </DocNote>

      <MovilBand
        title="La carrera, en su móvil"
        subtitle={
          <>
            Tu atleta ve la carrera <b>tramo a tramo</b>, con su objetivo en cada uno y las series
            contadas — lo mismo que montaste tú, sin una frase suelta que interpretar.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Tramo a tramo.</b> El calentamiento, cada 400 de la serie con su ritmo y la
              recuperación entre medias — y cuántas repeticiones quedan.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Series · pista
            </div>
            <div />
          </div>
          <div className="num" style={{ fontSize: '10.5px', color: 'var(--muted)', margin: '2px 0 12px' }}>
            3 × (4 × 400 m) · recuperación 60 s trote
          </div>

          <div className="logcard" style={{ marginBottom: '10px' }}>
            <div className="lh">Ahora · bloque 1 de 3</div>
            <Leg measure="Calentamiento · 10 min" target="Z1" />
            <Leg measure="400 m" target="4:00/km" />
            <Leg measure="60 s" extra="trote" kind="recovery" />
            <Leg measure="400 m" target="4:00/km" />
            <Leg measure="60 s" extra="trote" kind="recovery" />
          </div>

          <div className="cta">Empezar la serie</div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        Ese es el salto: la carrera deja de ser una nota de texto y pasa a ser una{' '}
        <b>prescripción medible</b>. Lo que montas aquí es lo que tu atleta corre, lo que la app juzga
        tramo a tramo y lo que después alimenta sus analíticas — sin que nada dependa de cómo se
        interprete una frase.
      </p>
    </DocSection>
  );
}
