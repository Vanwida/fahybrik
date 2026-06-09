// Source extractors. Returns plaintext from a binary upload.
//
// `pdfjs-dist` and `mammoth` are loaded dynamically so the rest of the API
// (e.g. retrieval) can run on workers/edges where these aren't bundled.

export class UnsupportedFormatError extends Error {
  constructor(mime: string) {
    super(`Unsupported file type: ${mime}`);
    this.name = 'UnsupportedFormatError';
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface ParsedSource {
  text: string;
  mime_type: string;
  byte_size: number;
}

export async function parseUpload(
  file: { mime_type: string; buffer: Buffer; name?: string },
): Promise<ParsedSource> {
  const mime = file.mime_type.toLowerCase();
  const byte_size = file.buffer.byteLength;

  if (mime === 'text/plain' || mime === 'text/markdown') {
    return {
      text: file.buffer.toString('utf-8'),
      mime_type: mime,
      byte_size,
    };
  }

  if (mime === 'application/pdf') {
    const text = await parsePdf(file.buffer);
    return { text, mime_type: mime, byte_size };
  }

  if (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await parseDocx(file.buffer);
    return { text, mime_type: mime, byte_size };
  }

  throw new UnsupportedFormatError(mime);
}

// Y-coordinate delta (PDF user-space units) above which two text items are
// treated as belonging to different lines. The chunker is paragraph-aware
// (splits on \n{2,}), so emitting line breaks here preserves the document's
// structure for downstream chunking/embeddings.
const PDF_LINE_BREAK_THRESHOLD = 1;

async function parsePdf(buffer: Buffer): Promise<string> {
  // pdfjs-dist's `legacy` build is the Node-compatible (non-DOM) entrypoint.
  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err) {
    throw new ParseError(
      'pdfjs-dist not installed. Run pnpm install in /web. ' +
        (err instanceof Error ? err.message : ''),
    );
  }
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // Text-only extraction — lean on system fonts so we never need to fetch
      // remote font/cMap assets (we only read textContent, never render).
      useSystemFonts: true,
    }).promise;

    const pages: string[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        let pageText = '';
        let lastY: number | null = null;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > PDF_LINE_BREAK_THRESHOLD) {
            pageText += '\n';
          }
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
          lastY = y;
        }
        pages.push(pageText.trim());
        page.cleanup();
      }
    } finally {
      await doc.destroy();
    }

    // Page boundaries become paragraph breaks so the chunker doesn't run two
    // pages' content together.
    return pages.join('\n\n').trim();
  } catch (err) {
    throw new ParseError(
      `Could not parse PDF: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  let mod: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
  try {
    mod = (await import('mammoth')) as unknown as typeof mod;
  } catch (err) {
    throw new ParseError(
      'mammoth not installed. Run pnpm install in /web. ' +
        (err instanceof Error ? err.message : ''),
    );
  }
  try {
    const out = await mod.extractRawText({ buffer });
    return (out.value ?? '').trim();
  } catch (err) {
    throw new ParseError(
      `Could not parse DOCX: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

export function inferSourceType(
  mime: string,
):
  | 'text'
  | 'document_upload'
  | 'interview_transcript'
  | 'voice_note' {
  if (mime === 'text/plain' || mime === 'text/markdown') return 'text';
  return 'document_upload';
}
