import 'server-only';

// LA BASAL ÚNICA, PARA LAS PANTALLAS DEL COACH — el roster (`cohort.ts`), el
// barrido de avisos (`attention/recompute-batch.ts`) y la ficha
// (`athlete-deep-dive.ts`). Hasta el 29-09-2026 cada una llevaba su propia
// consulta SQL de «VFC de 7 días frente a la de hace 60 a 14», en instantes UTC
// desde «ahora», sin la ventana del coach y sin exigir noches (P3, P16): el
// mismo atleta podía estar «bajo» en la ficha y «en su normal» en su teléfono.
//
// Aquí se leen las MUESTRAS de todo el club (una consulta, sin N+1) y cada
// atleta pasa por la función única (`comparaConBasal`, con la ventana basal y
// las noches mínimas del coach, en el día LOCAL del atleta). El sueño de la
// semana, igual: una noche es un número (`nochesDeSueno`), no la media de los
// lotes que subió el teléfono.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  comparaConBasal,
  diaDeSueno,
  diaLocal,
  nochesDeSueno,
  recienteDe,
  type ComparacionConBasal,
  type Media,
  type MuestraDia,
} from '@fahybrid/shared/domain/analytics/basal';
import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';

const SEGUNDOS_POR_HORA = 3600;
const MS_POR_DIA = 86_400_000;

export interface BasalDelAtleta {
  /** El hoy del atleta (su huso), contra el que se mide todo. */
  hoy: string;
  /** Su VFC de 7 días frente a su basal, con las puertas del coach. */
  vfc: ComparacionConBasal;
  /** La media de sus noches de los últimos 7 días (una noche, un número), en horas. */
  sueno_7d: Media;
}

/**
 * La basal de los atletas de UN coach (o de uno solo de ellos). La consulta se
 * ata al club por `coach_id`; lo que no es del coach no se lee.
 */
export async function loadBasalesDelClub(args: {
  coach_id: number | bigint;
  /** Solo este atleta del club (la ficha); sin él, todo el club. */
  athlete_id?: number | bigint | null;
  now: Date;
  metodo: Pick<CoachAnalyticsMethod, 'basal_dias' | 'basal_excluir_dias' | 'hrv_min_nights_recent' | 'hrv_min_nights_baseline'>;
  client?: Sql;
}): Promise<Map<string, BasalDelAtleta>> {
  const client = args.client ?? defaultSql;
  // La basal del día mira `basal_dias` atrás; dos días de holgura por los husos.
  const desde = new Date(args.now.getTime() - (args.metodo.basal_dias + 2) * MS_POR_DIA);
  const hasta = new Date(args.now.getTime() + MS_POR_DIA);
  const solo = args.athlete_id != null ? Number(args.athlete_id) : null;

  const filas = await client<Array<{ athlete_id: string; tz: string | null; metric: string; at: Date; v: number }>>`
    select bs.athlete_id::text as athlete_id, a.timezone as tz, bs.metric_type::text as metric,
           bs.recorded_at as at, bs.value_numeric::float8 as v
    from biometric_streams bs
    join athletes a on a.id = bs.athlete_id
    where a.coach_id = ${Number(args.coach_id)}
      and (${solo}::bigint is null or a.id = ${solo}::bigint)
      and bs.metric_type::text in ('hrv', 'sleep_duration')
      and bs.value_numeric is not null
      and bs.recorded_at >= ${desde}
      and bs.recorded_at < ${hasta}
  `;

  const porAtleta = new Map<string, { tz: string; vfc: MuestraDia[]; sueno: MuestraDia[] }>();
  for (const f of filas) {
    let a = porAtleta.get(f.athlete_id);
    if (!a) {
      a = { tz: f.tz != null && isValidTimezone(f.tz) ? f.tz : BOX_TIMEZONE, vfc: [], sueno: [] };
      porAtleta.set(f.athlete_id, a);
    }
    const at = new Date(f.at);
    if (f.metric === 'hrv') {
      a.vfc.push({ dia: diaLocal(at, a.tz), valor: f.v });
    } else {
      const dia = diaDeSueno(at, a.tz);
      if (dia != null) a.sueno.push({ dia, valor: f.v / SEGUNDOS_POR_HORA });
    }
  }

  const out = new Map<string, BasalDelAtleta>();
  for (const [id, a] of porAtleta) {
    const hoy = zonedDayString(args.now, a.tz);
    out.set(id, { hoy, vfc: comparaConBasal(a.vfc, hoy, args.metodo), sueno_7d: recienteDe(nochesDeSueno(a.sueno), hoy) });
  }
  return out;
}
