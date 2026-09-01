import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prescriptionToText, type Prescription } from '@fahybrid/shared/domain/prescription';
import { ITEM_NOTES_MAX, SESSION_NOTES_MAX } from '@fahybrid/shared/schema/program-templates';

/**
 * Las DOS notas que el atleta lee en el móvil (la del entreno y la de una línea
 * prescrita) tienen botón de ayuda del modelo. El contrato que se prueba aquí:
 *
 *  1. Sin modelo configurado NUNCA se queda el coach sin nada: salen los
 *     borradores estáticos honestos y `source: 'fallback'`.
 *  2. Con modelo, el prompt lleva el CONTENIDO REAL (los bloques de la sesión /
 *     el ejercicio con SU dosis), no un contexto genérico.
 *  3. Lo que devuelve el modelo se recorta al tope que aceptará el esquema al
 *     guardar: una propuesta jamás puede provocar un guardado rechazado.
 *  4. Cualquier fallo del modelo (excepción, JSON inválido, lista vacía) cae al
 *     borrador estático en vez de propagar el error.
 *
 * El LLM va mockeado ENTERO: aquí no se prueba la calidad de lo generado (no hay
 * clave en este entorno), se prueba el cableado y los bordes.
 */

const llm = vi.hoisted(() => ({ configured: false, call: vi.fn() }));

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

const { TextSuggestError, cleanSuggestions, suggestFreeText } = await import(
  '@/lib/dashboard/coach/text-ai-suggest'
);

const COACH_ID = 60;

const SESSION_CONTEXT = {
  session_title: 'Fuerza tren inferior',
  blocks: [
    {
      title: 'Principal',
      format: 'strength_block',
      items: [{ exercise_name: 'Front squat', modality: 'strength' as const }],
    },
    {
      title: 'Finisher',
      format: 'amrap',
      items: [
        { exercise_name: 'Wall balls', modality: 'functional' as const },
        { exercise_name: 'Remo', modality: 'row' as const },
      ],
    },
  ],
};

const SQUAT: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [
    { measure: { kind: 'reps', value: 6 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 120 },
    { measure: { kind: 'reps', value: 6 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 120 },
    { measure: { kind: 'reps', value: 6 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 120 },
  ],
};

const lastCall = () => llm.call.mock.calls.at(-1)![0] as { system: string; user: string };

beforeEach(() => {
  llm.configured = false;
  llm.call.mockReset();
});

describe('nota del entreno (coach_note)', () => {
  test('sin modelo configurado devuelve los borradores estáticos, sin llamar a nadie', async () => {
    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'coach_note', context: SESSION_CONTEXT },
    });

    expect(res.source).toBe('fallback');
    expect(res.suggestions).toHaveLength(3);
    expect(res.suggestions[0]).toContain('técnica');
    expect(llm.call).not.toHaveBeenCalled();
  });

  test('con modelo, el prompt lleva el título y el contenido REAL de la sesión', async () => {
    llm.configured = true;
    llm.call.mockResolvedValue({
      suggestions: ['Hoy manda la técnica.', 'No te pases en la primera serie.'],
    });

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'coach_note', context: SESSION_CONTEXT },
    });

    expect(res.source).toBe('ai');
    expect(res.suggestions).toEqual(['Hoy manda la técnica.', 'No te pases en la primera serie.']);

    const { system, user } = lastCall();
    expect(user).toContain('Fuerza tren inferior');
    expect(user).toContain('Front squat');
    expect(user).toContain('Wall balls');
    expect(system).toContain('NOTA DEL ENTRENO');
    // Regla de copy dura: el modelo tiene prohibidos los guiones largos.
    expect(system).toContain('SIN guiones largos');
  });

  test('recorta al tope del esquema — una nota nunca puede hacer fallar el guardado', async () => {
    llm.configured = true;
    llm.call.mockResolvedValue({ suggestions: ['a'.repeat(SESSION_NOTES_MAX + 250)] });

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'coach_note', context: SESSION_CONTEXT },
    });

    expect(res.source).toBe('ai');
    expect(res.suggestions[0]!.length).toBe(SESSION_NOTES_MAX);
  });
});

