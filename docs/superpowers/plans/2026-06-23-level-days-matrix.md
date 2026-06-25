# Level × Days Matrix System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-dimensional level × days system that auto-suggests an athlete level from onboarding benchmarks, lets Pablo tag blocks with (level, days), shows him a visual matrix of library coverage, and sends a proposal card to /hoy when a new athlete joins.

**Architecture:** Three layers. (1) DB foundation: `athlete_levels` table (per-coach, editable), `min_level_id` / `max_level_id` / `days_per_week` on `blocks`, and `level_id` / `suggested_level_id` / confidence on `athletes`. (2) Server-side algorithm: reads `athlete_benchmarks` + `athletes` → produces a level suggestion (sort_order 1-5) → maps to coach's actual level row. (3) V2 dashboard: biblioteca switches from flat block list to a level×days matrix, block editor gains level+days pickers, /hoy gains a "nivel sugerido" proposal card, and the roster shows the real level.

**Tech Stack:** PostgreSQL (Neon), Next.js 15 App Router, TypeScript, Zod, shadcn/ui, Tailwind CSS v3.

## Global Constraints

- Next migration number: `0057` — file in `infra/migrations/`
- All web code lives under `web/` (Next.js root at `web/`)
- **Methodology-agnostic**: no hardcoded ATR (ACC/TRANS/REAL) in any new file
- `blocks.id` is `bigserial` — all FK references use `bigint`, NOT uuid
- `athletes.training_days_per_week` already exists (int, derived from availability_json count of 'program' days)
- Benchmark exercise slugs in `athlete_benchmarks`: `hyrox_open`, `hyrox_pro`, `run_5k`, `row_2k`, `back_squat`
- Snake_case for all DB columns and API response fields
- Levels are per-coach (`coach_id` FK on `athlete_levels`)
- Default seed: N1-N5 created for all existing coaches on migration run
- Level thresholds are **sex-aware** (read `athletes.sex`)
- Out of scope for this plan: test batteries per level, automatic re-leveling, price tiers

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `infra/migrations/0057_athlete_levels.sql` | DB schema + seed N1-N5 |
| `web/lib/coach/level-algorithm.ts` | Pure function: benchmarks → level suggestion |
| `web/app/api/coach/levels/route.ts` | GET + POST coach levels |
| `web/app/api/coach/levels/[id]/route.ts` | PATCH + DELETE a level |
| `web/app/api/coach/athletes/[id]/level/route.ts` | GET + PATCH athlete level |
| `web/components/v2/biblioteca/LevelMatrix.tsx` | Matrix grid (level rows × days cols) |
| `web/components/v2/biblioteca/MatrixCell.tsx` | Single cell: filled block or "+" to create |

### Modified files
| File | What changes |
|---|---|
| `web/lib/dashboard/v2/biblioteca-data.ts` | Add `listBlocksMatrix()` — blocks grouped by level × days |
| `web/components/v2/editor/BlockEditor.tsx` | Add level range picker + days stepper |
| `web/components/v2/biblioteca/BibliotecaView.tsx` | Replace BloqueCard flat grid with LevelMatrix |
| `web/lib/dashboard/v2/hoy-lanes.ts` | Add `nivel_sugerido` decision type |
| `web/components/v2/hoy/LaneCard.tsx` | Render `nivel_sugerido` card variant |
| `web/lib/dashboard/v2/level.ts` | Replace heuristic with real DB lookup |
| `web/lib/dashboard/v2/atletas-row.ts` | Join `athlete_levels` for level name |

---

## Task 1: Migration 0057 — Level system foundation

**Files:**
- Create: `infra/migrations/0057_athlete_levels.sql`

**Interfaces:**
- Produces: `athlete_levels(id, coach_id, name, label, description, sort_order)` table; `blocks.min_level_id`, `blocks.max_level_id`, `blocks.days_per_week`; `athletes.level_id`, `athletes.suggested_level_id`, `athletes.level_source`, `athletes.level_confidence`

- [ ] **Step 1: Write the migration**

