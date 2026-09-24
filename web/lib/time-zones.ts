import 'server-only';

// Un huso que sirve a los DOS motores de fechas del producto. TS resuelve el día
// con Intl (`zonedDayString`, `startOfDayInTz`); SQL, con `at time zone <huso>`. No
// comparten base de husos: Intl acepta nombres heredados que un Postgres con el
// tzdata recortado rechaza ('Europe/Kiev', 'Asia/Calcutta'), nombres que tzdata ya
// borró ('US/Pacific-New') y desfases ('+01:00', que Postgres lee con el signo al
// revés). Y un huso guardado que Postgres no conoce tumba CADA consulta que lo usa
// («time zone not recognized»), con la pantalla entera detrás.
//
// Por eso se valida AL ESCRIBIR (el huso del club en Ajustes, el del teléfono en la
// sincronización): una columna de huso solo guarda nombres que Intl entiende Y que
// están en `pg_timezone_names` de ESTA base, nombre a nombre. Así cada lectura, en
// TS o en SQL, puede fiarse de la columna.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';

type Client = Sql | TransactionClient;

/** ¿Lo conocen los dos motores, Intl y este Postgres (nombre a nombre)? */
export async function isSafeTimezone(tz: string, client: Client = defaultSql): Promise<boolean> {
  if (!isValidTimezone(tz)) return false;
  const rows = await client<Array<{ known: boolean }>>`
    select exists (select 1 from pg_timezone_names where name = ${tz}) as known
  `;
  return rows[0]?.known === true;
}

/** Los nombres de huso que conoce este Postgres. */
export async function loadPostgresTimezoneNames(client: Client = defaultSql): Promise<Set<string>> {
  const rows = await client<Array<{ name: string }>>`select name from pg_timezone_names`;
  return new Set(rows.map((r) => r.name));
}

/** La zona a la que Intl resuelve un nombre ('Asia/Kolkata' → 'Asia/Calcutta'), o null si no lo conoce. */
function intlZoneOf(name: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Los husos que se ofrecen para elegir: la lista de Intl (una entrada por zona),
 * cada una con un nombre que conocen los dos motores. La lista de Intl usa los
 * nombres de CLDR, algunos heredados ('Asia/Calcutta', 'Europe/Kiev'); si Postgres
 * no conoce ese nombre, va el que sí conoce para la MISMA zona ('Asia/Kolkata',
 * 'Europe/Kyiv'), así ninguna ciudad desaparece. Una zona sin ningún nombre que
 * conozca Postgres no se ofrece. Puro: la lista y los nombres los pone quien llama.
 */
export function offerableTimezones(intlZones: readonly string[], known: ReadonlySet<string>): string[] {
  const listed = new Set(intlZones);
  // El nombre de Postgres para cada zona de la lista que no conoce por el suyo.
  // Solo pueden serlo los nombres que no están en la lista (esos son su propia zona).
  const alias = new Map<string, string>();
  if (intlZones.some((zone) => !known.has(zone))) {
    for (const name of [...known].sort()) {
      if (listed.has(name)) continue;
      const zone = intlZoneOf(name);
      if (zone && listed.has(zone) && !known.has(zone) && !alias.has(zone)) alias.set(zone, name);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const zone of intlZones) {
    const name = known.has(zone) && isValidTimezone(zone) ? zone : alias.get(zone);
    if (name !== undefined && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Los husos del combo de Ajustes › Tu club: `offerableTimezones` con la lista de Intl de este servidor. */
export async function loadOfferableTimezones(client: Client = defaultSql): Promise<string[]> {
  return offerableTimezones(Intl.supportedValuesOf('timeZone'), await loadPostgresTimezoneNames(client));
}
