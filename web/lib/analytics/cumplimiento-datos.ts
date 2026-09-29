import 'server-only';

// LOS DATOS DEL CUMPLIMIENTO — las filas que el motor puro necesita, y nada más
// (docs/analiticas/modelo.md A7/A8). Aquí no se juzga nada.
//
//   · QUÉ sesiones del plan cuentan y si son debidas, hechas, excluidas o de una
//     semana oculta: el lector ÚNICO de la adherencia (`loadAdherenceSessionsBatch`),
//     no una segunda consulta con sus propias reglas.
//   · De esas, las del COACH: su plantilla, sus líneas (con ejercicio y formato),
//     su ejecución y los tramos de la ejecución con sus series.
//   · Qué ejecuciones cuelgan del plan del coach, para contar aparte lo hecho sin
//     plan (libres, fuera del plan, importaciones: carga sí, adherencia no, 0270).
//
// Cada consulta va por `AtletaVerificado` (el id sale de la sesión del atleta o
// del guard del coach), y las que siguen ids sacados de ahí lo dicen
// (`// tenancy: verified-owner`).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAdherenceSessionsBatch, type AdherenceAssignmentStatus } from '@fahybrid/shared/domain/coach/adherence';
import { familiaDe } from '@fahybrid/shared/domain/analytics/familia';
import { modalidadCargaDe } from '@fahybrid/shared/domain/analytics/carga-plan';
import type { LineaPlan, SerieHecha, TramoEjecutado } from '@fahybrid/shared/domain/analytics/cumplimiento-esfuerzos';
import type { SesionCumplimiento } from '@fahybrid/shared/domain/analytics/cumplimiento-sesion';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { diffDays, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { safeParsePrescription, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { AtletaVerificado } from './atleta-verificado';
import { rolDe } from './panel-datos';

type FilaSesion = {
  assignment_id: string;
  titulo: string | null;
  template_id: string | null;
  template_format: string | null;
  execution_id: string | null;
  dia_hecha: string | null;
  segundos: number | null;
  metros: number | null;
};

type FilaLinea = {
  id: string;
  template_id: string;
  posicion: number;
  bloque: number | null;
  block_format: string | null;
  prescription: unknown;
  ejercicio: string | null;
  exercise_modality: string | null;
  exercise_category: string | null;
};

type FilaTramo = {
  id: string;
  execution_id: string;
  template_segment_id: string | null;
  posicion: number;
  segundos: number | null;
  metros: number | null;
  ritmo_s_km: number | null;
  split_s_500m: number | null;
  vatios: number | null;
  pulso: number | null;
  inclinacion: number | null;
  pendiente: number | null;
  reps: number | null;
  reps_prescritas: number | null;
  kg: number | null;
  calorias: number | null;
  rondas: number | null;
  rondas_prescritas: number | null;
  pierna: number | null;
  papel_pierna: string | null;
  ronda: number | null;
  modalidad: string | null;
  snapshot: unknown;
  series: Array<{
    i: number;
    reps: number | null;
    reps_p: number | null;
    kg: number | null;
    kg_p: number | null;
    rpe: number | null;
    rir: number | null;
    estado: string;
  }> | null;
};

function prescripcionDe(raw: unknown): Prescription | null {
  if (raw == null) return null;
  const r = safeParsePrescription(raw);
  return r.success ? (r.data as Prescription) : null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function tramoDe(t: FilaTramo): TramoEjecutado {
  const series: SerieHecha[] = (t.series ?? []).map((s) => ({
    indice: s.i,
    reps: num(s.reps),
    reps_prescritas: num(s.reps_p),
    kg: num(s.kg),
    kg_prescritos: num(s.kg_p),
    rpe: num(s.rpe),
    rir: num(s.rir),
    estado: s.estado,
  }));
  return {
    id: t.id,
    template_segment_id: t.template_segment_id,
    posicion: t.posicion,
    segundos: num(t.segundos),
    metros: num(t.metros),
    ritmo_s_km: num(t.ritmo_s_km),
    split_s_500m: num(t.split_s_500m),
    vatios: num(t.vatios),
    pulso_medio: num(t.pulso),
    inclinacion_pct: num(t.inclinacion),
    pendiente_pct: num(t.pendiente),
    reps: num(t.reps),
    reps_prescritas: num(t.reps_prescritas),
    kg: num(t.kg),
    calorias: num(t.calorias),
    rondas: num(t.rondas),
    rondas_prescritas: num(t.rondas_prescritas),
    pierna: num(t.pierna),
    papel_pierna: t.papel_pierna,
    ronda: num(t.ronda),
    modalidad: t.modalidad,
    series,
  };
}

/**
 * La línea con la prescripción CON LA QUE SE ENTRENÓ: la que el servidor estampó
 * en su tramo al guardar (`prescription_snapshot`, 0120 — sobrevive a que el
 * coach edite la plantilla después), o la de la línea si no hay tramo.
 */
function lineaDe(l: FilaLinea, formatoPlantilla: string | null, snapshot: unknown): LineaPlan {
  const prescripcion = prescripcionDe(snapshot) ?? prescripcionDe(l.prescription);
  const modalidad = l.exercise_modality ?? prescripcion?.modality ?? null;
  const formato = normalizeFormat(l.block_format ?? formatoPlantilla) ?? null;
  return {
    template_segment_id: l.id,
    bloque: l.bloque ?? l.posicion,
    posicion: l.posicion,
    formato,
    prescripcion,
    modalidad,
    familia: familiaDe({
      modalidad: modalidadCargaDe(modalidad),
      exercise_modality: l.exercise_modality,
      exercise_category: l.exercise_category,
      formato: l.block_format ?? formatoPlantilla,
    }),
    rol: rolDe(l.block_format),
    ejercicio: l.ejercicio,
  };
}

/** Las líneas de las plantillas de esas sesiones (ids sacados del atleta verificado). */
async function leerLineas(plantillas: number[], client: Sql): Promise<FilaLinea[]> {
  if (plantillas.length === 0) return [];
  // tenancy: verified-owner
  return await client<FilaLinea[]>`
    select
      ts.id::text as id,
      ts.template_id::text as template_id,
      ts.position as posicion,
      ts.block_position as bloque,
      ts.block_format,
      ts.prescription_json as prescription,
      ex.name as ejercicio,
      ex.modality as exercise_modality,
      ex.category::text as exercise_category
    from template_segments ts
    left join exercises ex on ex.id = ts.exercise_id
    where ts.template_id = any(${plantillas}::bigint[])
    order by ts.template_id, ts.block_position, ts.position
  `;
}

/** Los tramos de esas ejecuciones, con sus series; la ejecución tiene que ser del atleta. */
async function leerTramos(atleta: AtletaVerificado, ejecuciones: number[], client: Sql): Promise<FilaTramo[]> {
  if (ejecuciones.length === 0) return [];
  // tenancy: verified-owner
  return await client<FilaTramo[]>`
    select
      se.id::text as id,
      se.execution_id::text as execution_id,
      se.template_segment_id::text as template_segment_id,
      se.position as posicion,
      extract(epoch from (se.ended_at - se.started_at))::float as segundos,
      se.distance_meters::float as metros,
      se.avg_pace_s_per_km::float as ritmo_s_km,
      se.avg_pace_s_per_500m::float as split_s_500m,
      se.avg_power_w::float as vatios,
      se.avg_hr::float as pulso,
      se.incline_pct::float as inclinacion,
      se.avg_gradient_pct::float as pendiente,
      se.reps_completed as reps,
      se.reps_prescribed as reps_prescritas,
      se.weight_used_kg::float as kg,
      se.calories::float as calorias,
      se.emom_rounds_completed as rondas,
      se.emom_rounds_prescribed as rondas_prescritas,
      se.leg_index as pierna,
      se.leg_role as papel_pierna,
      se.round_index as ronda,
      se.modality as modalidad,
      se.prescription_snapshot as snapshot,
      (
        select json_agg(json_build_object(
          'i', s.set_index, 'reps', s.reps_actual, 'reps_p', s.reps_prescribed,
          'kg', s.load_actual_kg, 'kg_p', s.load_prescribed_kg,
          'rpe', s.rpe, 'rir', s.rir, 'estado', s.status
        ) order by s.set_index)
        from set_executions s
        where s.segment_execution_id = se.id
      ) as series
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where se.execution_id = any(${ejecuciones}::bigint[])
      and we.athlete_id = ${atleta.athlete_id}
    order by se.execution_id, se.position
  `;
}

/**
 * Las sesiones del plan del COACH programadas entre `desde` y hoy (días locales
 * del atleta), con lo que decide si son debidas y todo lo que se juzga. El «hoy»
 * y las banderas (hecha, excluida, visible) salen del lector de la adherencia.
 */
export async function loadSesionesCumplimiento(
  atleta: AtletaVerificado,
  periodo: { tz: string; desde: string; hoy: string; now: Date },
  client: Sql = defaultSql,
): Promise<SesionCumplimiento[]> {
  const { tz, desde, hoy, now } = periodo;
  const dias = Math.max(1, diffDays(parseIsoDate(hoy), parseIsoDate(desde)) + 1);
  const lote = await loadAdherenceSessionsBatch({ client, athlete_ids: [atleta.athlete_id], window_days: dias, now });
  const banderas = (lote.sessions.get(String(atleta.athlete_id)) ?? []).filter(
    (s) => s.origin !== 'self' && s.assignment_id != null && s.scheduled_for >= desde,
  );
  if (banderas.length === 0) return [];
  const ids = banderas.map((s) => Number(s.assignment_id));

  // tenancy: verified-owner
  const sesiones = await client<FilaSesion[]>`
    select
      wa.id::text as assignment_id,
      t.name as titulo,
      wa.template_id::text as template_id,
      t.format::text as template_format,
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at, we.created_at) at time zone ${tz}, 'YYYY-MM-DD') as dia_hecha,
      coalesce(we.total_duration_seconds, extract(epoch from (we.ended_at - we.started_at)))::float as segundos,
      we.total_distance_m::float as metros
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${atleta.athlete_id}
      and wa.id = any(${ids}::bigint[])
  `;
  const plantillas = [...new Set(sesiones.map((s) => s.template_id).filter((x): x is string => x != null))].map(Number);
  const ejecuciones = sesiones.map((s) => s.execution_id).filter((x): x is string => x != null).map(Number);

  const [lineas, tramos] = await Promise.all([leerLineas(plantillas, client), leerTramos(atleta, ejecuciones, client)]);

  const lineasDe = new Map<string, FilaLinea[]>();
  for (const l of lineas) lineasDe.set(l.template_id, [...(lineasDe.get(l.template_id) ?? []), l]);
  const tramosDe = new Map<string, FilaTramo[]>();
  for (const t of tramos) tramosDe.set(t.execution_id, [...(tramosDe.get(t.execution_id) ?? []), t]);
  const porId = new Map(sesiones.map((s) => [s.assignment_id, s] as const));

  const out: SesionCumplimiento[] = [];
  for (const b of banderas) {
    const s = porId.get(b.assignment_id!);
    if (!s) continue;
    const suyos = s.execution_id ? (tramosDe.get(s.execution_id) ?? []) : [];
    const snapshotDe = new Map<string, unknown>();
    for (const t of suyos) if (t.template_segment_id && t.snapshot != null && !snapshotDe.has(t.template_segment_id)) snapshotDe.set(t.template_segment_id, t.snapshot);
    out.push({
      assignment_id: s.assignment_id,
      dia: b.scheduled_for,
      titulo: s.titulo,
      estado_plan: b.status as AdherenceAssignmentStatus,
      excluida: b.excluded === true,
      visible: b.visible !== false,
      ejecucion:
        s.execution_id != null && s.dia_hecha != null
          ? { id: s.execution_id, dia: s.dia_hecha, segundos: num(s.segundos), metros: num(s.metros) }
          : null,
      lineas: (s.template_id ? (lineasDe.get(s.template_id) ?? []) : []).map((l) => lineaDe(l, s.template_format, snapshotDe.get(l.id))),
      tramos: suyos.map(tramoDe),
    });
  }
  return out;
}

/**
 * El primer día del plan del coach hasta hoy. «Todo» en el cumplimiento es toda
 * la historia DEL PLAN: un atleta con plan y sin un solo entreno tiene un 0 %
 * que decir, no un «sin plan». Null si nunca tuvo plan.
 */
export async function loadPrimerDiaDelPlan(atleta: AtletaVerificado, hoy: string, client: Sql = defaultSql): Promise<string | null> {
  // tenancy: verified-owner
  const rows = await client<Array<{ dia: string | null }>>`
    select to_char(min(wa.scheduled_for), 'YYYY-MM-DD') as dia
    from workout_assignments wa
    where wa.athlete_id = ${atleta.athlete_id}
      and wa.origin = 'coach'
      and wa.scheduled_for <= ${hoy}::date
  `;
  return rows[0]?.dia ?? null;
}

/** Las ejecuciones que cuelgan del plan del coach. El resto de lo hecho es «sin plan». */
export async function loadEjecucionesDelPlan(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<Set<string>> {
  // tenancy: verified-owner
  const rows = await client<Array<{ id: string }>>`
    select we.id::text as id
    from workout_executions we
    join workout_assignments wa on wa.id = we.assignment_id
    where we.athlete_id = ${atleta.athlete_id}
      and wa.origin = 'coach'
  `;
  return new Set(rows.map((r) => r.id));
}
