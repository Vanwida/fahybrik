/**
 * Seed demo program library: week → month → macrocycle (Pro level).
 * Requires migration 0014 + existing workout templates (run seed:templates first).
 *
 * Run: pnpm --filter @fahybrid/infra seed:programs
 */
import { getSql } from './_db.js';

const COACH_EMAIL = 'pablo@fabrik.training';

type Session = { kind: 'rest' | 'workout'; template_id?: string | null };

type Slots = {
  days: Array<{
    day_of_week: number;
    sessions: Session[];
  }>;
};

function emptySlots(): Slots {
  return {
    days: [1, 2, 3, 4, 5, 6, 7].map((day_of_week) => ({
      day_of_week,
      sessions: [],
    })),
  };
}

function setSlot(
  slots: Slots,
  day: number,
  slot: 'am' | 'pm',
  templateId: string | null,
) {
  const d = slots.days.find((x) => x.day_of_week === day);
  if (!d) return;
  const idx = slot === 'am' ? 0 : 1;
  while (d.sessions.length <= idx) d.sessions.push({ kind: 'rest' });
  if (templateId) {
    d.sessions[idx] = { kind: 'workout', template_id: templateId };
  } else {
    d.sessions[idx] = { kind: 'rest' };
  }
  while (d.sessions.length > 0) {
    const last = d.sessions[d.sessions.length - 1]!;
    if (last.kind === 'rest' && last.template_id == null) {
      d.sessions.pop();
    } else break;
  }
}

