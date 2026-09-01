// El ciclo del atleta, dicho como CAMINO.
//
// Traduce el `Ciclo` del modelo del plan a las paradas de la espina compartida
// (`web/components/plan-espina`). Es puro a propósito: aquí se decide QUÉ dice
// cada parada —su rótulo de semanas, su tono, si ya pasó, qué se lee en voz
// alta— y eso se puede fijar con pruebas. El dibujo y lo que cuelga de cada
// nodo van en `atoms.tsx`.
//
// LOS RÓTULOS SON LOS MISMOS QUE LOS DEL PLAN REAL. `weeksLabel` y
// `planPathTone` salen de `@fahybrid/shared/domain/plan-path`, o sea del mismo
// sitio del que salen cuando el servidor resuelve el camino de verdad
// (`lib/plan/camino.ts`). Si el atleta lee «S5-S8 · Base 1» en la nota de su
// coach, lee «S5-S8 · Base 1» aquí: dos gramáticas para la misma semana serían
// dos apps.
//
// LO QUE NO SE DERIVA: la descarga no se marca (no hay dato que la pruebe desde
// la migración 0064) y un tramo no se colorea por lo que dice su nombre. El tono
// es la POSICIÓN, que es lo único verdadero y además agnóstico.

import { planPathTone, weeksLabel } from '@fahybrid/shared/domain/plan-path';
import { cuandoElHito, plural, type Ciclo } from '../../plan/modelo';
import { fmtClock } from '../../sim';

/** Qué clase de parada es. La forma del nodo sale de aquí, no al revés. */
export type ClaseNodo = 'tramo' | 'hueco' | 'carrera';

/** Una parada del camino, ya decidida y todavía sin dibujar. */
export interface NodoCiclo {
  clave: string;
  clase: ClaseNodo;
  /** Su sitio en `ciclo.tramos`. `null` en el hueco y en la carrera. */
  indiceTramo: number | null;
  /** «S1» o «S5-S8». Vacío = esta parada no ocupa semanas. */
  semanas: string;
  titulo: string;
  detalle: string | null;
  /** Tono por posición; cada superficie lo mapea a SUS tokens. `null` = sin tono propio. */
  tono: number | null;
  pasado: boolean;
  actual: boolean;
  semanaActual: number | null;
  /** Dentro pasa algo que rompe la rutina. */
  destacado: boolean;
  /** El rótulo que se lee en voz alta. */
  etiqueta: string;
}

/**
 * Quién desbloquea lo que el atleta no puede desbloquear, dicho una sola vez.
 * Sale en el vacío de «aún no tienes plan» y en el hueco del final, y las dos
 * frases tienen que ser LA MISMA: son el mismo hecho visto en dos momentos.
 */
export const LO_PUBLICA_EL_COACH = { quien: 'tu coach', cuando: 'Todavía no hay fecha' } as const;

/**
 * El nivel que declara lo publicado: el del tramo donde caes hoy, o el que
 * comparten TODOS cuando hoy no cae en ninguno. Si declaran niveles distintos y
 * no hay cursor, no existe «el nivel del ciclo» y no se pinta ninguno.
 *
 * Se resuelve una sola vez para que el nivel salga UNA vez en el cromo en lugar
 * de repetirse en cada parada: una parada solo lo dice cuando se sale de lo que
 * declara el resto, que es justo cuando el dato informa de algo.
 */
export function nivelDeLoPublicado(ciclo: Ciclo): string | null {
  const actual = ciclo.tramos[ciclo.indiceActual];
  if (actual) return actual.nivel;
  const niveles = new Set(ciclo.tramos.map((t) => t.nivel));
  return niveles.size === 1 ? (ciclo.tramos[0]?.nivel ?? null) : null;
}

/**
 * ¿El camino tiene un agujero al final? Dos procedencias, un mismo hecho: o hoy
 * no cae dentro de ningún tramo, o el último no declara qué pasa al acabar. En
 * los dos casos lo que viene después NO se sabe, y se dice.
 */
export function hayHueco(ciclo: Ciclo): boolean {
  return ciclo.indiceActual < 0 || ciclo.alAcabar === null;
}

/**
 * Las paradas del camino, en orden: los tramos publicados, el agujero del final
 * si lo hay, y la carrera cerrando.
 *
 * Devuelve vacío cuando no hay ni un tramo publicado: sin estructura no hay
 * camino que dibujar, y la pantalla degrada a Vacío en vez de pintar un camino
 * de cero pasos que sugiere que falta cargar algo.
 */
