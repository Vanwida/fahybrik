/**
 * backfill_zone_seconds.ts — EL RECONSTRUCTOR. Rehace el reparto por zonas del
 * histórico entero a partir de lo que ya está guardado.
 *
 * QUÉ HAY QUE RECONSTRUIR, Y POR QUÉ VALE LA PENA. El reparto de zonas sólo
 * existía dentro del móvil, congelado en 24 de los 241 tramos ejecutados. Todo lo
 * demás está en muestras de pulso que ya llevan años en producción y que nadie
 * cruzaba con los entrenos: 106.880 lecturas, de las que 986 caen dentro de la
 * ventana de un tramo (44 tramos de 23 ejecuciones, medido el 10-ago-2026).
 *
 * Reutiliza el MISMO servicio que la ingesta (`computeExecutionZoneSeconds`), no
 * una copia en SQL: un reconstructor que calcule distinto que el motor produce un
 * histórico que no casa con lo nuevo, y nadie se entera hasta meses después.
 *
 * IDEMPOTENTE Y REANUDABLE. Cada ejecución se reescribe entera (upsert por
 * tramo), así que volver a lanzarlo no duplica nada. Por defecto SALTA las
 * ejecuciones que ya tienen filas — así una pasada interrumpida se retoma sin
 * rehacer lo hecho. Con `--force` las recalcula todas.
 *
 * NO RECALCULA POR SU CUENTA NADA QUE YA ESTUVIERA BIEN: el reparto que congeló
 * el móvil se respeta tal cual, porque es medida, no estimación.
 *
 * LANZAR (contra la base que apunte web/.env.local, o con DATABASE_URL explícito):
 *
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/backfill_zone_seconds.ts --dry-run
 *
 * Opciones:
 *   --dry-run          cuenta lo que haría y no escribe nada
 *   --force            recalcula también las ejecuciones que ya tienen filas
 *   --athlete=<id>     limita a un atleta
 *   --limit=<n>        procesa como mucho n ejecuciones (para probar)
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';
import type { AthleteHrZones } from '@fahybrid/shared/domain/methodology';

// Los servicios de web viven detrás de `server-only` y del alias `@/`, y forman
// ciclos de importación que el bundler de Next tolera y el enlazador ESTÁTICO de
// tsx no («does not provide an export»). El import() DINÁMICO aplaza el enlazado
// más allá del ciclo, así que se cargan en tiempo de ejecución. Es el mismo
// patrón que `seed_demo_coaches.ts`, y por eso se corre con
// `--conditions=react-server` (ahí `server-only` resuelve a su no-op).
type Deps = {
  sql: Sql;
  loadAthleteHrZones: typeof import('@/lib/athlete/hr-zones')['loadAthleteHrZones'];
  computeExecutionZoneSeconds: typeof import('@/lib/zones/segment-zone-seconds')['computeExecutionZoneSeconds'];
};

async function loadDeps(): Promise<Deps> {
  const [db, hr, zones] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/athlete/hr-zones'),
    import('@/lib/zones/segment-zone-seconds'),
  ]);
  return {
    sql: db.sql,
    loadAthleteHrZones: hr.loadAthleteHrZones,
    computeExecutionZoneSeconds: zones.computeExecutionZoneSeconds,
  };
}

let D: Deps;

type Args = {
  dryRun: boolean;
  force: boolean;
  athleteId: number | null;
  limit: number | null;
};

function parseArgs(argv: string[]): Args {
  const num = (prefix: string): number | null => {
    const raw = argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
    if (!raw || !/^\d+$/.test(raw)) return null;
    return Number(raw);
  };
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    athleteId: num('--athlete='),
    limit: num('--limit='),
  };
}

type Candidate = { execution_id: number; athlete_id: number };

/**
 * Las ejecuciones a reconstruir: las que tienen al menos un tramo CON VENTANA
 * (sin `started_at`/`ended_at` no hay a qué cruzar el pulso) y, salvo `--force`,
 * ninguna fila de zonas todavía.
 */
