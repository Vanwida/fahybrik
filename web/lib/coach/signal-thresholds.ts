import 'server-only';

// Umbrales de señal del coach — la capa de lectura/escritura sobre
// `coach_signal_thresholds` (migs 0161 y 0211).
//
// El motor de señales evalúa con `EffectiveThresholds`: los defectos del sistema
// (`SIGNAL_THRESHOLDS`) con la fila del coach encima. Este módulo es el ÚNICO
// resolutor de esa mezcla, para que el barrido, las superficies que pintan
// bandas y el editor del coach no puedan discrepar sobre cuál es el umbral
// vigente. En la fila, una columna nula = el defecto (`COACH_THRESHOLD_SPEC`).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import {
  COACH_THRESHOLD_KEYS,
  DEFAULT_COACH_THRESHOLDS,
  mergeCoachThresholds,
  type CoachThresholdKey,
  type CoachThresholdOverrides,
  type CoachThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { EffectiveThresholds } from '@fahybrid/shared/domain/coach/signals';
import type {
  CoachSignalThresholdsPutInput,
  CoachSignalThresholdsResponse,
} from '@fahybrid/shared/schema/coach-signal-thresholds';

const TABLE = 'coach_signal_thresholds';

type ThresholdRow = CoachThresholdOverrides & { updated_at: string };

/**
 * La fila del coach, o null si no ha escrito ninguna. `select *` a propósito: la
 * tabla solo tiene columnas de umbral, y así un entorno a medio migrar (sin 0211)
 * sigue sirviendo lo que tenga — una columna que falta se lee como nula, es decir,
 * como el defecto — en vez de tumbar el barrido.
 */
async function loadRow(coach_id: bigint | number, client: Sql): Promise<ThresholdRow | null> {
  try {
    const rows = await client<Array<Record<string, unknown>>>`
      select * from coach_signal_thresholds where coach_id = ${Number(coach_id)} limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const at = row.updated_at;
    const out: ThresholdRow = { updated_at: at instanceof Date ? at.toISOString() : String(at) };
    for (const k of COACH_THRESHOLD_KEYS) {
      const v = row[k];
      out[k] = v == null ? null : Number(v);
    }
    return out;
  } catch (err) {
    // Entorno sin migrar: servir los defectos en vez de tumbar el barrido entero.
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

/** Los umbrales editables efectivos de un coach (defecto + su fila). */
export async function resolveCoachThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachThresholds> {
  return mergeCoachThresholds(await loadRow(coach_id, client));
}

/**
 * Los umbrales VIGENTES para evaluar: los del sistema (`SIGNAL_THRESHOLDS`) con
 * los editables del coach encima. Es la única lectura que necesita el motor.
 */
export async function resolveEffectiveThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<EffectiveThresholds> {
  const coach = await resolveCoachThresholds(coach_id, client);
  return { ...SIGNAL_THRESHOLDS, ...coach };
}

function toResponse(row: ThresholdRow | null): CoachSignalThresholdsResponse {
  const effective = mergeCoachThresholds(row);
  const custom_keys = row
    ? COACH_THRESHOLD_KEYS.filter((k) => row[k] != null)
    : ([] as CoachThresholdKey[]);
  return {
    ...effective,
    is_custom: custom_keys.length > 0,
    custom_keys,
    defaults: { ...DEFAULT_COACH_THRESHOLDS },
    updated_at: row?.updated_at ?? null,
  };
}

/** El GET del editor: los efectivos + cuáles son del coach + los defectos. */
export async function getCoachSignalThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachSignalThresholdsResponse> {
  return toResponse(await loadRow(coach_id, client));
}

/**
 * Lo que quedaría vigente si se aplicara `patch` — para validar la coherencia
 * entre campos ANTES de escribir (la ruta rechaza con 422).
 */
export async function previewCoachThresholds(
  coach_id: bigint | number,
  patch: CoachSignalThresholdsPutInput,
  client: Sql = defaultSql,
): Promise<CoachThresholds> {
  const row = await loadRow(coach_id, client);
  const next: CoachThresholdOverrides = { ...(row ?? {}) };
  for (const k of COACH_THRESHOLD_KEYS) {
    if (k in patch) next[k] = patch[k] ?? null;
  }
  return mergeCoachThresholds(next);
}

/**
 * El PUT del editor: escribe SOLO las claves recibidas (número o null = volver al
 * defecto) y deja el resto como estaba. `patch` llega validado por el esquema Zod
 * de la ruta.
 */
export async function upsertCoachSignalThresholds(
  coach_id: bigint | number,
  patch: CoachSignalThresholdsPutInput,
  client: Sql = defaultSql,
): Promise<CoachSignalThresholdsResponse> {
  const keys: string[] = COACH_THRESHOLD_KEYS.filter((k) => k in patch);
  const values: Record<string, number | null> = {};
  for (const k of COACH_THRESHOLD_KEYS) if (k in patch) values[k] = patch[k] ?? null;

  if (keys.length > 0) {
    const insertRow: Record<string, number | null> = { coach_id: Number(coach_id), ...values };
    const insertCols: string[] = ['coach_id', ...keys];
    await client`
      insert into coach_signal_thresholds ${client(insertRow, insertCols)}
      on conflict (coach_id) do update set
        ${client(values, keys)},
        updated_at = now()
    `;
  }
  return getCoachSignalThresholds(coach_id, client);
}