```sql
-- 0057: athlete_levels — per-coach level catalog + block level tagging + athlete level assignment
-- =============================================================================

-- Level catalog (one row per level per coach, e.g. N1-N5 for Pablo)
create table athlete_levels (
  id          bigserial primary key,
  coach_id    bigint not null references coaches(id) on delete cascade,
  name        text not null,       -- display code, e.g. 'N1'
  label       text not null,       -- human name, e.g. 'Iniciación'
  description text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint athlete_levels_coach_name_uq unique (coach_id, name)
);

create index athlete_levels_coach_idx on athlete_levels (coach_id, sort_order);

comment on table athlete_levels is
  'Coach-owned level catalog. One set per coach (e.g. N1-N5 for Pablo). Methodology-agnostic.';
comment on column athlete_levels.sort_order is
  '1-based ascending difficulty. sort_order=1 = entry level.';

-- Level + days tags on blocks
alter table blocks
  add column if not exists min_level_id  bigint references athlete_levels(id) on delete set null,
  add column if not exists max_level_id  bigint references athlete_levels(id) on delete set null,
  add column if not exists days_per_week smallint,
  add constraint blocks_days_per_week_chk
    check (days_per_week is null or days_per_week between 1 and 7);

comment on column blocks.min_level_id  is 'Lowest level this block targets (inclusive).';
comment on column blocks.max_level_id  is 'Highest level this block targets (inclusive). NULL = same as min.';
comment on column blocks.days_per_week is 'Training days/week this block is designed for (3-7). NULL = any.';

-- Level assignment on athletes
alter table athletes
  add column if not exists level_id           bigint references athlete_levels(id) on delete set null,
  add column if not exists suggested_level_id bigint references athlete_levels(id) on delete set null,
  add column if not exists level_source       text,
  add column if not exists level_confidence   text,
  add constraint athletes_level_source_chk
    check (level_source in ('algorithm', 'coach', 'self_reported')),
  add constraint athletes_level_confidence_chk
    check (level_confidence in ('low', 'medium', 'high'));

comment on column athletes.level_id           is 'Coach-confirmed level (FK → athlete_levels).';
comment on column athletes.suggested_level_id is 'Algorithm-suggested level pending coach review.';
comment on column athletes.level_source       is 'Who set level_id: algorithm | coach | self_reported.';
comment on column athletes.level_confidence   is 'Algorithm confidence when level_source=algorithm.';

-- Seed default N1-N5 for all existing coaches
insert into athlete_levels (coach_id, name, label, description, sort_order)
select
  c.id,
  lvl.name,
  lvl.label,
  lvl.description,
  lvl.sort_order
from coaches c
cross join (values
  ('N1', 'Iniciación',  'Primera experiencia con entrenamiento estructurado. Sin carreras o >90min.', 1),
  ('N2', 'Desarrollo',  'Base aeróbica, 0-1 carreras completadas. 75-90min.', 2),
  ('N3', 'Rendimiento', '1-3 carreras, entiende zonas de intensidad. 65-75min.', 3),
  ('N4', 'Competición', 'Open competitivo, múltiples carreras. 55-65min.', 4),
  ('N5', 'Elite',       'Pro o sub-elite, targets de pódium. <55min (H) / <65min (M).', 5)
) as lvl(name, label, description, sort_order)
on conflict (coach_id, name) do nothing;
```

- [ ] **Step 2: Apply migration to Neon dev branch**

```bash
cd /Users/alexsolecarretero/Public/projects/FAHYBRIK
psql "$DATABASE_URL" -f infra/migrations/0057_athlete_levels.sql
```

Expected: no errors. Verify:
```bash
psql "$DATABASE_URL" -c "\d athlete_levels"
psql "$DATABASE_URL" -c "select count(*) from athlete_levels;"
```
Expected: table exists, count = 5 × number of coaches.

- [ ] **Step 3: Commit**

```bash
git add infra/migrations/0057_athlete_levels.sql
git commit -m "feat(db): add athlete_levels table + block level/days tagging + athlete level fields"
```

---

## Task 2: Level algorithm

**Files:**
- Create: `web/lib/coach/level-algorithm.ts`

**Interfaces:**
- Consumes: `BenchmarkRow { exercise_slug: string; value: number; unit: string }`, `AthleteProfile { sex: 'male' | 'female' | 'other'; weight_kg: number | null; training_experience_years: number | null }`
- Produces: `suggestLevel(profile, benchmarks): LevelSuggestion` where `LevelSuggestion = { sort_order: number; confidence: 'low' | 'medium' | 'high'; signals: string[] }`

- [ ] **Step 1: Create the algorithm file**

