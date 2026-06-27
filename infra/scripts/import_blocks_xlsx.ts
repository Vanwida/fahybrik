/**
 * Import Pablo's training blocks (Biblioteca de Bloques) from the source
 * spreadsheet into the `blocks` table (migration 0037).
 *
 * Source: Grupos_Entrenamiento_HYROX.xlsx (repo root), sheet "Grupos de
 * Entrenamiento". Layout:
 *   - a title row, a header row (# | Sesión | Descripción | Grupo)
 *   - per group: a "  GRUPO N  —  <emoji> NOMBRE" header row, a
 *     "📌 ENFOQUE: …" focus row, then N data rows (block per row).
 *
 * MODEL A: we store Pablo's `Descripción del Entrenamiento` text VERBATIM as
 * `description` (source of truth). `title` is a short derived label, `format`
 * is a coarse hint inferred from the group, `source_ref` is the "S1 – Martes"
 * session hint.
 *
 * Group mapping: the spreadsheet's "GRUPO N" number maps 1:1 to
 * methodology_groups.id (verified — same order and names). We parse N from the
 * group header row, not the emoji string, so it is robust to copy drift.
 *
 * PER-COACH (no orphans): the block library is per-coach content (blocks.coach_id).
 * This importer REQUIRES an explicit target coach (--coach <id> / IMPORT_COACH_ID)
 * and writes every block with coach_id = that coach. It NEVER defaults to NULL (a
 * global orphan) or to any coach silently.
 *
 * Idempotent: each block's stored slug is namespaced per coach
 * (`<baseSlug>--c<coachId>`, the same convention as clone_block_library.ts). The
 * base slug is deterministic (group id + # + title), so a re-import upserts in
 * place — no dupes — and two coaches can each own their own copy without colliding
 * on the global blocks.slug unique index.
 *
 * Host-guarded: refuses to write unless --confirm-host (/ IMPORT_CONFIRM_HOST) is
 * a substring of the live DATABASE_URL host, so you cannot bulk-insert into the
 * wrong DB by accident.
 *
 * Run: pnpm --filter @fahybrid/infra import:blocks -- \
 *        --coach=<coachId> --confirm-host=<dbHostSubstring>
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getSql } from './_db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const XLSX_PATH = resolve(REPO_ROOT, 'Grupos_Entrenamiento_HYROX.xlsx');
const SHEET = 'Grupos de Entrenamiento';

// Per-group coarse hint. Index = methodology_group_id (1..10). Single source of
// the format inference rule so it stays consistent per group. (The legacy
// atr_block_hint axis was dropped — periodization is coach-agnostic, migration
// 0064 — so blocks carry no hardcoded phase tag.)
const GROUP_HINTS: Record<number, { format: string }> = {
  1: { format: 'strength_block' }, // Fuerza Base
  2: { format: 'plyometric' }, // Fuerza Explosiva / Pliométrica
  3: { format: 'erg_intervals' }, // Series Ergómetros
  4: { format: 'run_intervals' }, // Series Running
  5: { format: 'zone2' }, // Zona 2 / Recuperación
  6: { format: 'metcon' }, // WODs / Metcons
  7: { format: 'race_sim' }, // Simulaciones de Carrera
  8: { format: 'core_mobility' }, // Core / Movilidad / Preventivos
  9: { format: 'functional_circuit' }, // Circuitos Funcionales
  10: { format: 'tapering' }, // Tapering / Activación
};

type Row = (string | number | null)[];

/**
 * Read the sheet rows via a tiny python/openpyxl bridge (openpyxl is available
 * in this env; there is no JS xlsx dep in infra and we won't add one just for a
 * one-shot import). Emits one JSON array of rows on stdout.
 */
