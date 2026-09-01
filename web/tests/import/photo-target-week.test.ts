/**
 * `buildPhotoProposal` — `target_week_id` is a client-supplied id: verified
 * as this coach's own, in THIS microcycle, BEFORE anything else runs (never
 * trusted at face value). `loadMonthTemplateWithWeeks`
 * (lib/dashboard/coach/program-months.ts) is mocked — it already scopes both
 * the month AND every week to `coach_id`, so it is the single source of
 * truth for "does this id belong to this coach" here; this file only proves
 * `buildPhotoProposal` reacts correctly to what it returns.
 *
 * The fail-fast claim gets its own assertion: a rejected `target_week_id`
 * must never reach Blob or the vision model — wasting a download or an LLM
 * call on a request that was always going to fail is exactly the kind of
 * waste the 2026-08-05 incident review flagged.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { buildPhotoProposal } from '@/lib/import/photo-proposal';
import { ImportError } from '@/lib/import/import-shared';

const { loadMonthTemplateWithWeeksMock } = vi.hoisted(() => ({
  loadMonthTemplateWithWeeksMock: vi.fn(),
}));
vi.mock('@/lib/dashboard/coach/program-months', () => ({
  loadMonthTemplateWithWeeks: loadMonthTemplateWithWeeksMock,
}));

const { headMock } = vi.hoisted(() => ({ headMock: vi.fn() }));
vi.mock('@vercel/blob', () => ({ head: headMock }));

const { readWeekVisionMock } = vi.hoisted(() => ({ readWeekVisionMock: vi.fn() }));
vi.mock('@/lib/import/vision-reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import/vision-reader')>();
  return { ...actual, readWeekVision: readWeekVisionMock };
});

const COACH_ID = 7;
const BASE_BODY = {
  microcycle_id: 3,
  mode: 'photo' as const,
  images: [{ pathname: `import-photos/${COACH_ID}/2026/08/uuid.jpg` }],
  target_week_id: '200',
};

const MONTH_WITH_WEEKS = {
  month: { id: '3', name: 'Bloque 1', level: '' },
  weeks: [
    { id: '199', week_index: 0, name: 'S1', level: '', focus: null, coach_notes: null, slots_json: { days: [] } },
    { id: '200', week_index: 1, name: 'S2', level: '', focus: null, coach_notes: null, slots_json: { days: [] } },
    { id: '201', week_index: 2, name: 'S3', level: '', focus: null, coach_notes: null, slots_json: { days: [] } },
  ],
};

beforeEach(() => {
  loadMonthTemplateWithWeeksMock.mockReset();
  headMock.mockReset();
  readWeekVisionMock.mockReset();
});

describe('microciclo inexistente o ajeno', () => {
  test('loadMonthTemplateWithWeeks devuelve null → 404, y ni Blob ni el modelo se tocan', async () => {
    loadMonthTemplateWithWeeksMock.mockResolvedValue(null);

    await expect(
      buildPhotoProposal({ coach_id: COACH_ID, body: BASE_BODY }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    expect(headMock).not.toHaveBeenCalled();
    expect(readWeekVisionMock).not.toHaveBeenCalled();
  });
});

describe('target_week_id ajeno — no pertenece a este microciclo', () => {
  test('un id que no está entre las semanas del microciclo → 400 invalid_target, sin tocar Blob ni el modelo', async () => {
    loadMonthTemplateWithWeeksMock.mockResolvedValue(MONTH_WITH_WEEKS);

    await expect(
      buildPhotoProposal({ coach_id: COACH_ID, body: { ...BASE_BODY, target_week_id: '999' } }),
    ).rejects.toMatchObject({ code: 'invalid_target', status: 400 });

    expect(headMock).not.toHaveBeenCalled();
    expect(readWeekVisionMock).not.toHaveBeenCalled();
  });

  test('el id de la semana de OTRO microciclo (nunca aparece en `weeks`) se rechaza igual', async () => {
    loadMonthTemplateWithWeeksMock.mockResolvedValue(MONTH_WITH_WEEKS);

    await expect(
      buildPhotoProposal({
        coach_id: COACH_ID,
        body: { ...BASE_BODY, target_week_id: '54321' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_target' });
  });
});

describe('target_week_id propio — pasa la validación y sigue adelante', () => {
  test('un id real del microciclo NO lanza not_found/invalid_target — llega a resolver las capturas', async () => {
    loadMonthTemplateWithWeeksMock.mockResolvedValue(MONTH_WITH_WEEKS);
    // Sin BLOB_READ_WRITE_TOKEN configurado, la siguiente etapa (resolver
    // imágenes) falla con SU PROPIO error — distinto de los de arriba. Que
    // sea ESE error, y no el de target_week_id, es la prueba de que la
    // validación de la semana ya quedó atrás.
    const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      await expect(
        buildPhotoProposal({ coach_id: COACH_ID, body: BASE_BODY }),
      ).rejects.toMatchObject({ code: 'storage_unavailable', status: 503 });
    } finally {
      if (savedToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = savedToken;
    }
    // find(...) === -1 sería el único camino a 'invalid_target'; confirmado
    // que no fue ese el error lanzado. `idSchema` coacciona microcycle_id a
    // bigint, de ahí el `3n`.
    expect(loadMonthTemplateWithWeeksMock).toHaveBeenCalledWith(
      expect.objectContaining({ coach_id: COACH_ID, month_id: BigInt(BASE_BODY.microcycle_id) }),
    );
  });
});

describe('ImportError sigue siendo la clase compartida', () => {
  test('invalid_target es instanceof ImportError', async () => {
    loadMonthTemplateWithWeeksMock.mockResolvedValue(MONTH_WITH_WEEKS);
    try {
      await buildPhotoProposal({
        coach_id: COACH_ID,
        body: { ...BASE_BODY, target_week_id: '999' },
      });
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
    }
  });
});
