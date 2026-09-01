'use client';

// El plan a la distancia larga — «¿hacia dónde voy y cuánto queda?».
//
// De dónde vengo, en qué punto estoy y qué hay marcado por delante. No enseña
// ningún entreno: enseña la ESTRUCTURA que el coach ha publicado, en orden, con
// el cursor de hoy dentro y la carrera cerrando por abajo.
//
// ---------------------------------------------------------------------------
// LA ESPINA ES EL SUJETO DE ESTA PANTALLA
// ---------------------------------------------------------------------------
//
// El ciclo se pinta con `web/components/plan-espina`, la MISMA pieza que dibuja
// el camino en la nota del coach y en la periodización del dashboard. No es un
// parecido: es el mismo componente con los tokens de esta superficie. Un camino
// redibujado por pantalla son tres caminos distintos a los dos meses, y el
// atleta que ve «S5-S8 · Base 1» en la nota de su coach tiene que ver
// exactamente eso aquí (docs/DECISIONS.md 2026-08-09).
//
// Lo que decide QUÉ dice cada parada está en `espina.ts` y es puro; lo que
// cuelga de cada parada —las marcas de semana, lo que hay en el calendario, la
// declaración del hueco, la cuenta atrás— está en `atoms.tsx`.
//
// ---------------------------------------------------------------------------
// LA LEY QUE MANDA SOBRE ESTA PANTALLA
// ---------------------------------------------------------------------------
//
// El futuro tiene dos mitades y solo una se sabe (la cabecera de `plan/modelo.ts`
// lo deja escrito):
//
//   · La ESTRUCTURA está DECIDIDA — cuántos tramos hay, en qué orden, cuántas
//     semanas dura cada uno, cómo los llamó el coach, dónde caes hoy, qué tests
//     están marcados y cuándo es la carrera. Nada de eso depende de lo que el
//     atleta haga, así que se pinta con seguridad.
//   · El RESULTADO MEDIDO del futuro NO se sabe. Por eso aquí no hay ni una
//     barra de carga, ni de volumen, ni de intensidad prevista. El modelo no
//     tiene campo donde quepan —a propósito— y esta vista existe justo para
//     sustituir esa mentira. Las marcas de semana son POSICIÓN, no cantidad:
//     todas miden lo mismo y la única distinta es la de hoy.
//
// AGNÓSTICO: la etiqueta de un tramo es `Tramo.nombre`, o sea lo que escribió el
// coach («Acumulación», «Base 1», «Testing»). La migración 0064 borró la entidad
// «fase», así que aquí no hay catálogo, ni orden de fases asumido, ni una sola
// constante con un nombre de fase dentro. El color de un tramo es su POSICIÓN,
// nunca lo que dice su nombre.
//
// ---------------------------------------------------------------------------
// LA ALTURA (§6.1) — `llena`, y degrada a `centra`
// ---------------------------------------------------------------------------
//
// El cuerpo es LA ESPINA. El sobrante entra EN LAS PARADAS y nunca en una cola
// debajo; el reparto por peso está en `atoms.tsx`. Sin ningún tramo publicado no
// hay camino que repartir: entonces es un Vacío y degrada a `centra`, con su
// salida obligatoria.

import { useState } from 'react';
import { Espina, GEOMETRIA_ESPINA, TOKENS_TWIN } from '@/components/plan-espina';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { Accion, Cromo, Cuerpo, Lienzo, Numeral, Sujeto, entradaStyle } from '../../plan/atoms';
import { escenarioPlan } from '../../plan/datos';
import {
  TEXTO_AL_ACABAR,
  cuandoElHito,
  hitosDelCiclo,
  plural,
  proximoHito,
  semanaDelCiclo,
  semanasDelCiclo,
  type Ciclo,
} from '../../plan/modelo';
import { fmtClock, useTimeline } from '../../sim';
import { tramosDelCiclo } from './atoms';
import { LO_PUBLICA_EL_COACH, hayHueco, nivelDeLoPublicado } from './espina';

/** El ancho de la columna del raíl más su aire — alinea el texto suelto del pie
 *  con el de las paradas. Los dos valores salen de la pieza, no se repiten. */
