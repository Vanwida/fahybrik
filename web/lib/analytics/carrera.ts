import 'server-only';

// EL BLOQUE DE CARRERA, CARGADO — la carrera objetivo, lo que la disposición
// necesita además de la carga (lo debido día a día) y la previsión HYROX de la
// pizarra de carrera, leída sin escribir nada.
//
// LA PREVISIÓN ES LA DE LA PIZARRA: en individual, `calcularGoalGap` (el mismo
// cálculo que `/api/athlete/goal-gap`, sin congelar la foto del día: una lectura
// del panel no escribe); en dobles, `buildDoblesRaceGap` con el atleta como
// lector (el reparto de la pareja visto desde él, igual que en su pizarra). La
// tendencia son las previsiones completas que la pizarra congeló (`race_predictions`).
//
// El atleta viene verificado (`AtletaVerificado`).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadDailyAssignmentCounts } from '@/lib/coach/compliance-window';
import { calcularGoalGap } from '@/lib/athlete/goal-gap';
import { buildDoblesRaceGap, type DoblesRaceGapDTO } from '@/lib/athlete/dobles-gap';
import {
  disposicionPorDia,
  lecturasCarrera,
  previsionDeGoalGap,
  type CarreraDelPanel,
  type DiaCarga,
  type MuestraDia,
  type PrevisionCarrera,
  type TramoPrevision,
  type CoachAnalyticsMethod,
  type Lectura,
  type VentanaResuelta,
} from '@fahybrid/shared/domain/analytics';
import { diasDelPeriodo } from '@fahybrid/shared/domain/analytics/ventana';
import { raceReadinessMethodOf } from '@fahybrid/shared/domain/coach/race-readiness';
import type { CoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { TargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { supportsHyroxGoalGap } from '@fahybrid/shared/domain/objectives/catalog';
import type { AtletaVerificado } from './atleta-verificado';

/** Quién hace un tramo de dobles, en palabras, desde el atleta que lee. */
function quienEs(s: DoblesRaceGapDTO['segments'][number], pareja: string | null): string {
  const otro = pareja ?? 'tu pareja';
  switch (s.carrier) {
    case 'together':
      return 'Los dos juntos: manda el más lento';
    case 'self':
      return 'Lo haces tú';
    case 'partner':
      return `Lo hace ${otro}`;
    default:
      return `A medias: tú el ${Math.round((s.self_share ?? 0.5) * 100)} %`;
  }
}

/**
 * La previsión de la pareja, desde el atleta. Un tramo sin datos NO trae
 * previsión (la pizarra lo dibuja a su presupuesto para que la barra tenga
 * largo; aquí eso sería un número inventado). Sin objetivo, la pizarra usa la
 * propia previsión como presupuesto: aquí no hay presupuesto.
 */
export function previsionDeDobles(d: DoblesRaceGapDTO): PrevisionCarrera {
  const tramos: TramoPrevision[] = d.segments.map((s) => ({
    slug: s.key,
    etiqueta_es: s.label_es,
    tipo: s.kind,
    previsto_s: s.tier === 'sin_datos' ? null : s.pair_predicted_s,
    banda_s: null,
    presupuesto_s: d.goal_s != null ? s.budget_s : null,
    nivel: s.tier,
    fuente: null,
    accion_es: null,
    quien_es: quienEs(s, d.partner_name),
  }));
  return {
    formato: 'dobles',
    total_s: d.predicted_total_s,
    banda_s: null,
    observado_pct: null,
    tramos,
    sin_pareja: d.availability === 'no_pair',
    pareja: d.partner_name,
  };
}

async function prevision(atleta: AtletaVerificado, carrera: TargetRaceRow, hoy: string, client: Sql): Promise<PrevisionCarrera | null> {
  if (!supportsHyroxGoalGap(carrera.event_type)) return null;
  if (carrera.format === 'singles') {
    return previsionDeGoalGap(await calcularGoalGap({ athlete_id: atleta.athlete_id, race: carrera, todayIso: hoy }, client));
  }
  if (carrera.format !== 'doubles') return null;
  // tenancy: verified-owner
  const rows = await client<Array<{ user_id: string | null }>>`
    select user_id::text as user_id from athletes where id = ${atleta.athlete_id} limit 1
  `;
  const userId = rows[0]?.user_id;
  if (userId == null) {
    return { formato: 'dobles', total_s: null, banda_s: null, observado_pct: null, tramos: [], sin_pareja: true, pareja: null };
  }
  const dto = await buildDoblesRaceGap(
    {
      self_athlete_id: BigInt(atleta.athlete_id),
      self_user_id: BigInt(userId),
      race: {
        race_id: carrera.race_id,
        name: carrera.name,
        race_date: carrera.race_date,
        division: carrera.division,
        gender_category: carrera.gender_category,
        goal_time_seconds: carrera.goal_time_seconds,
      },
    },
    client,
  );
  return previsionDeDobles(dto);
}

async function tendencia(atleta: AtletaVerificado, carrera: TargetRaceRow, desde: string, hasta: string, client: Sql) {
  // tenancy: verified-owner
  return client<Array<{ dia: string; previsto_s: number }>>`
    select to_char(pred_date, 'YYYY-MM-DD') as dia, predicted_total_s::int as previsto_s
    from race_predictions
    where athlete_id = ${atleta.athlete_id}
      and target_race_id = ${carrera.race_id}
      and pred_date >= ${desde}::date
      and pred_date <= ${hasta}::date
      and predicted_total_s is not null
    order by pred_date
  `;
}

export async function cargarCarrera(args: {
  atleta: AtletaVerificado;
  /** El instante del panel: la adherencia resuelve con él el día del atleta. */
  now: Date;
  hoy: string;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  umbrales: CoachThresholds;
  carrera: TargetRaceRow | null;
  diario: readonly DiaCarga[];
  vfc: readonly MuestraDia[];
  client?: Sql;
}): Promise<Lectura[]> {
  const client = args.client ?? defaultSql;
  const { atleta, hoy, ventana, carrera } = args;
  if (!carrera) {
    return lecturasCarrera({ hoy, ventana, metodo: args.metodo, carrera: null, disposicion: [], prevision: null, tendencia: [] });
  }

  // La disposición de cada día de la ventana y del cierre del periodo anterior.
  const dias = diasDelPeriodo(ventana);
  if (ventana.anterior) dias.push(ventana.anterior.hasta);
  const [asignaciones, prev, tend] = await Promise.all([
    loadDailyAssignmentCounts({
      athlete_id: atleta.athlete_id,
      on_date: args.now,
      // Los siete días antes del primer día pedido, para su adherencia.
      days: ventana.dias + (ventana.anterior ? 1 : 0) + 7,
      client,
    }),
    prevision(atleta, carrera, hoy, client),
    tendencia(atleta, carrera, ventana.desde, hoy, client),
  ]);

  const c: CarreraDelPanel = {
    id: carrera.race_id,
    nombre: carrera.name,
    fecha: carrera.race_date,
    dias: carrera.days_until,
    tipo: carrera.event_type,
    formato: carrera.format,
    objetivo_s: carrera.goal_time_seconds != null && carrera.goal_time_seconds > 0 ? carrera.goal_time_seconds : null,
  };

  return lecturasCarrera({
    hoy,
    ventana,
    metodo: args.metodo,
    carrera: c,
    disposicion: disposicionPorDia({
      dias,
      diario: args.diario,
      metodo: args.metodo,
      asignaciones,
      vfc: args.vfc,
      pesos: raceReadinessMethodOf(args.umbrales),
    }),
    prevision: prev,
    tendencia: tend,
  });
}
