'use client';

// Lo que CUELGA de cada parada del camino.
//
// El camino ya no se dibuja aquí: lo dibuja `web/components/plan-espina`, la
// misma pieza que pinta la nota del coach y la periodización del dashboard. Lo
// que queda en este fichero es lo que sí es de esta pantalla — las marcas de
// semana con el cursor de hoy, la lista de lo que hay en el calendario, la
// declaración del hueco y la cuenta atrás de la carrera— y el puente que
// convierte una parada (`espina.ts`) en un nodo pintable.
//
// Ninguna pieza inventa un color ni un tamaño: todo sale de los tokens `--twin-*`
// y del vocabulario de `plan/atoms.tsx`.

import type { ReactNode } from 'react';
import { TONOS_TWIN, colorDelTono, type TramoEspina } from '@/components/plan-espina';
import { SP } from '../../kit';
import { Etiqueta } from '../../kit-composicion/chrome';
import { DeclaracionDepende } from '../../kit-composicion/estados';
import { Numeral } from '../../plan/atoms';
import { cuandoElHito, type Ciclo, type Hito } from '../../plan/modelo';
import { LO_PUBLICA_EL_COACH, nodosDelCiclo, type NodoCiclo } from './espina';

/**
 * El reparto del sobrante vertical (§6.1). El sobrante entra EN LAS PARADAS y
 * nunca en una cola debajo del camino, y se reparte a PARTES IGUALES entre las
 * tres que de verdad tienen algo que estirar: el tramo de hoy cuando lleva
 * algo en el calendario, el hueco declarado —que ocupa tiempo de verdad entre
 * lo último publicado y la carrera— y la carrera, que es la que da sentido a
 * todo lo de arriba. Ninguna pesa más que otra: `PlanCicloAtoms.swift` lo
 * resuelve con un booleano (`crece`) y no con una jerarquía de pesos, y el
 * doble espeja esa misma regla en vez de una escala 3:2:1:1 que nadie pidió.
 *
 * Un tramo abierto SIN nada en su calendario no entra en el reparto: estirarlo
 * sería aire dentro de un camino, y el sobrante rinde más en las paradas que
 * sí tienen contenido.
 */
const PESO_CRECE = 1;
const PESO_QUIETO = 0;

/** El color neutro de una parada sin tono propio: el hueco es ausencia. */
const COLOR_HUECO = 'var(--twin-muted)';
/** La meta no se pinta con el acento: el acento ya dice «estás aquí». */
const COLOR_CARRERA = 'var(--twin-fg)';

/**
 * De las paradas del ciclo a los nodos que dibuja la espina.
 *
 * Aquí se añaden las tres cosas que la parada no sabe porque no son suyas: el
 * color de ESTA superficie, lo que cuelga del nodo y qué pasa al tocarlo.
 */
export function tramosDelCiclo(ciclo: Ciclo, onLog: (linea: string) => void): TramoEspina[] {
  return nodosDelCiclo(ciclo).map((nodo) => ({
    clave: nodo.clave,
    semanas: nodo.semanas,
    titulo: nodo.titulo,
    detalle: nodo.detalle,
    color: colorDeNodo(nodo),
    forma: nodo.clase === 'tramo' ? 'tramo' : nodo.clase === 'hueco' ? 'hueco' : 'meta',
    destacado: nodo.destacado,
    actual: nodo.actual,
    semanaActual: nodo.semanaActual,
    pasado: nodo.pasado,
    peso: pesoDeNodo(ciclo, nodo),
    contenido: contenidoDeNodo(ciclo, nodo),
    etiqueta: nodo.etiqueta,
    onSeleccionar: () => onLog(nodo.etiqueta),
  }));
}

function colorDeNodo(nodo: NodoCiclo): string {
  if (nodo.tono !== null) return colorDelTono(TONOS_TWIN, nodo.tono);
  return nodo.clase === 'hueco' ? COLOR_HUECO : COLOR_CARRERA;
}

function pesoDeNodo(ciclo: Ciclo, nodo: NodoCiclo): number {
  if (nodo.clase === 'hueco') return PESO_CRECE;
  if (nodo.clase === 'carrera') return PESO_CRECE;
  if (!nodo.actual) return PESO_QUIETO;
  const tramo = nodo.indiceTramo !== null ? ciclo.tramos[nodo.indiceTramo] : undefined;
  return tramo && tramo.hitos.length > 0 ? PESO_CRECE : PESO_QUIETO;
}

