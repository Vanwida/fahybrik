// GUÍA · Tests — Programar › Tests: la batería del coach (ordenable, «Usar la
// batería por defecto», un test se monta como un entreno), «Aplicar» a varios en
// un día con repetición, y en la ficha: «Programar test», «Apuntar un resultado»
// y lo que un resultado fija (zonas, máximos, los marcadores clave).

import { DocSection, DocNote, PanelFigure, Buttons } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Los tests fijan el <b>punto de partida real</b> de cada atleta: de un test de umbral salen
          sus zonas; de un 1RM, sus cargas en %. Tú decides qué tests forman tu batería y cuándo le
          toca cada uno a cada atleta.
        </>
      }
    >
      <h3>Tu batería</h3>
      <p>
        En <b>Programar › Tests</b> está la lista de tus tests, en tu orden (las flechas la
        reordenan). Si está vacía, <b>Usar la batería por defecto</b> te pone una para empezar, y la
        ajustas. <b>Nuevo test</b> se monta como cualquier entreno: eliges el tipo de trabajo{' '}
        <b>Test</b> y escribes lo que hará el atleta. Desplegar un test enseña exactamente eso; en su{' '}
        <b>···</b>, <b>Editar</b> o <b>Quitar de la batería…</b>.
      </p>

      <h3>Aplicar un test a varios</h3>
      <p>
        <b>Aplicar</b> pone un test a varios atletas el mismo día. Al lado de cada nombre ves cuándo
        lo hizo por última vez, y dos atajos: <b>Todos</b> y <b>Los que no lo han hecho nunca</b>.
        Eliges el día y si quieres <b>repetirlo</b> (no repetir, en 6 o en 12 semanas), y{' '}
        <b>Ponérselo a N</b>. El test aparece en su semana como un entreno más.
      </p>

      <h3>Desde la ficha del atleta</h3>
      <PanelFigure caption={<>En <b>Rendimiento › Zonas y tests</b> de cada atleta.</>}>
        <Buttons items={[{ label: 'Apuntar un resultado' }, { label: 'Programar test' }]} />
      </PanelFigure>
      <p>
        <b>Programar test</b> le pone uno de tu batería en un día; <b>Apuntar un resultado</b> guarda
        uno que hizo fuera de la app. En la columna de su estado, <b>Tus marcadores</b> te dice qué
        marcas le faltan y enlaza a programarle el test.
      </p>

      <DocNote variant="log" title="Sin test, lo dice">
        <p>
          Mientras un atleta no tenga un resultado, no verás zonas ni cargas inventadas: su ficha dice
          «sin zonas todavía» y de dónde saldrían. Sus zonas de pulso, por ejemplo, cuelgan de su
          umbral (ver <b>Zonas de pulso</b>).
        </p>
      </DocNote>
    </DocSection>
  );
}
