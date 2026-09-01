import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import {
  lecturasRecuperacion,
  type FilaBiometrica,
} from '@fahybrid/shared/domain/analytics/recuperacion';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { HRV_BASELINE_FROM_DAYS } from '@fahybrid/shared/domain/biometrics/hrv-baseline';
import { loadRestingHrDays } from '@fahybrid/shared/domain/biometrics/resting-hr';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

// EL CABLE de recuperación: una consulta masiva a `biometric_streams` + una
// llamada al resolvedor de pulso en reposo, y el puro (`shared/domain/
// analytics/recuperacion.ts`) reparte las filas entre las siete lecturas. El
// dominio decide QUÉ es cada lectura; esto solo decide DE DÓNDE salen las
// filas.
//
// Pulso en reposo queda FUERA de la consulta masiva a propósito, igual que ya
// hace `web/lib/athlete/analytics/recovery.ts`: es un agregado diario
// revisado in situ (la misma fecha se reescribe varias veces con
// `created_at` distinto), así que leerlo con `metric_type = any(...)`
// contaría revisiones superadas como si fueran muestras nuevas. Su resolvedor
// (`loadRestingHrDays`) ya hace el día local + última revisión ganadora.
//
// LA VENTANA QUE SE LEE ES MÁS ANCHA QUE LA QUE SE ENSEÑA. El basal de
// variabilidad (y, por el mismo tamaño de ventana, el de pulso en reposo)
// mira hasta `HRV_BASELINE_FROM_DAYS` atrás con independencia de cuántos días
// pida el cliente para la serie — si `dias` fuese, por ejemplo, 14, el motor
// igualmente necesita 60 días de historia para decidir si el basal se
// sostiene. Por eso la consulta siempre trae `max(dias, HRV_BASELINE_FROM_DAYS)`
// días, y es el puro quien decide cuánto de eso enseña.

/** Las métricas que caben en la consulta masiva. Pulso en reposo (`hr_resting`)
 *  queda fuera: ver cabecera. */
const METRICAS_CONSULTA_MASIVA = ['hrv', 'sleep_duration', 'sleep_score', 'stress', 'body_battery', 'weight'];

/** Holgura UTC a cada lado del rango local, para que el borde del rango no
 *  recorte una muestra por el huso del atleta — el corte fino por día lo hace
 *  el puro con `timezone`. Mismo patrón que `resting-hr.ts` (`UTC_SLACK_DAYS`). */
const HOLGURA_DIAS = 1;

export async function loadLecturasRecuperacion(params: {
  athlete_id: number | bigint;
  /** Día local del atleta hasta el que se lee (YYYY-MM-DD), inclusive. */
  hasta: string;
  /** Días que se ENSEÑAN (serie + cobertura); el motor puede mirar más atrás
   *  para los basales, ver cabecera. */
  dias: number;
  metodo: CoachAnalyticsMethod;
  client?: Sql;
}): Promise<Lectura[]> {
  const client = params.client ?? defaultSql;
  const athleteId = params.athlete_id;

  // Siempre >= HRV_BASELINE_FROM_DAYS (60), así que nunca es cero: no hace
  // falta guardar el caso «ventana vacía» aquí, eso lo decide el puro con `dias`.
  const diasFetch = Math.max(Math.max(0, Math.trunc(params.dias)), HRV_BASELINE_FROM_DAYS);
  const desdeFetch = isoDateString(addDays(parseIsoDate(params.hasta), -(diasFetch - 1)));

  const desdeUtc = addDays(parseIsoDate(desdeFetch), -HOLGURA_DIAS);
  const hastaUtc = addDays(parseIsoDate(params.hasta), 1 + HOLGURA_DIAS);

  const [timezone, filasCrudas, pulsoReposoDias] = await Promise.all([
    loadAthleteTimezone(client, athleteId),
    client<Array<{ metric_type: string; recorded_at: Date; value_numeric: number; source: string }>>`
      select
        metric_type::text as metric_type,
        recorded_at,
        value_numeric::float as value_numeric,
        source::text as source
      from biometric_streams
      where athlete_id = ${athleteId as number}
        and metric_type::text = any(${METRICAS_CONSULTA_MASIVA})
        and recorded_at >= ${desdeUtc}
        and recorded_at < ${hastaUtc}
    `,
    loadRestingHrDays({
      athlete_id: athleteId,
      from_iso: desdeFetch,
      to_iso: params.hasta,
      client,
    }),
  ]);

  // Defensivo, mismo patrón que `resting-hr.ts::toDays`: si el driver alguna
  // vez devuelve `recorded_at` como string en vez de `Date`, esto lo normaliza
  // en vez de dejar que el puro reciba un tipo que no es el declarado.
  const filas: FilaBiometrica[] = filasCrudas.map((f) => ({ ...f, recorded_at: new Date(f.recorded_at) }));

  return lecturasRecuperacion({
    filas,
    pulso_reposo_dias: pulsoReposoDias,
    hasta: params.hasta,
    dias: params.dias,
    timezone,
    metodo: params.metodo,
  });
}
