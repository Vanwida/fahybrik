// PATCH /api/exercises/[id] — coach-only catalog edit with per-coach overrides.
//
// The catalog is GLOBAL, but a coach's pedagogical content is their own (mig
// 0085). This route SPLITS the edit:
//   • cues / description / video_url → the coach's OVERRIDE (upsert), NOT global.
//   • name / category / muscles / equipment → the GLOBAL exercise row.
// These tests pin that routing (override vs global), plus auth / validation /
// YouTube canonicalization / 404.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseUpdateError,
  updateExerciseSchema,
} from '@/lib/dashboard/exercises/update-exercise';

let session: { coach_id: bigint; user_id: bigint } | null = null;
let existsRows: { one: number }[] = [{ one: 1 }];
let lastUpdateArgs: { id: bigint; patch: Record<string, unknown> } | null = null;
let lastUpsert: { coach_id: bigint; exercise_id: bigint; patch: Record<string, unknown> } | null =
  null;
let updateBehaviour: 'ok' | 'not_found' = 'ok';

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => session,
}));

// `sql` is used by the route only for the existence check; return `existsRows`.
vi.mock('@/lib/db', () => ({
  sql: vi.fn(async () => existsRows),
}));

vi.mock('@/lib/dashboard/exercises/update-exercise', async (importOriginal) => {
  // Keep the real schema + error class; stub only the DB-touching GLOBAL updater.
  const actual =
    await importOriginal<typeof import('@/lib/dashboard/exercises/update-exercise')>();
  return {
    ...actual,
    updateExercise: vi.fn(async (id: bigint, patch: Record<string, unknown>) => {
      lastUpdateArgs = { id, patch };
      if (updateBehaviour === 'not_found') {
        throw new actual.ExerciseUpdateError('not_found', 'Ejercicio no encontrado', 404);
      }
      return {} as never;
    }),
  };
});

vi.mock('@/lib/exercises/coach-override', async (importOriginal) => {
  // Keep the real pure splitters (pickOverrideFields / pickIdentityFields); stub
  // the two DB-touching helpers (override upsert + merged-row load).
  const actual = await importOriginal<typeof import('@/lib/exercises/coach-override')>();
  return {
    ...actual,
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
      name: (lastUpdateArgs?.patch.name as string) ?? 'Wall Balls',
      category: 'hyrox_station',
      modality: 'functional',
      primary_muscle_groups: [],
      equipment: [],
      default_metrics_json: {},
      hyrox_station_position: null,
      description: (lastUpsert?.patch.description as string | null) ?? null,
      cues: (lastUpsert?.patch.cues as string | null) ?? null,
      video_url: (lastUpsert?.patch.video_url as string | null) ?? null,
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
    existsRows = [{ one: 1 }];
    updateBehaviour = 'ok';
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

  it('rejects an empty patch (no fields) with 400', async () => {
    const res = await PATCH(patchReq({}), ctx('1'));
    expect(res.status).toBe(400);
  });

  it('routes cues/description to THIS coach override, never the global row', async () => {
    const res = await PATCH(
      patchReq({ description: 'desc', cues: 'cue 1\ncue 2' }),
      ctx('7'),
    );
    expect(res.status).toBe(200);
    // → coach override, with the coach + exercise scoped.
    expect(upsertCoachExerciseOverride).toHaveBeenCalledTimes(1);
    expect(lastUpsert?.coach_id).toBe(BigInt(10));
    expect(lastUpsert?.exercise_id).toBe(BigInt(7));
    expect(lastUpsert?.patch).toEqual({ cues: 'cue 1\ncue 2', description: 'desc' });
    // → the GLOBAL row is NOT touched.
    expect(updateExercise).not.toHaveBeenCalled();
    const body = (await res.json()) as { exercise: { cues: string; override_cues: string } };
    expect(body.exercise.cues).toBe('cue 1\ncue 2');
    expect(body.exercise.override_cues).toBe('cue 1\ncue 2');
  });

  it('routes name/category to the GLOBAL row, never the override', async () => {
    const res = await PATCH(patchReq({ name: 'Wall Balls' }), ctx('7'));
    expect(res.status).toBe(200);
    expect(updateExercise).toHaveBeenCalledTimes(1);
    expect(lastUpdateArgs?.id).toBe(BigInt(7));
    expect(lastUpdateArgs?.patch).toEqual({ name: 'Wall Balls' });
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });

  it('applies a global identity edit AND an override edit in one request', async () => {
    const res = await PATCH(
      patchReq({ name: 'X', video_url: 'https://youtu.be/dQw4w9WgXcQ' }),
      ctx('5'),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateArgs?.patch).toEqual({ name: 'X' });
    expect(lastUpsert?.patch).toEqual({
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('canonicalizes a YouTube URL into the override', async () => {
    const res = await PATCH(patchReq({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(lastUpsert?.patch.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('accepts an empty video_url and clears the override (null = inherit global)', async () => {
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

  it('rejects an empty name with 400', async () => {
    const res = await PATCH(patchReq({ name: '   ' }), ctx('1'));
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields (strict body) with 400', async () => {
    const res = await PATCH(patchReq({ slug: 'hacked' }), ctx('1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the exercise does not exist (override-only edit)', async () => {
    existsRows = [];
    const res = await PATCH(patchReq({ cues: 'x' }), ctx('999'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(upsertCoachExerciseOverride).not.toHaveBeenCalled();
  });
});

describe('updateExerciseSchema', () => {
  it('normalizes empty description/cues to null', () => {
    const parsed = updateExerciseSchema.parse({ description: '   ', cues: '' });
    expect(parsed.description).toBeNull();
    expect(parsed.cues).toBeNull();
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
