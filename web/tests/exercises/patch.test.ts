// PATCH /api/exercises/[id] — the ROUTER between the two write paths (mig 0132).
//
// The rule these tests pin: a coach forks what they AUTHOR, never what the
// movement IS.
//   • BASE exercise (coach_id is null) → name/cues/description/video_url become
//     THIS coach's override. The base row is never mutated. category/muscles/
//     equipment are REFUSED (409) — shared identity, create your own instead.
//   • OWN exercise (coach_id = coach) → everything is written directly.
//   • another coach's exercise → 404, identical to "doesn't exist".
//
// `name` moved from the global-identity side to the forkable side here — that IS
// the change (Alex: "si le cambia el nombre… se forkea"). The old tests asserted
// the opposite and were rewritten, not patched.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseUpdateError,
  updateExerciseSchema,
} from '@/lib/dashboard/exercises/update-exercise';

let session: { coach_id: bigint; user_id: bigint } | null = null;
/** What `loadExerciseScope` reports: 'base' | 'own' | null (missing/foreign). */
let scope: 'base' | 'own' | null = 'base';
let lastUpdateArgs: { id: bigint; patch: Record<string, unknown>; coachId: bigint } | null = null;
let lastUpsert: { coach_id: bigint; exercise_id: bigint; patch: Record<string, unknown> } | null =
  null;

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => session,
}));

// The route only passes `sql` through to the (stubbed) helpers.
vi.mock('@/lib/db', () => ({
  sql: vi.fn(async () => []),
}));

vi.mock('@/lib/dashboard/exercises/update-exercise', async (importOriginal) => {
  // Keep the real schema + error class; stub only the DB-touching direct updater.
  const actual =
    await importOriginal<typeof import('@/lib/dashboard/exercises/update-exercise')>();
  return {
    ...actual,
    updateExercise: vi.fn(async (id: bigint, patch: Record<string, unknown>, coachId: bigint) => {
      lastUpdateArgs = { id, patch, coachId };
      return {} as never;
    }),
  };
});

vi.mock('@/lib/exercises/coach-override', async (importOriginal) => {
  // Keep the real pure splitters (pickOverrideFields / pickIdentityFields); stub
  // the DB-touching helpers (scope probe + override upsert + merged-row load).
  const actual = await importOriginal<typeof import('@/lib/exercises/coach-override')>();
  return {
    ...actual,
    loadExerciseScope: vi.fn(async () => scope),
    upsertCoachExerciseOverride: vi.fn(
      async (
        _client: unknown,
        args: { coach_id: bigint; exercise_id: bigint; patch: Record<string, unknown> },
      ) => {
        lastUpsert = args;
      },
    ),
    loadCoachExerciseRow: vi.fn(async (_client: unknown, _coach: bigint, exercise_id: bigint) => ({
      id: exercise_id.toString(),
      slug: 'wall-balls',
      coach_id: scope === 'own' ? '10' : null,
      origin: scope === 'own' ? 'own' : lastUpsert ? 'customized' : 'base',
      // The merged view: the coach's override wins, else the base value.
      name: (lastUpsert?.patch.name as string) ?? (lastUpdateArgs?.patch.name as string) ?? 'Wall Balls',
      category: 'hyrox_station',
      modality: 'functional',
      primary_muscle_groups: [],
      equipment: [],
      default_metrics_json: {},
      hyrox_station_position: null,
      description: (lastUpsert?.patch.description as string | null) ?? null,
      cues: (lastUpsert?.patch.cues as string | null) ?? null,
      video_url: (lastUpsert?.patch.video_url as string | null) ?? null,
      base_name: 'Wall Balls',
      base_cues: null,
      base_description: null,
      base_video_url: null,
      override_name: (lastUpsert?.patch.name as string | null) ?? null,
      override_cues: (lastUpsert?.patch.cues as string | null) ?? null,
      override_description: (lastUpsert?.patch.description as string | null) ?? null,
      override_video_url: (lastUpsert?.patch.video_url as string | null) ?? null,
    })),
  };
});

