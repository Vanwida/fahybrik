// PATCH /api/exercises/[id] — coach-only catalog edit. Covers auth, partial
// validation, YouTube URL accept/reject + canonicalization, and 404.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseUpdateError,
  updateExerciseSchema,
} from '@/lib/dashboard/exercises/update-exercise';

let session: { coach_id: bigint; user_id: bigint } | null = null;
let lastUpdateArgs: { id: bigint; patch: Record<string, unknown> } | null = null;
let updateBehaviour: 'ok' | 'not_found' = 'ok';

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => session,
}));

vi.mock('@/lib/dashboard/exercises/update-exercise', async (importOriginal) => {
  // Keep the real schema + error class; stub only the DB-touching updater.
  const actual =
    await importOriginal<typeof import('@/lib/dashboard/exercises/update-exercise')>();
  return {
    ...actual,
    updateExercise: vi.fn(async (id: bigint, patch: Record<string, unknown>) => {
      lastUpdateArgs = { id, patch };
      if (updateBehaviour === 'not_found') {
        throw new actual.ExerciseUpdateError('not_found', 'Ejercicio no encontrado', 404);
      }
      return {
        id: id.toString(),
        slug: 'wall-balls',
        name: (patch.name as string) ?? 'Wall Balls',
        category: 'hyrox_station',
        primary_muscle_groups: [],
        equipment: [],
        default_metrics_json: {},
        hyrox_station_position: null,
        description: (patch.description as string | null) ?? null,
        cues: (patch.cues as string | null) ?? null,
        video_url: (patch.video_url as string | null) ?? null,
      };
    }),
  };
});

const { PATCH } = await import('@/app/api/exercises/[id]/route');

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
    updateBehaviour = 'ok';
    lastUpdateArgs = null;
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

  it('updates name + description + cues and returns the row', async () => {
    const res = await PATCH(
      patchReq({ name: 'Wall Balls', description: 'desc', cues: 'cue 1\ncue 2' }),
      ctx('7'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exercise: { name: string; cues: string } };
    expect(body.exercise.name).toBe('Wall Balls');
    expect(body.exercise.cues).toBe('cue 1\ncue 2');
    expect(lastUpdateArgs?.id).toBe(BigInt(7));
  });

  it('accepts a valid YouTube URL and canonicalizes it to a watch URL', async () => {
    const res = await PATCH(
      patchReq({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }),
      ctx('1'),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateArgs?.patch.video_url).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('accepts an empty video_url and stores null (clears the link)', async () => {
    const res = await PATCH(patchReq({ video_url: '' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(lastUpdateArgs?.patch.video_url).toBeNull();
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

  it('returns 404 when the exercise does not exist', async () => {
    updateBehaviour = 'not_found';
    const res = await PATCH(patchReq({ name: 'X' }), ctx('999'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
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
