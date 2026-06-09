/**
 * BACKFILL — resolve null `exercise_id`/`exercise_name` items in the Transformación
 * program_week_templates (54,55,56,57) to REAL catalog exercises by matching the
 * item's `notes` (fallback: block title) against a keyword→exercise map.
 *
 * The bulk TRANS seed left these WOD/station items unlinked (exercise_id null) even
 * though notes describe a concrete movement ("12,5m sled push 260kg", "10 burpee
 * BBJ"). The week-slots Zod schema requires a non-null exercise_id + non-empty
 * exercise_name, so getWeekTemplate throws on these weeks during instantiation.
 * This links each item to the catalog exercise it describes — coherent data, no
 * placeholders. params_json (reps/sets/distance/time) is left intact.
 *
 * Idempotent: only fills items where exercise_id IS NULL. Every keyword resolves to
 * an id verified to exist in `exercises`; an unmatched note aborts (fail loud — we
 * do NOT want silent garbage in the plan).
 *
 * Run: pnpm --filter @fahybrid/infra tsx scripts/backfill_week_item_exercises.ts
 */
import { getSql } from './_db.js';

const WEEK_IDS = [54, 55, 56, 57];

// Ordered keyword → catalog exercise id. First match wins, so list the most
// specific phrases first (e.g. "burpee to plate" before "burpee", "sled pull"
// before "sled"). Ids verified against the exercises catalog.
const RULES: Array<{ kw: RegExp; id: number; name: string }> = [
  { kw: /burpee to plate/i, id: 3578, name: 'Burpee to Plate' },
  { kw: /burpee\s*bbj|burpee bbj|bbj/i, id: 4, name: 'Burpee Broad Jump' },
  { kw: /burpee/i, id: 3508, name: 'Burpee' },
  { kw: /sled push/i, id: 2, name: 'Sled Push' },
  { kw: /sled pull|sled drag|sled pull\/drag|pull\/drag|sled/i, id: 3, name: 'Sled Pull' },
  { kw: /high box jump|high box/i, id: 3574, name: 'High Box Jump' },
  { kw: /box jump/i, id: 3512, name: 'Box Jump' },
  { kw: /power clean/i, id: 3494, name: 'Power Clean' },
  { kw: /front squat/i, id: 3485, name: 'Front Squat' },
  { kw: /back squat/i, id: 3484, name: 'Back Squat' },
  { kw: /wall ball/i, id: 8, name: 'Wall Balls' },
  { kw: /walking lunge|sb walking lunge|sb lunge|reverse lunge|lunge/i, id: 3498, name: 'Walking Lunge' },
  { kw: /farmer carry|farmers carry|farmer/i, id: 6, name: 'Farmers Carry' },
  { kw: /sit-?up shoot/i, id: 3575, name: 'Sit-up Shoot' },
  { kw: /sit-?up|core/i, id: 3519, name: 'Sit-up' },
  { kw: /bench/i, id: 3490, name: 'Bench Press' },
  { kw: /shoulder press|overhead press|push press/i, id: 3488, name: 'Overhead Press' },
  { kw: /ski/i, id: 3480, name: 'SkiErg' },
  { kw: /\bab\b|assault bike|bike/i, id: 3483, name: 'Assault Bike' },
  { kw: /\brow\b|row\./i, id: 3481, name: 'Rowing' },
  { kw: /\brun\b/i, id: 3479, name: 'Run' },
  { kw: /foam/i, id: 2809, name: 'Foam roll lower body' },
  { kw: /movilidad|mobility|respiratorio|preventivo|plio/i, id: 2807, name: 'Hip mobility flow' },
];

interface Item { exercise_id?: number | string | null; exercise_name?: string | null; notes?: string; [k: string]: unknown }
interface Block { title?: string; items?: Item[]; [k: string]: unknown }
interface Session { blocks?: Block[]; [k: string]: unknown }
interface Day { sessions?: Session[]; [k: string]: unknown }
interface Slots { days?: Day[]; [k: string]: unknown }

function resolve(text: string): { id: number; name: string } | null {
  for (const r of RULES) if (r.kw.test(text)) return { id: r.id, name: r.name };
  return null;
}

async function main(): Promise<void> {
  const sql = getSql();

  // Sanity: every rule id exists in the catalog.
  const ids = [...new Set(RULES.map((r) => r.id))];
  const present = await sql<{ id: string }[]>`select id::text from exercises where id = any(${ids}::bigint[])`;
  const presentSet = new Set(present.map((r) => Number(r.id)));
  const missing = ids.filter((i) => !presentSet.has(i));
  if (missing.length) throw new Error(`rule exercise ids missing from catalog: ${missing.join(', ')}`);

  const rows = await sql<{ id: string; slots_json: unknown }[]>`
    select id::text, slots_json from program_week_templates where id = any(${WEEK_IDS}::bigint[]) order by id
  `;

  let filled = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const raw = row.slots_json;
    const slots: Slots = typeof raw === 'string' ? JSON.parse(raw) : (raw as Slots);
    let changed = false;

    for (const day of slots.days ?? []) {
      for (const session of day.sessions ?? []) {
        for (const block of session.blocks ?? []) {
          for (const item of block.items ?? []) {
            if (item.exercise_id != null) continue;
            const match = resolve(item.notes ?? '') ?? resolve(block.title ?? '');
            if (!match) {
              unmatched.push(`pwt ${row.id} | ${block.title} | ${item.notes}`);
              continue;
            }
            item.exercise_id = match.id;
            item.exercise_name = match.name;
            filled += 1;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await sql`
        update program_week_templates set slots_json = ${sql.json(slots as Parameters<typeof sql.json>[0])}, updated_at = now()
        where id = ${Number(row.id)}
      `;
    }
  }

  if (unmatched.length) {
    console.error(`[backfill-ex] ${unmatched.length} UNMATCHED items — aborting partial state:`);
    unmatched.forEach((u) => console.error('  ' + u));
    await sql.end();
    process.exit(1);
  }

  console.log(`[backfill-ex] filled ${filled} items across weeks ${WEEK_IDS.join(',')}`);
  await sql.end();
}

main().catch((err) => {
  console.error('[backfill-ex] FAILED:', err);
  process.exit(1);
});