function contenidoDeNodo(ciclo: Ciclo, nodo: NodoCiclo): ReactNode {
  if (nodo.clase === 'hueco') {
    return (
      <DeclaracionDepende
        quien={LO_PUBLICA_EL_COACH.quien}
        cuando={LO_PUBLICA_EL_COACH.cuando}
        style={{ marginTop: SP.s, alignSelf: 'flex-start' }}
      />
    );
  }
  if (nodo.clase === 'carrera') {
    return ciclo.carrera ? (
      <span style={{ marginTop: SP.xs, display: 'flex' }}>
        <Numeral tamano="m" sufijo={ciclo.carrera.enDias === 1 ? 'día' : 'días'}>
          {ciclo.carrera.enDias}
        </Numeral>
      </span>
    ) : null;
  }

  const tramo = nodo.indiceTramo !== null ? ciclo.tramos[nodo.indiceTramo] : undefined;
  if (!tramo) return null;
  return (
    <>
      {nodo.actual ? (
        <Semanas semanas={tramo.semanas} cursor={nodo.semanaActual} color={colorDeNodo(nodo)} />
      ) : null}
      {tramo.hitos.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto', marginTop: SP.xs }}>
          <Etiqueta>En el calendario</Etiqueta>
          {tramo.hitos.map((hito, i) => (
            <LineaHito key={i} hito={hito} color={colorDeNodo(nodo)} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Las semanas del tramo abierto
// ---------------------------------------------------------------------------

/**
 * Las semanas del tramo donde estás, con el cursor de hoy encima.
 *
 * Son MARCAS DE POSICIÓN: todas miden lo mismo y solo cambia la de hoy. Si
 * alguna fuese más alta que otra estaríamos dibujando una rampa de carga
 * prevista, que es exactamente lo que esta pantalla viene a sustituir y lo que
 * el modelo se niega a guardar.
 *
 * Se lleva el sobrante del nodo y se centra en él: el hueco entra aquí, no en
 * una cola debajo del camino (§6.1). Va `aria-hidden` porque la posición ya se
 * lee entera en el rótulo de su parada («estás en la semana 2»).
 *
 * El cursor va del color DE ESTE TRAMO y no del acento: en la espina el color
 * dice de qué tramo es cada cosa, y una marca naranja dentro de un tramo azul
 * diría que pertenece a otro sitio.
 */
function Semanas({ semanas, cursor, color }: { semanas: number; cursor: number | null; color: string }) {
  const marcas = Array.from({ length: semanas }, (_, i) => i + 1);
  return (
    <div
      aria-hidden
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 5,
        paddingTop: SP.xs,
      }}
    >
      <div style={{ display: 'flex', gap: 4, height: 5 }}>
        {marcas.map((n) => (
          <span key={n} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            {n === cursor ? (
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: `5px solid ${color}`,
                }}
              />
            ) : null}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {marcas.map((n) => (
          <span
            key={n}
            style={{
              flex: 1,
              height: n === cursor ? 10 : 8,
              borderRadius: 5,
              background:
                cursor !== null && n < cursor
                  ? 'var(--twin-muted)'
                  : n === cursor
                    ? color
                    : 'var(--twin-hairline-strong)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Un hito decidido. El «cuándo» sale de `cuandoElHito`, que dice «en 12 días»
 * cuando hay fecha y «semana 1 · miércoles» cuando solo hay posición. Nunca se
 * inventa una fecha desde una posición.
 *
 * Su rombo va del color de SU tramo por la misma razón que el cursor: en la
 * espina el color tiene un solo significado, y meterle un segundo lo rompe.
 */
function LineaHito({ hito, color }: { hito: Hito; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          transform: 'rotate(45deg)',
          background: color,
          flex: '0 0 auto',
          alignSelf: 'center',
        }}
      />
      <span
        style={{
          font: '500 13px/1.3 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hito.nombre}
      </span>
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', flex: '0 0 auto' }}>
        {cuandoElHito(hito)}
      </span>
    </div>
  );
}
