import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseUpload, UnsupportedFormatError } from '@/lib/rag/parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Real corpus PDF (Pablo's master doc) lives at repo-root /docs.
const SAMPLE_PDF = resolve(__dirname, '../../../docs/Documento_Maestro_Proyecto.pdf');

describe('parseUpload', () => {
  test('passes through plain text and markdown untouched', async () => {
    const text = 'El bloque ACC dura 3 semanas.';
    const out = await parseUpload({
      mime_type: 'text/plain',
      buffer: Buffer.from(text, 'utf-8'),
    });
    expect(out.text).toBe(text);
    expect(out.mime_type).toBe('text/plain');
    expect(out.byte_size).toBe(Buffer.byteLength(text));
  });

  test('rejects unsupported mime types', async () => {
    await expect(
      parseUpload({ mime_type: 'image/png', buffer: Buffer.from([0]) }),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  // The PDF extractor is the core of the RAG ingest path. Pablo's methodology
  // (his IP) enters the system through here, so a regression that drops content
  // would silently degrade every Pablo-IA answer. This test guards extraction
  // quality against the real master document via pdfjs-dist.
  const pdfTest = existsSync(SAMPLE_PDF) ? test : test.skip;
  pdfTest(
    'extracts the methodology corpus PDF with structure preserved',
    async () => {
      const buffer = readFileSync(SAMPLE_PDF);
      const out = await parseUpload({
        mime_type: 'application/pdf',
        buffer,
      });

      expect(out.mime_type).toBe('application/pdf');
      expect(out.byte_size).toBe(buffer.byteLength);

      // Substantive extraction: the doc is ~6.4k words / ~40k chars.
      expect(out.text.length).toBeGreaterThan(30_000);
      const words = out.text.match(/\S+/g) ?? [];
      expect(words.length).toBeGreaterThan(5_000);

      // Domain/IP vocabulary must survive extraction.
      expect(out.text).toContain('HYROX');
      expect(out.text).toContain('Pablo');

      // No mojibake / replacement chars from a broken encoding path.
      expect(out.text).not.toContain('�');

      // Paragraph structure is preserved so the chunker can split sensibly.
      const paragraphs = out.text.split(/\n{2,}/).filter((p) => p.trim());
      expect(paragraphs.length).toBeGreaterThan(20);
    },
    30_000,
  );
});
