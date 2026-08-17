import { describe, expect, test } from 'vitest';
import { methodologySourceType } from '@fahybrid/shared/schema/_primitives';
import {
  ingestTextRequestSchema,
  METHODOLOGY_CORPUS_SOURCE_TYPES,
  PAPER_SOURCE_TYPE,
  resolveCorpusSourceTypes,
} from '@/lib/rag/schema';

describe('resolveCorpusSourceTypes', () => {
  test('sin filtro: método, nunca paper', () => {
    expect(resolveCorpusSourceTypes()).toEqual([...METHODOLOGY_CORPUS_SOURCE_TYPES]);
    expect(resolveCorpusSourceTypes([])).toEqual([...METHODOLOGY_CORPUS_SOURCE_TYPES]);
    expect(resolveCorpusSourceTypes()).not.toContain(PAPER_SOURCE_TYPE);
  });

  test('con filtro explícito: respeta lo pedido, incluido paper', () => {
    expect(resolveCorpusSourceTypes(['paper'])).toEqual(['paper']);
    expect(resolveCorpusSourceTypes(['text', 'paper'])).toEqual(['text', 'paper']);
  });

  test('el enum compartido admite paper', () => {
    expect(methodologySourceType.parse('paper')).toBe('paper');
    expect(methodologySourceType.safeParse('scientific').success).toBe(false);
  });

  test('la ingesta de método rechaza paper', () => {
    expect(
      ingestTextRequestSchema.safeParse({
        title: 'Z2',
        source_type: 'paper',
        raw_content: 'literatura',
      }).success,
    ).toBe(false);
    expect(
      ingestTextRequestSchema.safeParse({
        title: 'Z2',
        source_type: 'text',
        raw_content: 'cómo programo',
      }).success,
    ).toBe(true);
  });
});
