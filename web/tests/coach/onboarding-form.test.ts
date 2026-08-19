import { describe, expect, test } from 'vitest';
import {
  definitionIsValid,
  definitionMentionsProductBrand,
  duplicateOnboardingDefinition,
  typicalOnboardingPreset,
  validateDestinationEmail,
  validateOnboardingAnswers,
  validateOnboardingDefinition,
} from '@fahybrid/shared/domain/coach/onboarding-form';

describe('cuestionario de alta', () => {
  test('el típico es válido y no nombra la marca', () => {
    const def = typicalOnboardingPreset();
    expect(validateOnboardingDefinition(def)).toEqual([]);
    expect(definitionIsValid(def)).toBe(true);
    expect(definitionMentionsProductBrand(def)).toBe(false);
  });

  test('duplicar cambia los ids y deja el contenido', () => {
    const def = typicalOnboardingPreset();
    const copy = duplicateOnboardingDefinition(def);
    expect(copy.steps[0]?.title).toBe(def.steps[0]?.title);
    expect(copy.steps[0]?.id).not.toBe(def.steps[0]?.id);
    expect(copy.steps[0]?.questions[0]?.id).not.toBe(def.steps[0]?.questions[0]?.id);
    expect(definitionIsValid(copy)).toBe(true);
  });

  test('el correo se puede vaciar y rechaza basura', () => {
    expect(validateDestinationEmail(null)).toEqual([]);
    expect(validateDestinationEmail('')).toEqual([]);
    expect(validateDestinationEmail('coach@club.com')).toEqual([]);
    expect(validateDestinationEmail('no-es-correo')).toHaveLength(1);
  });

  test('una respuesta obligatoria vacía no vale', () => {
    const def = typicalOnboardingPreset();
    const issues = validateOnboardingAnswers(def, {});
    expect(issues.some((i) => i.path === 'objetivo')).toBe(true);
  });
});
