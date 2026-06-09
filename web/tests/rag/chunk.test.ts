import { describe, expect, test } from 'vitest';
import { chunkDocument } from '@/lib/rag/chunk';
import { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, APPROX_CHARS_PER_TOKEN } from '@/lib/rag/schema';

const TARGET_CHARS = CHUNK_TARGET_TOKENS * APPROX_CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;

describe('chunkDocument', () => {
  test('returns empty array for empty/whitespace-only input', () => {
    expect(chunkDocument('')).toEqual([]);
    expect(chunkDocument('   \n\n  \t  ')).toEqual([]);
  });

  test('keeps a small document as a single chunk', () => {
    const input = 'El bloque ACC dura 3 semanas. Volumen alto, intensidad media.';
    const out = chunkDocument(input);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('bloque ACC');
  });

  test('respects target chunk size on long input', () => {
    const paragraph = 'Frase corta. '.repeat(40); // ~520 chars
    const input = Array(20).fill(paragraph).join('\n\n');
    const out = chunkDocument(input);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.length).toBeLessThanOrEqual(TARGET_CHARS + OVERLAP_CHARS); // overlap can exceed target slightly
    }
  });

  test('produces overlap between consecutive chunks', () => {
    // Many distinct paragraphs so the chunker actually splits.
    const paragraphs: string[] = [];
    for (let i = 0; i < 60; i++) {
      paragraphs.push(
        `Párrafo número ${i}. ` +
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      );
    }
    const out = chunkDocument(paragraphs.join('\n\n'));
    expect(out.length).toBeGreaterThan(1);
    for (let i = 1; i < out.length; i++) {
      const prev_tail = out[i - 1].slice(-OVERLAP_CHARS);
      const curr = out[i];
      const overlap = prev_tail
        .split(/\s+/)
        .filter((w) => w.length >= 6)
        .find((w) => curr.includes(w));
      expect(overlap, `chunk ${i} should share content with chunk ${i - 1}`).toBeDefined();
    }
  });

  test('handles a single oversized paragraph by sentence-splitting it', () => {
    const sentences = Array(30)
      .fill('Frase larga con suficiente contenido para forzar la división por punto.')
      .join(' ');
    const out = chunkDocument(sentences);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.length).toBeLessThanOrEqual(TARGET_CHARS + OVERLAP_CHARS);
    }
  });

  test('normalizes Windows line endings and collapses excessive blank lines', () => {
    const input = 'Línea 1.\r\n\r\n\r\n\r\n\r\nLínea 2.';
    const out = chunkDocument(input);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe('Línea 1.\n\nLínea 2.');
  });
});