async function candidates(args: Args): Promise<Candidate[]> {
  const rows = await D.sql<Array<{ execution_id: string; athlete_id: string }>>`
    select we.id::text as execution_id, we.athlete_id::text as athlete_id
    from workout_executions we
    join segment_executions se on se.execution_id = we.id
    where se.started_at is not null
      and se.ended_at is not null
      and (${args.athleteId}::bigint is null or we.athlete_id = ${args.athleteId}::bigint)
      and (
        ${args.force}::boolean
        or not exists (
          select 1 from segment_zone_seconds z where z.segment_execution_id = se.id
        )
      )
    -- Agrupar y no distinct: la ejecución sale una vez aunque tenga ocho tramos,
    -- y el orden va por el id NUMÉRICO (en texto, el 100 iría antes que el 99).
    group by we.id, we.athlete_id
    order by we.id asc
  `;
  const all = rows.map((r) => ({
    execution_id: Number(r.execution_id),
    athlete_id: Number(r.athlete_id),
  }));
  return args.limit != null ? all.slice(0, args.limit) : all;
}

async function main(): Promise<void> {
  D = await loadDeps();
  const args = parseArgs(process.argv.slice(2));
  const pending = await candidates(args);

  console.log(
    `[zonas] ${pending.length} ejecución(es) por reconstruir` +
      (args.athleteId != null ? ` (atleta ${args.athleteId})` : '') +
      (args.force ? ' — modo --force, se recalcula todo' : '') +
      (args.dryRun ? ' — DRY RUN, no se escribe nada' : ''),
  );
  if (pending.length === 0 || args.dryRun) {
    await D.sql.end();
    return;
  }

  // Las zonas del atleta se resuelven UNA vez y se reparten entre sus
  // ejecuciones: son dos consultas por atleta, no dos por entreno.
  const zonesByAthlete = new Map<number, AthleteHrZones | null>();
  let executions = 0;
  let segments = 0;
  let withZones = 0;
  const byOrigin: Record<string, number> = {};
  const failed: number[] = [];

  for (const c of pending) {
    if (!zonesByAthlete.has(c.athlete_id)) {
      zonesByAthlete.set(c.athlete_id, await D.loadAthleteHrZones(c.athlete_id, D.sql));
    }
    try {
      const summary = await D.computeExecutionZoneSeconds({
        execution_id: c.execution_id,
        client: D.sql,
        zones: zonesByAthlete.get(c.athlete_id) ?? null,
      });
      executions += 1;
      segments += summary.rows_written;
      withZones += summary.rows_with_zones;
      for (const [origin, n] of Object.entries(summary.by_origin)) {
        byOrigin[origin] = (byOrigin[origin] ?? 0) + n;
      }
    } catch (err) {
      // Una ejecución rota no puede parar la reconstrucción de las otras 200: se
      // apunta su id y sale en el resumen, que es lo que hace falta para ir a
      // mirarla.
      failed.push(c.execution_id);
      console.error(`[zonas] ejecución ${c.execution_id} falló: ${(err as Error).message}`);
    }
    if (executions % 25 === 0) console.log(`[zonas] ${executions}/${pending.length}…`);
  }

  console.log('[zonas] hecho.');
  console.log(`  ejecuciones procesadas : ${executions}`);
  console.log(`  tramos escritos        : ${segments}`);
  console.log(`  con zona               : ${withZones}`);
  console.log(`  sin zona               : ${segments - withZones}`);
  console.log(`  atletas                : ${zonesByAthlete.size}`);
  console.log(
    `  sin ancla              : ${[...zonesByAthlete.values()].filter((z) => z == null).length} atleta(s)`,
  );
  for (const [origin, n] of Object.entries(byOrigin).sort((a, b) => b[1] - a[1])) {
    console.log(`  fuente ${origin.padEnd(15)}: ${n}`);
  }
  if (failed.length > 0) console.log(`  FALLARON               : ${failed.join(', ')}`);

  await D.sql.end();
}

main().catch((err) => {
  console.error('[zonas] error fatal:', err);
  process.exit(1);
});
