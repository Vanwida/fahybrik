import 'server-only';

// El método de FC del coach — la capa de lectura/escritura sobre
// `coach_hr_method` (mig 0168).
//
// El motor de zonas clasifica con `EffectiveHrMethod`: los defectos del sistema
// (`DEFAULT_COACH_HR_METHOD`) con la fila del coach encima. Este módulo es el
// ÚNICO resolutor de esa mezcla, para que el cómputo, la gráfica y el editor no
// puedan discrepar sobre dónde cortan las bandas. Espejo exacto de
// `web/lib/coach/signal-thresholds.ts`.
//
// Un coach sin fila —o una base sin migrar— recibe los defectos, así que nada
// depende de que alguien haya rellenado nada.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  COACH_HR_METHOD_KEYS,
  DEFAULT_COACH_HR_METHOD,
  defaultCoachHrMethod,
  type CoachHrMethod,
} from '@fahybrid/shared/domain/coach/hr-method';

const TABLE = 'coach_hr_method';

/**
 * La fila del coach, o null si no ha escrito ninguna.
 *
 * Las fracciones son `numeric` en la tabla y postgres.js las entrega como
 * TEXTO. Se piden ya casteadas a float8 para que nadie aguas abajo tenga que
 * acordarse de convertirlas — un `'0.81'` colándose en una multiplicación
 * silenciosa es exactamente el fallo que no se ve hasta que la banda está mal.
 */
async function loadRow(coach_id: bigint | number, client: Sql): Promise<CoachHrMethod | null> {
  try {
    const rows = await client<CoachHrMethod[]>`
      select
        z1_hi_frac::float8 as z1_hi_frac,
        z2_lo_frac::float8 as z2_lo_frac,
        z2_hi_frac::float8 as z2_hi_frac,
        z3_lo_frac::float8 as z3_lo_frac,
        z3_hi_frac::float8 as z3_hi_frac,
        z4_lo_frac::float8 as z4_lo_frac,
        z4_hi_frac::float8 as z4_hi_frac,
        z5_lo_frac::float8 as z5_lo_frac,
        z5_hi_frac::float8 as z5_hi_frac,
        polarization_low_max_zone::int as polarization_low_max_zone,
        polarization_mid_max_zone::int as polarization_mid_max_zone,
        polarization_low_pct::int as polarization_low_pct,
        polarization_mid_pct::int as polarization_mid_pct,
        polarization_high_pct::int as polarization_high_pct
      from coach_hr_method
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    // Entorno sin migrar: servir los defectos en vez de tumbar la ficha entera.
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

/**
 * El método VIGENTE de este coach: los defectos del sistema con su fila encima.
 * Es la única lectura que necesita el motor — no le importa quién escribió cada
 * número, sólo cuál manda.
 */
export async function resolveCoachHrMethod(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachHrMethod> {
  const row = await loadRow(coach_id, client);
  if (!row) return defaultCoachHrMethod();
  const values = Object.fromEntries(COACH_HR_METHOD_KEYS.map((k) => [k, row[k]]));
  return { ...DEFAULT_COACH_HR_METHOD, ...values };
}

/**
 * El método vigente para UN ATLETA, por su coach.
 *
 * Un atleta sin coach (los hay: el alta libre, y las cuentas de prueba) usa los
 * defectos. Es la respuesta correcta y no un caso raro — sus zonas siguen siendo
 * las del modelo, simplemente nadie las ha movido.
 */
export async function resolveAthleteHrMethod(
  athlete_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachHrMethod> {
  const rows = await client<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${Number(athlete_id)} limit 1
  `;
  const coachId = rows[0]?.coach_id;
  if (!coachId) return defaultCoachHrMethod();
  return resolveCoachHrMethod(Number(coachId), client);
}

/**
 * Guardar reemplaza el conjunto entero del coach, sin parche por campo: así el
 * editor y el motor no pueden discrepar sobre cuáles son «los suyos». Los CHECK
 * de la tabla son la última palabra sobre bandas que se pisen o un reparto que
 * no sume 100.
 */
export async function upsertCoachHrMethod(
  coach_id: bigint | number,
  values: CoachHrMethod,
  client: Sql = defaultSql,
): Promise<CoachHrMethod> {
  await client`
    insert into coach_hr_method (
      coach_id,
      z1_hi_frac, z2_lo_frac, z2_hi_frac, z3_lo_frac, z3_hi_frac,
      z4_lo_frac, z4_hi_frac, z5_lo_frac, z5_hi_frac,
      polarization_low_max_zone, polarization_mid_max_zone,
      polarization_low_pct, polarization_mid_pct, polarization_high_pct,
      updated_at
    )
    values (
      ${coach_id},
      ${values.z1_hi_frac}, ${values.z2_lo_frac}, ${values.z2_hi_frac},
      ${values.z3_lo_frac}, ${values.z3_hi_frac},
      ${values.z4_lo_frac}, ${values.z4_hi_frac},
      ${values.z5_lo_frac}, ${values.z5_hi_frac},
      ${values.polarization_low_max_zone}, ${values.polarization_mid_max_zone},
      ${values.polarization_low_pct}, ${values.polarization_mid_pct}, ${values.polarization_high_pct},
      now()
    )
    on conflict (coach_id) do update set
      z1_hi_frac = excluded.z1_hi_frac,
      z2_lo_frac = excluded.z2_lo_frac,
      z2_hi_frac = excluded.z2_hi_frac,
      z3_lo_frac = excluded.z3_lo_frac,
      z3_hi_frac = excluded.z3_hi_frac,
      z4_lo_frac = excluded.z4_lo_frac,
      z4_hi_frac = excluded.z4_hi_frac,
      z5_lo_frac = excluded.z5_lo_frac,
      z5_hi_frac = excluded.z5_hi_frac,
      polarization_low_max_zone = excluded.polarization_low_max_zone,
      polarization_mid_max_zone = excluded.polarization_mid_max_zone,
      polarization_low_pct = excluded.polarization_low_pct,
      polarization_mid_pct = excluded.polarization_mid_pct,
      polarization_high_pct = excluded.polarization_high_pct,
      updated_at = now()
  `;
  return { ...values };
}
