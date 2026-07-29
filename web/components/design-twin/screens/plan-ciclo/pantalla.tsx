'use client';

// El plan a la distancia larga — «¿hacia dónde voy y cuánto queda?».
//
// De dónde vengo, en qué punto estoy y qué hay marcado por delante. No enseña
// ningún entreno: enseña la ESTRUCTURA que el coach ha publicado, en orden, con
// el cursor de hoy dentro y la carrera cerrando por abajo.
//
// ---------------------------------------------------------------------------
// LA LEY QUE MANDA SOBRE ESTA PANTALLA
// ---------------------------------------------------------------------------
//
// El futuro tiene dos mitades y solo una se sabe (la cabecera de `plan/modelo.ts`
// lo deja escrito):
//
//   · La ESTRUCTURA está DECIDIDA — cuántas etapas hay, en qué orden, cuántas
//     semanas dura cada uno, cómo los llamó el coach, dónde caes hoy, qué tests
//     están marcados y cuándo es la carrera. Nada de eso depende de lo que el
//     atleta haga, así que se pinta con seguridad.
//   · El RESULTADO MEDIDO del futuro NO se sabe. Por eso aquí no hay ni una
//     barra de carga, ni de volumen, ni de intensidad prevista. El modelo no
//     tiene campo donde quepan —a propósito— y esta vista existe justo para
//     sustituir esa mentira. Las marcas de semana son POSICIÓN, no cantidad:
//     todas miden lo mismo y la única distinta es la de hoy.
//
// AGNÓSTICO: la etiqueta de una etapa es `Tramo.nombre`, o sea lo que escribió
// el coach («Acumulación», «Base 1», «Testing»). La migración 0064 borró la
// entidad «fase», así que aquí no hay catálogo, ni orden de fases asumido, ni
// una sola constante con un nombre de fase dentro. Un tramo sin nombre se
// pintaría sin etiqueta.
//
// ---------------------------------------------------------------------------
// LA ALTURA (§6.1) — `llena`, y degrada a `centra`
// ---------------------------------------------------------------------------
//
// El cuerpo es LA ESPINA: las etapas en orden, de arriba abajo. El sobrante
// entra EN LAS FILAS y nunca en una cola debajo, y se reparte por peso entre
// las tres cosas que pueden pagarlo:
//
//   · la etapa ACTUAL (3) — se abre y enseña sus semanas y sus hitos;
//   · el HUECO declarado (2) — cuando lo publicado se acaba y no hay siguiente,
//     el agujero es un hecho de la estructura y se dibuja como tal;
//   · la CARRERA (1) — la que da sentido a todo lo de arriba (§6.2).
//
// Sin ningún tramo publicado no hay espina que repartir: entonces es un Vacío y
// degrada a `centra`, con su salida obligatoria.

import { useState } from 'react';
import { SP } from '../../kit';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { Accion, Cromo, Cuerpo, Lienzo, Numeral, Sujeto, entradaStyle } from '../../plan/atoms';
import { escenarioPlan } from '../../plan/datos';
import {
  TEXTO_AL_ACABAR,
  cuandoElHito,
  estadoDeTramo,
  hitosDelCiclo,
  plural,
  proximoHito,
  semanaDelCiclo,
  semanasDelCiclo,
  type Ciclo,
} from '../../plan/modelo';
import { fmtClock, useTimeline } from '../../sim';
import { FilaCarrera, FilaTramo, Hueco, RAIL } from './atoms';

/** Sangría que alinea el texto suelto de la espina con el de las filas. */
const SANGRIA = SP.m + RAIL + SP.m;

/**
 * El nivel que declara lo publicado: el de la etapa donde caes hoy, o el que
 * comparten TODOS cuando hoy no cae en ninguno. Si declaran niveles distintos y
 * no hay cursor, no existe «el nivel del ciclo» y no se pinta ninguno.
 *
 * Se resuelve aquí una sola vez para que el nivel salga UNA vez en el cromo en
 * lugar de repetirse en las tres filas: una fila solo lo dice cuando se sale de
 * lo que declara el resto, que es justo cuando el dato informa de algo.
 */
function nivelDeLoPublicado(ciclo: Ciclo): string | null {
  const actual = ciclo.tramos[ciclo.indiceActual];
  if (actual) return actual.nivel;
  const niveles = new Set(ciclo.tramos.map((t) => t.nivel));
  return niveles.size === 1 ? (ciclo.tramos[0]?.nivel ?? null) : null;
}

/**
 * ¿La espina tiene un agujero al final? Dos procedencias, un mismo hecho: o hoy
 * no cae dentro de ninguna etapa, o la última etapa no declara qué pasa al
 * acabar. En los dos casos lo que viene después NO se sabe, y se dice.
 */
