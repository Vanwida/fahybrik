import 'server-only';

// POLARIZACIÓN — cuánto del trabajo del atleta fue fácil, medio y duro.
//
// EL BUG QUE ESTE FICHERO CIERRA. La lectura anterior preguntaba a
// `biometric_streams` por TODAS las pulsaciones del atleta en los últimos N días,
// sin atarlas a ningún entreno. Medido el 10-ago-2026: de las 106.880 lecturas de
// pulso guardadas, 105.894 caen fuera de cualquier tramo ejecutado. El 99 % de lo
// que el coach leía como «base aeróbica» era el pulso de dormir, de estar sentado
// y de vivir — y como el pulso en reposo cae en Z1, cuanto más descansaba el
// atleta más polarizado parecía su entrenamiento.
//
// Ahora sale de `segment_zone_seconds`, que sólo existe para tramos ejecutados y
// cuenta SEGUNDOS, no filas. Y se agrega en Postgres: antes se traían las 10⁵
// filas al proceso, y el histórico repetía esa consulta doce veces.
//
// EL PLIEGUE Y EL OBJETIVO SON DEL COACH. Que Z1+Z2 sea «lo fácil» y que el
// objetivo sea 80/0/20 son sus decisiones, no nuestro mecanismo: llegan
// resueltos en `method` (mig 0168) y aquí sólo se aplican.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  collapseToPolarization,
  polarizationDriftFrom,
  polarizationPct,
  polarizationTargetFrom,
  type CoachHrMethod,
  type PolarizationSplit,
} from '@fahybrid/shared/domain/coach/hr-method';
import type { ZoneSecondsByZone } from '@fahybrid/shared/domain/methodology';

const SECONDS_PER_WEEK = 7 * 24 * 60 * 60;

type ZoneSumRow = {
  z1_s: number;
  z2_s: number;
  z3_s: number;
  z4_s: number;
  z5_s: number;
};

const toByZone = (r: ZoneSumRow): ZoneSecondsByZone => ({
  1: r.z1_s,
  2: r.z2_s,
  3: r.z3_s,
  4: r.z4_s,
  5: r.z5_s,
});

/**
 * El camino de la fila de zonas hasta el atleta y su fecha.
 *
 * SIN filtro de «tramo de trabajo» a propósito: el trote entre series es tiempo
 * de entrenamiento y su pulso cuenta en el reparto. Ese filtro existe para las
 * lecturas que comparan ESFUERZOS entre sí (el mejor tiempo, la economía en Z2),
 * donde una recuperación falsearía la media. Aquí falsearía justo lo contrario.
 */
const zoneJoin = (client: Sql) => client`
  from segment_zone_seconds z
  join segment_executions se on se.id = z.segment_execution_id
  join workout_executions we on we.id = se.execution_id
`;

/**
 * El reparto de los últimos `days` días, en porcentajes que suman 100, y cuánto
 * se ha desviado del objetivo del coach.
 *
 * Null cuando no hay ni un segundo clasificado en la ventana: el atleta sin
 * ancla, o la semana sin pulso medido. Nunca un 0/0/0 con una desviación
 * máxima inventada al lado.
 */
export async function loadPolarizationWindow(args: {
  athlete_id: number;
  days: number;
  method: CoachHrMethod;
  now?: Date;
  client?: Sql;
}): Promise<{ pct: PolarizationSplit | null; drift_vs_target: number | null }> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.days * 24 * 60 * 60 * 1000);

  const rows = await client<ZoneSumRow[]>`
    select
      coalesce(sum(z.z1_s), 0)::int as z1_s,
      coalesce(sum(z.z2_s), 0)::int as z2_s,
      coalesce(sum(z.z3_s), 0)::int as z3_s,
      coalesce(sum(z.z4_s), 0)::int as z4_s,
      coalesce(sum(z.z5_s), 0)::int as z5_s
    ${zoneJoin(client)}
    where we.athlete_id = ${args.athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${now.toISOString()}::timestamptz
  `;
  const row = rows[0];
  if (!row) return { pct: null, drift_vs_target: null };

  const pct = polarizationPct(collapseToPolarization(toByZone(row), args.method));
  if (!pct) return { pct: null, drift_vs_target: null };
  return {
    pct,
    drift_vs_target: polarizationDriftFrom(pct, polarizationTargetFrom(args.method)),
  };
}

/**
 * El reparto semana a semana, hacia atrás. UNA consulta para las N semanas.
 *
 * Una semana sin nada medido sale con `pct: null` y no con un 0/0/0: la línea se
 * ROMPE, que es lo honesto — no es una semana en la que el atleta hizo el 0 % de
 * su trabajo suave.
 */
export async function loadPolarizationHistory(args: {
  athlete_id: number;
  weeks: number;
  method: CoachHrMethod;
  now?: Date;
  client?: Sql;
}): Promise<Array<{ iso_date: string; pct: PolarizationSplit | null }>> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.weeks * SECONDS_PER_WEEK * 1000);

  // El cubo es «cuántas semanas hace», medido desde AHORA hacia atrás, para que
  // cada punto siga cayendo donde caía cuando esto eran doce consultas sueltas.
  const rows = await client<Array<ZoneSumRow & { weeks_ago: number }>>`
    select
      floor(
        extract(epoch from (${now.toISOString()}::timestamptz - coalesce(we.ended_at, we.started_at)))
        / ${SECONDS_PER_WEEK}
      )::int as weeks_ago,
      coalesce(sum(z.z1_s), 0)::int as z1_s,
      coalesce(sum(z.z2_s), 0)::int as z2_s,
      coalesce(sum(z.z3_s), 0)::int as z3_s,
      coalesce(sum(z.z4_s), 0)::int as z4_s,
      coalesce(sum(z.z5_s), 0)::int as z5_s
    ${zoneJoin(client)}
    where we.athlete_id = ${args.athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${now.toISOString()}::timestamptz
    group by 1
  `;
  const byWeeksAgo = new Map(rows.map((r) => [r.weeks_ago, r]));

  const out: Array<{ iso_date: string; pct: PolarizationSplit | null }> = [];
  for (let i = args.weeks - 1; i >= 0; i--) {
    const at = new Date(now.getTime() - i * SECONDS_PER_WEEK * 1000);
    const row = byWeeksAgo.get(i);
    out.push({
      iso_date: at.toISOString().slice(0, 10),
      pct: row ? polarizationPct(collapseToPolarization(toByZone(row), args.method)) : null,
    });
  }
  return out;
}
