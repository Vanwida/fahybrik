// TIEMPO EN ZONAS — de una serie de pulsos a segundos por banda.
//
// EL ERROR QUE ESTE FICHERO EXISTE PARA NO COMETER: contar filas.
//
// Una lectura de pulso NO es un segundo. Medido contra el dato real de
// producción (10-ago-2026, 1.168 huecos entre muestras dentro de tramos
// ejecutados): la cadencia dentro de un entreno va a 5 s de mediana, con el
// percentil 25 en 3 s, el 75 en 6, el 90 en 9 y un hueco máximo de 521 s. Y en
// la tabla entera hay 106.880 lecturas repartidas en solo 46.366 instantes
// distintos — o sea 2,3 filas por segundo de reloj, porque un re-sync de Apple
// Health vuelve a insertar lo mismo. Contando filas, ese minuto denso pesaría el
// doble que uno ralo y las zonas dirían cualquier cosa.
//
// Aquí cada muestra aporta EL INTERVALO HASTA LA SIGUIENTE, así que dos lecturas
// del mismo instante aportan cero segundos y el duplicado no cuenta: la
// integración por intervalo es inmune al problema por construcción, no por un
// filtro que alguien tenga que acordarse de poner.
//
// Y EL HUECO NO SE REPARTE. Lo que pasa del tope se declara «sin pulso» y se
// queda ahí. Repartirlo entre las zonas vecinas sería fabricar dato
// indistinguible del medido — la misma doctrina que la migración 0156 escribió
// para el eje explícito de la traza.
//
// MECANISMO, no método: aquí no hay un solo número que otro entrenador pondría
// en otro sitio. Dónde cortan las bandas es suyo y llega ya resuelto en `zones`.

import { zoneForBpm, HR_ZONES, type AthleteHrZones, type HrZone } from './hr-zones';
import { largestRemainder } from '../goal-gap/budget';

/**
 * Cuánto vale como mucho una muestra.
 *
 * 15 s = 3× la cadencia mediana MEDIDA dentro de un entreno (5 s), que cubre de
 * sobra el percentil 90 real (9 s) y deja fuera los parones. Es un tope de
 * MECANISMO: describe cada cuánto miden los aparatos, no cómo entrena nadie, así
 * que no es dato editable del coach. Si mañana la cadencia real cambia, este
 * número se vuelve a medir y se cambia aquí, con el nuevo dato en el comentario.
 */
export const HR_SAMPLE_MAX_INTERVAL_S = 15;

/** Una lectura de pulso situada en el tiempo, en segundos desde una referencia. */
export interface HrSampleAt {
  at_s: number;
  bpm: number;
}

/**
 * Segundos por zona, indexados por el NÚMERO de zona. Siempre las cinco claves:
 * una banda a 0 es una banda que el atleta no pisó, que es un hecho, no un hueco.
 *
 * Distinto a propósito del `ZoneSeconds` de `web/lib/execution/zone-seconds.ts`,
 * que lee las claves `z1…z5` del reparto que congeló el móvil: aquel es un
 * formato de transporte y este es el modelo.
 */
export type ZoneSecondsByZone = Record<HrZone, number>;

export interface TimeInZone {
  /** Segundos clasificados en cada banda. Suman `classified_s`. */
  by_zone: ZoneSecondsByZone;
  /** Segundos de la ventana que NO se pudieron repartir. */
  no_hr_s: number;
  /** Σ de las cinco bandas. `classified_s + no_hr_s` == duración de la ventana. */
  classified_s: number;
}

function emptyByZone(): ZoneSecondsByZone {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Todo el tramo sin repartir — la respuesta honesta cuando falta el ancla o el pulso. */
function allUnknown(window_s: number): TimeInZone {
  return { by_zone: emptyByZone(), no_hr_s: Math.max(0, Math.round(window_s)), classified_s: 0 };
}

/**
 * Reparte una ventana de tiempo entre las cinco bandas del atleta.
 *
 * `samples` van en segundos sobre el MISMO reloj que la ventana (quien llama
 * decide cuál: el `started_at` de la traza o el del tramo). No hace falta que
 * vengan ordenadas ni limpias de duplicados: se ordenan aquí.
 *
 * SIN ANCLA NO HAY ZONAS: con `zones` a null, la ventana entera es «sin pulso».
 * Es la misma negativa que `resolveHrZones`, sostenida hasta el final de la
 * cadena — una banda etiquetada pero fabricada es peor que una ausente porque a
 * simple vista no se distingue de una real.
 *
 * Los segundos salen ENTEROS y cuadran exactamente con la duración de la
 * ventana, así que el total de una fila nunca contradice al tramo del que sale.
 */
export function timeInZone(args: {
  samples: readonly HrSampleAt[];
  window_start_s: number;
  window_end_s: number;
  zones: AthleteHrZones | null;
}): TimeInZone {
  const { window_start_s, window_end_s, zones } = args;
  const window_s = Math.round(window_end_s - window_start_s);
  if (!Number.isFinite(window_s) || window_s <= 0) {
    // Una ventana de duración cero o rota no puede contener tiempo. Devolver la
    // duración medida por las muestras la inventaría; devolver 0 dice la verdad.
    return { by_zone: emptyByZone(), no_hr_s: 0, classified_s: 0 };
  }
  if (!zones) return allUnknown(window_s);

  const samples = args.samples
    .filter((s) => Number.isFinite(s.at_s) && Number.isFinite(s.bpm) && s.bpm > 0)
    .filter((s) => s.at_s >= window_start_s && s.at_s <= window_end_s)
    .sort((a, b) => a.at_s - b.at_s);
  if (samples.length === 0) return allUnknown(window_s);

  // Acumulado en coma flotante y redondeado UNA vez al final: redondear cada
  // intervalo iría acumulando error muestra a muestra sobre miles de ellas.
  const raw = emptyByZone();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const next = samples[i + 1];
    // El último tramo cubre hasta el tope o hasta el final de la ventana, lo que
    // llegue antes: la muestra dice cómo iba el pulso en ese momento, no cómo
    // acabó el entreno.
    const until = Math.min(
      next ? next.at_s : window_end_s,
      s.at_s + HR_SAMPLE_MAX_INTERVAL_S,
      window_end_s,
    );
    const dt = until - s.at_s;
    if (dt <= 0) continue; // dos lecturas del mismo instante: cero segundos
    const zone = zoneForBpm(s.bpm, zones);
    if (zone == null) continue; // pulso imposible: no clasifica, y no se rellena
    raw[zone] += dt;
  }

  const classifiedRaw = HR_ZONES.reduce((sum, z) => sum + raw[z], 0);
  // Nunca puede pasarse: cada intervalo está recortado dentro de la ventana.
  const classified_s = Math.min(window_s, Math.round(classifiedRaw));
  const shares = HR_ZONES.map((z) => (classifiedRaw > 0 ? raw[z] / classifiedRaw : 0));
  const rounded = largestRemainder(shares, classified_s);

  const by_zone = emptyByZone();
  HR_ZONES.forEach((z, i) => {
    by_zone[z] = rounded[i] ?? 0;
  });
  return { by_zone, no_hr_s: window_s - classified_s, classified_s };
}
