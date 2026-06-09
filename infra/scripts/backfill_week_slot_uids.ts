/**
 * BACKFILL — inject stable `uid` into every block + item of program_week_templates
 * slots_json. The current week-slots Zod schema (shared/schema/program-templates)
 * requires `uid` (non-empty string) on each block (weekDayPartSchema) and item
 * (weekDayPartItemSchema). The bulk seeds predate this requirement, so getWeekTemplate
 * (which parses slots_json through the schema) throws on every legacy week. This
 * backfill makes the stored data valid.
 *
 * Idempotent: uids are deterministic by position (d{day_of_week}-s{sessionIdx}-b{blockIdx}
 * for blocks, …-i{itemIdx} for items) and only written when missing. Re-running is a
 * no-op for already-backfilled rows.
 *
 * Run: pnpm --filter @fahybrid/infra tsx scripts/backfill_week_slot_uids.ts
 */
import { getSql } from './_db.js';

interface Item { uid?: string; exercise_id?: number | string; exercise_name?: string; [k: string]: unknown }
interface Block { uid?: string; items?: Item[]; [k: string]: unknown }
interface Session { kind?: string; blocks?: Block[]; [k: string]: unknown }
interface Day { day_of_week?: number; sessions?: Session[]; [k: string]: unknown }
interface Slots { days?: Day[]; [k: string]: unknown }

function backfill(slots: Slots, names: Map<number, string>): { slots: Slots; changed: boolean } {
  let changed = false;
  const days = slots.days ?? [];
  for (const day of days) {
    const dow = day.day_of_week ?? 0;
    const sessions = day.sessions ?? [];
    sessions.forEach((session, si) => {
      const blocks = session.blocks ?? [];
      blocks.forEach((block, bi) => {
        if (!block.uid) {
          block.uid = `d${dow}-s${si}-b${bi}`;
          changed = true;
        }
        const items = block.items ?? [];
        items.forEach((item, ii) => {
          if (!item.uid) {
            item.uid = `d${dow}-s${si}-b${bi}-i${ii}`;
            changed = true;
          }
          // exercise_name is required by the schema; the bulk seeds left some items
          // without it. Backfill from the real catalog by exercise_id.
          if (!item.exercise_name && item.exercise_id != null) {
            const name = names.get(Number(item.exercise_id));
            if (name) {
              item.exercise_name = name;
              changed = true;
            }
          }
        });
      });
    });
  }
  return { slots, changed };
}

async function main(): Promise<void> {
  const sql = getSql();

  // Catalog of exercise names for exercise_name backfill.
  const exRows = await sql<{ id: string; name: string }[]>`
    select id::text, name from exercises
  `;
  const names = new Map<number, string>(exRows.map((r) => [Number(r.id), r.name]));

  const rows = await sql<{ id: string; slots_json: unknown }[]>`
    select id::text, slots_json from program_week_templates order by id
  `;

  let updated = 0;
  for (const row of rows) {
    let parsed: Slots;
    const raw = row.slots_json;
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw) as Slots;
    } else {
      parsed = raw as Slots;
    }
    const { slots, changed } = backfill(parsed, names);
    if (!changed) continue;
    await sql`
      update program_week_templates
      set slots_json = ${sql.json(slots as Parameters<typeof sql.json>[0])}, updated_at = now()
      where id = ${Number(row.id)}
    `;
    updated += 1;
  }

  console.log(`[backfill-uids] updated ${updated}/${rows.length} week templates`);
  await sql.end();
}

main().catch((err) => {
  console.error('[backfill-uids] FAILED:', err);
  process.exit(1);
});
