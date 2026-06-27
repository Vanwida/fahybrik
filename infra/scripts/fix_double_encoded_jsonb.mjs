// One-off, IDEMPOTENT, HOST-GUARDED repair for double-encoded jsonb columns.
//
// Background: some rows were written with their jsonb value stored as a JSON
// *string scalar* (the column holds `"{...}"` instead of `{...}`) — a
// double-encode bug from a write path that JSON.stringify'd an already-JSON
// value. Symptoms:
//   - readers using `coerceJson()` JSON.parse the string at runtime; if the
//     inner text is itself malformed (e.g. two concatenated objects
//     `{...}{...}`) it throws "Unexpected non-whitespace character after JSON",
//     500ing the page;
//   - readers using Postgres operators (`payload_json ->> 'kind'`) silently get
//     NULL because you cannot index into a string scalar.
//
// The correct representation is a jsonb object/array. This script scans EVERY
// jsonb column, finds string-typed values, decodes them ONCE, and rewrites the
// cell as a proper object/array. Safe because every reader already tolerates the
// object form (coerceJson passes objects through; PG operators work on objects).
//
// SAFETY:
//   - Aborts unless the connection host contains `ep-flat-wind` (the DEMO DB).
//   - Idempotent: after the fix jsonb_typeof becomes 'object'/'array', so a
//     re-run selects nothing.
//   - Per-row + per-column guarded: a value whose inner text is unrecoverable
//     (genuinely malformed JSON) is REPORTED and left untouched (manual fix),
//     never fabricated.
//   - Only touches values that decode to an object/array. A legit string scalar
//     (rare/intentional) is left alone.
//
// Run:  node infra/scripts/fix_double_encoded_jsonb.mjs
//       (reads DATABASE_URL from web/.env.local if not already in env)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from '../../web/node_modules/postgres/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = resolve(__dirname, '../../web/.env.local');
  const txt = readFileSync(envPath, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error('DATABASE_URL not found in env or web/.env.local');
}

const DBURL = loadDbUrl();

// HARD HOST GUARD — only the demo branch.
if (!/ep-flat-wind/.test(DBURL)) {
  console.error('ABORT: DATABASE_URL host is not ep-flat-wind (demo DB). Refusing to run.');
  process.exit(1);
}

const sql = postgres(DBURL, { ssl: 'require' });

const cols = await sql`
  select table_name, column_name
  from information_schema.columns
  where data_type in ('jsonb', 'json') and table_schema = 'public'
  order by table_name, column_name
`;

let fixed = 0;
let unrecoverable = 0;
let scanned = 0;

for (const { table_name, column_name } of cols) {
  // Pull the unwrapped inner text (#>> '{}' yields the string scalar's content)
  // for every string-typed value, addressed by ctid (works for tables without a
  // clean primary key, e.g. junctions).
  const rows = await sql.unsafe(
    `select ctid::text as ctid, (${column_name} #>> '{}') as inner_text
     from ${table_name}
     where jsonb_typeof(${column_name}::jsonb) = 'string'`,
  );
  for (const r of rows) {
    scanned++;
    let decoded;
    try {
      decoded = JSON.parse(r.inner_text);
    } catch (e) {
      unrecoverable++;
      console.error(
        `UNRECOVERABLE ${table_name}.${column_name} ctid=${r.ctid}: ${e.message}` +
          ` (len=${r.inner_text?.length}). Left untouched — needs manual repair.`,
      );
      continue;
    }
    if (decoded === null || typeof decoded !== 'object') {
      // A legitimate JSON string/number/bool scalar — not a double-encode. Skip.
      continue;
    }
    // Re-encode IN SQL: derive the new value from the column itself via
    // `#>> '{}'` (the unwrapped inner text) cast back to jsonb. No param
    // round-trip (that silently no-op'd), and the ctid literal comes from the DB
    // so it is safe to embed. The jsonb_typeof guard keeps it idempotent.
    const res = await sql.unsafe(
      `update ${table_name}
         set ${column_name} = (${column_name} #>> '{}')::jsonb
       where ctid = '${r.ctid}'::tid
         and jsonb_typeof(${column_name}::jsonb) = 'string'`,
    );
    if (res.count !== 1) {
      console.error(`WARN ${table_name}.${column_name} ctid=${r.ctid}: rows affected=${res.count} (expected 1)`);
      continue;
    }
    fixed++;
    console.log(`fixed ${table_name}.${column_name} ctid=${r.ctid} (-> ${Array.isArray(decoded) ? 'array' : 'object'})`);
  }
}

console.log(`\nDONE. scanned=${scanned} fixed=${fixed} unrecoverable=${unrecoverable}`);
await sql.end();
