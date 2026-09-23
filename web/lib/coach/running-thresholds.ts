import 'server-only';

// Umbrales de carrera del coach — la capa de lectura sobre
// `coach_running_thresholds` (mig 0183 + 0184 + 0187). Espejo de web/lib/
// coach/signal-thresholds.ts.
//
// Los leen DOS lecturas: los agregados del coach (`running-analytics.ts`) y el
// «¿estoy mejorando?» del atleta (`athlete/analytics/running-progress.ts`).
// Comparten fila a propósito — `min_pairs_for_compromised_trend` gobierna la
// MISMA curva de correr cansado en las dos pantallas, y dos umbrales para una
// curva es una discrepancia esperando a pasar.
//
// A diferencia de los umbrales de señal (que se mezclan sobre un objeto de
// constantes DEL MOTOR más grande, `SIGNAL_THRESHOLDS`), aquí las columnas
// SON el conjunto entero de lo editable — no hay nada más grande en lo que
// se inserten. `resolveEffectiveRunningThresholds` es por tanto el único
// resolutor: la fila del coach si existe, si no, los defectos.
//
// El editor vive en Ajustes › Método (sección «Lecturas de carrera»). Guardar
// mezcla lo que cambia sobre lo vigente y escribe el conjunto entero: las
// columnas son NOT NULL, así que «volver al defecto» de una clave es escribir
// el defecto, y sin fila el coach ve los defectos.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  COACH_RUNNING_THRESHOLD_KEYS,
  defaultCoachRunningThresholds,
  type CoachRunningThresholds,
} from '@fahybrid/shared/domain/coach/running-thresholds';

const TABLE = 'coach_running_thresholds';

/**
 * La fila cruda del coach. `select *` A PROPÓSITO, y es lo que hace que el
 * resolutor cumpla lo que promete abajo: con una lista explícita de columnas,
 * el hueco entre desplegar código que lee una columna nueva y correr su
 * migración es una excepción de Postgres en cada lectura — justo el momento en
 * que más caro sale. Con `*`, la columna que aún no existe simplemente no
 * viene, y el defecto la rellena. Las columnas de más no se cuelan porque
 * abajo se recogen las claves editables por su lista, nunca la fila entera.
 */