```typescript
// web/lib/coach/level-algorithm.ts
// Pure function — no DB calls. Called from API routes after fetching benchmarks.

export interface BenchmarkRow {
  exercise_slug: string
  value: number
  unit: string
}

export interface AthleteProfile {
  sex: 'male' | 'female' | 'other'
  weight_kg: number | null
  training_experience_years: number | null
}

export interface LevelSuggestion {
  sort_order: number              // 1-5, maps to athlete_levels.sort_order
  confidence: 'low' | 'medium' | 'high'
  signals: string[]               // which signals contributed
}

// Time thresholds (seconds): boundaries [N1↔N2, N2↔N3, N3↔N4, N4↔N5]
// Lower time = better performance
const TIME_THRESHOLDS = {
  hyrox_open: { male: [5400, 4500, 3900, 3300], female: [6000, 5100, 4500, 3900] },
  run_5k:     { male: [1680, 1440, 1260, 1080], female: [1920, 1620, 1440, 1260] },
  row_2k:     { male: [480,  440,  410,  380],  female: [560,  510,  470,  440]  },
} as const

function timeToLevel(seconds: number, boundaries: readonly number[]): number {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (seconds <= boundaries[i]) return i + 2
  }
  return 1
}

function squatToLevel(squatKg: number, weightKg: number): number {
  const ratio = squatKg / weightKg
  if (ratio >= 1.8) return 5
  if (ratio >= 1.5) return 4
  if (ratio >= 1.2) return 3
  if (ratio >= 0.9) return 2
  return 1
}

function experienceToLevel(years: number): number {
  if (years >= 5) return 4
  if (years >= 3) return 3
  if (years >= 1) return 2
  return 1
}

export function suggestLevel(
  profile: AthleteProfile,
  benchmarks: BenchmarkRow[]
): LevelSuggestion {
  const sex = profile.sex === 'female' ? 'female' : 'male'
  const bySlug = Object.fromEntries(benchmarks.map(b => [b.exercise_slug, b]))

  const scores: number[] = []
  const signals: string[] = []

  // 1. HYROX time — strongest signal
  const hyrox = bySlug['hyrox_open'] ?? bySlug['hyrox_pro']
  if (hyrox) {
    scores.push(timeToLevel(hyrox.value, TIME_THRESHOLDS.hyrox_open[sex]))
    signals.push('hyrox_time')
  }

  // 2. 5K run time
  const run5k = bySlug['run_5k']
  if (run5k) {
    scores.push(timeToLevel(run5k.value, TIME_THRESHOLDS.run_5k[sex]))
    signals.push('run_5k')
  }

  // 3. 2K row
  const row2k = bySlug['row_2k']
  if (row2k) {
    scores.push(timeToLevel(row2k.value, TIME_THRESHOLDS.row_2k[sex]))
    signals.push('row_2k')
  }

  // 4. Back squat relative to body weight
  const squat = bySlug['back_squat']
  if (squat && profile.weight_kg) {
    scores.push(squatToLevel(squat.value, profile.weight_kg))
    signals.push('back_squat_bw')
  }

  // 5. Fallback: training experience years
  if (scores.length === 0 && profile.training_experience_years != null) {
    scores.push(experienceToLevel(profile.training_experience_years))
    signals.push('experience_years')
  }

  if (scores.length === 0) {
    return { sort_order: 1, confidence: 'low', signals: [] }
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const sort_order = Math.min(5, Math.max(1, Math.round(avg)))
  const confidence: LevelSuggestion['confidence'] =
    scores.length >= 3 ? 'high' : scores.length >= 2 ? 'medium' : 'low'

  return { sort_order, confidence, signals }
}
```

- [ ] **Step 2: Write unit tests**

Create `web/lib/coach/__tests__/level-algorithm.test.ts`:

