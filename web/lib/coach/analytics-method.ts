import 'server-only';

// El MÉTODO del coach para las analíticas del atleta — la capa de lectura y
// escritura sobre `coach_analytics_method` (migs 0189, 0190, 0277, 0279).
//
// Lo leen las familias de lecturas: la carga única (escalera por modalidad,
// coeficiente de fuerza, cobertura del veredicto), la forma (ventanas, bandas de
// frescura, aviso de subida), las semanas (cambio significativo), la capacidad
// (las puertas del ajuste de velocidad crítica) y la recuperación (objetivo de
// sueño, noches mínimas, ventana basal). Comparten fila a propósito: son el
// método de UN coach sobre UN atleta, y partirlas en tablas obligaría a resolver
// varias filas para pintar una pantalla.
//
// GUARDAR ES REEMPLAZAR EL CONJUNTO ENTERO — sin parche por campo — y valida
// con `validarMetodoAnalitico` antes de escribir, porque hay reglas que ningún
// CHECK por columna puede cubrir (que lo reciente sea menos que el fondo, que las
// bandas de frescura vayan en orden, que una modalidad no liste un peldaño que
// no puede preciar). «Restaurar» borra la fila: sin fila, mandan los defectos.
// Mismo patrón que `hr-method.ts`.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  BASES_CUMPLIMIENTO,
  BASES_SESION,
  COACH_ANALYTICS_METHOD_KEYS,
  COACH_ANALYTICS_METHOD_LIST_KEYS,
  defaultCoachAnalyticsMethod,
  FUENTES_CARGA,
  type BaseCumplimiento,
  type BaseSesion,
  type CoachAnalyticsMethod,
  type FuenteCarga,
} from '@fahybrid/shared/domain/analytics/metodo';
import { resolveMethodRow, type LectorColumna } from './method-row';

const TABLE = 'coach_analytics_method';

/** Un `text[]` de peldaños: solo si TODOS son del vocabulario; si no, el defecto. */
const comoFuentes: LectorColumna<FuenteCarga[]> = (v) => {
  if (!Array.isArray(v) || v.length === 0) return null;
  const ok = v.every((x) => typeof x === 'string' && (FUENTES_CARGA as readonly string[]).includes(x));
  return ok ? (v as FuenteCarga[]) : null;
};

/** Un `text[]` de bases de una sesión: solo si TODAS son del vocabulario; si no, el defecto. */
const comoBasesSesion: LectorColumna<BaseSesion[]> = (v) => {
  if (!Array.isArray(v) || v.length === 0) return null;
  const ok = v.every((x) => typeof x === 'string' && (BASES_SESION as readonly string[]).includes(x));
  return ok ? (v as BaseSesion[]) : null;
};

const comoBase: LectorColumna<BaseCumplimiento> = (v) =>
  typeof v === 'string' && (BASES_CUMPLIMIENTO as readonly string[]).includes(v) ? (v as BaseCumplimiento) : null;

const LECTORES: Parameters<typeof resolveMethodRow<CoachAnalyticsMethod>>[0]['parse'] = {
  fuentes_run: comoFuentes,
  fuentes_row: comoFuentes,
  fuentes_ski: comoFuentes,
  fuentes_bike: comoFuentes,
  fuentes_strength: comoFuentes,
  fuentes_other: comoFuentes,
  cumplimiento_base: comoBase,
  cumplimiento_sesion_bases: comoBasesSesion,
};

/**
 * El método vigente de un coach: su fila si la ha escrito, si no, los defectos
 * — que son EXACTAMENTE el comportamiento de siempre, así que un coach que no
 * ha tocado nada ve los mismos números que veía.
 */
