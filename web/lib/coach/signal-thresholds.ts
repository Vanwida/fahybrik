import 'server-only';

// Umbrales de señal del coach — la capa de lectura/escritura sobre
// `coach_signal_thresholds` (mig 0161).
//
// El motor de señales evalúa con `EffectiveThresholds`: los defectos del sistema
// (`SIGNAL_THRESHOLDS`) con la fila del coach encima. Este módulo es el ÚNICO
// resolutor de esa mezcla, para que el barrido y el editor del coach no puedan
// discrepar sobre cuál es el umbral vigente. Espejo de web/lib/coach/import-defaults.ts.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import {
  COACH_SIGNAL_THRESHOLD_KEYS,
  defaultCoachSignalThresholds,
  type CoachSignalThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { EffectiveThresholds } from '@fahybrid/shared/domain/coach/signals';
import type { CoachSignalThresholdsResponse } from '@fahybrid/shared/schema/coach-signal-thresholds';

const TABLE = 'coach_signal_thresholds';

interface ThresholdRow extends CoachSignalThresholds {
  updated_at: string;
}

/** La fila del coach, o null si no ha escrito ninguna. Única por coach. */
async function loadRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<ThresholdRow | null> {
  try {
    const rows = await client<ThresholdRow[]>`
      select
        communication_question_unanswered_days,
        communication_task_overdue_critical_days,
        communication_protocol_unopened_days,
        updated_at::text as updated_at
      from coach_signal_thresholds
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    // Entorno sin migrar: servir los defectos en vez de tumbar el barrido entero.
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

/**
 * Los umbrales VIGENTES para evaluar: los defectos del sistema con la fila del
 * coach encima. Es la única lectura que necesita el motor — no le importa quién
 * escribió cada número, sólo cuál manda.
 */
export async function resolveEffectiveThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<EffectiveThresholds> {
  const row = await loadRow(coach_id, client);
  if (!row) return SIGNAL_THRESHOLDS;
  // Se cogen las claves editables por su lista, no la fila entera: `updated_at`
  // es texto y no tiene sitio en un registro de umbrales.
  const values = Object.fromEntries(COACH_SIGNAL_THRESHOLD_KEYS.map((k) => [k, row[k]]));
  return { ...SIGNAL_THRESHOLDS, ...values };
}

/**
 * El GET del editor: los umbrales resueltos + si son suyos o los del sistema
 * (para que la pantalla pueda decir «usando los del sistema»).
 */
export async function getCoachSignalThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachSignalThresholdsResponse> {
  const row = await loadRow(coach_id, client);
  if (row) {
    const { updated_at, ...values } = row;
    return { ...values, is_custom: true, updated_at };
  }
  return { ...defaultCoachSignalThresholds(), is_custom: false, updated_at: null };
}

/**
 * El PUT del editor: reemplaza el conjunto entero del coach (sin parche por
 * campo). `values` llega ya validado por el esquema Zod de la ruta.
 */
export async function upsertCoachSignalThresholds(
  coach_id: bigint | number,
  values: CoachSignalThresholds,
  client: Sql = defaultSql,
): Promise<CoachSignalThresholdsResponse> {
  const rows = await client<{ updated_at: string }[]>`
    insert into coach_signal_thresholds (
      coach_id,
      communication_question_unanswered_days,
      communication_task_overdue_critical_days,
      communication_protocol_unopened_days,
      updated_at
    )
    values (
      ${coach_id},
      ${values.communication_question_unanswered_days},
      ${values.communication_task_overdue_critical_days},
      ${values.communication_protocol_unopened_days},
      now()
    )
    on conflict (coach_id) do update set
      communication_question_unanswered_days = excluded.communication_question_unanswered_days,
      communication_task_overdue_critical_days = excluded.communication_task_overdue_critical_days,
      communication_protocol_unopened_days = excluded.communication_protocol_unopened_days,
      updated_at = now()
    returning updated_at::text as updated_at
  `;
  return {
    ...values,
    is_custom: true,
    updated_at: rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