```typescript
import { suggestLevel } from '../level-algorithm'

describe('suggestLevel', () => {
  it('returns N1 for no data', () => {
    const result = suggestLevel({ sex: 'male', weight_kg: null, training_experience_years: null }, [])
    expect(result.sort_order).toBe(1)
    expect(result.confidence).toBe('low')
  })

  it('N2 for slow HYROX male (88min)', () => {
    const result = suggestLevel({ sex: 'male', weight_kg: 80, training_experience_years: 1 }, [
      { exercise_slug: 'hyrox_open', value: 88 * 60, unit: 'seconds' },
    ])
    expect(result.sort_order).toBe(2)
    expect(result.signals).toContain('hyrox_time')
  })

  it('N4 for fast HYROX female (71min)', () => {
    const result = suggestLevel({ sex: 'female', weight_kg: 60, training_experience_years: 3 }, [
      { exercise_slug: 'hyrox_open', value: 71 * 60, unit: 'seconds' },
    ])
    expect(result.sort_order).toBe(4)
  })

  it('high confidence when 3 signals agree', () => {
    const result = suggestLevel({ sex: 'male', weight_kg: 80, training_experience_years: 2 }, [
      { exercise_slug: 'hyrox_open', value: 70 * 60, unit: 'seconds' },
      { exercise_slug: 'run_5k',     value: 22 * 60, unit: 'seconds' },
      { exercise_slug: 'back_squat', value: 100,     unit: 'kg' },
    ])
    expect(result.confidence).toBe('high')
  })

  it('falls back to experience_years when no benchmarks', () => {
    const result = suggestLevel({ sex: 'male', weight_kg: null, training_experience_years: 4 }, [])
    expect(result.sort_order).toBe(3)
    expect(result.signals).toContain('experience_years')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/alexsolecarretero/Public/projects/FAHYBRIK/web
npx jest lib/coach/__tests__/level-algorithm.test.ts
```

Expected: 5 passing.

- [ ] **Step 4: Commit**

```bash
git add web/lib/coach/level-algorithm.ts web/lib/coach/__tests__/level-algorithm.test.ts
git commit -m "feat(coach): level suggestion algorithm from onboarding benchmarks"
```

---

## Task 3: API — levels CRUD + athlete level endpoints

**Files:**
- Create: `web/app/api/coach/levels/route.ts`
- Create: `web/app/api/coach/levels/[id]/route.ts`
- Create: `web/app/api/coach/athletes/[id]/level/route.ts`

**Interfaces:**
- `GET /api/coach/levels` → `{ levels: { id: number; name: string; label: string; description: string | null; sort_order: number }[] }`
- `POST /api/coach/levels` → body `{ name, label, description?, sort_order }` → 201 with created level
- `PATCH /api/coach/levels/[id]` → body `{ name?, label?, description?, sort_order? }` → 200
- `DELETE /api/coach/levels/[id]` → 204 or 409 if athletes have this level
- `GET /api/coach/athletes/[id]/level` → `{ level_id, level_name, suggested_level_id, suggested_level_name, level_source, level_confidence, signals }`
- `PATCH /api/coach/athletes/[id]/level` → body `{ level_id: number }` → sets level_id + level_source='coach'

- [ ] **Step 1: Create `web/app/api/coach/levels/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getCoachSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { z } from 'zod'

export async function GET() {
  const { coachId } = await getCoachSession()
  const levels = await db.query(
    `select id, name, label, description, sort_order
     from athlete_levels
     where coach_id = $1
     order by sort_order asc`,
    [coachId]
  )
  return NextResponse.json({ levels: levels.rows })
}

const createSchema = z.object({
  name:        z.string().min(1).max(10),
  label:       z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  sort_order:  z.number().int().min(1).max(99),
})

export async function POST(req: Request) {
  const { coachId } = await getCoachSession()
  const body = createSchema.parse(await req.json())
  const result = await db.query(
    `insert into athlete_levels (coach_id, name, label, description, sort_order)
     values ($1, $2, $3, $4, $5)
     returning id, name, label, description, sort_order`,
    [coachId, body.name, body.label, body.description ?? null, body.sort_order]
  )
  return NextResponse.json(result.rows[0], { status: 201 })
}
```