async function loadRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<Record<string, unknown> | null> {
  try {
    const rows = await client<Array<Record<string, unknown>>>`
      select * from coach_running_thresholds
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
 * Un umbral, en número. `numeric` (volume_surge_ratio) llega de postgres.js
 * como CADENA, y una cadena colada aquí haría que `0.2 >= subida` comparase
 * texto contra número — el aviso de exceso de carga saltaría o no saltaría por
 * motivos que nadie podría explicar. Null/undefined devuelven null para que el
 * defecto tome el relevo en vez de sobrescribirlo con `undefined`.
 */
function comoNumero(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Los umbrales VIGENTES para los agregados de carrera de un coach: su fila
 * si la ha escrito, si no, los defectos del sistema. Es la única lectura que
 * necesita `running-analytics.ts` — no le importa quién escribió cada
 * número, sólo cuál manda.
 */
export async function resolveEffectiveRunningThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachRunningThresholds> {
  const row = await loadRow(coach_id, client);
  if (!row) return defaultCoachRunningThresholds();
  // Se cogen las claves editables por su lista, no la fila entera: `coach_id`
  // y `updated_at` vienen en el `select *` y no son umbrales. Y las que llegan
  // vacías se DESCARTAN antes de esparcir: `{...defectos, x: undefined}` deja
  // `undefined`, no el defecto — el mismo hueco que esta función existe para
  // tapar cuando una migración va por detrás del despliegue.
  const values: Partial<CoachRunningThresholds> = {};
  for (const k of COACH_RUNNING_THRESHOLD_KEYS) {
    const n = comoNumero(row[k]);
    if (n != null) values[k] = n;
  }
  return { ...defaultCoachRunningThresholds(), ...values };
}

/**
 * Los umbrales vigentes para UN ATLETA, por su coach. Espejo exacto de
 * `resolveAthleteHrMethod`.
 *
 * Un atleta sin coach (el alta libre, las cuentas de prueba) usa los defectos.
 * Es la respuesta correcta y no un caso raro: nadie ha movido sus umbrales.
 *
 * Existe para los llamadores que tienen el atleta en la mano y no su coach —
 * el detalle de una sesión, que necesita mandarle al móvil el umbral de
 * pendiente del coach dentro de `run_compliance`.
 */
export async function resolveAthleteRunningThresholds(
  athlete_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachRunningThresholds> {
  const rows = await client<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${Number(athlete_id)} limit 1
  `;
  const coachId = rows[0]?.coach_id;
  if (!coachId) return defaultCoachRunningThresholds();
  return resolveEffectiveRunningThresholds(Number(coachId), client);
}

/** Lo que pinta el editor: lo vigente, si hay fila suya, y los defectos. */
export async function getCoachRunningThresholdsSetting(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<{ thresholds: CoachRunningThresholds; is_custom: boolean; defaults: CoachRunningThresholds }> {
  const row = await loadRow(coach_id, client);
  return {
    thresholds: await resolveEffectiveRunningThresholds(coach_id, client),
    is_custom: row != null,
    defaults: defaultCoachRunningThresholds(),
  };
}

/**
 * Cambiar umbrales: las claves de `patch` (null = su defecto) sobre lo vigente,
 * guardado como conjunto entero. Si todo queda en los defectos, se borra la fila
 * (sin fila = defectos; así «restaurar» deja al coach como uno que nunca tocó).
 */
export async function patchCoachRunningThresholds(
  coach_id: bigint | number,
  patch: Partial<Record<keyof CoachRunningThresholds, number | null>>,
  client: Sql = defaultSql,
): Promise<CoachRunningThresholds> {
  const defaults = defaultCoachRunningThresholds();
  const current = await resolveEffectiveRunningThresholds(coach_id, client);
  const next: CoachRunningThresholds = { ...current };
  for (const k of COACH_RUNNING_THRESHOLD_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    next[k] = v == null ? defaults[k] : v;
  }
  if (COACH_RUNNING_THRESHOLD_KEYS.every((k) => next[k] === defaults[k])) {
    await client`delete from coach_running_thresholds where coach_id = ${coach_id}`;
    return next;
  }
  await client`
    insert into coach_running_thresholds (
      coach_id, min_reps_per_position, min_series_for_calibration, freshness_alert_tsb,
      min_pairs_for_compromised_trend, min_weeks_to_judge, meaningful_gain_s_per_km,
      volume_surge_ratio, good_in_band_pct, min_reps_to_judge_band, same_hr_reference_zone,
      same_hr_tolerance_bpm, same_hr_min_distance_m, gradient_retires_pace_pct, updated_at
    ) values (
      ${coach_id}, ${next.min_reps_per_position}, ${next.min_series_for_calibration}, ${next.freshness_alert_tsb},
      ${next.min_pairs_for_compromised_trend}, ${next.min_weeks_to_judge}, ${next.meaningful_gain_s_per_km},
      ${next.volume_surge_ratio}, ${next.good_in_band_pct}, ${next.min_reps_to_judge_band}, ${next.same_hr_reference_zone},
      ${next.same_hr_tolerance_bpm}, ${next.same_hr_min_distance_m}, ${next.gradient_retires_pace_pct}, now()
    )
    on conflict (coach_id) do update set
      min_reps_per_position = excluded.min_reps_per_position,
      min_series_for_calibration = excluded.min_series_for_calibration,
      freshness_alert_tsb = excluded.freshness_alert_tsb,
      min_pairs_for_compromised_trend = excluded.min_pairs_for_compromised_trend,
      min_weeks_to_judge = excluded.min_weeks_to_judge,
      meaningful_gain_s_per_km = excluded.meaningful_gain_s_per_km,
      volume_surge_ratio = excluded.volume_surge_ratio,
      good_in_band_pct = excluded.good_in_band_pct,
      min_reps_to_judge_band = excluded.min_reps_to_judge_band,
      same_hr_reference_zone = excluded.same_hr_reference_zone,
      same_hr_tolerance_bpm = excluded.same_hr_tolerance_bpm,
      same_hr_min_distance_m = excluded.same_hr_min_distance_m,
      gradient_retires_pace_pct = excluded.gradient_retires_pace_pct,
      updated_at = now()
  `;
  return next;
}