describe('nota de la línea (item_note)', () => {
  test('sin modelo configurado devuelve tres borradores propios de un ejercicio', async () => {
    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: {
        surface: 'item_note',
        context: { exercise_name: 'Front squat', block_title: 'Principal', prescription: SQUAT },
      },
    });

    expect(res.source).toBe('fallback');
    expect(res.suggestions).toHaveLength(3);
    // Son del EJERCICIO (carga, técnica, series), no de la sesión entera.
    expect(res.suggestions.join(' ')).toContain('carga');
    // Y caben en el campo sin recorte.
    for (const s of res.suggestions) expect(s.length).toBeLessThanOrEqual(ITEM_NOTES_MAX);
    expect(llm.call).not.toHaveBeenCalled();
  });

  test('el prompt lleva el ejercicio y SU dosis, no la sesión entera', async () => {
    llm.configured = true;
    llm.call.mockResolvedValue({ suggestions: ['Sube la carga solo si sale limpio.'] });

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: {
        surface: 'item_note',
        context: { exercise_name: 'Front squat', block_title: 'Principal', prescription: SQUAT },
      },
    });

    expect(res.source).toBe('ai');
    const { system, user } = lastCall();
    expect(user).toContain('Ejercicio: Front squat');
    // La dosis se dice con el formateador CANÓNICO, no con uno inventado aquí.
    expect(user).toContain(prescriptionToText(SQUAT));
    expect(user).toContain('Bloque del entreno: Principal');
    // Contexto de LÍNEA: nada de la sesión se cuela.
    expect(user).not.toContain('Wall balls');
    expect(system).toContain('NOTA DE UN EJERCICIO');
  });

  test('una prescripción que el esquema estricto no acepta no tumba la petición', async () => {
    llm.configured = true;
    llm.call.mockResolvedValue({ suggestions: ['Empieza cómodo.'] });

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: {
        surface: 'item_note',
        context: { exercise_name: 'Front squat', prescription: { scheme: 'sets', inventado: true } },
      },
    });

    expect(res.source).toBe('ai');
    expect(lastCall().user).toContain('Dosis prescrita: (todavía sin poner)');
  });

  test('recorta al tope de la nota de línea', async () => {
    llm.configured = true;
    llm.call.mockResolvedValue({ suggestions: ['b'.repeat(ITEM_NOTES_MAX + 80)] });

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'item_note', context: { exercise_name: 'Front squat' } },
    });

    expect(res.suggestions[0]!.length).toBe(ITEM_NOTES_MAX);
  });
});

describe('bordes', () => {
  test.each([
    ['excepción del modelo', () => llm.call.mockRejectedValue(new Error('502'))],
    ['JSON con otra forma', () => llm.call.mockResolvedValue({ nope: true })],
    ['lista vacía', () => llm.call.mockResolvedValue({ suggestions: ['  ', ''] })],
  ])('%s → borrador estático, nunca un error al coach', async (_label, arrange) => {
    llm.configured = true;
    arrange();

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'item_note', context: { exercise_name: 'Front squat' } },
    });

    expect(res.source).toBe('fallback');
    expect(res.suggestions).toHaveLength(3);
  });

  test('las superficies que NO son notas siguen siendo heurísticas puras', async () => {
    llm.configured = true;

    const res = await suggestFreeText({
      coach_id: COACH_ID,
      body: { surface: 'block_title', context: { format: 'strength_block', items_count: 4 } },
    });

    // `block_title` es alias de `block_name` — el alias sigue vivo.
    expect(res.source).toBe('fallback');
    expect(res.suggestions).toContain('Principal');
    expect(llm.call).not.toHaveBeenCalled();
  });

  test('una superficie desconocida es un 400, no un borrador falso', async () => {
    await expect(
      suggestFreeText({ coach_id: COACH_ID, body: { surface: 'lo_que_sea', context: {} } }),
    ).rejects.toBeInstanceOf(TextSuggestError);
  });

  test('un contexto que no cuadra con su superficie es un 400', async () => {
    await expect(
      suggestFreeText({
        coach_id: COACH_ID,
        body: { surface: 'coach_note', context: { blocks: 'no soy una lista' } },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('limpieza de los borradores', () => {
  test('quita guiones largos, espacios dobles, repetidas y vacías, y deja como mucho tres', () => {
    const out = cleanSuggestions(
      [
        'Cuida  la  técnica — sin prisa',
        'Cuida la técnica, sin prisa', // misma frase ya normalizada → una sola
        '   ',
        'Baja la carga si vienes cargado',
        'Sal con sensación de poder más',
        'Una cuarta que sobra',
      ],
      'item_note',
    );

    expect(out).toEqual([
      'Cuida la técnica, sin prisa',
      'Baja la carga si vienes cargado',
      'Sal con sensación de poder más',
    ]);
    expect(out.join(' ')).not.toContain('—');
  });
});
