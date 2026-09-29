import 'server-only';

// EL DETALLE DE UNA SESIÓN EN LAS ANALÍTICAS — `GET …/analytics/sesion/[executionId]`
// (docs/analiticas/modelo.md §3 fila 9, §5), el mismo para el atleta y su coach.
//
// Tramo a tramo: lo prescrito (la prescripción que viajó con el tramo, y su
// texto), lo hecho (las cifras del tramo, serie a serie y parcial a parcial,
// con el MISMO lector que el detalle de la sesión del plan), sus zonas
// congeladas con su ancla, y su carga con su peldaño — la que el panel sumó,
// porque se lee y se precia con las mismas piezas (`loadSesionHecha` +
// `preciarSesion`). Además la traza (pulso y ritmo para dibujar, kilómetros a
// fidelidad completa, el mapa) con las bandas de pulso del coach como líneas.
//
// El veredicto de cada tramo contra su banda es del motor de cumplimiento: se
// declara pendiente (`pendientes`), no se inventa aquí.
//
// El atleta viene verificado; la ejecución se lee filtrada por él: una ajena o
// inexistente es null (la ruta contesta 404 sin decir cuál de las dos).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { resolveEffectiveAnalyticsMethod } from '@/lib/coach/analytics-method';
import { resolveCoachHrMethod } from '@/lib/coach/hr-method';
import { getCoachPaceZones } from '@/lib/coach/methodology-zones';
import { loadExecutionRow } from '@/lib/athlete/assignment-detail';
import { loadSegmentActuals, type SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import { loadSessionTrace, type AssignmentDetailRoute, type DisplaySeries } from '@/lib/execution/session-trace';
import {
  cargaDeTramo,
  cargaPlanificadaDeSesion,
  familiaDe,
  lecturasSesion,
  preciarSesion,
  zonasDeTramo,
  type CargaDeTramo,
  type Familia,
  type Lectura,
  type ReferenciaSerie,
  type ZonasDeTramo,
} from '@fahybrid/shared/domain/analytics';
import { defaultCoachHrMethod, hrZoneFractionsFrom } from '@fahybrid/shared/domain/coach/hr-method';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolveHrZones, resolveZonesForAthlete, standardZonesFor, type ResolvedZone } from '@fahybrid/shared/domain/methodology';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription/to-text';
import { safeParsePrescription, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import { loadAnclasAtleta } from './anclas';
import type { AtletaVerificado } from './atleta-verificado';
import { loadContexto, loadSesionesPlan, loadSesionHecha } from './panel-datos';

export interface TramoDeSesion {
  id: string;
  posicion: number;
  /** La ronda del formato (0 = no se repite). */
  ronda: number;
  familia: Familia;
  modalidad: string | null;
  /** El nombre del ejercicio (con el del coach si lo renombró). Null sin ejercicio. */
  ejercicio_es: string | null;
  /** `work` | `recovery` en una carrera de series; null fuera. */
  papel: string | null;
  /** `warmup` | `main` | `cooldown`; null fuera de una carrera de series. */
  fase: string | null;
  inicio_iso: string | null;
  segundos: number | null;
  /** Lo que se le pidió a ESTE tramo. Null si no viajó ninguna prescripción. */
  prescrito: { prescripcion: Prescription; texto_es: string } | null;
  /** Lo que hizo: las cifras del tramo, sus series y sus parciales. */
  hecho: SegmentActual | null;
  zonas: ZonasDeTramo | null;
  carga: CargaDeTramo | null;
}

export interface DetalleSesion {
  athlete_id: string;
  execution_id: string;
  assignment_id: string | null;
  /** Por qué no tiene asignación (importación, fuera del plan). */
  fuera_del_plan: string | null;
  /** El día local del atleta. */
  dia: string;
  inicio_iso: string | null;
  fin_iso: string | null;
  titulo_es: string | null;
  formato: string | null;
  /** RPE de la sesión, 1-10. */
  rpe: number | null;
  /** Qué aparato midió lo principal, y cómo se registró. */
  fuente: string | null;
  registrado: string | null;
  /** Carga (contra la planificada), duración y zonas de la sesión entera. */
  lecturas: Lectura[];
  tramos: TramoDeSesion[];
  /** La carga del rato que ningún tramo cubre (calentar, descansos). */
  resto: CargaDeTramo | null;
  traza: {
    disponible: boolean;
    /** Kilómetro a kilómetro, sobre la traza ENTERA. */
    parciales_km: KmSplit[];
    /** Para dibujar: reducidas, nunca fuente de un cálculo. */
    pulso: DisplaySeries | null;
    ritmo: DisplaySeries | null;
    ruta: AssignmentDetailRoute;
    /** Dónde empieza cada zona de pulso del coach, en ppm, con el umbral de hoy. */
    referencias_pulso: ReferenciaSerie[] | null;
    /** Las seis zonas de ritmo con las que se colorea la ruta. */
    zonas_ritmo: ResolvedZone[] | null;
  };
  /** Lo que este detalle aún no sirve: el veredicto de cada tramo contra su banda. */
  pendientes: Array<'cumplimiento'>;
}

type Cabecera = {
  assignment_id: string | null;
  off_plan_reason: string | null;
  titulo: string | null;
  formato: string | null;
  programada: string | null;
};

type MetaTramo = {
  id: string;
  position: number;
  round_index: number;
  modality: string | null;
  exercise_modality: string | null;
  exercise_category: string | null;
  context_format: string | null;
  leg_role: string | null;
  leg_phase: string | null;
  prescription_snapshot: unknown;
};

export async function cargarSesion(args: {
  atleta: AtletaVerificado;
  execution_id: number;
  now?: Date;
  client?: Sql;
}): Promise<DetalleSesion | null> {
  const client = args.client ?? defaultSql;
  const { atleta, execution_id } = args;

  // tenancy: verified-owner
  const cabeceras = await client<Cabecera[]>`
    select we.assignment_id::text as assignment_id, we.off_plan_reason, t.name as titulo, t.format::text as formato,
           to_char(wa.scheduled_for, 'YYYY-MM-DD') as programada
    from workout_executions we
    left join workout_assignments wa on wa.id = we.assignment_id
    left join templates t on t.id = wa.template_id
    where we.id = ${execution_id} and we.athlete_id = ${atleta.athlete_id}
    limit 1
  `;
  const cabecera = cabeceras[0];
  if (!cabecera) return null;

  const contexto = await loadContexto(atleta, args.now ?? new Date(), client);
  const coachId = contexto.coach_id;
  const [fila, sesion, metodo, hr, anclas, hechos, metas] = await Promise.all([
    loadExecutionRow(client, { execution_id: BigInt(execution_id), athlete_id: BigInt(atleta.athlete_id) }),
    loadSesionHecha(atleta, contexto.tz, execution_id, client),
    coachId != null ? resolveEffectiveAnalyticsMethod(coachId, client) : Promise.resolve(defaultCoachAnalyticsMethod()),
    coachId != null ? resolveCoachHrMethod(coachId, client) : Promise.resolve(defaultCoachHrMethod()),
    loadAnclasAtleta(atleta, client),
    loadSegmentActuals(client, execution_id),
    // tenancy: verified-owner
    client<MetaTramo[]>`
      select se.id::text as id, se.position, se.round_index, se.modality, ex.modality as exercise_modality,
             ex.category::text as exercise_category, se.context_format, se.leg_role, se.leg_phase, se.prescription_snapshot
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join exercises ex on ex.id = se.exercise_id
      where se.execution_id = ${execution_id} and we.athlete_id = ${atleta.athlete_id}
      order by se.position, se.round_index, se.id
    `,
  ]);
  if (!fila || !sesion) return null;

  const fracciones_hr = hrZoneFractionsFrom(hr);
  const precio = preciarSesion(sesion, { anclas, metodo, fracciones_hr });

  // La planificada de su asignación, con la misma escalera que el panel.
  let plan = null;
  if (cabecera.assignment_id != null && cabecera.programada != null) {
    const delDia = await loadSesionesPlan(atleta, cabecera.programada, cabecera.programada, client);
    const suya = delDia.find((s) => s.id === cabecera.assignment_id);
    plan = suya ? cargaPlanificadaDeSesion(suya, { anclas, fracciones_hr }) : null;
  }

  // Tramo a tramo: el precio que entró en la suma (por id), lo hecho (por posición y ronda).
  const precioPorId = new Map<string, ReturnType<typeof cargaDeTramo>>();
  const zonasPorId = new Map<string, ZonasDeTramo | null>();
  sesion.tramos.forEach((t, i) => {
    if (t.id == null) return;
    precioPorId.set(t.id, cargaDeTramo(precio.tramos[i] ?? null));
    zonasPorId.set(t.id, zonasDeTramo(t.zonas));
  });
  const hechoPor = new Map(hechos.map((h) => [`${h.position}:${h.round_index}`, h]));

  const tramos: TramoDeSesion[] = metas.map((m) => {
    const hecho = hechoPor.get(`${m.position}:${m.round_index}`) ?? null;
    const parsed = m.prescription_snapshot == null ? null : safeParsePrescription(m.prescription_snapshot);
    const prescripcion = parsed && parsed.success ? (parsed.data as Prescription) : null;
    return {
      id: m.id,
      posicion: m.position,
      ronda: m.round_index,
      familia: familiaDe({ modalidad: m.modality, exercise_modality: m.exercise_modality, exercise_category: m.exercise_category, formato: m.context_format }),
      modalidad: m.modality,
      ejercicio_es: hecho?.exercise_name ?? null,
      papel: m.leg_role,
      fase: m.leg_phase,
      inicio_iso: hecho?.started_at ?? null,
      segundos: hecho?.duration_seconds ?? null,
      prescrito: prescripcion ? { prescripcion, texto_es: prescriptionToText(prescripcion) } : null,
      hecho,
      zonas: zonasPorId.get(m.id) ?? null,
      carga: precioPorId.get(m.id) ?? null,
    };
  });

  // Las zonas de ritmo del coach sobre el umbral de correr (las del bloque de intensidad).
  let zonas_ritmo: ResolvedZone[] | null = null;
  if (anclas.ritmo.run) {
    const modelo = coachId != null ? (await getCoachPaceZones(coachId, 'per_km', client)).zones : [...standardZonesFor('per_km')];
    try {
      zonas_ritmo = resolveZonesForAthlete({ modality: 'run', threshold_s: anclas.ritmo.run.valor, pace_unit: 'per_km' }, modelo);
    } catch {
      zonas_ritmo = null;
    }
  }
  const traza = await loadSessionTrace({
    execution_id,
    started_at: fila.started_at ? new Date(fila.started_at) : null,
    route_polyline: fila.route_polyline ?? null,
    pace_zones: zonas_ritmo,
    client,
  });
  const bandas = anclas.pulso ? resolveHrZones({ lthr_bpm: anclas.pulso.valor }, fracciones_hr)?.bands ?? null : null;
  const referencias_pulso = bandas
    ? bandas.filter((b) => b.min_bpm != null).map((b) => ({ code: `z${b.zone}_desde`, etiqueta_es: `Z${b.zone}`, valor: b.min_bpm! }))
    : null;

  return {
    athlete_id: String(atleta.athlete_id),
    execution_id: String(execution_id),
    assignment_id: cabecera.assignment_id,
    fuera_del_plan: cabecera.off_plan_reason,
    dia: sesion.dia,
    inicio_iso: fila.started_at ?? null,
    fin_iso: fila.ended_at ?? null,
    titulo_es: cabecera.titulo,
    formato: cabecera.formato,
    rpe: fila.perceived_exertion ?? null,
    fuente: fila.source ?? null,
    registrado: fila.recorded_via ?? null,
    lecturas: lecturasSesion({ sesion, precio, plan }),
    tramos,
    resto: cargaDeTramo(precio.resto),
    traza: {
      disponible: traza.available,
      parciales_km: traza.splits,
      pulso: traza.display_curve.hr,
      ritmo: traza.display_curve.pace,
      ruta: traza.route,
      referencias_pulso,
      zonas_ritmo,
    },
    pendientes: ['cumplimiento'],
  };
}
