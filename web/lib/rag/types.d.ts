// Minimal ambient declarations for runtime-only deps used in lib/rag/parse.ts.
// We don't need the full surface — just enough for the dynamic imports to
// type-check. (pdfjs-dist ships its own types, so no declaration is needed.)

declare module 'mammoth' {
  interface ExtractRawTextResult {
    value: string;
    messages: Array<{ message: string }>;
  }
  export function extractRawText(opts: {
    buffer: Buffer;
  }): Promise<ExtractRawTextResult>;
}
