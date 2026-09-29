import 'server-only';

// LOS DATOS DEL PANEL — las filas que el motor puro necesita, y nada más.
//
// Aquí no se calcula nada: se traen las sesiones hechas con lo que midió cada
// tramo (ritmo, vatios, pulso, sus segundos por zona congelados, el esfuerzo de
// sus series), las sesiones planificadas con su prescripción tipada, y el
// contexto del atleta (su huso, su coach, su primera sesión). Todo en SU día
// (DECISIONS 2026-09-23): la carga es algo que él vivió.
//
// Cada consulta va por `AtletaVerificado` (ver ./atleta-verificado.ts): el id
// nunca viene de la URL sin un guard, y eso sostiene el `// tenancy` de cada una.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { athleteSeesAssignment } from '@/lib/athlete/week-visibility';
import { loadPrimeraSesion } from '@/lib/athlete/analytics/running-progress';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import { familiaDe } from '@fahybrid/shared/domain/analytics/familia';
import { modalidadCargaDe, type ItemPlan, type SesionPlan } from '@fahybrid/shared/domain/analytics/carga-plan';
import type { SesionHecha, TramoHecho, ZonasCongeladas } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { HR_ANCHOR_ANCLA, type HrAnchorSource } from '@fahybrid/shared/domain/methodology/hr-zones';
import { safeParsePrescription, type Prescription, type PrescriptionRole } from '@fahybrid/shared/domain/prescription';
import type { AtletaVerificado } from './atleta-verificado';

export interface ContextoAtleta {
  tz: string;
  coach_id: number | null;
  /** Hoy, en el día local del atleta. */
  hoy: string;
  /** Días desde la primera sesión y su día. Null cuando no ha ejecutado nada. */
  historia: { dias: number | null; iso: string | null };
}

export async function loadContexto(atleta: AtletaVerificado, now: Date, client: Sql = defaultSql): Promise<ContextoAtleta> {
  // tenancy: verified-owner
  const rows = await client<Array<{ timezone: string | null; coach_id: string | null }>>`
    select timezone, coach_id::text as coach_id from athletes where id = ${atleta.athlete_id} limit 1
  `;
  const row = rows[0];
  const tz = row?.timezone != null && isValidTimezone(row.timezone) ? row.timezone : BOX_TIMEZONE;
  const historia = await loadPrimeraSesion(client, atleta.athlete_id, now, tz);
  return {
    tz,
    coach_id: row?.coach_id != null ? Number(row.coach_id) : null,
    hoy: zonedDayString(now, tz),
    historia,
  };
}

// ---------------------------------------------------------------------------
// LO HECHO
// ---------------------------------------------------------------------------

type TramoFila = {
  seconds: number | null;
  modality: string | null;
  exercise_modality: string | null;
  exercise_category: string | null;
  context_format: string | null;
  pace_km: number | null;
  pace_500m: number | null;
  power_w: number | null;
  avg_hr: number | null;
  gradient_pct: number | null;
  incline_pct: number | null;
  zonas: { z1: number; z2: number; z3: number; z4: number; z5: number; no_hr: number; anchor: string | null } | null;
  esfuerzo: number | null;
};

type SesionFila = {
  id: string;
  dia: string;
  segundos: number;
  rpe: number | null;
  avg_hr: number | null;
  tramos: TramoFila[] | null;
};

function zonasDe(z: TramoFila['zonas']): ZonasCongeladas | null {
  if (!z) return null;
  const anchor = z.anchor as HrAnchorSource | null;
  return {
    por_zona: { 1: z.z1 ?? 0, 2: z.z2 ?? 0, 3: z.z3 ?? 0, 4: z.z4 ?? 0, 5: z.z5 ?? 0 },
    sin_pulso_s: z.no_hr ?? 0,
    ancla: anchor != null && anchor in HR_ANCHOR_ANCLA ? HR_ANCHOR_ANCLA[anchor] : null,
  };
}

function tramoDe(t: TramoFila): TramoHecho {
  const modalidad = modalidadCargaDe(t.modality);
  const ritmo = modalidad === 'run' ? t.pace_km : modalidad === 'row' || modalidad === 'ski' || modalidad === 'bike' ? t.pace_500m : null;
  // La cinta manda cuando la hay (su inclinación es medida directa); si no, la
  // pendiente media derivada de la altitud (0185). Misma precedencia que el
  // veredicto de carrera (`resolveSegmentGradientPct`).
  const pendiente = t.incline_pct ?? t.gradient_pct ?? null;
  return {
    segundos: Math.max(0, Math.round(t.seconds ?? 0)),
    modalidad,
    familia: familiaDe({
      modalidad: t.modality,
      exercise_modality: t.exercise_modality,
      exercise_category: t.exercise_category,
      formato: t.context_format,
    }),
    potencia_w: t.power_w,
    ritmo_s: ritmo,
    pendiente_pct: pendiente,
    pulso_medio: t.avg_hr,
    zonas: zonasDe(t.zonas),
    esfuerzo: t.esfuerzo,
  };
}

/**
 * TODAS las sesiones hechas del atleta hasta `hasta_excl`, en su día local. Se
 * leen todas y no «la ventana» porque la media móvil arranca en la primera
 * sesión: con la historia entera no hay calentamiento artificial que recortar.
 * Es un barrido acotado por SUS filas, no por lo ancha que sea la ventana.
 */
