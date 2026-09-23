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
} from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
} as const;

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

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Una carrera no es «6 series y ya». Es una <b>secuencia por fases</b> (un calentamiento, la
          parte principal, una vuelta a la calma) donde cada tramo lleva su <b>trabajo</b> (metros o
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
            claro. Las series se agrupan en un <b>«Repetir ×N»</b>, y un repetir puede llevar otro
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
            adapta. Prescrito así, cada tramo <b>se juzga solo</b> contra lo que hizo tu atleta, y esa
            es la base del cumplimiento por tramo.
          </>
        }
      />

      <h3>1 · Tres fases, en orden</h3>
      <p>
        Toda carrera se ordena en hasta tres fases, siempre en el mismo sentido:{' '}
        <b>Calentamiento → Principal → Vuelta a la calma</b>. La <b>principal</b> es obligatoria (es
        el meollo del entreno); el calentamiento y la vuelta son <b>opcionales</b>: los pones cuando
        aportan. No hay forma de dejarlas desordenadas: el editor solo admite ese orden.
      </p>

      <h3>2 · Cada tramo: qué se mide y contra qué</h3>
      <p>
        Un tramo es <b>trabajo</b> o <b>recuperación</b>. Eliges cómo se mide: por <b>distancia</b>{' '}
        (metros) o por <b>tiempo</b> (segundos), y qué objetivo persigue: un <b>ritmo exacto</b>{' '}
        (4:00/km) o una <b>banda</b> (4:00–4:10), una <b>zona de ritmo</b> (Z1–Z5), una <b>zona de
        pulso</b> (Z1–Z5), un <b>RPE</b> (punto o banda, 1–10) o <b>libre</b> (sin objetivo, un rodaje
        por sensaciones). En cinta o cuesta añades <b>inclinación</b> (0–15 %); y si trabajas técnica,
        una <b>cadencia</b> objetivo (120–220 spm). La recuperación además dice cómo se toma:{' '}
        <b>trote</b>, <b>caminar</b> o <b>parado</b> (esta última, medida en tiempo).
      </p>

      <h3>3 · «Repetir ×N», y repeticiones dentro de repeticiones</h3>
      <p>
        Las series no se copian y pegan: envuelves los tramos en un <b>«Repetir ×N»</b> (de 2 a 20) y
        el bloque se repite entero. Y un repetir puede llevar <b>otro dentro</b> (hasta dos niveles),
        que es exactamente como se escribe un <b>3×(4×400)</b>: tres bloques, cada uno con cuatro
        cuatrocientos y sus micro-recuperaciones, con una pausa más larga entre bloques.
      </p>

      <DocNote variant="cue" title="Empieza por un arquetipo, no de cero">
        <p>
          Elegir <b>Series</b>, <b>Progresivo</b>, <b>Fartlek</b>, <b>Cuestas</b> o <b>Pirámide</b> te
          deja la parte principal <b>ya montada</b> con números sensatos, en el idioma del deporte y
          totalmente editable. No son plantillas cerradas: siembran la misma estructura para que
          arranques de algo con sentido y lo ajustes a tu atleta.
        </p>
      </DocNote>

      <DocNote variant="log" title="Tus bloques de siempre se abren sin perder nada">
        <p>
          Los entrenos de carrera que ya tenías se abren <b>en este mismo editor</b> sin tocar nada:
          lo que era plano se lee como su estructura equivalente y sigues desde ahí. Y la app del
          atleta que ya está instalada <b>nunca se rompe</b>: cada carrera viaja también en su forma
          simple, así que el móvil siempre muestra un entreno coherente.
        </p>
      </DocNote>

      <MovilBand
        title="La carrera, en su móvil"
        subtitle={
          <>
            Tu atleta ve la carrera <b>tramo a tramo</b>, con su objetivo en cada uno y las series
            contadas, lo mismo que montaste tú, sin una frase suelta que interpretar.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Tramo a tramo.</b> El calentamiento, cada 400 de la serie con su ritmo y la
              recuperación entre medias, y cuántas repeticiones quedan.
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
        tramo a tramo y lo que después alimenta sus analíticas, sin que nada dependa de cómo se
        interprete una frase.
      </p>
    </DocSection>
  );
}