async function main() {
  const sql = getSql();

  const coaches = await sql<{ id: string }[]>`
    select c.id::text
    from coaches c
    join users u on u.id = c.user_id
    where u.email = ${COACH_EMAIL}
    limit 1
  `;
  const coach = coaches[0];
  if (!coach) {
    process.stderr.write(
      `Coach user ${COACH_EMAIL} not found. Run: pnpm --filter @fahybrid/infra seed:templates\n`,
    );
    process.exit(1);
  }
  const coachId = Number(coach.id);

  const templates = await sql<{ id: string; name: string }[]>`
    select id::text, name from templates where coach_id = ${coachId} order by name
  `;
  if (templates.length === 0) {
    process.stderr.write('No templates found. Run: pnpm --filter @fahybrid/infra seed:templates\n');
    process.exit(1);
  }

  const byName = (substr: string) =>
    templates.find((t) => t.name.toLowerCase().includes(substr.toLowerCase()))?.id ?? null;

  const tplAcc = byName('ACC') ?? templates[0]!.id;
  const tplTrans = byName('TRANS') ?? templates[1]!.id;
  const tplReal = byName('REAL') ?? templates[2]!.id;

  async function upsertWeek(name: string, fill: (s: Slots) => void): Promise<string> {
    const existing = await sql<{ id: string }[]>`
      select id::text from program_week_templates
      where coach_id = ${coachId} and name = ${name} limit 1
    `;
    const slots = emptySlots();
    fill(slots);
    if (existing[0]) {
      await sql`
        update program_week_templates
        set slots_json = ${sql.json(slots) as never}, updated_at = now()
        where id = ${Number(existing[0].id)}
      `;
      return existing[0].id;
    }
    const ins = await sql<{ id: string }[]>`
      insert into program_week_templates (coach_id, name, level, atr_block_hint, slots_json)
      values (${coachId}, ${name}, 'pro'::program_level, null, ${sql.json(slots) as never})
      returning id::text
    `;
    return ins[0]!.id;
  }

  const week1 = await upsertWeek('DEMO Pro · ACC Semana 1', (s) => {
    setSlot(s, 1, 'am', tplAcc);
    setSlot(s, 3, 'am', tplAcc);
    setSlot(s, 5, 'am', tplAcc);
  });
  const week2 = await upsertWeek('DEMO Pro · ACC Semana 2', (s) => {
    setSlot(s, 1, 'am', tplAcc);
    setSlot(s, 2, 'am', tplAcc);
    setSlot(s, 4, 'pm', tplAcc);
  });
  const week3 = await upsertWeek('DEMO Pro · ACC Semana 3', (s) => {
    setSlot(s, 2, 'am', tplAcc);
    setSlot(s, 6, 'am', tplAcc);
  });
  const week4 = await upsertWeek('DEMO Pro · ACC Semana 4 (deload)', (s) => {
    setSlot(s, 1, 'am', tplAcc);
  });
  const week5 = await upsertWeek('DEMO Pro · TRANS Semana 1', (s) => {
    setSlot(s, 1, 'am', tplTrans);
    setSlot(s, 3, 'am', tplTrans);
  });
  const week6 = await upsertWeek('DEMO Pro · TRANS Semana 2', (s) => {
    setSlot(s, 2, 'am', tplTrans);
    setSlot(s, 4, 'am', tplTrans);
  });
  const week7 = await upsertWeek('DEMO Pro · REAL Semana 1', (s) => {
    setSlot(s, 1, 'am', tplReal);
    setSlot(s, 3, 'am', tplReal);
  });

  process.stdout.write(`  weeks: ${week1}, ${week2}, … ${week7}\n`);

  async function upsertMonth(
    name: string,
    weekIds: string[],
    blockHint: 'ACC' | 'TRANS' | 'REAL' | null,
  ): Promise<string> {
    const existing = await sql<{ id: string }[]>`
      select id::text from program_month_templates
      where coach_id = ${coachId} and name = ${name} limit 1
    `;
    let monthId: string;
    if (existing[0]) {
      monthId = existing[0].id;
      await sql`delete from program_month_weeks where month_template_id = ${Number(monthId)}`;
      await sql`
        update program_month_templates
        set atr_block_hint = ${blockHint}, updated_at = now()
        where id = ${Number(monthId)}
      `;
    } else {
      const ins = await sql<{ id: string }[]>`
        insert into program_month_templates (coach_id, name, level, atr_block_hint)
        values (${coachId}, ${name}, 'pro'::program_level, ${blockHint})
        returning id::text
      `;
      monthId = ins[0]!.id;
    }
    for (let i = 0; i < weekIds.length; i++) {
      await sql`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${Number(monthId)}, ${Number(weekIds[i])}, ${i})
        on conflict do nothing
      `;
    }
    return monthId;
  }

  const monthAcc1 = await upsertMonth(
    'DEMO Pro · ACC Mes 1',
    [week1, week2, week3, week4],
    'ACC',
  );
  const monthTrans = await upsertMonth('DEMO Pro · TRANS', [week5, week6, week5, week6], 'TRANS');
  const monthReal = await upsertMonth('DEMO Pro · REAL Taper', [week7, week7, week7, week7], 'REAL');

  process.stdout.write(`  months: ${monthAcc1}, ${monthTrans}, ${monthReal}\n`);

  const macroName = 'DEMO HYROX Pro · 12 semanas';
  const existingMacro = await sql<{ id: string }[]>`
    select id::text from program_macrocycle_templates
    where coach_id = ${coachId} and name = ${macroName} limit 1
  `;

  let macroId: string;
  if (existingMacro[0]) {
    macroId = existingMacro[0].id;
    const blocks = await sql<{ id: string }[]>`
      select id::text from program_macrocycle_blocks where macrocycle_template_id = ${Number(macroId)}
    `;
    for (const b of blocks) {
      await sql`delete from program_block_months where block_id = ${Number(b.id)}`;
    }
    await sql`delete from program_macrocycle_blocks where macrocycle_template_id = ${Number(macroId)}`;
  } else {
    const ins = await sql<{ id: string }[]>`
      insert into program_macrocycle_templates (coach_id, name, level, is_default, total_weeks)
      values (${coachId}, ${macroName}, 'pro'::program_level, true, 12)
      returning id::text
    `;
    macroId = ins[0]!.id;
  }

  const blockSpecs: Array<{ type: 'ACC' | 'TRANS' | 'REAL'; months: string[]; pos: number }> = [
    { type: 'ACC', months: [monthAcc1], pos: 0 },
    { type: 'TRANS', months: [monthTrans], pos: 1 },
    { type: 'REAL', months: [monthReal], pos: 2 },
  ];

  for (const spec of blockSpecs) {
    const blockIns = await sql<{ id: string }[]>`
      insert into program_macrocycle_blocks (macrocycle_template_id, type, position)
      values (${Number(macroId)}, ${spec.type}, ${spec.pos})
      returning id::text
    `;
    const blockId = blockIns[0]!.id;
    for (let i = 0; i < spec.months.length; i++) {
      await sql`
        insert into program_block_months (block_id, month_template_id, position)
        values (${Number(blockId)}, ${Number(spec.months[i])}, ${i})
      `;
    }
  }

  process.stdout.write(`\n✓ Program demo seeded. Open /es/programs\n`);
  process.stdout.write(`  macrocycle id=${macroId}\n`);
  await sql.end();
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(1);
});
