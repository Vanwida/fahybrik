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
import { getTestCadenceSetting } from '@/lib/coach/test-cadence';
import { testDueDays } from '@fahybrid/shared/domain/coach/test-cadence';
import {
  COACH_THRESHOLD_KEYS,
  DEFAULT_COACH_THRESHOLDS,
  mergeCoachThresholds,
  type CoachThresholdKey,
  type CoachThresholdOverrides,
  type CoachThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { EffectiveThresholds } from '@fahybrid/shared/domain/coach/signals';
import {
  DEFAULT_WRIST_RPE_WORDS,
  buildWristMethod,
  effectiveWristRpeWords,
  type WristMethod,
} from '@fahybrid/shared/domain/coach/wrist-method';
import type {
  CoachSignalThresholdsPutInput,
  CoachSignalThresholdsResponse,
} from '@fahybrid/shared/schema/coach-signal-thresholds';

const TABLE = 'coach_signal_thresholds';

/**
 * La fila del coach: cada umbral es su número o null (= el defecto), más las
 * palabras del RPE de la muñeca (text[], no caben en el registro numérico).
 */
type ThresholdRow = CoachThresholdOverrides & {
  wrist_rpe_words: string[] | null;
  updated_at: string;
};

/** Una fila cruda de `coach_signal_thresholds` → la del coach. UNA lectura para el editor, el barrido y el reloj. */
function parseRow(row: Record<string, unknown>): ThresholdRow {
  const at = row.updated_at;
  const words = row.wrist_rpe_words;
  const out: ThresholdRow = {
    wrist_rpe_words: Array.isArray(words) ? (words as string[]) : null,
    updated_at: at instanceof Date ? at.toISOString() : String(at),
  };
  for (const k of COACH_THRESHOLD_KEYS) {
    const v = row[k];
    out[k] = v == null ? null : Number(v);
  }
  return out;
}

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
    return row ? parseRow(row) : null;
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
  const [coach, cadence] = await Promise.all([
    resolveCoachThresholds(coach_id, client),
    getTestCadenceSetting(coach_id, client),
  ]);
  // «Toca test» no es un número suelto: salta cuando pasa la repetición más
  // corta del coach (su cadencia de tests, mig 0259), no a los 35 días fijos.
  return { ...SIGNAL_THRESHOLDS, ...coach, test_due_days: testDueDays(cadence.stored) };
}

/**
 * El método de la muñeca de UN atleta: el de su coach, listo para el reloj. Sin
 * coach, sin fila del coach o en un entorno sin la migración 0282, sale el de
 * fábrica — nunca un hueco, nunca un fallo (un reloj que no recibe método no
 * sabe avisar, y eso no puede depender de que el coach haya abierto Ajustes).
 */
export async function resolveAthleteWristMethod(
  athlete_id: bigint | number,
  client: Sql = defaultSql,
): Promise<WristMethod> {
  try {
    const rows = await client<Array<Record<string, unknown>>>`
      select t.* from athletes a
      join coach_signal_thresholds t on t.coach_id = a.coach_id
      where a.id = ${Number(athlete_id)}
      limit 1
    `;
    const row = rows[0] ? parseRow(rows[0]) : null;
    return buildWristMethod(mergeCoachThresholds(row), row?.wrist_rpe_words);
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return buildWristMethod(mergeCoachThresholds(null), null);
    throw err;
  }
}

function toResponse(row: ThresholdRow | null): CoachSignalThresholdsResponse {
  const effective = mergeCoachThresholds(row);
  const custom_keys = row
    ? COACH_THRESHOLD_KEYS.filter((k) => row[k] != null)
    : ([] as CoachThresholdKey[]);
  const wristWordsCustom = row?.wrist_rpe_words != null;
  return {
    ...effective,
    wrist_rpe_words: effectiveWristRpeWords(row?.wrist_rpe_words),
    wrist_rpe_words_custom: wristWordsCustom,
    default_wrist_rpe_words: [...DEFAULT_WRIST_RPE_WORDS],
    is_custom: custom_keys.length > 0 || wristWordsCustom,
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
  const values: Record<string, number | string[] | null> = {};
  for (const k of COACH_THRESHOLD_KEYS) if (k in patch) values[k] = patch[k] ?? null;
  // Las palabras del RPE de la muñeca: las once del coach, o null = las de fábrica.
  if ('wrist_rpe_words' in patch) {
    keys.push('wrist_rpe_words');
    values.wrist_rpe_words = patch.wrist_rpe_words ?? null;
  }

  if (keys.length > 0) {
    const insertRow: Record<string, number | string[] | null> = { coach_id: Number(coach_id), ...values };
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
