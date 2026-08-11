import 'server-only';

// LA SERIE DE UN ENTRENO, GUARDADA. El escritor que `workout_traces` no tenía.
//
// La tabla y su Zod existen desde la migración 0156 y hasta hoy no había ni una
// fila: el archivo que tiene que durar toda la vida deportiva del atleta empieza
// el día que alguien escribe en él. Esto es ese día por el lado del servidor —
// el motor en vivo emitirá las trazas en su propia tanda.
//
// UPSERT POR (ejecución, señal, fuente), que es el unique de la tabla. Un
// re-sync actualiza y nunca duplica, y la FUENTE va en la clave a propósito: la
// FC de la correa y la del reloj son dos medidas distintas del mismo fenómeno y
// conviven en filas separadas. Quien lee elige por fidelidad.
//
// AL GUARDAR PULSO SE RECALCULA EL REPARTO DE ZONAS de esa ejecución: la serie es
// mejor evidencia que las muestras sueltas con las que se hubiera reconstruido,
// así que la fila de zonas se rehace con lo mejor que hay. No es «recomputar el
// histórico» —eso sigue siendo un gesto explícito— sino terminar de ingerir lo
// que acaba de llegar.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { computeExecutionZoneSeconds } from '@/lib/zones/segment-zone-seconds';
import { computeMeasuredHeader } from '@/lib/execution/measured-header';
import { workoutTraceInputSchema } from '@fahybrid/shared/schema/workouts';

/**
 * Cuántos puntos caben en una señal. Una sesión de 90 min a la cadencia real
 * (~5 s) son ~1.100 puntos; 20.000 cubre un ultra de 24 h sin quedarse corto y
 * corta de raíz un payload que intente tumbar el proceso.
 */
export const TRACE_MAX_POINTS = 20_000;
/** Siete señales por dos aparatos: nadie manda más de esto en una sesión. */
export const TRACE_MAX_PER_REQUEST = 14;

export const workoutTracesPayloadSchema = z.object({
  execution_id: z.number().int().positive(),
  traces: z
    .array(
      workoutTraceInputSchema.superRefine((t, ctx) => {
        if (t.offsets_s.length > TRACE_MAX_POINTS) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_big,
            maximum: TRACE_MAX_POINTS,
            type: 'array',
            inclusive: true,
            message: `traza demasiado larga: ${t.offsets_s.length} puntos`,
            path: ['offsets_s'],
          });
        }
      }),
    )
    .min(1)
    .max(TRACE_MAX_PER_REQUEST),
});
export type WorkoutTracesPayload = z.infer<typeof workoutTracesPayloadSchema>;

export type IngestTracesResult =
  | { ok: false; reason: 'not_found' }
  | { ok: true; traces_saved: number; zones_recomputed: boolean; header_recomputed: boolean };

/**
 * Guarda las series de una ejecución del atleta autenticado.
 *
 * La ejecución se comprueba CONTRA EL ATLETA: un id ajeno responde «no
 * encontrado» y no escribe nada. Es la misma garantía que el resto de rutas de
 * sync, y aquí importa más porque la traza es el archivo del atleta.
 */
export async function ingestWorkoutTraces(args: {
  athlete_id: number;
  payload: WorkoutTracesPayload;
  client?: Sql;
}): Promise<IngestTracesResult> {
  const client = args.client ?? defaultSql;

  const owned = await client<Array<{ id: string }>>`
    select id::text as id from workout_executions
    where id = ${args.payload.execution_id} and athlete_id = ${args.athlete_id}
    limit 1
  `;
  if (owned.length === 0) return { ok: false, reason: 'not_found' };

  for (const t of args.payload.traces) {
    await client`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (
        ${args.payload.execution_id},
        ${t.signal},
        ${t.source},
        ${t.started_at}::timestamptz,
        ${t.offsets_s}::int[],
        ${t.values}::real[]
      )
      on conflict (execution_id, signal, source) do update set
        started_at = excluded.started_at,
        offsets_s  = excluded.offsets_s,
        values     = excluded.values
    `;
  }

  const hasHr = args.payload.traces.some((t) => t.signal === 'hr');
  if (hasHr) {
    await computeExecutionZoneSeconds({ execution_id: args.payload.execution_id, client });
  }

  // Las tres columnas huérfanas de la 0154 (deriva aeróbica, desnivel,
  // recuperación de pulso) exigen recorrer la traza entera — mismo gesto que el
  // reparto de zonas, disparado por las TRES señales que alimentan alguna de
  // ellas (hr+speed para la deriva, hr para la recuperación, altitude para el
  // desnivel), no solo por hr. Siempre relee TODAS las trazas ya guardadas de
  // la ejecución (no solo las de este payload), así que una subida en dos
  // pasos (hr ahora, speed más tarde) completa la deriva en cuanto llega la
  // segunda mitad sin perder la primera.
  const hasHeaderSignal = args.payload.traces.some((t) =>
    (['hr', 'speed', 'altitude'] as const).includes(t.signal as 'hr' | 'speed' | 'altitude'),
  );
  const header_recomputed = hasHeaderSignal
    ? (await computeMeasuredHeader({ execution_id: args.payload.execution_id, client })).written
    : false;

  return {
    ok: true,
    traces_saved: args.payload.traces.length,
    zones_recomputed: hasHr,
    header_recomputed,
  };
}