const { PATCH } = await import('@/app/api/exercises/[id]/route');
const { updateExercise } = await import('@/lib/dashboard/exercises/update-exercise');
const { upsertCoachExerciseOverride } = await import('@/lib/exercises/coach-override');

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchReq(body: unknown) {
  return new Request('http://localhost/api/exercises/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/exercises/[id]', () => {
  beforeEach(() => {
    session = { coach_id: BigInt(10), user_id: BigInt(1) };
    scope = 'base';
    lastUpdateArgs = null;
    lastUpsert = null;
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects unauthenticated requests with 401', async () => {
    session = null;
    const res = await PATCH(patchReq({ name: 'X' }), ctx('1'));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid id with 400', async () => {
    const res = await PATCH(patchReq({ name: 'X' }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('rejects an empty patch (no fields) with 400, before touching the DB', async () => {
    const res = await PATCH(patchReq({}), ctx('1'));
    expect(res.status).toBe(400);
    expect(updateExercise).not.toHaveBeenCalled();
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });

  // ── BASE exercise: the fork ────────────────────────────────────────────────
  it('forks cues/description into THIS coach override, never the base row', async () => {
    const res = await PATCH(patchReq({ description: 'desc', cues: 'cue 1\ncue 2' }), ctx('7'));
    expect(res.status).toBe(200);
    expect(upsertCoachExerciseOverride).toHaveBeenCalledTimes(1);
    expect(lastUpsert?.coach_id).toBe(BigInt(10));
    expect(lastUpsert?.exercise_id).toBe(BigInt(7));
    expect(lastUpsert?.patch).toEqual({ cues: 'cue 1\ncue 2', description: 'desc' });
    // → the BASE row is NOT touched.
    expect(updateExercise).not.toHaveBeenCalled();
    const body = (await res.json()) as { exercise: { cues: string; override_cues: string } };
    expect(body.exercise.cues).toBe('cue 1\ncue 2');
    expect(body.exercise.override_cues).toBe('cue 1\ncue 2');
  });

  it('forks the NAME of a base exercise — the base row keeps its name', async () => {
    const res = await PATCH(patchReq({ name: 'Wall Ball Shots' }), ctx('7'));
    expect(res.status).toBe(200);
    expect(upsertCoachExerciseOverride).toHaveBeenCalledTimes(1);
    expect(lastUpsert?.patch).toEqual({ name: 'Wall Ball Shots' });
    expect(updateExercise).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      exercise: { name: string; base_name: string; override_name: string };
    };
    // The coach sees their name; the shared base name is still there underneath.
    expect(body.exercise.name).toBe('Wall Ball Shots');
    expect(body.exercise.override_name).toBe('Wall Ball Shots');
    expect(body.exercise.base_name).toBe('Wall Balls');
  });

  it('clears the name override with "" — the coach takes back their rename', async () => {
    // The restore affordance. A fork you can't undo is a trap, so "" on a base
    // exercise clears the override and the base name is inherited again — exactly
    // how cues/description/video_url already behave.
    const res = await PATCH(patchReq({ name: '  ' }), ctx('7'));
    expect(res.status).toBe(200);
    expect(lastUpsert?.patch).toEqual({ name: null });
    expect(updateExercise).not.toHaveBeenCalled();
  });

  it('refuses a shared-identity edit on a base exercise with 409, writing nothing', async () => {
    const res = await PATCH(patchReq({ category: 'strength' }), ctx('7'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('shared_identity');
    // The refusal NAMES what it refused and points at the escape hatch.
    expect(body.error.message).toContain('la categoría');
    expect(body.error.message).toContain('propio');
    expect(updateExercise).not.toHaveBeenCalled();
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });

  it('refuses the whole request when identity rides along with a forkable field', async () => {
    // All-or-nothing: we never silently apply half of what the coach asked for.
    const res = await PATCH(patchReq({ name: 'X', equipment: ['sled'] }), ctx('7'));
    expect(res.status).toBe(409);
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
    expect(updateExercise).not.toHaveBeenCalled();
  });

  // ── OWN exercise: direct edit ──────────────────────────────────────────────
  it('edits the coach OWN exercise directly — identity included, no override', async () => {
    scope = 'own';
    const res = await PATCH(patchReq({ name: 'Fabrik Complex', category: 'strength' }), ctx('5'));
    expect(res.status).toBe(200);
    expect(updateExercise).toHaveBeenCalledTimes(1);
    expect(lastUpdateArgs?.id).toBe(BigInt(5));
    expect(lastUpdateArgs?.patch).toEqual({ name: 'Fabrik Complex', category: 'strength' });
    // The ownership guard is threaded to the writer's WHERE clause.
    expect(lastUpdateArgs?.coachId).toBe(BigInt(10));
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });

  // ── Visibility ─────────────────────────────────────────────────────────────
  it("returns 404 for another coach's exercise — same answer as not existing", async () => {
    scope = null;
    const res = await PATCH(patchReq({ name: 'X' }), ctx('999'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
    expect(updateExercise).not.toHaveBeenCalled();
  });

  // ── Validation / canonicalization (unchanged by 0132) ──────────────────────
  it('canonicalizes a YouTube URL into the override', async () => {
    const res = await PATCH(patchReq({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(lastUpsert?.patch.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('accepts an empty video_url and clears the override (null = inherit base)', async () => {
    const res = await PATCH(patchReq({ video_url: '' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(lastUpsert?.patch.video_url).toBeNull();
  });

  it('rejects a non-YouTube URL with 400', async () => {
    const res = await PATCH(patchReq({ video_url: 'https://vimeo.com/123' }), ctx('1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  it('sends a cleared name straight to the writer for an OWN exercise', async () => {
    // Asymmetric on purpose: on a base exercise "" means "inherit the base name",
    // but an own exercise has no base to fall back to. The route does NOT
    // special-case it — it hands it to the writer, which is what upholds the NOT
    // NULL invariant (pinned against the real writer below).
    scope = 'own';
    await PATCH(patchReq({ name: '   ' }), ctx('5'));
    expect(lastUpdateArgs?.patch).toEqual({ name: null });
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });

  it('rejects unknown fields (strict body) with 400 — slug is never editable', async () => {
    const res = await PATCH(patchReq({ slug: 'hacked' }), ctx('1'));
    expect(res.status).toBe(400);
  });
});

describe('updateExercise (the writer upholds its own invariant)', () => {
  it('refuses a null name — an own exercise has no base name to fall back to', async () => {
    // Against the REAL writer, not the route's stub. The guard runs before any DB
    // call, so this needs no database.
    const actual = await vi.importActual<typeof import('@/lib/dashboard/exercises/update-exercise')>(
      '@/lib/dashboard/exercises/update-exercise',
    );
    await expect(actual.updateExercise(BigInt(1), { name: null }, BigInt(10))).rejects.toMatchObject(
      { code: 'invalid_name', status: 400 },
    );
  });
});

describe('updateExerciseSchema', () => {
  it('normalizes empty description/cues to null', () => {
    const parsed = updateExerciseSchema.parse({ description: '   ', cues: '' });
    expect(parsed.description).toBeNull();
    expect(parsed.cues).toBeNull();
  });

  it('normalizes an empty name to null — "" is how a coach undoes their rename', () => {
    expect(updateExerciseSchema.parse({ name: '   ' }).name).toBeNull();
    expect(updateExerciseSchema.parse({ name: ' Wall Ball Shots ' }).name).toBe('Wall Ball Shots');
  });

  it('canonicalizes an embed URL to a watch URL', () => {
    const parsed = updateExerciseSchema.parse({
      video_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
    expect(parsed.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('rejects a foreign category', () => {
    expect(() => updateExerciseSchema.parse({ category: 'nonsense' })).toThrow();
  });

  it('throws ExerciseUpdateError shape is constructable', () => {
    const e = new ExerciseUpdateError('no_fields', 'x', 400);
    expect(e.status).toBe(400);
  });
});
