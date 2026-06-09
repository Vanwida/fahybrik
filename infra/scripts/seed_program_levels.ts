/**
 * Seed month templates (ACC, Mes 1) for the 4 program levels — beginner,
 * intermediate, pro, elite — with progressive density (3 / 4 / 5 / 6
 * sessions/week). Each month = 4 weeks pointing to per-level week
 * templates. Designed to back the intake `suggestFirstMonth` flow.
 *
 * Mix per week (orientativo, ACC):
 *   - beginner    : 2 Z2 endurance + 1 fuerza                  (3 ses/sem)
 *   - intermediate: 2 Z2 + 1 fuerza + 1 HYROX skill            (4 ses/sem)
 *   - pro         : 2 Z2 + 2 fuerza + 1 HYROX sim corto        (5 ses/sem)
 *   - elite       : 3 Z2/threshold + 2 fuerza + 1 HYROX sim    (6 ses/sem)
 *
 * Slot kind=workout pointing to the closest matching ACC workout template
 * already seeded (`seed_templates`). We pick by name substring; fallback to
 * any ACC template if no match. Pablo can replace the targets later.
 *
 * Idempotent: UPSERT by (coach_id, name) on weeks/months; rewrites slots/
 * relations on every run. Re-running keeps IDs stable.
 *
 * Run: pnpm --filter @fahybrid/infra seed:programs-levels
 */
import { getSql } from './_db.js';

const COACH_EMAIL = 'pablo@fabrik.training';
const LEVELS = ['beginner', 'intermediate', 'pro', 'elite'] as const;
type Level = (typeof LEVELS)[number];

type SlotKind = 'rest' | 'workout';

type Session = { kind: SlotKind; template_id?: string | null };

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

/**
 * Inserta/sustituye la sesión "AM" (idx 0) o "PM" (idx 1) del día.
 * Preserva el patrón legacy AM/PM para mapear semillas históricas — el
 * modelo nuevo soporta N sesiones pero estos seeds sólo emiten ≤2/día.
 */
function setSlot(slots: Slots, day: number, slot: 'am' | 'pm', templateId: string | null) {
  const d = slots.days.find((x) => x.day_of_week === day);
  if (!d) return;
  const idx = slot === 'am' ? 0 : 1;
  while (d.sessions.length <= idx) d.sessions.push({ kind: 'rest' });
  if (templateId) {
    d.sessions[idx] = { kind: 'workout', template_id: templateId };
  } else {
    d.sessions[idx] = { kind: 'rest' };
  }
  // Trim trailing empty rest sessions
  while (d.sessions.length > 0) {
    const last = d.sessions[d.sessions.length - 1]!;
    if (last.kind === 'rest' && (last.template_id == null)) {
      d.sessions.pop();
    } else break;
  }
}

// Returns the count of sessions per week for the given level. ACC keeps it
// conservative — REAL/TRANS phases would add more later.
const SESSIONS_PER_WEEK: Record<Level, number> = {
  beginner: 3,
  intermediate: 4,
  pro: 5,
  elite: 6,
};

// Days where sessions happen (1=Mon … 7=Sun). Avoid back-to-back high days
// when possible. We use the first N days from this list for AM sessions,
// then add PM on day 4 for elite to reach 6.
const SESSION_DAYS: Record<Level, Array<{ day: number; slot: 'am' | 'pm' }>> = {
  beginner: [
    { day: 1, slot: 'am' },
    { day: 3, slot: 'am' },
    { day: 5, slot: 'am' },
  ],
  intermediate: [
    { day: 1, slot: 'am' },
    { day: 2, slot: 'am' },
    { day: 4, slot: 'am' },
    { day: 6, slot: 'am' },
  ],
  pro: [
    { day: 1, slot: 'am' },
    { day: 2, slot: 'am' },
    { day: 3, slot: 'am' },
    { day: 5, slot: 'am' },
    { day: 6, slot: 'am' },
  ],
  elite: [
    { day: 1, slot: 'am' },
    { day: 2, slot: 'am' },
    { day: 3, slot: 'am' },
    { day: 4, slot: 'pm' },
    { day: 5, slot: 'am' },
    { day: 6, slot: 'am' },
  ],
};

// Session focus rotation per level — uses indexes into the per-level day list.
// 'Z2' → endurance template; 'STR' → strength template; 'HYROX' → simulation.
type Focus = 'Z2' | 'STR' | 'HYROX';
const SESSION_FOCUS: Record<Level, readonly Focus[]> = {
  beginner: ['Z2', 'STR', 'Z2'],
  intermediate: ['Z2', 'STR', 'Z2', 'HYROX'],
  pro: ['Z2', 'STR', 'HYROX', 'STR', 'Z2'],
  elite: ['Z2', 'STR', 'HYROX', 'STR', 'Z2', 'Z2'],
};

