import 'server-only';

// LAS FILAS DEL PROGRESO Y LOS RÉCORDS — lo que el motor puro necesita, y nada más.
//
// Aquí no se calcula nada: se traen los tramos hechos con lo que midieron (y su
// ejercicio, su patrón y su equipo en el catálogo), las series de fuerza, las
// series continuas de distancia, las marcas y tests, las puntuaciones de los WOD
// con su plantilla raíz, y el desacople de cada sesión. TODA la historia hasta
// hoy — un récord es de siempre y la ventana anterior también cuenta —, en el
// día LOCAL del atleta (DECISIONS 2026-09-23). Son barridos acotados por SUS
// filas, no por lo ancha que sea la ventana (ver `ventana.ts`).
//
// Cada consulta va por `AtletaVerificado` (./atleta-verificado.ts): el id nunca
// viene de la URL sin un guard, y eso sostiene el `// tenancy` de cada una.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AtletaVerificado } from './atleta-verificado';

export interface TramoFila {
  id: string;
  sesion_id: string;
  dia: string;
  segundos: number | null;
  position: number;
  modality: string | null;
  source: string | null;
  context_format: string | null;
  prior_work_s: number | null;
  is_structural: boolean;
  leg_role: string | null;
  distance_m: number | null;
  pace_km: number | null;
  pace_500m: number | null;
  power_w: number | null;
  avg_hr: number | null;
  gradient_pct: number | null;
  incline_pct: number | null;
  stroke_spm: number | null;
  reps_completed: number | null;
  weight_kg: number | null;
  erg_splits: unknown;
  exercise_id: string | null;
  exercise_slug: string | null;
  exercise_name: string | null;
  exercise_modality: string | null;
  exercise_category: string | null;
  movement_pattern: string | null;
  equipment: string[] | null;
}

export interface SerieFila {
  segmento_id: string;
  reps: number | null;
  kg: number | null;
  estado: string;
}

export interface TrazaFila {
  sesion_id: string;
  dia: string;
  source: string | null;
  offsets_s: number[];
  values: number[];
}

export interface MarcaFila {
  slug: string;
  valor: number;
  unidad: string;
  fuente: string;
  run_context: string | null;
  dia: string;
}

export interface PuntuacionFila {
  sesion_id: string;
  dia: string;
  wod_id: string | null;
  nombre: string | null;
  formato: string | null;
  tiempo_s: number | null;
  rondas: number | null;
  reps: number | null;
}

export interface SegmentoPlantillaFila {
  template_id: string;
  block_format: string | null;
  block_position: number | null;
  prescription: unknown;
}

export interface DesacopleFila {
  sesion_id: string;
  dia: string;
  pct: number;
}

export interface FilasProgreso {
  tramos: TramoFila[];
  series: SerieFila[];
  trazas: TrazaFila[];
  marcas: MarcaFila[];
  puntuaciones: PuntuacionFila[];
  plantillas: SegmentoPlantillaFila[];
  desacoples: DesacopleFila[];
}

/** El día local de una ejecución: el mismo criterio que el panel (`panel-datos.ts`). */
const DIA = (client: Sql, tz: string) => client`to_char(coalesce(we.ended_at, we.started_at, we.created_at) at time zone ${tz}, 'YYYY-MM-DD')`;

