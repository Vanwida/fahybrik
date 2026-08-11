import 'server-only';

// CUANDO EL PULSO LLEGA TARDE, LAS ZONAS SE REHACEN.
//
// El motor de zonas (`lib/zones/segment-zone-seconds`) cruza las muestras de pulso
// con la ventana de cada tramo. Si el pulso de un entreno de hace ocho meses no
// estaba guardado cuando se calculó, su fila quedó en `hr_origin='none'` — gris
// honesto, «se miró y no había». El import del histórico de Apple Salud trae
// justamente ese pulso, así que al aterrizar hay que volver a preguntarle al motor.
//
// LA DISTINCIÓN QUE IMPORTA, Y QUE NO ES UN DETALLE. Esto NO es «recalcular el
// histórico en silencio», que el modelo prohíbe: aquello es rehacer lo ya calculado
// porque el COACH movió las anclas, y eso cambia la forma de una gráfica que nadie ha
// tocado, así que es un botón. Esto es lo contrario — llegó EVIDENCIA que antes no
// existía y se rellena un hueco declarado. Un tramo que decía «sin pulso» pasa a
// decir la verdad; ninguno que ya tenía dato cambia de valor por este camino.
//
// SE RECALCULA POR EJECUCIÓN Y AL FINAL DEL LOTE, jamás por muestra: el motor lee de
// la base todas las muestras de la ventana, así que recalcular por muestra haría el
// mismo trabajo N veces para llegar al mismo sitio. Y es idempotente: si el pulso de
// un tramo llega repartido en tres páginas, cada una recalcula y la última acierta.

import type { Sql } from '@/lib/db';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { computeExecutionZoneSeconds } from '@/lib/zones/segment-zone-seconds';

/**
 * Tope de ejecuciones por lote. Una página de histórico abarca un rato, no un año,
 * así que en la práctica son una o dos; el tope existe para que un cliente que mande
 * una ventana absurda no convierta un POST en una reconstrucción entera (para eso
 * está `infra/scripts/backfill_zone_seconds.ts`, que se lanza a mano).
 */
const MAX_EXECUTIONS_PER_BATCH = 200;

/**
 * Rehace el reparto por zonas de las ejecuciones cuyos tramos caen dentro de
 * `[from, to]`. Devuelve cuántas se recalcularon.
 *
 * Nunca deja caer el lote: la ingesta de un dato no puede fallar porque el recálculo
 * de una gráfica se atragante. Lo que no se pueda rehacer ahora lo rehace el
 * reconstructor.
 */
export async function recomputeZonesForSampleWindow(args: {
  sql: Sql;
  athlete_id: bigint;
  /** Instante de la muestra nueva más antigua del lote (ISO). */
  from: string;
  /** Instante de la muestra nueva más reciente del lote (ISO). */
  to: string;
}): Promise<number> {
  const { sql, athlete_id, from, to } = args;
  const id = athlete_id as unknown as number;

  // Tramos que SOLAPAN la ventana, no que estén contenidos en ella: una página de
  // 500 pulsos cubre unos minutos dentro de un tramo de media hora, y ese tramo hay
  // que recalcularlo entero.
  const rows = await sql<Array<{ id: string }>>`
    select we.id::text as id
    from workout_executions we
    join segment_executions se on se.execution_id = we.id
    where we.athlete_id = ${id}
      and se.started_at is not null
      and se.ended_at is not null
      and se.started_at <= ${to}::timestamptz
      and se.ended_at >= ${from}::timestamptz
    -- Agrupar y no distinct: la ejecución sale una vez aunque solapen ocho de sus
    -- tramos, y el orden va por el id NUMÉRICO (en texto, el 100 iría antes del 99).
    group by we.id
    order by we.id asc
    limit ${MAX_EXECUTIONS_PER_BATCH}
  `;
  if (rows.length === 0) return 0;

  // Las anclas del atleta se resuelven UNA vez y se reparten: son las mismas para
  // todas sus ejecuciones, y el motor las volvería a pedir en cada llamada.
  const zones = await loadAthleteHrZones(Number(athlete_id), sql);

  let recomputed = 0;
  for (const row of rows) {
    try {
      await computeExecutionZoneSeconds({ execution_id: Number(row.id), client: sql, zones });
      recomputed += 1;
    } catch {
      // Una ejecución rota no puede tumbar la ingesta de las otras 199 ni el lote.
    }
  }
  return recomputed;
}