export async function resolveEffectiveAnalyticsMethod(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachAnalyticsMethod> {
  return resolveMethodRow<CoachAnalyticsMethod>({
    table: TABLE,
    keys: COACH_ANALYTICS_METHOD_KEYS,
    defaults: defaultCoachAnalyticsMethod(),
    coach_id,
    client,
    parse: LECTORES,
  });
}

/** ¿Tiene fila propia? (para el editor: «restaurar» solo tiene sentido si la hay). */
async function tieneFila(coach_id: bigint | number, client: Sql): Promise<boolean> {
  try {
    const rows = await client<Array<{ uno: number }>>`
      select 1 as uno from coach_analytics_method where coach_id = ${coach_id} limit 1
    `;
    return rows.length > 0;
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return false;
    throw err;
  }
}

/**
 * Guardar reemplaza el conjunto entero del coach. Las listas van como text[];
 * postgres.js las serializa desde un array de JS.
 */
export async function upsertCoachAnalyticsMethod(
  coach_id: bigint | number,
  m: CoachAnalyticsMethod,
  client: Sql = defaultSql,
): Promise<CoachAnalyticsMethod> {
  await client`
    insert into coach_analytics_method (
      coach_id,
      ctl_days, atl_days, ramp_alert_tss_per_week, acr_low, acr_high,
      fuentes_run, fuentes_row, fuentes_ski, fuentes_bike, fuentes_strength, fuentes_other,
      fuerza_coeficiente, cobertura_veredicto_min_pct,
      frescura_sobrecarga_hasta, frescura_optimo_hasta, frescura_mantener_hasta, frescura_fresco_hasta,
      cumplimiento_base, cumplimiento_bien_pct, cumplimiento_regular_pct,
      cumplimiento_sesion_bases, cumplimiento_verde_min_pct, cumplimiento_verde_max_pct,
      cumplimiento_ambar_min_pct, cumplimiento_ambar_max_pct,
      holgura_ritmo_s_km, holgura_split_s_500m, holgura_vatios_w, holgura_pulso_ppm,
      holgura_rpe, holgura_rir, holgura_carga_pct, holgura_dosis_pct,
      cambio_carga_pct, cambio_horas_pct, cambio_forma_tss, cambio_frescura_tss,
      cambio_variabilidad_pct, cambio_pulso_reposo_bpm, cambio_sueno_horas, cambio_cumplimiento_pts,
      basal_dias, basal_excluir_dias,
      cs_min_efforts, cs_min_duration_s, cs_max_duration_s, cs_min_spread_ratio, cs_min_fit_r2_pct, cs_max_drift_from_threshold_pct,
      sleep_target_hours, hrv_min_nights_baseline, hrv_min_nights_recent,
      subida_dias, subida_minima_pct, cobertura_ciega_alerta_pct,
      updated_at
    ) values (
      ${coach_id},
      ${m.ctl_days}, ${m.atl_days}, ${m.ramp_alert_tss_per_week}, ${m.acr_low}, ${m.acr_high},
      ${m.fuentes_run}, ${m.fuentes_row}, ${m.fuentes_ski}, ${m.fuentes_bike}, ${m.fuentes_strength}, ${m.fuentes_other},
      ${m.fuerza_coeficiente}, ${m.cobertura_veredicto_min_pct},
      ${m.frescura_sobrecarga_hasta}, ${m.frescura_optimo_hasta}, ${m.frescura_mantener_hasta}, ${m.frescura_fresco_hasta},
      ${m.cumplimiento_base}, ${m.cumplimiento_bien_pct}, ${m.cumplimiento_regular_pct},
      ${m.cumplimiento_sesion_bases}, ${m.cumplimiento_verde_min_pct}, ${m.cumplimiento_verde_max_pct},
      ${m.cumplimiento_ambar_min_pct}, ${m.cumplimiento_ambar_max_pct},
      ${m.holgura_ritmo_s_km}, ${m.holgura_split_s_500m}, ${m.holgura_vatios_w}, ${m.holgura_pulso_ppm},
      ${m.holgura_rpe}, ${m.holgura_rir}, ${m.holgura_carga_pct}, ${m.holgura_dosis_pct},
      ${m.cambio_carga_pct}, ${m.cambio_horas_pct}, ${m.cambio_forma_tss}, ${m.cambio_frescura_tss},
      ${m.cambio_variabilidad_pct}, ${m.cambio_pulso_reposo_bpm}, ${m.cambio_sueno_horas}, ${m.cambio_cumplimiento_pts},
      ${m.basal_dias}, ${m.basal_excluir_dias},
      ${m.cs_min_efforts}, ${m.cs_min_duration_s}, ${m.cs_max_duration_s}, ${m.cs_min_spread_ratio}, ${m.cs_min_fit_r2_pct}, ${m.cs_max_drift_from_threshold_pct},
      ${m.sleep_target_hours}, ${m.hrv_min_nights_baseline}, ${m.hrv_min_nights_recent},
      ${m.subida_dias}, ${m.subida_minima_pct}, ${m.cobertura_ciega_alerta_pct},
      now()
    )
    on conflict (coach_id) do update set
      ctl_days = excluded.ctl_days,
      atl_days = excluded.atl_days,
      ramp_alert_tss_per_week = excluded.ramp_alert_tss_per_week,
      acr_low = excluded.acr_low,
      acr_high = excluded.acr_high,
      fuentes_run = excluded.fuentes_run,
      fuentes_row = excluded.fuentes_row,
      fuentes_ski = excluded.fuentes_ski,
      fuentes_bike = excluded.fuentes_bike,
      fuentes_strength = excluded.fuentes_strength,
      fuentes_other = excluded.fuentes_other,
      fuerza_coeficiente = excluded.fuerza_coeficiente,
      cobertura_veredicto_min_pct = excluded.cobertura_veredicto_min_pct,
      frescura_sobrecarga_hasta = excluded.frescura_sobrecarga_hasta,
      frescura_optimo_hasta = excluded.frescura_optimo_hasta,
      frescura_mantener_hasta = excluded.frescura_mantener_hasta,
      frescura_fresco_hasta = excluded.frescura_fresco_hasta,
      cumplimiento_base = excluded.cumplimiento_base,
      cumplimiento_bien_pct = excluded.cumplimiento_bien_pct,
      cumplimiento_regular_pct = excluded.cumplimiento_regular_pct,
      cumplimiento_sesion_bases = excluded.cumplimiento_sesion_bases,
      cumplimiento_verde_min_pct = excluded.cumplimiento_verde_min_pct,
      cumplimiento_verde_max_pct = excluded.cumplimiento_verde_max_pct,
      cumplimiento_ambar_min_pct = excluded.cumplimiento_ambar_min_pct,
      cumplimiento_ambar_max_pct = excluded.cumplimiento_ambar_max_pct,
      holgura_ritmo_s_km = excluded.holgura_ritmo_s_km,
      holgura_split_s_500m = excluded.holgura_split_s_500m,
      holgura_vatios_w = excluded.holgura_vatios_w,
      holgura_pulso_ppm = excluded.holgura_pulso_ppm,
      holgura_rpe = excluded.holgura_rpe,
      holgura_rir = excluded.holgura_rir,
      holgura_carga_pct = excluded.holgura_carga_pct,
      holgura_dosis_pct = excluded.holgura_dosis_pct,
      cambio_carga_pct = excluded.cambio_carga_pct,
      cambio_horas_pct = excluded.cambio_horas_pct,
      cambio_forma_tss = excluded.cambio_forma_tss,
      cambio_frescura_tss = excluded.cambio_frescura_tss,
      cambio_variabilidad_pct = excluded.cambio_variabilidad_pct,
      cambio_pulso_reposo_bpm = excluded.cambio_pulso_reposo_bpm,
      cambio_sueno_horas = excluded.cambio_sueno_horas,
      cambio_cumplimiento_pts = excluded.cambio_cumplimiento_pts,
      basal_dias = excluded.basal_dias,
      basal_excluir_dias = excluded.basal_excluir_dias,
      cs_min_efforts = excluded.cs_min_efforts,
      cs_min_duration_s = excluded.cs_min_duration_s,
      cs_max_duration_s = excluded.cs_max_duration_s,
      cs_min_spread_ratio = excluded.cs_min_spread_ratio,
      cs_min_fit_r2_pct = excluded.cs_min_fit_r2_pct,
      cs_max_drift_from_threshold_pct = excluded.cs_max_drift_from_threshold_pct,
      sleep_target_hours = excluded.sleep_target_hours,
      hrv_min_nights_baseline = excluded.hrv_min_nights_baseline,
      hrv_min_nights_recent = excluded.hrv_min_nights_recent,
      subida_dias = excluded.subida_dias,
      subida_minima_pct = excluded.subida_minima_pct,
      cobertura_ciega_alerta_pct = excluded.cobertura_ciega_alerta_pct,
      updated_at = now()
  `;
  return resolveEffectiveAnalyticsMethod(coach_id, client);
}

/** Volver a los defectos del producto: sin fila, el resolutor sirve los defectos. */
export async function resetCoachAnalyticsMethod(coach_id: bigint | number, client: Sql = defaultSql): Promise<CoachAnalyticsMethod> {
  await client`delete from coach_analytics_method where coach_id = ${coach_id}`;
  return defaultCoachAnalyticsMethod();
}

/** Lo que pinta el editor: lo vigente, si es suyo, y los defectos al lado. */
export async function getCoachAnalyticsMethodSetting(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<{ method: CoachAnalyticsMethod; is_custom: boolean; defaults: CoachAnalyticsMethod; list_keys: readonly string[] }> {
  const [method, is_custom] = await Promise.all([resolveEffectiveAnalyticsMethod(coach_id, client), tieneFila(coach_id, client)]);
  return { method, is_custom, defaults: defaultCoachAnalyticsMethod(), list_keys: COACH_ANALYTICS_METHOD_LIST_KEYS };
}
