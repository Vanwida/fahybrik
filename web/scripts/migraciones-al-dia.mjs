#!/usr/bin/env node
// La build de producción se para si a la base le falta una migración del repo.
//
// Existe por el 24-09-2026: el PR #191 salió a producción con código que leía
// `workout_executions.off_plan_reason` (0270) y la base no la tenía — la cola de
// atención de todos los coaches dejó de recalcularse en el primer cron. Nada
// comparaba el código que se publica con el esquema que lo tiene que servir.
// Decisión de Alex (DECISIONS 2026-09-24 «Ningún deploy sin su migración»): la
// build se para; sigue sirviendo la versión anterior hasta que se aplican y se
// vuelve a desplegar.
//
// Qué compara: los `infra/migrations/*.sql` de este código contra el diario
// `schema_migrations` que escribe `infra/scripts/migrate.ts` (la versión es el
// nombre del fichero sin `.sql`, la misma llave que usa el migrador).
//
// Cuándo actúa (VERCEL_ENV):
//   production → falta alguna, o no se puede comprobar → la build falla.
//   preview    → avisa en el log y sigue (las previews no sirven a nadie).
//   sin Vercel → no hace nada (local, CI). `--forzar` lo ejecuta como producción.

import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = resolve(webDir, '..', 'infra', 'migrations');

/**
 * Las versiones del repo (nombre sin `.sql`), en el orden del migrador.
 * @param {string[]} files
 * @returns {string[]}
 */
export function repoVersions(files) {
  return files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.slice(0, -'.sql'.length))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Qué falta en la base. `pending` son las del repo que el diario no tiene.
 * `gaps` es el subconjunto que es ANTERIOR a la última registrada: no suele ser
 * «falta aplicarla» sino un diario que no sabe de una migración vieja (se aplicó a
 * mano, o antes de que existiera el diario) — se dice aparte porque se arregla
 * distinto.
 * @param {string[]} versions
 * @param {Set<string>} applied
 * @returns {{ pending: string[]; gaps: string[]; newestApplied: string | null }}
 */
export function missingMigrations(versions, applied) {
  const pending = versions.filter((v) => !applied.has(v));
  const newestApplied = versions.filter((v) => applied.has(v)).at(-1) ?? null;
  const gaps = newestApplied ? pending.filter((v) => v.localeCompare(newestApplied, 'en') < 0) : [];
  return { pending, gaps, newestApplied };
}

/**
 * El texto del log de la build.
 * @param {{ pending: string[]; gaps: string[] }} missing
 * @param {{ enforce: boolean }} options
 * @returns {string}
 */
export function report({ pending, gaps }, { enforce }) {
  const lines = [];
  const where = enforce ? 'La base de producción' : 'La base de esta preview';
  lines.push(`[migraciones] ${where} no tiene ${pending.length} migración(es) de este código:`);
  for (const v of pending) lines.push(`  · ${v}${gaps.includes(v) ? '   (anterior a la última registrada)' : ''}`);
  if (!enforce) return lines.join('\n');

  lines.push('');
  lines.push('Este deploy se para para no publicar código que las necesita; la versión anterior sigue sirviendo.');
  if (gaps.length > 0) {
    // Primero los huecos: `migrate` las ejecutaría todas, también las viejas.
    lines.push('');
    lines.push('Las marcadas como anteriores suelen estar ya en la base sin constar en el diario.');
    lines.push('Comprueba su esquema; si ya está, regístralas SIN ejecutarlas:');
    lines.push(`  pnpm --dir infra migrate:backfill --through=${gaps.at(-1)}`);
  }
  if (pending.length > gaps.length) {
    lines.push('');
    lines.push(gaps.length > 0 ? 'Después aplica las demás desde main al día:' : 'Aplícalas desde main al día:');
    lines.push('  git pull && pnpm --dir infra migrate:dry-run && pnpm --dir infra migrate');
  }
  lines.push('');
  lines.push('Y vuelve a desplegar (Redeploy en Vercel).');
  return lines.join('\n');
}

async function appliedVersions(url) {
  const { default: postgres } = await import('postgres');
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 15, idle_timeout: 1, prepare: false });
    try {
      const rows = await sql`select version from schema_migrations`;
      return new Set(rows.map((r) => r.version));
    } catch (error) {
      lastError = error;
      // Un endpoint de Neon dormido puede cortar la primera conexión.
      if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
    } finally {
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  }
  throw lastError;
}

async function main() {
  const env = process.env.VERCEL_ENV;
  const enforce = env === 'production' || process.argv.includes('--forzar');
  if (!enforce && env !== 'preview') {
    console.log('[migraciones] fuera de Vercel: no se comprueba (usa --forzar para comprobar a mano).');
    return 0;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migraciones] DATABASE_URL no está en el entorno de la build: no se puede comprobar el esquema.');
    return enforce ? 1 : 0;
  }

  let versions;
  try {
    versions = repoVersions(readdirSync(MIGRATIONS_DIR));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[migraciones] No se pueden leer las migraciones del repo (${MIGRATIONS_DIR}): ${reason}`);
    return enforce ? 1 : 0;
  }
  let applied;
  try {
    applied = await appliedVersions(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[migraciones] No se pudo leer schema_migrations: ${reason}`);
    if (enforce) console.error('Sin comprobarlo no se publica. Si la base estaba caída, vuelve a desplegar.');
    return enforce ? 1 : 0;
  }

  const missing = missingMigrations(versions, applied);
  if (missing.pending.length === 0) {
    console.log(`[migraciones] al día: las ${versions.length} migraciones del repo están en la base.`);
    return 0;
  }
  const text = report(missing, { enforce });
  if (enforce) console.error(text);
  else console.warn(text);
  return enforce ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
