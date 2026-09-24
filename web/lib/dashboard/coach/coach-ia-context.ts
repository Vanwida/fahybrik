import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  buildAthleteContextPack as _buildAthleteContextPack,
  type AthleteContextPack,
  type ProgressionVerdict,
} from '@fahybrid/shared/domain/coach/coach-ia-context';
import { loadBodySignals } from '@/lib/coach/week-adjust-signals';

export type { AthleteContextPack, ProgressionVerdict };

/**
 * El paquete de la IA con las señales vivas de Hoy dentro: su lectura de
 * progresión («down» si Hoy pide tocar la semana) sale de la misma fuente que el
 * veredicto semanal y que Hoy.
 */
export async function buildAthleteContextPack(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  /** El instante de la lectura: la cuenta atrás a la carrera va en el día del atleta. */
  now?: Date;
  client?: Sql;
}): Promise<AthleteContextPack> {
  const client = params.client ?? sql;
  const body_signals = await loadBodySignals({ athlete_id: params.athlete_id, client });
  return _buildAthleteContextPack({ ...params, client, body_signals });
}

/** Alias for plan naming. */
export const buildCoachIaContextPack = buildAthleteContextPack;