- [ ] **Step 2: Create `web/app/api/coach/levels/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getCoachSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  name:        z.string().min(1).max(10).optional(),
  label:       z.string().min(1).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
  sort_order:  z.number().int().min(1).max(99).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { coachId } = await getCoachSession()
  const levelId = Number(params.id)
  const body = patchSchema.parse(await req.json())

  const sets: string[] = []
  const vals: unknown[] = [coachId, levelId]
  let i = 3
  if (body.name        !== undefined) { sets.push(`name = $${i++}`);        vals.push(body.name) }
  if (body.label       !== undefined) { sets.push(`label = $${i++}`);       vals.push(body.label) }
  if (body.description !== undefined) { sets.push(`description = $${i++}`); vals.push(body.description) }
  if (body.sort_order  !== undefined) { sets.push(`sort_order = $${i++}`);  vals.push(body.sort_order) }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const result = await db.query(
    `update athlete_levels set ${sets.join(', ')}
     where coach_id = $1 and id = $2
     returning id, name, label, description, sort_order`,
    vals
  )
  if (result.rowCount === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { coachId } = await getCoachSession()
  const levelId = Number(params.id)

  // Block deletion if any athlete has this level
  const inUse = await db.query(
    `select 1 from athletes where (level_id = $1 or suggested_level_id = $1) limit 1`,
    [levelId]
  )
  if ((inUse.rowCount ?? 0) > 0) {
    return NextResponse.json({ error: 'level_in_use' }, { status: 409 })
  }

  await db.query(
    `delete from athlete_levels where coach_id = $1 and id = $2`,
    [coachId, levelId]
  )
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `web/app/api/coach/athletes/[id]/level/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getCoachSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { suggestLevel } from '@/lib/coach/level-algorithm'
import { z } from 'zod'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { coachId } = await getCoachSession()
  const athleteId = Number(params.id)

  const row = await db.query(
    `select
       a.level_id, al.name as level_name,
       a.suggested_level_id, als.name as suggested_level_name,
       a.level_source, a.level_confidence,
       a.sex, a.weight_kg, a.training_experience_years
     from athletes a
     left join athlete_levels al  on al.id = a.level_id
     left join athlete_levels als on als.id = a.suggested_level_id
     where a.id = $1 and a.coach_id = $2`,
    [athleteId, coachId]
  )
  if (!row.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(row.rows[0])
}

