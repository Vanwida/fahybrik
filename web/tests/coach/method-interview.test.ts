/**
 * Entrevista «Cómo entrenas»: catálogo cerrado, espejo determinista,
 * PUT que regenera o conserva el párrafo editado.
 */
import { describe, expect, test } from 'vitest';
import {
  CHAPTER_IDS,
  INTERVIEW_CHAPTERS,
  INTERVIEW_QUESTION_COUNT,
  INTERVIEW_QUESTIONS,
  MULTI_FIELDS,
  NOTE_FIELDS,
  OPTION_IDS,
  SINGLE_FIELDS,
  SPEC_EXAMPLE_MIRROR,
  answeredQuestionCount,
  applyInterviewUpdate,
  emptyInterview,
  generateMirror,
  hasMethodInterview,
  normalizeAnswers,
  normalizeMulti,
  specExampleAnswers,
} from '@fahybrid/shared/domain/coach/method-interview';
import { coachMethodInterviewPutSchema } from '@fahybrid/shared/schema/coach-method-interview';
import { mirrorCoversCatalog } from '@fahybrid/shared/domain/coach/method-interview-mirror';

describe('catálogo', () => {
  test('siete capítulos y 34 preguntas, sin ids sueltos', () => {
    expect(CHAPTER_IDS).toHaveLength(7);
    expect(INTERVIEW_CHAPTERS).toHaveLength(7);
    expect(INTERVIEW_QUESTIONS).toHaveLength(34);
    expect(INTERVIEW_QUESTION_COUNT).toBe(34);
    expect(SINGLE_FIELDS).toHaveLength(33);
    expect(MULTI_FIELDS).toEqual(['tests_used']);
    expect(NOTE_FIELDS).toHaveLength(4);

    const questionIds = INTERVIEW_QUESTIONS.map((q) => q.id).sort();
    const fieldIds = [...SINGLE_FIELDS, ...MULTI_FIELDS].slice().sort();
    expect(questionIds).toEqual(fieldIds);
  });

  test('cada opción del catálogo está en OPTION_IDS', () => {
    for (const q of INTERVIEW_QUESTIONS) {
      const allowed = OPTION_IDS[q.id as keyof typeof OPTION_IDS];
      expect(allowed, q.id).toBeDefined();
      expect(q.options.map((o) => o.id).sort()).toEqual([...allowed].sort());
    }
  });

  test('las cláusulas del espejo cubren las opciones del ejemplo y las hermanas', () => {
    expect(mirrorCoversCatalog()).toEqual([]);
  });
});

describe('generateMirror', () => {
  test('vacío es cadena vacía: la IA no imita', () => {
    expect(generateMirror(emptyInterview().answers)).toBe('');
    expect(hasMethodInterview(emptyInterview())).toBe(false);
  });

  test('el párrafo de la spec sale de esas trece casillas, bit a bit', () => {
    const answers = normalizeAnswers(specExampleAnswers());
    expect(generateMirror(answers)).toBe(SPEC_EXAMPLE_MIRROR);
    expect(generateMirror(answers)).toBe(generateMirror(answers));
    expect(answeredQuestionCount(answers)).toBe(13);
    expect(hasMethodInterview({ generated_mirror: SPEC_EXAMPLE_MIRROR })).toBe(true);
  });

  test('una nota sustituye la cláusula cuando ninguna casilla cubre', () => {
    const answers = normalizeAnswers({
      typical_day: 'depends',
      typical_day_other: 'un combinate de trail y force',
    });
    expect(generateMirror(answers)).toContain('un combinate de trail y force');
    expect(generateMirror(answers)).not.toContain('no hay un típico');
  });

  test('casi no testeo no convive con tests concretos', () => {
    expect(normalizeMulti('tests_used', ['almost_no_tests', 'threshold'])).toEqual(['threshold']);
    const answers = normalizeAnswers({ tests_used: ['almost_no_tests'] });
    expect(generateMirror(answers)).toBe('Casi no testeas: miras entrenos.');
  });
});

describe('applyInterviewUpdate', () => {
  test('sin edición previa, cambiar casillas regenera el párrafo', () => {
    const first = applyInterviewUpdate(emptyInterview(), {
      answers: normalizeAnswers(specExampleAnswers()),
    });
    expect(first.mirror_text).toBe(SPEC_EXAMPLE_MIRROR);
    expect(first.mirror_is_edited).toBe(false);

    const second = applyInterviewUpdate(first, {
      answers: { ...first.answers, training_days: 'd4' },
    });
    expect(second.generated_mirror).toContain('Semana de 4 días');
    expect(second.mirror_text).toBe(second.generated_mirror);
    expect(second.mirror_is_edited).toBe(false);
  });

  test('si el coach tachó, cambiar casillas conserva su texto', () => {
    const first = applyInterviewUpdate(emptyInterview(), {
      answers: normalizeAnswers(specExampleAnswers()),
      mirror_text: 'Mi sistema, dicho por mí.',
    });
    expect(first.mirror_is_edited).toBe(true);

    const second = applyInterviewUpdate(first, {
      answers: { ...first.answers, training_days: 'd3' },
    });
    expect(second.mirror_text).toBe('Mi sistema, dicho por mí.');
    expect(second.generated_mirror).toContain('Semana de 3 días');
    expect(second.mirror_is_edited).toBe(true);
  });
});

describe('PUT schema', () => {
  test('rechaza una opción que no está en el catálogo', () => {
    const answers = normalizeAnswers(specExampleAnswers());
    const parsed = coachMethodInterviewPutSchema.safeParse({
      answers: { ...answers, typical_day: 'undulating' },
    });
    expect(parsed.success).toBe(false);
  });

  test('acepta el vacío entero', () => {
    const parsed = coachMethodInterviewPutSchema.safeParse({
      answers: emptyInterview().answers,
    });
    expect(parsed.success).toBe(true);
  });
});