async function main() {
  const sql = getSql();

  const coaches = await sql<{ id: string }[]>`
    select c.id::text from coaches c join users u on u.id = c.user_id
    where u.email = ${COACH_EMAIL} limit 1
  `;
  const coach = coaches[0];
  if (!coach) {
    process.stderr.write(`Coach ${COACH_EMAIL} not found\n`);
    process.exit(1);
  }
  const coachId = Number(coach.id);

  // Workout templates already in DB — we will match by name substring.
  const templates = await sql<{ id: string; name: string }[]>`
    select id::text, name from templates where coach_id = ${coachId} order by name
  `;
  if (templates.length === 0) {
    process.stderr.write(
      'No workout templates found. Run seed:templates + seed:programs first.\n',
    );
    process.exit(1);
  }

  function pickByNameSubstr(substr: string): string {
    return (
      templates.find((t) => t.name.toLowerCase().includes(substr.toLowerCase()))?.id ??
      templates[0]!.id
    );
  }

  // Coarse mapping focus → workout template id. All in ACC for Mes 1.
  const tplZ2 = pickByNameSubstr('z2');
  const tplStr =
    templates.find((t) => /fuerza|strength|lower|squat|deadlift/i.test(t.name))?.id ??
    pickByNameSubstr('acc');
  const tplHyrox =
    templates.find((t) => /hyrox|sim|station/i.test(t.name))?.id ?? pickByNameSubstr('acc');

  function templateForFocus(f: Focus): string {
    if (f === 'Z2') return tplZ2;
    if (f === 'STR') return tplStr;
    return tplHyrox;
  }

  async function upsertWeek(
    name: string,
    level: Level,
    fill: (s: Slots) => void,
  ): Promise<string> {
    const existing = await sql<{ id: string }[]>`
      select id::text from program_week_templates
      where coach_id = ${coachId} and name = ${name} limit 1
    `;
    const slots = emptySlots();
    fill(slots);
    if (existing[0]) {
      await sql`
        update program_week_templates
        set slots_json = ${sql.json(slots) as never},
            level = ${level}::program_level,
            atr_block_hint = 'ACC',
            updated_at = now()
        where id = ${Number(existing[0].id)}
      `;
      return existing[0].id;
    }
    const ins = await sql<{ id: string }[]>`
      insert into program_week_templates (coach_id, name, level, atr_block_hint, slots_json)
      values (
        ${coachId}, ${name}, ${level}::program_level, 'ACC', ${sql.json(slots) as never}
      )
      returning id::text
    `;
    return ins[0]!.id;
  }

  async function upsertMonth(
    name: string,
    level: Level,
    weekIds: string[],
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
        set level = ${level}::program_level,
            atr_block_hint = 'ACC',
            updated_at = now()
        where id = ${Number(monthId)}
      `;
    } else {
      const ins = await sql<{ id: string }[]>`
        insert into program_month_templates (coach_id, name, level, atr_block_hint)
        values (${coachId}, ${name}, ${level}::program_level, 'ACC')
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

  const stats: Record<Level, { weeks: number; months: number }> = {
    beginner: { weeks: 0, months: 0 },
    intermediate: { weeks: 0, months: 0 },
    pro: { weeks: 0, months: 0 },
    elite: { weeks: 0, months: 0 },
  };

  for (const level of LEVELS) {
    const sessionsCount = SESSIONS_PER_WEEK[level];
    const sessionDays = SESSION_DAYS[level];
    const focus = SESSION_FOCUS[level];
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

    // 4 weeks per month — week 4 = deload (drop 1 session).
    const weekIds: string[] = [];
    for (let wk = 1; wk <= 4; wk++) {
      const isDeload = wk === 4;
      const weekSessions = isDeload ? Math.max(2, sessionsCount - 1) : sessionsCount;
      const weekName = `${levelLabel} · ACC Semana ${wk}${isDeload ? ' (deload)' : ''}`;
      const id = await upsertWeek(weekName, level, (s) => {
        for (let i = 0; i < weekSessions; i++) {
          const slot = sessionDays[i];
          const fo = focus[i % focus.length];
          if (slot && fo) setSlot(s, slot.day, slot.slot, templateForFocus(fo));
        }
      });
      weekIds.push(id);
      stats[level].weeks += 1;
    }

    const monthName = `${levelLabel} · Mes 1 (ACC)`;
    await upsertMonth(monthName, level, weekIds);
    stats[level].months += 1;
    process.stdout.write(
      `  ${level.padEnd(13)} · ${sessionsCount} ses/sem · ${weekIds.length} semanas · 1 mes\n`,
    );
  }

  const totalWeeks = Object.values(stats).reduce((s, v) => s + v.weeks, 0);
  const totalMonths = Object.values(stats).reduce((s, v) => s + v.months, 0);
  process.stdout.write(
    `\n✓ Seed niveles: ${totalMonths} meses · ${totalWeeks} semanas (4 niveles × 4 semanas)\n`,
  );
  await sql.end();
}

main().catch((e) => {
  process.stderr.write(`${e}\n`);
  process.exit(1);
});