const patchSchema = z.object({ level_id: z.number().int() })

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { coachId } = await getCoachSession()
  const athleteId = Number(params.id)
  const { level_id } = patchSchema.parse(await req.json())

  // Verify level belongs to this coach
  const levelCheck = await db.query(
    `select 1 from athlete_levels where id = $1 and coach_id = $2`,
    [level_id, coachId]
  )
  if ((levelCheck.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: 'invalid level' }, { status: 400 })
  }

  await db.query(
    `update athletes set level_id = $1, level_source = 'coach' where id = $2 and coach_id = $3`,
    [level_id, athleteId, coachId]
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add web/app/api/coach/levels/ web/app/api/coach/athletes/
git commit -m "feat(api): CRUD endpoints for coach levels + athlete level assignment"
```

---

## Task 4: Block level + days tagging (editor)

**Files:**
- Modify: `web/components/v2/editor/BlockEditor.tsx`
- Modify: (verify) block PATCH endpoint supports `min_level_id`, `max_level_id`, `days_per_week`

**Interfaces:**
- Consumes: `GET /api/coach/levels` for the level dropdown
- Produces: PATCH to block endpoint with `{ min_level_id?, max_level_id?, days_per_week? }`

- [ ] **Step 1: Add level + days fields to BlockEditor**

In `web/components/v2/editor/BlockEditor.tsx`, add after the block title input:

```typescript
// At the top of the component, fetch levels
const [levels, setLevels] = React.useState<{ id: number; name: string; label: string }[]>([])
React.useEffect(() => {
  fetch('/api/coach/levels').then(r => r.json()).then(d => setLevels(d.levels ?? []))
}, [])

// Add to the block metadata section (after title):
<div className="flex gap-3 mt-3">
  <div className="flex-1">
    <label className="v2-label">Nivel mínimo</label>
    <select
      className="v2-select w-full"
      value={block.min_level_id ?? ''}
      onChange={e => onBlockChange({ ...block, min_level_id: e.target.value ? Number(e.target.value) : null })}
    >
      <option value="">Cualquier nivel</option>
      {levels.map(l => (
        <option key={l.id} value={l.id}>{l.name} — {l.label}</option>
      ))}
    </select>
  </div>
  <div className="flex-1">
    <label className="v2-label">Nivel máximo</label>
    <select
      className="v2-select w-full"
      value={block.max_level_id ?? ''}
      onChange={e => onBlockChange({ ...block, max_level_id: e.target.value ? Number(e.target.value) : null })}
    >
      <option value="">Mismo que mínimo</option>
      {levels.map(l => (
        <option key={l.id} value={l.id}>{l.name} — {l.label}</option>
      ))}
    </select>
  </div>
  <div className="w-32">
    <label className="v2-label">Días/semana</label>
    <select
      className="v2-select w-full"
      value={block.days_per_week ?? ''}
      onChange={e => onBlockChange({ ...block, days_per_week: e.target.value ? Number(e.target.value) : null })}
    >
      <option value="">Cualquiera</option>
      {[3, 4, 5, 6].map(d => <option key={d} value={d}>{d} días</option>)}
    </select>
  </div>
</div>
```

- [ ] **Step 2: Verify block PATCH endpoint includes these fields**

Check `web/app/api/coach/blocks/[id]/route.ts`. If `min_level_id`, `max_level_id`, `days_per_week` are not in the allowed set, add them to the Zod schema and the SQL SET clause.

- [ ] **Step 3: Wire save in BlockEditor**

Ensure `handleSave` (or the existing PATCH call) includes `min_level_id`, `max_level_id`, `days_per_week` in the request body.

- [ ] **Step 4: Commit**

```bash
git add web/components/v2/editor/BlockEditor.tsx
git commit -m "feat(v2): add level range + days/week pickers to block editor"
```

---

## Task 5: Biblioteca — level × days matrix view

**Files:**
- Create: `web/components/v2/biblioteca/LevelMatrix.tsx`
- Create: `web/components/v2/biblioteca/MatrixCell.tsx`
- Modify: `web/lib/dashboard/v2/biblioteca-data.ts` (add `listBlocksMatrix`)
- Modify: `web/components/v2/biblioteca/BibliotecaView.tsx` (replace BloqueCard grid with LevelMatrix)

**Interfaces:**
- `listBlocksMatrix(coachId)` → `{ levels: Level[]; days: number[]; cells: MatrixBlock[][] }` where `MatrixBlock = { blockId: number; title: string; needs_review: boolean } | null`
- `LevelMatrix` props: `{ data: MatrixData; onCellClick: (levelId: number, days: number) => void }`

- [ ] **Step 1: Add `listBlocksMatrix` to biblioteca-data.ts**

```typescript
export interface MatrixLevel {
  id: number
  name: string
  label: string
  sort_order: number
}

export interface MatrixBlock {
  block_id: number
  title: string
  needs_review: boolean
}

export interface MatrixData {
  levels: MatrixLevel[]
  days: number[]          // [3, 4, 5, 6]
  cells: Record<string, MatrixBlock | null>  // key = `${level_id}:${days}`
}

export async function listBlocksMatrix(coachId: number): Promise<MatrixData> {
  const [levelsResult, blocksResult] = await Promise.all([
    db.query(
      `select id, name, label, sort_order from athlete_levels
       where coach_id = $1 order by sort_order`,
      [coachId]
    ),
    db.query(
      `select id as block_id, title, needs_review, min_level_id, days_per_week
       from blocks
       where coach_id = $1 and min_level_id is not null and days_per_week is not null`,
      [coachId]
    ),
  ])

  const levels: MatrixLevel[] = levelsResult.rows
  const DAYS = [3, 4, 5, 6]

  const cells: Record<string, MatrixBlock | null> = {}
  for (const level of levels) {
    for (const d of DAYS) {
      cells[`${level.id}:${d}`] = null
    }
  }
  for (const b of blocksResult.rows) {
    const key = `${b.min_level_id}:${b.days_per_week}`
    if (key in cells) {
      cells[key] = { block_id: b.block_id, title: b.title, needs_review: b.needs_review }
    }
  }

  return { levels, days: DAYS, cells }
}
```

- [ ] **Step 2: Create `MatrixCell.tsx`**

```typescript
// web/components/v2/biblioteca/MatrixCell.tsx
import { cn } from '@/lib/utils'

interface MatrixCellProps {
  block: { block_id: number; title: string; needs_review: boolean } | null
  onClick: () => void
}

export function MatrixCell({ block, onClick }: MatrixCellProps) {
  if (!block) {
    return (
      <button
        onClick={onClick}
        className="w-full h-16 rounded-lg border-2 border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] text-xl hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)] transition-colors"
        aria-label="Crear bloque"
      >
        +
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full h-16 rounded-lg border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-left text-sm font-medium truncate hover:border-[color:var(--v2-accent)] transition-colors',
        block.needs_review && 'border-[color:var(--v2-warn)]'
      )}
    >
      {block.title}
      {block.needs_review && <span className="ml-1 text-[color:var(--v2-warn)] text-xs">•</span>}
    </button>
  )
}
```

- [ ] **Step 3: Create `LevelMatrix.tsx`**

```typescript
// web/components/v2/biblioteca/LevelMatrix.tsx
import { MatrixCell } from './MatrixCell'
import type { MatrixData } from '@/lib/dashboard/v2/biblioteca-data'

interface LevelMatrixProps {
  data: MatrixData
  onCellClick: (levelId: number, days: number, blockId?: number) => void
}

