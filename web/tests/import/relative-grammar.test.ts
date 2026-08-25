/**
 * Card 130 pieza 4 — el importador lee un objetivo relativo del texto del coach.
 * Las líneas son las formas del ciclo real. Fiel o revisión. Sin kilos inventados.
 */
import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { parseRelativeTarget } from '@fahybrid/shared/domain/import/relative';
import { dictionaryFromRows } from '@fahybrid/shared/domain/coach/phrase-dictionary';

describe('gramática de objetivos relativos', () => {
  test('«a peso de competición» en el trineo → competition_load, sin kilos', () => {
    const [l] = parseNotationCell('50 m Sled push a peso de competición');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'competition_load', station: 'hyrox-sled-push' },
    });
  });

  test('«5-10 kg por encima del peso de competición» guarda el delta escrito', () => {
    const [l] = parseNotationCell('15 m Sled push con 5-10 kg por encima del peso de competición');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'competition_load', station: 'hyrox-sled-push' },
      delta_kg: 5,
      delta_kg_max: 10,
    });
  });

  test('«al 50 % del peso corporal» no es peso corporal a secas', () => {
    const [l] = parseNotationCell('4 x 20 m al 50 % del peso corporal');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'bodyweight' },
      percent: 50,
    });
  });

  test('«1000 m Run a ritmo HYROX» no es un WOD por llevar HYROX', () => {
    const [l] = parseNotationCell('1000 m Run a ritmo HYROX');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'race_pace', modality: 'run' },
    });
  });

  test('«Z4 de remo» sigue siendo zona, no un relativo', () => {
    const [l] = parseNotationCell('10 min remo Z4');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 4 });
  });

  test('«al 60 % del peso de competición» no se lee como %1RM', () => {
    const [l] = parseNotationCell('3 x 12 m Sled push al 60 % del peso de competición');
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'competition_load', station: 'hyrox-sled-push' },
      percent: 60,
    });
    expect(l!.prescription.sets?.[0]?.target?.kind).not.toBe('percent_rm');
  });

  test('peso de competición sin estación no se adivina', () => {
    const [l] = parseNotationCell('3 x 25 reps a peso de competición');
    expect(l!.confidence).toBe('review');
    expect(l!.review_reasons.join(' ')).toMatch(/estación/i);
  });

  test('«por encima» sin kilos no inventa el delta', () => {
    const [l] = parseNotationCell('3 x 30 m Sandbag lunge por encima del peso de competición');
    expect(l!.confidence).toBe('review');
    expect(l!.review_reasons.join(' ')).toMatch(/no se inventa/);
  });

  test('«carga media» sin diccionario va a revisión', () => {
    const [l] = parseNotationCell('6 x 15 m Sled push a carga media');
    expect(l!.confidence).toBe('review');
    expect(l!.review_reasons.join(' ')).toMatch(/diccionario/);
  });

  test('«carga media» una vez traducida se reutiliza', () => {
    const dictionary = dictionaryFromRows([
      {
        phrase: 'carga media',
        phrase_key: 'carga media',
        as: 'competition_percent',
        value: 60,
      },
    ]);
    const [l] = parseNotationCell('6 x 15 m Sled push a carga media', { phraseDictionary: dictionary });
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'competition_load', station: 'hyrox-sled-push' },
      percent: 60,
    });
  });

  test('SkiErg a split de carrera ancla el ritmo al ski', () => {
    const [l] = parseNotationCell(`SkiErg 3x1000 m a split de carrera, rec 3'`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.target).toEqual({
      kind: 'relative',
      ref: { of: 'race_pace', modality: 'ski' },
    });
  });

  test('all-out sigue en revisión: no hay referencia para eso', () => {
    const [l] = parseNotationCell('SkiErg 1000 m all-out');
    expect(l!.confidence).toBe('review');
  });
});

describe('parseRelativeTarget es fiel al texto', () => {
  test('no fabrica un porcentaje que el texto no escribió', () => {
    expect(parseRelativeTarget('Sled push a peso de competición').status).toBe('target');
    const t = parseRelativeTarget('Sled push a peso de competición');
    if (t.status !== 'target' || t.target.kind !== 'relative') throw new Error('expected relative');
    expect(t.target.percent).toBeUndefined();
    expect(t.target.delta_kg).toBeUndefined();
  });
});