const SANGRIA = GEOMETRIA_ESPINA.rail + GEOMETRIA_ESPINA.aire;

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const [visible, setVisible] = useState(false);

  const { ciclo } = escenarioPlan(escenario);
  const tramoActual = ciclo.tramos[ciclo.indiceActual] ?? null;
  const nivel = nivelDeLoPublicado(ciclo);
  const totalSemanas = semanasDelCiclo(ciclo);
  const semanaCiclo = semanaDelCiclo(ciclo);

  const guion = guionDelCiclo(ciclo);
  useTimeline([
    { at: 240, run: () => setVisible(true) },
    ...guion.map((linea, i) => ({ at: 700 + i * 540, run: () => onLog(linea) })),
  ]);

  // La salida directa (§5): en iOS esta pantalla es un `fullScreenCover` sobre
  // la pestaña Plan, y el cromo lleva su propio cierre en vez de depender del
  // gesto de deslizar. Va tanto con datos como en el Vacío — el botón no puede
  // desaparecer solo porque no haya camino que enseñar.
  const cerrar = () => onLog('Cerrar → volvería a la pestaña Plan');

  // Sin estructura publicada no hay camino que repartir: el arquetipo degrada a
  // Vacío (§6.2) y se centra, con la salida declarada. Este atleta nunca ha
  // tenido plan, así que tampoco hay de dónde venir: no se finge un pasado.
  if (ciclo.tramos.length === 0) {
    return (
      <Lienzo>
        <Cromo izquierda="Tu plan" onCerrar={cerrar} visible={visible} />
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'grid',
            placeItems: 'center',
            ...entradaStyle(visible, 90),
          }}
        >
          <EstadoCentrado
            titulo="Aún no tienes plan"
            cuerpo="Cuando tu coach publique tu primera etapa, aquí verás por dónde vas y cuánto queda."
            salida={{ tipo: 'depende', ...LO_PUBLICA_EL_COACH }}
          />
        </div>
      </Lienzo>
    );
  }

  return (
    <Lienzo
      accion={
        <Accion
          titulo="VER LA SEMANA"
          principal={false}
          visible={visible}
          onTap={() =>
            onLog(
              tramoActual
                ? `Ver la semana → abriría la semana ${ciclo.semanaEnTramo} de «${tramoActual.nombre}»`
                : 'Ver la semana → abriría la semana de hoy, que está vacía',
            )
          }
        />
      }
    >
      <Cromo izquierda="Tu plan" derecha={nivel ?? undefined} onCerrar={cerrar} visible={visible} />

      {tramoActual && ciclo.semanaEnTramo !== null ? (
        <Sujeto
          titulo={tramoActual.nombre}
          cifra={<Numeral sufijo={`de ${tramoActual.semanas}`}>{ciclo.semanaEnTramo}</Numeral>}
          // La escala del ciclo solo se dice cuando NO coincide con la de la
          // etapa: con una única etapa publicada las dos cuentas son la misma y
          // repetirla sería ruido.
          pie={
            ciclo.tramos.length > 1 && semanaCiclo !== null
              ? `Semana ${semanaCiclo} de ${totalSemanas} del ciclo`
              : undefined
          }
          visible={visible}
        />
      ) : (
        // Hoy no cae en ninguna etapa. No hay cifra que inventar: el sujeto es el
        // hecho, no un contador puesto a cero.
        <Sujeto titulo="Sin etapa activa" pie="Hoy no cae dentro de ninguna de tus etapas." visible={visible} />
      )}

      <Cuerpo>
        {/* `llena`: el interior se estira hasta el alto para que las paradas
            puedan repartirse el sobrante, y scrollea solo si de verdad desborda
            (un coach con ocho etapas publicadas). */}
        <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Espina
            tokens={TOKENS_TWIN}
            tramos={tramosDelCiclo(ciclo, onLog)}
            style={{ flex: '1 0 auto', ...entradaStyle(visible, 140) }}
          />

          {/* La secuencia SÍ declara qué pasa al acabar: entonces no hay
              agujero, hay una regla, y se dice en una línea bajo el camino. */}
          {!hayHueco(ciclo) && ciclo.alAcabar ? (
            <p
              style={{
                margin: 0,
                paddingLeft: SANGRIA,
                font: '500 12px/1.4 var(--twin-font-sans)',
                color: 'var(--twin-muted)',
                ...entradaStyle(visible, 340),
              }}
            >
              {TEXTO_AL_ACABAR[ciclo.alAcabar]}
            </p>
          ) : null}
        </div>
      </Cuerpo>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// El guion del panel
// ---------------------------------------------------------------------------

/** El guion del panel: qué está mirando quien dirige el diseño. */
function guionDelCiclo(ciclo: Ciclo): string[] {
  if (ciclo.tramos.length === 0) {
    return [
      '0:00 · Atleta recién dado de alta: ninguna etapa publicada y ninguna carrera',
      '0:01 · Sin estructura no hay camino que repartir: degrada a Vacío y centra',
      '0:02 · Nunca ha tenido plan, así que tampoco hay de dónde venir',
    ];
  }
  const tramo = ciclo.tramos[ciclo.indiceActual];
  const marcas = hitosDelCiclo(ciclo);
  const proximo = proximoHito(ciclo);
  const carrera = ciclo.carrera;
  return [
    tramo && ciclo.semanaEnTramo !== null
      ? `0:00 · «${tramo.nombre}», semana ${ciclo.semanaEnTramo} de ${tramo.semanas}`
      : '0:00 · Hoy no cae dentro de ninguna etapa: no hay cursor que pintar',
    `0:01 · ${plural(ciclo.tramos.length, 'etapa publicada', 'etapas publicadas')}, ${semanasDelCiclo(ciclo)} semanas en total · el camino es la espina compartida`,
    marcas.length > 0
      ? `0:02 · ${plural(marcas.length, 'marca en el calendario', 'marcas en el calendario')}${
          proximo ? ` · la próxima, ${proximo.hito.nombre} (${cuandoElHito(proximo.hito)})` : ''
        }`
      : '0:02 · Ninguna marca en el calendario de lo publicado: no se pinta ninguna',
    ciclo.alAcabar
      ? `0:03 · ${TEXTO_AL_ACABAR[ciclo.alAcabar]}`
      : '0:03 · Lo publicado se acaba y no hay siguiente: el camino se rompe y se dice de quién depende',
    carrera
      ? `0:04 · ${carrera.nombre} en ${carrera.enDias} días${
          carrera.objetivoS !== null ? ` · objetivo ${fmtClock(carrera.objetivoS)}` : ''
        }`
      : '0:04 · Sin carrera objetivo: el camino cierra sin meta',
  ];
}