export function nodosDelCiclo(ciclo: Ciclo): NodoCiclo[] {
  if (ciclo.tramos.length === 0) return [];

  const nivelComun = nivelDeLoPublicado(ciclo);
  const nodos: NodoCiclo[] = [];
  let primeraSemana = 1;

  ciclo.tramos.forEach((tramo, i) => {
    const actual = i === ciclo.indiceActual;
    const semanas = weeksLabel(primeraSemana, tramo.semanas);
    primeraSemana += tramo.semanas;
    nodos.push({
      clave: `tramo-${i}`,
      clase: 'tramo',
      indiceTramo: i,
      semanas,
      titulo: tramo.nombre,
      // El nivel solo cuando se sale del que declara el resto del ciclo.
      detalle: tramo.nivel && tramo.nivel !== nivelComun ? tramo.nivel : null,
      tono: planPathTone(i),
      // Sin cursor no se sabe qué queda detrás: `indiceActual = -1` no convierte
      // en pasado a nadie, aunque sus fechas hayan quedado atrás.
      pasado: ciclo.indiceActual >= 0 && i < ciclo.indiceActual,
      actual,
      semanaActual: actual ? ciclo.semanaEnTramo : null,
      destacado: tramo.hitos.length > 0,
      etiqueta: etiquetaTramo(ciclo, i, semanas),
    });
  });

  if (hayHueco(ciclo)) {
    const detalle =
      ciclo.indiceActual < 0
        ? 'Lo que tu coach ha montado se termina antes de hoy.'
        : 'Después de esta etapa no hay nada montado todavía.';
    nodos.push({
      clave: 'hueco',
      clase: 'hueco',
      indiceTramo: null,
      semanas: '',
      titulo: 'Aquí acaba lo publicado',
      detalle,
      tono: null,
      pasado: false,
      actual: false,
      semanaActual: null,
      destacado: false,
      etiqueta: `Aquí acaba lo publicado. ${detalle} Lo publica ${LO_PUBLICA_EL_COACH.quien}. ${LO_PUBLICA_EL_COACH.cuando}.`,
    });
  }

  if (ciclo.carrera) {
    const { nombre, enDias, objetivoS } = ciclo.carrera;
    nodos.push({
      clave: 'carrera',
      clase: 'carrera',
      indiceTramo: null,
      semanas: '',
      titulo: nombre,
      // Sin objetivo puesto no se escribe ninguno: un tiempo por defecto
      // parecería del atleta, y ningún valor por defecto puede parecerlo.
      detalle: objetivoS !== null ? `Tu carrera · objetivo ${fmtClock(objetivoS)}` : 'Tu carrera',
      tono: null,
      pasado: false,
      actual: false,
      semanaActual: null,
      destacado: false,
      etiqueta: etiquetaCarrera(nombre, enDias, objetivoS),
    });
  }

  return nodos;
}

/**
 * El rótulo accesible de un tramo.
 *
 * El estado solo se dice con palabras cuando hoy cae dentro de alguno: sin
 * cursor no se sabe si un tramo queda por delante o por detrás, y afirmarlo
 * sería inventarlo.
 */
function etiquetaTramo(ciclo: Ciclo, i: number, semanas: string): string {
  const tramo = ciclo.tramos[i]!;
  const base = `${tramo.nombre}, ${plural(tramo.semanas, 'semana', 'semanas')} (${semanas})`;
  const donde =
    i === ciclo.indiceActual && ciclo.semanaEnTramo !== null
      ? `, estás en la semana ${ciclo.semanaEnTramo}`
      : ciclo.indiceActual >= 0 && i < ciclo.indiceActual
        ? ', ya pasó'
        : '';
  const nivel = tramo.nivel ? `, nivel ${tramo.nivel}` : '';
  const hitos =
    tramo.hitos.length > 0
      ? `. ${plural(tramo.hitos.length, 'marca en el calendario', 'marcas en el calendario')}: ${tramo.hitos
          .map((h) => `${h.nombre}, ${cuandoElHito(h)}`)
          .join('; ')}`
      : '';
  return `${base}${donde}${nivel}${hitos}`;
}

function etiquetaCarrera(nombre: string, enDias: number, objetivoS: number | null): string {
  const objetivo = objetivoS !== null ? `, objetivo ${fmtClock(objetivoS)}` : '';
  return `Tu carrera: ${nombre}, en ${plural(enDias, 'día', 'días')}${objetivo}`;
}