function hayHueco(ciclo: Ciclo): boolean {
  return ciclo.indiceActual < 0 || ciclo.alAcabar === null;
}

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const [visible, setVisible] = useState(false);

  const { ciclo } = escenarioPlan(escenario);
  const tramoActual = ciclo.tramos[ciclo.indiceActual] ?? null;
  const nivel = nivelDeLoPublicado(ciclo);
  const totalSemanas = semanasDelCiclo(ciclo);
  const semanaCiclo = semanaDelCiclo(ciclo);
  const hueco = hayHueco(ciclo);

  const guion = guionDelCiclo(ciclo);
  useTimeline([
    { at: 240, run: () => setVisible(true) },
    ...guion.map((linea, i) => ({ at: 700 + i * 540, run: () => onLog(linea) })),
  ]);

  // Sin estructura publicada no hay espina que repartir: el arquetipo degrada a
  // Vacío (§6.2) y se centra, con la salida declarada. Este atleta nunca ha
  // tenido plan, así que tampoco hay de dónde venir: no se finge un pasado.
  if (ciclo.tramos.length === 0) {
    return (
      <Lienzo>
        <Cromo izquierda="Tu plan" visible={visible} />
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
            salida={{ tipo: 'depende', quien: 'tu coach', cuando: 'Todavía no hay fecha' }}
          />
        </div>
      </Lienzo>
    );
  }

  return (
    <Lienzo
      accion={
        <Accion
          titulo="Ver la semana"
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
      <Cromo izquierda="Tu plan" derecha={nivel ?? undefined} visible={visible} />

      {tramoActual && ciclo.semanaEnTramo !== null ? (
        <Sujeto
          titulo={tramoActual.nombre}
          cifra={<Numeral sufijo={`de ${tramoActual.semanas}`}>{ciclo.semanaEnTramo}</Numeral>}
          // La escala del ciclo solo se dice cuando NO coincide con la del
          // etapa: con una única etapa publicada las dos cuentas son la misma
          // y repetirla sería ruido.
          pie={
            ciclo.tramos.length > 1 && semanaCiclo !== null
              ? `Semana ${semanaCiclo} de ${totalSemanas} del ciclo`
              : undefined
          }
          visible={visible}
        />
      ) : (
        // Hoy no cae en ninguna etapa. No hay cifra que inventar: el sujeto es
        // el hecho, no un contador puesto a cero.
        <Sujeto
          titulo="Sin etapa activa"
          pie="Hoy no cae dentro de ninguna de tus etapas."
          visible={visible}
        />
      )}

      <Cuerpo>
        {/* `llena`: el interior se estira hasta el alto para que las filas
            puedan repartirse el sobrante, y scrollea solo si de verdad desborda
            (un coach con ocho etapas publicadas). */}
        <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', gap: SP.s }}>
            {ciclo.tramos.map((tramo, i) => (
              <FilaTramo
                key={i}
                tramo={tramo}
                estado={estadoDeTramo(i, ciclo.indiceActual)}
                cursor={i === ciclo.indiceActual ? ciclo.semanaEnTramo : null}
                nivelComun={nivel}
                visible={visible}
                retardo={140 + i * 70}
                onLog={onLog}
              />
            ))}

            {hueco ? (
              <Hueco ciclo={ciclo} visible={visible} />
            ) : ciclo.alAcabar ? (
              // La secuencia SÍ declara qué pasa al acabar: entonces no hay
              // agujero, hay una regla, y se dice en una línea.
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

            {ciclo.carrera ? <FilaCarrera carrera={ciclo.carrera} visible={visible} onLog={onLog} /> : null}
          </div>
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
      '0:01 · Sin estructura no hay espina que repartir: degrada a Vacío y centra',
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
    `0:01 · ${plural(ciclo.tramos.length, 'etapa publicada', 'etapas publicadas')}, ${semanasDelCiclo(ciclo)} semanas en total`,
    marcas.length > 0
      ? `0:02 · ${plural(marcas.length, 'marca en el calendario', 'marcas en el calendario')}${
          proximo ? ` · la próxima, ${proximo.hito.nombre} (${cuandoElHito(proximo.hito)})` : ''
        }`
      : '0:02 · Ninguna marca en el calendario de lo publicado: no se pinta ninguna',
    ciclo.alAcabar
      ? `0:03 · ${TEXTO_AL_ACABAR[ciclo.alAcabar]}`
      : '0:03 · Lo publicado se acaba y no hay siguiente: el hueco se declara y se dice de quién depende',
    carrera
      ? `0:04 · ${carrera.nombre} en ${carrera.enDias} días${
          carrera.objetivoS !== null ? ` · objetivo ${fmtClock(carrera.objetivoS)}` : ''
        }`
      : '0:04 · Sin carrera objetivo: la espina cierra sin meta',
  ];
}
