import { describe, expect, test } from 'vitest';
import {
  healthkitActivityTitle,
  healthkitActivityToModality,
} from '@/lib/sync/healthkit-activity';

describe('healthkitActivityToModality', () => {
  test('mapea los enteros estables de Apple a nuestros cubos', () => {
    expect(healthkitActivityToModality(37)).toBe('run');
    // Walking (52) no es run: un paseo a 17 min/km envenena volumen y ritmos.
    // Criterio del mapeo + reparación del histórico (mig 0192).
    expect(healthkitActivityToModality(52)).toBe('other');
    expect(healthkitActivityToModality(35)).toBe('row');
    expect(healthkitActivityToModality(60)).toBe('ski');
    expect(healthkitActivityToModality(13)).toBe('bike');
    expect(healthkitActivityToModality(20)).toBe('strength');
    expect(healthkitActivityToModality(50)).toBe('strength');
  });

  test('lo que no entra es other, no un cubo nuevo', () => {
    expect(healthkitActivityToModality(57)).toBe('other');
    expect(healthkitActivityToModality(3000)).toBe('other');
    expect(healthkitActivityToModality(null)).toBe('other');
    expect(healthkitActivityToModality(undefined)).toBe('other');
  });

  test('el título es para el atleta, no el raw value', () => {
    expect(healthkitActivityTitle(37)).toBe('Carrera');
    expect(healthkitActivityTitle(null)).toBe('Entreno');
  });
});