export function LevelMatrix({ data, onCellClick }: LevelMatrixProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-32 text-left text-xs text-[color:var(--v2-faint)] pb-2 pr-4">Nivel</th>
            {data.days.map(d => (
              <th key={d} className="text-center text-xs text-[color:var(--v2-faint)] pb-2 px-2">
                {d} días
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.levels.map(level => (
            <tr key={level.id} className="border-t border-[color:var(--v2-border)]">
              <td className="py-3 pr-4">
                <span className="text-sm font-semibold">{level.name}</span>
                <span className="ml-2 text-xs text-[color:var(--v2-faint)]">{level.label}</span>
              </td>
              {data.days.map(d => {
                const block = data.cells[`${level.id}:${d}`]
                return (
                  <td key={d} className="py-3 px-2">
                    <MatrixCell
                      block={block}
                      onClick={() => onCellClick(level.id, d, block?.block_id)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Add matrix toggle to BibliotecaView**

In `web/components/v2/biblioteca/BibliotecaView.tsx`, on the "Bloques" tab:
- Add a view toggle: "Lista" | "Matriz" (SegmentedControl already exists in v2)
- When "Matriz" selected: render `<LevelMatrix data={matrixData} onCellClick={...} />`
- When "Lista" selected: render existing `BloqueCard` grid
- `matrixData` comes from server via a new prop (or client fetch from `/api/coach/blocks/matrix`)

Add API route `GET /api/coach/blocks/matrix`:
```typescript
// web/app/api/coach/blocks/matrix/route.ts
import { NextResponse } from 'next/server'
import { getCoachSession } from '@/lib/auth/session'
import { listBlocksMatrix } from '@/lib/dashboard/v2/biblioteca-data'

export async function GET() {
  const { coachId } = await getCoachSession()
  const data = await listBlocksMatrix(coachId)
  return NextResponse.json(data)
}
```

- [ ] **Step 5: Commit**

```bash
git add web/lib/dashboard/v2/biblioteca-data.ts \
        web/components/v2/biblioteca/LevelMatrix.tsx \
        web/components/v2/biblioteca/MatrixCell.tsx \
        web/components/v2/biblioteca/BibliotecaView.tsx \
        web/app/api/coach/blocks/matrix/route.ts
git commit -m "feat(v2): level × days matrix view in biblioteca"
```

---

## Task 6: Auto-proposal in /hoy when new athlete joins

**Files:**
- Create: `web/lib/coach/level-proposal.ts`
- Modify: `web/lib/dashboard/v2/hoy-lanes.ts`
- Modify: `web/components/v2/hoy/LaneCard.tsx`

**Interfaces:**
- `computeAndStoreLevelSuggestion(athleteId, coachId, db)` → runs algorithm + writes `suggested_level_id` + `level_confidence` to athletes + optionally creates coach inbox item
- New lane card type: `kind: 'nivel_sugerido'` with fields `{ athlete_name, suggested_level_name, confidence, block_suggestion?: string }`

- [ ] **Step 1: Create `web/lib/coach/level-proposal.ts`**

```typescript
import { db } from '@/lib/db'
import { suggestLevel } from './level-algorithm'

export async function computeAndStoreLevelSuggestion(
  athleteId: number,
  coachId: number
): Promise<void> {
  // Fetch athlete profile + benchmarks
  const [profileResult, benchmarksResult, levelsResult] = await Promise.all([
    db.query(
      `select sex, weight_kg, training_experience_years from athletes where id = $1`,
      [athleteId]
    ),
    db.query(
      `select exercise_slug, value::float as value, unit
       from athlete_benchmarks where athlete_id = $1`,
      [athleteId]
    ),
    db.query(
      `select id, sort_order from athlete_levels where coach_id = $1 order by sort_order`,
      [coachId]
    ),
  ])

  const profile = profileResult.rows[0]
  if (!profile) return

  const suggestion = suggestLevel(profile, benchmarksResult.rows)
  // Map sort_order → level id from this coach's levels
  const level = levelsResult.rows.find(l => l.sort_order === suggestion.sort_order)
    ?? levelsResult.rows[0]
  if (!level) return

  await db.query(
    `update athletes
     set suggested_level_id = $1,
         level_source       = 'algorithm',
         level_confidence   = $2
     where id = $3`,
    [level.id, suggestion.confidence, athleteId]
  )
}
```

- [ ] **Step 2: Call `computeAndStoreLevelSuggestion` on intake approval**

Find where intake is approved in `web/app/api/coach/inbox/` or the intake route. After setting `intake_pending = false`, add:

```typescript
import { computeAndStoreLevelSuggestion } from '@/lib/coach/level-proposal'
// ...after intake approval:
await computeAndStoreLevelSuggestion(athleteId, coachId)
```

- [ ] **Step 3: Surface in hoy-lanes.ts**

In `web/lib/dashboard/v2/hoy-lanes.ts`, add to the data loading (alongside roster rows):

```typescript
// Athletes with a suggested level pending coach confirmation
const pendingLevels = rosterRows.filter(
  a => a.suggested_level_id && !a.level_id
)
```

Add these as decision cards with `kind: 'nivel_sugerido'` into the decisions array passed to `HoyBoard`.

- [ ] **Step 4: Add card variant to LaneCard.tsx**

In `web/components/v2/hoy/LaneCard.tsx`, add a branch for `kind === 'nivel_sugerido'`:

```typescript
if (card.kind === 'nivel_sugerido') {
  return (
    <div className="v2-lane-card">
      <div className="flex items-center gap-2">
        <AthleteAvatar name={card.athlete_name} size="sm" />
        <div>
          <p className="text-sm font-medium">{card.athlete_name}</p>
          <p className="text-xs text-[color:var(--v2-faint)]">
            Nivel sugerido: <span className="font-semibold text-[color:var(--v2-text)]">{card.suggested_level_name}</span>
            {card.confidence === 'low' && ' (pocos datos)'}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onAccept(card)} className="v2-btn-primary text-xs">Aceptar nivel</button>
        <button onClick={() => onView(card)}   className="v2-btn-ghost text-xs">Ver atleta</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add web/lib/coach/level-proposal.ts \
        web/lib/dashboard/v2/hoy-lanes.ts \
        web/components/v2/hoy/LaneCard.tsx
git commit -m "feat(v2): nivel sugerido proposal card in /hoy when new athlete joins"
```

---

## Task 7: Roster — real level instead of heuristic

**Files:**
- Modify: `web/lib/dashboard/v2/level.ts`
- Modify: `web/lib/dashboard/v2/atletas-row.ts`

**Interfaces:**
- `atletas-row.ts` already exposes `level` field — change it to read from `athletes.level_id → athlete_levels.name` instead of the modality heuristic

- [ ] **Step 1: Update the roster query in `atletas-row.ts`**

Find the SQL that builds the roster rows. Add a join:

```sql
left join athlete_levels al on al.id = a.level_id
```

Change the `level` field in the SELECT from the heuristic to:

```sql
al.name as level_name,
al.sort_order as level_sort_order,
case when a.level_id is null then 'unset' else 'set' end as level_status
```

- [ ] **Step 2: Update `level.ts` to use real data**

Replace the modality-based heuristic entirely:

```typescript
// web/lib/dashboard/v2/level.ts
export function levelLabel(levelName: string | null): string {
  return levelName ?? '—'
}
```

- [ ] **Step 3: Update `AthleteTableRow.tsx` to show real level**

Replace the `LevelBadge` props to use `row.level_name` instead of the computed heuristic.

If `level_name` is null: show `—` badge (not a fake N2).

- [ ] **Step 4: Commit**

```bash
git add web/lib/dashboard/v2/level.ts \
        web/lib/dashboard/v2/atletas-row.ts \
        web/components/v2/atletas/AthleteTableRow.tsx
git commit -m "fix(v2): roster shows real athlete level from DB instead of modality heuristic"
```

---

## Self-review

**Spec coverage:**
- ✅ Level system (N1-N5, per-coach, editable) → Tasks 1 + 3
- ✅ Algorithm from onboarding benchmarks → Task 2
- ✅ Block tagging (level + days) → Task 4
- ✅ Visual matrix in biblioteca → Task 5
- ✅ Auto-proposal card in /hoy → Task 6
- ✅ Real level in roster → Task 7
- ✅ Methodology-agnostic: no ATR references in any new file
- ✅ Sex-aware thresholds in algorithm
- ✅ Fallback to experience years when no benchmarks

**Out of scope (confirmed):**
- Test batteries per level (future plan)
- Automatic re-leveling after performance updates (future)
- Price tiers (separate concern)

**Gaps to verify at implementation:**
- Benchmark exercise slugs (`run_5k`, `row_2k`, `hyrox_open`) must match what iOS onboarding actually writes to `athlete_benchmarks` — verify against `OnboardingAPI.swift` before Task 6
- Intake approval endpoint location (search `intake_pending = false` in codebase) before Task 6 Step 2
