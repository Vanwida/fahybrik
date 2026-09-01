/**
 * BACKFILL — «OPCIONAL»/«OPCIONA» title prefix → `WeekDayPart.optional` (fase 2,
 * ago-2026, docs/design/contrato-rediseno-editor-microciclos-fase2.md STREAM D).
 *
 * ONE-TIME, narrow, by id: fixes exactly the 2 known real blocks in ONE week
 * template — microciclo "Trainingpeaks · Semana 1" (coach_id = 60), Domingo
 * (day_of_week = 7) — whose titles still carry the literal text prefix the
 * coach typed before the importer learned to strip it (shared/domain/import/
 * label.ts `stripOptionalBlockPrefix`, fase 2):
 *
 *   "OPCIONA: REFUERZO HOMBRO"            → title "REFUERZO HOMBRO",            optional: true
 *   "OPCIONAL: FUERZA PARTE ALTA (4 × 4)" → title "FUERZA PARTE ALTA (4 × 4)",  optional: true
 *
 * NOTE on the id: the STREAM D brief called this "microciclo 76". Verified
 * against production: `program_week_templates.id = 76` does not exist — the
 * actual row (coach_id 60, name "Trainingpeaks · Semana 1", the only week in
 * the whole table whose slots_json contains "OPCION" besides an unrelated
 * coach_id=4 row) is **id = 180**. This script targets 180, confirmed by a
 * read-only scout before writing anything (see the STREAM D report).
 *
 * These are ALREADY-imported blocks (imported before fase 2 shipped), so the
 * new importer logic never touched them — this script is the one-off catch-up
 * for the 2 rows Alex is already looking at in production. It does NOT touch
 * any other row.
 *
 * Safety:
 *   1. Reads the row (id=76) and prints its CURRENT slots_json Domingo blocks
 *      verbatim — the before-state.
 *   2. Locates the 2 target blocks by EXACT verbatim title match (uid-scoped,
 *      same "exact text, never inference" contract as the importer). If it
 *      does not find exactly the 2 expected blocks, it STOPS and prints what
 *      it found instead — no partial/guessed UPDATE.
 *   3. Only with --apply does it write: strips the prefix from `title` and
 *      sets `optional: true` on those 2 blocks INSIDE the jsonb, via a single
 *      `update ... where id = 76` (never a broad WHERE).
 *   4. Re-reads the row after the write and prints the after-state so the
 *      diff is visible in the same run, not assumed.
 *
 * Idempotent: re-running after a successful --apply finds titles that no
 * longer match the "OPCIONA(L)?:" prefix, reports 0/2 targets found, and
 * exits without writing (the safety in step 2 doubles as the idempotency
 * guard).
 *
 * Run (dry-run, read-only, default):
 *   pnpm --filter @fahybrid/infra tsx scripts/backfill_optional_block_flag_microciclo76.ts
 * Run (writes):
 *   pnpm --filter @fahybrid/infra tsx scripts/backfill_optional_block_flag_microciclo76.ts --apply
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import postgres from 'postgres';

// Same credentials file every FAHYBRIK script/agent uses (never .env.local —
// this worktree has none, and the task explicitly points here). Read directly
// instead of `source`-ing into the shell so the script is self-contained and
// never needs the secret echoed anywhere.
const CREDENTIALS_PATH = resolve(homedir(), '.openclaw/credentials/vanwida-tokens.env');

function loadFahybrikDatabaseUrl(): string {
  const raw = readFileSync(CREDENTIALS_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('FAHYBRIK_DATABASE_URL=')) continue;
    let val = trimmed.slice('FAHYBRIK_DATABASE_URL='.length).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  }
  throw new Error(`FAHYBRIK_DATABASE_URL not found in ${CREDENTIALS_PATH}`);
}

const WEEK_TEMPLATE_ID = 180;
const EXPECTED_COACH_ID = 60;
const SUNDAY = 7;

interface Item {
  uid?: string;
  [k: string]: unknown;
}
interface Block {
  uid?: string;
  title?: string;
  optional?: boolean;
  items?: Item[];
  [k: string]: unknown;
}
interface Session {
  kind?: string;
  blocks?: Block[];
  [k: string]: unknown;
}
interface Day {
  day_of_week?: number;
  sessions?: Session[];
  [k: string]: unknown;
}
interface Slots {
  days?: Day[];
  [k: string]: unknown;
}

// The exact 2 real titles (verbatim, including the accented "×" in the first)
// — never a regex/inference here, this is a targeted one-off fix, not the
// general importer rule (that lives in shared/domain/import/label.ts).
const TARGETS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'OPCIONA: REFUERZO HOMBRO', to: 'REFUERZO HOMBRO' },
  { from: 'OPCIONAL: FUERZA PARTE ALTA (4 × 4)', to: 'FUERZA PARTE ALTA (4 × 4)' },
];

function parseSlots(raw: unknown): Slots {
  return typeof raw === 'string' ? (JSON.parse(raw) as Slots) : (raw as Slots);
}

function sundayBlocks(slots: Slots): Block[] {
  const sunday = (slots.days ?? []).find((d) => d.day_of_week === SUNDAY);
  const blocks: Block[] = [];
  for (const session of sunday?.sessions ?? []) {
    for (const block of session.blocks ?? []) blocks.push(block);
  }
  return blocks;
}

function printBlocks(label: string, blocks: Block[]): void {
  console.log(`\n[${label}] Domingo — ${blocks.length} bloque(s):`);
  for (const b of blocks) {
    console.log(`  - uid=${b.uid} title=${JSON.stringify(b.title)} optional=${b.optional ?? '(ausente)'}`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const sql = postgres(loadFahybrikDatabaseUrl(), { ssl: 'require', prepare: false, max: 1 });

  try {
    const rows = await sql<{ id: string; coach_id: string; name: string; slots_json: unknown }[]>`
      select id::text, coach_id::text, name, slots_json
      from program_week_templates
      where id = ${WEEK_TEMPLATE_ID}
    `;
    if (rows.length === 0) {
      console.error(`STOP: program_week_templates.id=${WEEK_TEMPLATE_ID} no existe. Nada tocado.`);
      process.exitCode = 1;
      return;
    }
    const row = rows[0]!;
    console.log(`microciclo id=${row.id} coach_id=${row.coach_id} name=${JSON.stringify(row.name)}`);
    if (Number(row.coach_id) !== EXPECTED_COACH_ID) {
      console.error(
        `STOP: coach_id esperado ${EXPECTED_COACH_ID}, encontrado ${row.coach_id}. Nada tocado.`,
      );
      process.exitCode = 1;
      return;
    }

    const before = parseSlots(row.slots_json);
    const beforeBlocks = sundayBlocks(before);
    printBlocks('ANTES', beforeBlocks);

    // Locate the 2 targets by exact title match — same discipline as the
    // importer's stripOptionalBlockPrefix: verbatim, never fuzzy.
    const matches = TARGETS.map((t) => ({
      target: t,
      block: beforeBlocks.find((b) => b.title === t.from),
    }));
    const missing = matches.filter((m) => !m.block);
    if (missing.length > 0) {
      console.error(
        `\nSTOP: no se encontraron los ${missing.length} bloque(s) esperados por título exacto:`,
      );
      for (const m of missing) console.error(`  - esperado: ${JSON.stringify(m.target.from)}`);
      console.error('Nada tocado. Revisa el título real antes de reintentar.');
      process.exitCode = 1;
      return;
    }

    console.log(`\nEncontrados los 2 bloques objetivo por título exacto.`);
    if (!apply) {
      console.log('\nDRY-RUN (sin --apply): no se escribe nada. Cambios que se aplicarían:');
      for (const m of matches) {
        console.log(`  - ${JSON.stringify(m.target.from)} → ${JSON.stringify(m.target.to)}, optional:true`);
      }
      return;
    }

    // Apply the strip + flag IN PLACE on the parsed structure (mutating the
    // exact Block objects found above, which are references into `before`).
    for (const m of matches) {
      m.block!.title = m.target.to;
      m.block!.optional = true;
    }

    await sql`
      update program_week_templates
      set slots_json = ${sql.json(before as Parameters<typeof sql.json>[0])}, updated_at = now()
      where id = ${WEEK_TEMPLATE_ID}
    `;
    console.log(`\nUPDATE aplicado a program_week_templates.id=${WEEK_TEMPLATE_ID}.`);

    // Re-read from the DB (not from local memory) so the after-state is the
    // real persisted row, not an assumption.
    const after = await sql<{ slots_json: unknown }[]>`
      select slots_json from program_week_templates where id = ${WEEK_TEMPLATE_ID}
    `;
    const afterBlocks = sundayBlocks(parseSlots(after[0]!.slots_json));
    printBlocks('DESPUÉS (releído de la DB)', afterBlocks);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[backfill-optional-microciclo76] FAILED:', err);
  process.exit(1);
});