function readSheetRows(): Row[] {
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook(${JSON.stringify(XLSX_PATH)}, data_only=True)
ws = wb[${JSON.stringify(SHEET)}]
out = []
for r in ws.iter_rows(values_only=True):
    out.append([c if (isinstance(c, (int, float)) or c is None) else str(c) for c in r])
print(json.dumps(out))
`;
  const stdout = execFileSync('python3', ['-c', py], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Row[];
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

/**
 * Derive a short, human-readable title from the verbatim description. We keep
 * the first clause (up to the first " + " join or sentence break) and tidy the
 * rep notation (10/10/8/8/6 → 10-10-8-8-6) for legibility. Display only — the
 * full prescription always lives verbatim in `description`.
 */
export function deriveTitle(desc: string): string {
  let t = desc.trim();
  // Cut at the first compound join so the title stays one movement/idea.
  const cut = t.search(/\s\+\s/);
  if (cut > 0 && cut < 70) t = t.slice(0, cut);
  // Tidy rep schemes "10/10/8/8/6" -> "10-10-8-8-6".
  t = t.replace(/(\d+)(\/\d+)+/g, (m) => m.replace(/\//g, '-'));
  if (t.length > 80) t = t.slice(0, 77).trimEnd() + '…';
  return t;
}

const GROUP_HEADER_RE = /^\s*GRUPO\s+(\d+)\s*[—-]/i;
const FOCUS_RE = /^\s*📌/;

export { GROUP_HINTS };

export type ParsedBlock = {
  slug: string;
  title: string;
  description: string;
  methodology_group_id: number;
  format: string;
  source_ref: string | null;
};

export function parseBlocks(rows: Row[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentGroup: number | null = null;

  for (const row of rows) {
    const colA = row[0];
    const colB = row[1];
    const colC = row[2];

    // Group header lives in col A (other cols null).
    if (typeof colA === 'string') {
      const m = colA.match(GROUP_HEADER_RE);
      if (m?.[1]) {
        currentGroup = Number.parseInt(m[1], 10);
        continue;
      }
      if (FOCUS_RE.test(colA)) continue; // ENFOQUE row — skip
    }

    // A data row has a numeric # in col A and a non-empty description in col C.
    if (typeof colA === 'number' && typeof colC === 'string' && colC.trim()) {
      if (currentGroup === null) {
        throw new Error(`Block row "${colC}" appears before any GRUPO header`);
      }
      const hints = GROUP_HINTS[currentGroup];
      if (!hints) throw new Error(`No hints for group ${currentGroup}`);
      const description = colC.trim();
      const sourceRef = typeof colB === 'string' && colB.trim() ? colB.trim() : null;
      const num = colA; // the spreadsheet's stable "#" — used for a stable slug
      const slug = `g${currentGroup}-${num}-${slugify(deriveTitle(description))}`;
      blocks.push({
        slug,
        title: deriveTitle(description),
        description,
        methodology_group_id: currentGroup,
        format: hints.format,
        source_ref: sourceRef,
      });
    }
  }
  return blocks;
}

/** Per-coach slug suffix → the idempotency key. Matches clone_block_library.ts. */
const COACH_SLUG_SUFFIX = '--c';

/** Read a CLI flag in either `--name value` or `--name=value` form. */
function argValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.match(new RegExp(`^--${name}=(.*)$`));
    if (eq) return eq[1];
    if (a === `--${name}`) return argv[i + 1];
  }
  return undefined;
}

/**
 * The target coach is MANDATORY — this importer writes into ONE coach's private
 * library. No silent default (NULL = a global orphan, or guessing a coach) is
 * allowed: missing/invalid → honest exit.
 */
function resolveTargetCoach(): number {
  const raw = (argValue('coach') ?? process.env.IMPORT_COACH_ID ?? '').trim();
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      'Missing target coach. Pass --coach <coachId> (or IMPORT_COACH_ID=<coachId>). ' +
        "This importer must write blocks into ONE coach's library; it will NOT " +
        'default to coach_id NULL (a global orphan) or pick a coach silently.',
    );
  }
  return id;
}

/**
 * Host guard: refuse to write unless the operator names the DB they mean and it
 * matches the live DATABASE_URL host. Prevents an accidental bulk insert into the
 * wrong branch. No silent default — the host substring must be given explicitly.
 */
function guardHost(): void {
  const want = (argValue('confirm-host') ?? process.env.IMPORT_CONFIRM_HOST ?? '').trim();
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (!want) {
    throw new Error(
      'Refusing to write: name the DB host you intend to import into via ' +
        `--confirm-host=<substring> (or IMPORT_CONFIRM_HOST). Live host is ` +
        `"${host || '(unknown)'}".`,
    );
  }
  if (!host.includes(want)) {
    throw new Error(
      `Refusing to write: live DATABASE_URL host "${host || '(unknown)'}" does not ` +
        `contain --confirm-host="${want}". Point DATABASE_URL at the right branch ` +
        'or fix the confirmation.',
    );
  }
}

async function main(): Promise<void> {
  const targetCoach = resolveTargetCoach();
  guardHost();

  const raw = readFileSync(XLSX_PATH); // existence check / loud failure
  if (raw.length === 0) throw new Error(`empty xlsx at ${XLSX_PATH}`);

  const rows = readSheetRows();
  const blocks = parseBlocks(rows);

  // Slugs must be unique within the import (defensive — would also trip the DB
  // unique constraint, but fail loud here with a clear message).
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.slug)) throw new Error(`duplicate slug derived: ${b.slug}`);
    seen.add(b.slug);
  }

  const sql = getSql();
  try {
    // Verify the 10 groups exist before inserting (FK + sanity).
    const groups = await sql<{ id: number }[]>`select id from methodology_groups`;
    const groupIds = new Set(groups.map((g) => Number(g.id)));
    for (const b of blocks) {
      if (!groupIds.has(b.methodology_group_id)) {
        throw new Error(
          `methodology_group_id ${b.methodology_group_id} not found in DB (block "${b.title}")`,
        );
      }
    }

    // Verify the target coach exists (clean error instead of an FK violation).
    const coachRows = await sql<{ id: number }[]>`
      select id from coaches where id = ${targetCoach} limit 1
    `;
    if (coachRows.length === 0) {
      throw new Error(`target coach_id ${targetCoach} not found in coaches`);
    }

    for (const b of blocks) {
      // Per-coach namespaced slug = the idempotency key. Deterministic, so a
      // re-import upserts in place; coach-scoped, so two coaches never collide on
      // the global blocks.slug unique index (same convention as the clone script).
      const slug = `${b.slug}${COACH_SLUG_SUFFIX}${targetCoach}`;
      // default_modifiers is a uniform placeholder set the IA/coach fill on use.
      await sql`
        insert into blocks
          (slug, title, description, methodology_group_id, format,
           source_ref, default_modifiers, coach_id)
        values
          (${slug}, ${b.title}, ${b.description}, ${b.methodology_group_id},
           ${b.format}, ${b.source_ref},
           ${sql.json({ intensity_pct: null, level: null, duration_min: null, rounds: null })},
           ${targetCoach})
        on conflict (slug) do update set
          title                = excluded.title,
          description          = excluded.description,
          methodology_group_id = excluded.methodology_group_id,
          format               = excluded.format,
          source_ref           = excluded.source_ref
      `;
    }

    // Report counts per group.
    const counts = await sql<{ methodology_group_id: number; n: number }[]>`
      select methodology_group_id, count(*)::int as n
      from blocks
      where coach_id = ${targetCoach}
      group by methodology_group_id
      order by methodology_group_id
    `;
    const names = await sql<{ id: number; name_es: string }[]>`
      select id, name_es from methodology_groups order by id
    `;
    const nameById = new Map(names.map((g) => [Number(g.id), g.name_es]));

    console.log(
      `[import:blocks] upserted ${blocks.length} blocks for coach ${targetCoach} from ${XLSX_PATH}`,
    );
    let total = 0;
    for (const c of counts) {
      total += Number(c.n);
      console.log(`  · grupo ${c.methodology_group_id} (${nameById.get(Number(c.methodology_group_id))}): ${c.n}`);
    }
    console.log(`[import:blocks] total blocks for coach ${targetCoach}: ${total}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only run when invoked directly (tsx scripts/import_blocks_xlsx.ts), not when
// imported by a test that exercises the pure parsing functions.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
