import {
  emptyDefinition,
  emptyQuestion,
  emptyStep,
  newOnboardingId,
  slugifyOnboardingKey,
  type OnboardingFormDefinition,
  type OnboardingQuestion,
  type OnboardingQuestionType,
} from '@fahybrid/shared/domain/coach/onboarding-form';
import type { OnboardingFormRecord } from '@fahybrid/shared/schema/coach-onboarding';

export interface FormDraft {
  id: string | null;
  name: string;
  destination_email: string;
  is_default: boolean;
  definition: OnboardingFormDefinition;
}

export function emptyFormDraft(): FormDraft {
  return {
    id: null,
    name: '',
    destination_email: '',
    is_default: false,
    definition: emptyDefinition(),
  };
}

export function recordToDraft(form: OnboardingFormRecord): FormDraft {
  return {
    id: form.id,
    name: form.name,
    destination_email: form.destination_email ?? '',
    is_default: form.is_default,
    definition: form.definition,
  };
}

function mapSteps(
  def: OnboardingFormDefinition,
  map: (step: OnboardingFormDefinition['steps'][number], si: number) => OnboardingFormDefinition['steps'][number],
): OnboardingFormDefinition {
  return { steps: def.steps.map(map) };
}

export function setStepTitle(
  def: OnboardingFormDefinition,
  si: number,
  title: string,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => (i === si ? { ...step, title } : step));
}

export function addStep(def: OnboardingFormDefinition): OnboardingFormDefinition {
  return { steps: [...def.steps, emptyStep()] };
}

export function removeStep(def: OnboardingFormDefinition, si: number): OnboardingFormDefinition {
  if (def.steps.length <= 1) return def;
  return { steps: def.steps.filter((_, i) => i !== si) };
}

export function addQuestion(def: OnboardingFormDefinition, si: number): OnboardingFormDefinition {
  return mapSteps(def, (step, i) =>
    i === si ? { ...step, questions: [...step.questions, emptyQuestion('text')] } : step,
  );
}

export function removeQuestion(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => {
    if (i !== si || step.questions.length <= 1) return step;
    return { ...step, questions: step.questions.filter((_, j) => j !== qi) };
  });
}

export function patchQuestion(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
  patch: Partial<OnboardingQuestion>,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => {
    if (i !== si) return step;
    return {
      ...step,
      questions: step.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)),
    };
  });
}

export function setQuestionType(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
  type: OnboardingQuestionType,
): OnboardingFormDefinition {
  const needsOptions = type === 'single' || type === 'multi';
  return mapSteps(def, (step, i) => {
    if (i !== si) return step;
    return {
      ...step,
      questions: step.questions.map((q, j) => {
        if (j !== qi) return q;
        return {
          ...q,
          type,
          options: needsOptions
            ? q.options.length >= 2
              ? q.options
              : [
                  { code: 'opcion_a', label: q.options[0]?.label ?? '' },
                  { code: 'opcion_b', label: '' },
                ]
            : [],
        };
      }),
    };
  });
}

export function addOption(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => {
    if (i !== si) return step;
    return {
      ...step,
      questions: step.questions.map((q, j) => {
        if (j !== qi) return q;
        return {
          ...q,
          options: [...q.options, { code: slugifyOnboardingKey(newOnboardingId('o')), label: '' }],
        };
      }),
    };
  });
}

export function removeOption(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
  oi: number,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => {
    if (i !== si) return step;
    return {
      ...step,
      questions: step.questions.map((q, j) => {
        if (j !== qi || q.options.length <= 2) return q;
        return { ...q, options: q.options.filter((_, k) => k !== oi) };
      }),
    };
  });
}

export function patchOption(
  def: OnboardingFormDefinition,
  si: number,
  qi: number,
  oi: number,
  label: string,
): OnboardingFormDefinition {
  return mapSteps(def, (step, i) => {
    if (i !== si) return step;
    return {
      ...step,
      questions: step.questions.map((q, j) => {
        if (j !== qi) return q;
        return {
          ...q,
          options: q.options.map((opt, k) => (k === oi ? { ...opt, label } : opt)),
        };
      }),
    };
  });
}
