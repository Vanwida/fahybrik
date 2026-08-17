/**
 * Tres puertas de Cómo entrenas.
 *   1. PUT a mitad (unas casillas, el resto null) entra.
 *   2. Con espejo, el composer de notas y el de plan lo ven en el prompt.
 *   3. Vacío: no se inventa un método. No hay chat IA coach; estas dos
 *      superficies son las que leen el párrafo.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const llm = vi.hoisted(() => ({ configured: false, call: vi.fn() }));
const store = vi.hoisted(() => ({
  get: vi.fn(),
  upsert: vi.fn(),
  loadMirror: vi.fn(),
}));

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/dashboard/coach/ai/llm', () => {
  class CoachIaLlmError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'CoachIaLlmError';
    }
  }
  return {
    CoachIaLlmError,
    isCoachIaLlmConfigured: () => llm.configured,
    callCoachIaLlmJson: llm.call,
  };
});
vi.mock('@/lib/coach/method-interview', async () => {
  const actual = await vi.importActual<typeof import('@/lib/coach/method-interview')>(
    '@/lib/coach/method-interview',
  );
  return {
    ...actual,
    getCoachMethodInterview: store.get,
    upsertCoachMethodInterview: store.upsert,
    loadCoachMethodMirror: store.loadMirror,
  };
});

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { PUT } = await import('@/app/api/coach/method-interview/route');
const { methodMirrorPromptBlock } = await import('@/lib/coach/method-interview');
const { suggestFreeText } = await import('@/lib/dashboard/coach/text-ai-suggest');
const { planWeekSkeleton } = await import('@/lib/dashboard/coach/ai/compose-week');
const {
  emptyInterview,
  generateMirror,
  hasMethodInterview,
  INTERVIEW_QUESTION_COUNT,
  normalizeAnswers,
  SPEC_EXAMPLE_MIRROR,
} = await import('@fahybrid/shared/domain/coach/method-interview');
const { coachMethodInterviewPutSchema } = await import(
  '@fahybrid/shared/schema/coach-method-interview'
);

const SESSION = { coach_id: BigInt(4) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getCoachSession>>
>;

const EMPTY_RESPONSE = {
  ...emptyInterview(),
  answered_count: 0,
  question_count: INTERVIEW_QUESTION_COUNT,
  updated_at: null,
};

const PARTIAL_ANSWERS = normalizeAnswers({
  typical_day: 'run_stations',
  training_days: 'd5',
});

const NOTE_CONTEXT = {
  session_title: 'Fuerza tren inferior',
  blocks: [
    {
      title: 'Principal',
      format: 'strength_block',
      items: [{ exercise_name: 'Front squat', modality: 'strength' as const }],
    },
  ],
};

const SKELETON_OK = {
  days: [
    {
      day_of_week: 1,
      kind: 'workout',
      sessions: [{ slot: 'am', theme: 'Fuerza', modalities: ['strength'], intensity: 'hard' }],
    },
  ],
};

function lastLlmCall(): { system: string; user: string } {
  return llm.call.mock.calls.at(-1)![0] as { system: string; user: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  llm.configured = false;
  llm.call.mockReset();
  store.loadMirror.mockResolvedValue('');
  store.upsert.mockResolvedValue(EMPTY_RESPONSE);
});

describe('PUT parcial', () => {
  test('unas casillas y el resto null: el schema acepta y el PUT entra', async () => {
    expect(PARTIAL_ANSWERS.typical_day).toBe('run_stations');
    expect(PARTIAL_ANSWERS.training_days).toBe('d5');
    expect(PARTIAL_ANSWERS.strength_role).toBeNull();
    expect(PARTIAL_ANSWERS.tests_used).toBeNull();

    const parsed = coachMethodInterviewPutSchema.safeParse({ answers: PARTIAL_ANSWERS });
    expect(parsed.success).toBe(true);

    const mirror = generateMirror(PARTIAL_ANSWERS);
    expect(mirror).toContain('mezcla carrera y estaciones');
    expect(mirror).toContain('Semana de 5 días');
    expect(mirror).not.toBe(SPEC_EXAMPLE_MIRROR);
    expect(mirror).not.toContain('Fuerza es pilar');

    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    store.upsert.mockResolvedValue({
      ...EMPTY_RESPONSE,
      answers: PARTIAL_ANSWERS,
      generated_mirror: mirror,
      mirror_text: mirror,
      answered_count: 2,
    });

    const res = await PUT(
      new Request('http://localhost/api/coach/method-interview', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: PARTIAL_ANSWERS }),
      }),
    );

    expect(res.status).toBe(200);
    expect(store.upsert).toHaveBeenCalledWith(
      BigInt(4),
      expect.objectContaining({ answers: PARTIAL_ANSWERS }),
    );
    const body = (await res.json()) as { answered_count: number; generated_mirror: string };
    expect(body.answered_count).toBe(2);
    expect(body.generated_mirror).toBe(mirror);
  });
});

describe('con espejo el composer lo ve', () => {
  test('nota del entreno: el párrafo entra en el system', async () => {
    llm.configured = true;
    store.loadMirror.mockResolvedValue(SPEC_EXAMPLE_MIRROR);
    llm.call.mockResolvedValue({ suggestions: ['Hoy manda la técnica.'] });

    const res = await suggestFreeText({
      coach_id: 4,
      body: { surface: 'coach_note', context: NOTE_CONTEXT },
    });

    expect(res.source).toBe('ai');
    expect(store.loadMirror).toHaveBeenCalledWith(4);
    const { system } = lastLlmCall();
    expect(system).toContain(SPEC_EXAMPLE_MIRROR);
    expect(system).toContain('CÓMO ENTRENA ESTE COACH');
  });

  test('plan de la semana: el párrafo entra en el system', async () => {
    llm.call.mockResolvedValue(SKELETON_OK);

    await planWeekSkeleton({
      focus: 'HYROX',
      level: 'intermediate',
      training_days: [1, 3, 5],
      library: [],
      box_block: null,
      coach_id: 4,
      method_mirror: SPEC_EXAMPLE_MIRROR,
    });

    const { system } = lastLlmCall();
    expect(system).toContain(SPEC_EXAMPLE_MIRROR);
    expect(system).toContain('CÓMO ENTRENA ESTE COACH');
  });
});

describe('vacío no inventa método', () => {
  test('sin casillas no hay párrafo, y el bloque de voz no nace', () => {
    expect(generateMirror(emptyInterview().answers)).toBe('');
    expect(hasMethodInterview(emptyInterview())).toBe(false);
    expect(methodMirrorPromptBlock('')).toBeNull();
    expect(methodMirrorPromptBlock('   ')).toBeNull();
  });

  test('nota del entreno: sin espejo no se cuela un sistema ajeno', async () => {
    llm.configured = true;
    store.loadMirror.mockResolvedValue('');
    llm.call.mockResolvedValue({ suggestions: ['Hoy manda la técnica.'] });

    await suggestFreeText({
      coach_id: 4,
      body: { surface: 'coach_note', context: NOTE_CONTEXT },
    });

    const { system } = lastLlmCall();
    expect(system).not.toContain('CÓMO ENTRENA ESTE COACH');
    expect(system).not.toContain(SPEC_EXAMPLE_MIRROR);
    expect(system).not.toContain('Fuerza es pilar');
  });

  test('plan de la semana: sin espejo no se inventa el oficio del coach', async () => {
    llm.call.mockResolvedValue(SKELETON_OK);

    await planWeekSkeleton({
      focus: 'HYROX',
      level: 'intermediate',
      training_days: [1, 3, 5],
      library: [],
      box_block: null,
      coach_id: 4,
      method_mirror: null,
    });

    const { system } = lastLlmCall();
    expect(system).not.toContain('CÓMO ENTRENA ESTE COACH');
    expect(system).not.toContain(SPEC_EXAMPLE_MIRROR);
    expect(system).not.toContain('Fuerza es pilar');
  });
});
