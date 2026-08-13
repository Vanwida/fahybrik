// Una vez: convierte los marcadores training_load de Salud en sesiones.
//   pnpm --filter web exec tsx scripts/materialize-healthkit-history.ts

import { sql } from '../lib/db';
import { materializeHealthkitHistory } from '../lib/sync/materialize-healthkit-history';

async function main() {
  const athlete = process.argv[2] ? Number(process.argv[2]) : undefined;
  if (process.argv[2] && !Number.isFinite(athlete)) {
    console.error('uso: tsx scripts/materialize-healthkit-history.ts [athlete_id]');
    process.exit(1);
  }

  const result = await materializeHealthkitHistory({
    sql,
    ...(athlete != null ? { athlete_id: athlete } : {}),
  });
  console.log(JSON.stringify(result));
  await sql.end({ timeout: 5 });
}

void main();