export async function loadFilasProgreso(args: {
  atleta: AtletaVerificado;
  tz: string;
  /** El final (excluido) de hoy en el huso del atleta. */
  hasta_excl: Date;
  /** El coach del atleta, para el nombre de ejercicio que ve (el suyo si lo renombró). */
  coach_id: number | null;
  client?: Sql;
}): Promise<FilasProgreso> {
  const client = args.client ?? defaultSql;
  const { atleta, tz } = args;
  const hasta = args.hasta_excl.toISOString();

  const [tramos, series, trazas, marcas, puntuaciones, desacoples] = await Promise.all([
    // tenancy: verified-owner
    client<TramoFila[]>`
      select
        se.id::text as id,
        we.id::text as sesion_id,
        ${DIA(client, tz)} as dia,
        extract(epoch from (se.ended_at - se.started_at))::float as segundos,
        se.position,
        se.modality,
        se.source,
        se.context_format,
        se.prior_work_s,
        coalesce(se.is_structural, false) as is_structural,
        se.leg_role,
        se.distance_meters::float as distance_m,
        se.avg_pace_s_per_km::float as pace_km,
        se.avg_pace_s_per_500m::float as pace_500m,
        se.avg_power_w::float as power_w,
        se.avg_hr::float as avg_hr,
        se.avg_gradient_pct::float as gradient_pct,
        se.incline_pct::float as incline_pct,
        se.stroke_rate_spm::float as stroke_spm,
        se.reps_completed,
        se.weight_used_kg::float as weight_kg,
        se.raw_lap_data_json -> 'erg_splits' as erg_splits,
        e.id::text as exercise_id,
        e.slug as exercise_slug,
        coalesce(ceo.name, e.name) as exercise_name,
        e.modality as exercise_modality,
        e.category::text as exercise_category,
        e.movement_pattern,
        e.equipment
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises e on e.id = coalesce(se.exercise_id, ts.exercise_id)
      left join coach_exercise_overrides ceo on ceo.exercise_id = e.id and ceo.coach_id = ${args.coach_id}
      where we.athlete_id = ${atleta.athlete_id}
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta}::timestamptz
      order by dia, we.id, se.position, se.id
    `,
    // tenancy: verified-owner
    client<SerieFila[]>`
      select st.segment_execution_id::text as segmento_id, st.reps_actual as reps, st.load_actual_kg::float as kg, st.status as estado
      from set_executions st
      join segment_executions se on se.id = st.segment_execution_id
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${atleta.athlete_id}
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta}::timestamptz
      order by st.segment_execution_id, st.set_index
    `,
    // tenancy: verified-owner
    client<TrazaFila[]>`
      select we.id::text as sesion_id, ${DIA(client, tz)} as dia, wt.source::text as source, wt.offsets_s::float8[] as offsets_s, wt.values::float8[] as values
      from workout_traces wt
      join workout_executions we on we.id = wt.execution_id
      where we.athlete_id = ${atleta.athlete_id}
        and wt.signal = 'distance'
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta}::timestamptz
    `,
    // Las marcas que cuentan como resultado: un test medido o una carrera
    // registrada. Lo declarado al entrar es un ancla, no una marca.
    // tenancy: verified-owner
    client<MarcaFila[]>`
      select ab.exercise_slug as slug, ab.value::float as valor, ab.unit as unidad, ab.source as fuente, ab.run_context,
        to_char(ab.recorded_at at time zone ${tz}, 'YYYY-MM-DD') as dia
      from athlete_benchmarks ab
      where ab.athlete_id = ${atleta.athlete_id}
        and ab.source in ('coach_test', 'athlete_test', 'registered')
        and ab.recorded_at < ${hasta}::timestamptz
      order by ab.recorded_at, ab.id
    `,
    // La plantilla RAÍZ: una instancia del atleta apunta a su original, que es la
    // que se repite de verdad.
    // tenancy: verified-owner
    client<PuntuacionFila[]>`
      select we.id::text as sesion_id, ${DIA(client, tz)} as dia,
        coalesce(t.instance_of_template_id, t.id)::text as wod_id,
        coalesce(raiz.name, t.name) as nombre,
        coalesce(raiz.format, t.format)::text as formato,
        we.score_time_s as tiempo_s, we.score_rounds as rondas, we.score_reps as reps
      from workout_executions we
      left join workout_assignments wa on wa.id = we.assignment_id
      left join templates t on t.id = wa.template_id
      left join templates raiz on raiz.id = t.instance_of_template_id
      where we.athlete_id = ${atleta.athlete_id}
        and (we.score_time_s is not null or we.score_rounds is not null)
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta}::timestamptz
      order by dia, we.id
    `,
    // tenancy: verified-owner
    client<DesacopleFila[]>`
      select we.id::text as sesion_id, ${DIA(client, tz)} as dia, we.decoupling_pct::float as pct
      from workout_executions we
      where we.athlete_id = ${atleta.athlete_id}
        and we.decoupling_pct is not null
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${hasta}::timestamptz
    `,
  ]);

  const raices = [...new Set(puntuaciones.map((p) => p.wod_id).filter((x): x is string => x != null))];
  const plantillas =
    raices.length === 0
      ? []
      : // Las plantillas salen de las ejecuciones del atleta verificado de arriba.
        // tenancy: verified-owner
        await client<SegmentoPlantillaFila[]>`
          select ts.template_id::text as template_id, ts.block_format, ts.block_position, ts.prescription_json as prescription
          from template_segments ts
          where ts.template_id in ${client(raices.map(Number))}
          order by ts.template_id, ts.block_position, ts.position
        `;

  return { tramos, series, trazas, marcas, puntuaciones, plantillas, desacoples };
}