export async function loadSesionesHechas(
  atleta: AtletaVerificado,
  tz: string,
  hasta_excl: Date,
  client: Sql = defaultSql,
): Promise<SesionHecha[]> {
  // tenancy: verified-owner
  const rows = await client<SesionFila[]>`
    select
      we.id::text as id,
      to_char(coalesce(we.ended_at, we.started_at, we.created_at) at time zone ${tz}, 'YYYY-MM-DD') as dia,
      coalesce(we.total_duration_seconds, extract(epoch from (we.ended_at - we.started_at)), 0)::int as segundos,
      we.perceived_exertion::float as rpe,
      we.avg_hr::float as avg_hr,
      coalesce(
        json_agg(
          json_build_object(
            'seconds', extract(epoch from (se.ended_at - se.started_at)),
            'modality', se.modality,
            'exercise_modality', ex.modality,
            'exercise_category', ex.category::text,
            'context_format', se.context_format,
            'pace_km', se.avg_pace_s_per_km::float,
            'pace_500m', se.avg_pace_s_per_500m::float,
            'power_w', se.avg_power_w::float,
            'avg_hr', se.avg_hr::float,
            'gradient_pct', se.avg_gradient_pct::float,
            'incline_pct', se.incline_pct::float,
            'zonas', (
              select json_build_object(
                'z1', z.z1_s, 'z2', z.z2_s, 'z3', z.z3_s, 'z4', z.z4_s, 'z5', z.z5_s,
                'no_hr', z.no_hr_s, 'anchor', z.computed_with_anchor
              )
              from segment_zone_seconds z
              where z.segment_execution_id = se.id
            ),
            'esfuerzo', (
              select avg(coalesce(s.rpe, 10 - s.rir))::float
              from set_executions s
              where s.segment_execution_id = se.id
                and s.status <> 'skipped'
                and (s.rpe is not null or s.rir is not null)
            )
          )
          order by se.position
        ) filter (where se.id is not null and se.ended_at is not null and se.started_at is not null),
        '[]'
      ) as tramos
    from workout_executions we
    left join segment_executions se on se.execution_id = we.id
    left join exercises ex on ex.id = se.exercise_id
    where we.athlete_id = ${atleta.athlete_id}
      and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta_excl.toISOString()}
    group by we.id
    order by 2, we.id
  `;
  return rows.map((r) => ({
    id: r.id,
    dia: r.dia,
    segundos: Math.max(0, r.segundos ?? 0),
    rpe: r.rpe,
    pulso_medio: r.avg_hr,
    tramos: (r.tramos ?? []).map(tramoDe),
  }));
}

// ---------------------------------------------------------------------------
// LO PLANIFICADO
// ---------------------------------------------------------------------------

type ItemFila = {
  prescription: unknown;
  block_format: string | null;
  template_format: string | null;
  exercise_modality: string | null;
  exercise_category: string | null;
};

type PlanFila = {
  id: string;
  dia: string;
  status: string;
  items: ItemFila[] | null;
};

function rolDe(block_format: string | null): PrescriptionRole {
  if (block_format === 'warmup') return 'calentamiento';
  if (block_format === 'cooldown') return 'vuelta';
  return 'principal';
}

function itemDe(f: ItemFila): ItemPlan {
  const parsed = f.prescription == null ? null : safeParsePrescription(f.prescription);
  const prescripcion: Prescription | null = parsed && parsed.success ? (parsed.data as Prescription) : null;
  const modalidad = f.exercise_modality ?? prescripcion?.modality ?? null;
  return {
    prescripcion,
    modalidad,
    familia: familiaDe({
      modalidad: modalidadCargaDe(modalidad),
      exercise_modality: f.exercise_modality,
      exercise_category: f.exercise_category,
      formato: f.block_format ?? f.template_format,
    }),
    rol: rolDe(f.block_format),
  };
}

/**
 * Las sesiones planificadas entre dos días locales (inclusive), con sus líneas.
 * Solo las que el atleta VE (la semana no es un borrador del coach; lo ya hecho
 * se ve siempre): el plan que se proyecta es el que él tiene delante, y la ruta
 * del coach enseña lo mismo que la del atleta (A1).
 */
export async function loadSesionesPlan(
  atleta: AtletaVerificado,
  desde: string,
  hasta: string,
  client: Sql = defaultSql,
): Promise<SesionPlan[]> {
  // tenancy: verified-owner
  const rows = await client<PlanFila[]>`
    select
      wa.id::text as id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as dia,
      wa.status::text as status,
      coalesce(
        json_agg(
          json_build_object(
            'prescription', ts.prescription_json,
            'block_format', ts.block_format,
            'template_format', t.format::text,
            'exercise_modality', ex.modality,
            'exercise_category', ex.category::text
          )
          order by ts.block_position, ts.position
        ) filter (where ts.id is not null),
        '[]'
      ) as items
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    left join template_segments ts on ts.template_id = wa.template_id
    left join exercises ex on ex.id = ts.exercise_id
    where wa.athlete_id = ${atleta.athlete_id}
      and wa.scheduled_for >= ${desde}::date
      and wa.scheduled_for <= ${hasta}::date
      and ${athleteSeesAssignment(client, { keepDone: true })}
    group by wa.id, t.format
    order by wa.scheduled_for, wa.id
  `;
  return rows.map((r) => ({ id: r.id, dia: r.dia, items: (r.items ?? []).map(itemDe) }));
}
