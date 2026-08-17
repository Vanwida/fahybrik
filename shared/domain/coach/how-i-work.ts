// Cómo trabaja el coach: texto suyo y/o su PDF de método.
//
// Vacío = aún no ha dicho cómo trabaja. Plan/chat/MCP no lo imitan. No hay
// defecto de escuela: no se copia a otro club ni se inventa un método.
// Papers y zonas no viven aquí (docs/metodologia-coach.html).
//
// Puro y sin I/O.

export const HOW_I_WORK_BODY_MAX = 8_000;
export const HOW_I_WORK_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const HOW_I_WORK_PDF_MIME = 'application/pdf';
export const HOW_I_WORK_PDF_FILENAME_MAX = 200;

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export interface HowIWorkPdfMeta {
  filename: string;
  byte_size: number;
  uploaded_at: string;
}

export interface HowIWork {
  body_text: string | null;
  pdf: HowIWorkPdfMeta | null;
}

export function emptyHowIWork(): HowIWork {
  return { body_text: null, pdf: null };
}

/** Recorta. Solo espacios = null. */
export function normalizeHowIWorkText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Hay método que imitar: texto no vacío o PDF propio. */
export function hasHowIWorkMethod(input: {
  body_text?: string | null;
  has_pdf?: boolean;
}): boolean {
  return normalizeHowIWorkText(input.body_text) !== null || input.has_pdf === true;
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

export function sanitizePdfFilename(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop()?.trim() || 'metodo.pdf';
  const stripped = base.replace(/[^\w.\- ()áéíóúÁÉÍÓÚñÑüÜ]+/g, '_').slice(0, HOW_I_WORK_PDF_FILENAME_MAX);
  if (stripped.toLowerCase().endsWith('.pdf') && stripped.length > 4) return stripped;
  const withExt = `${stripped.replace(/\.+$/, '') || 'metodo'}.pdf`;
  return withExt.slice(0, HOW_I_WORK_PDF_FILENAME_MAX);
}

export type HowIWorkPdfErrorCode =
  | 'empty_file'
  | 'file_too_large'
  | 'unsupported_file_type'
  | 'invalid_pdf';

export function validateHowIWorkPdf(input: {
  mime: string;
  byte_size: number;
  filename: string;
  bytes?: Uint8Array;
}): { ok: true; filename: string } | { ok: false; code: HowIWorkPdfErrorCode } {
  if (input.byte_size <= 0) return { ok: false, code: 'empty_file' };
  if (input.byte_size > HOW_I_WORK_PDF_MAX_BYTES) return { ok: false, code: 'file_too_large' };
  const mime = input.mime.toLowerCase();
  const name = input.filename.toLowerCase();
  if (mime !== HOW_I_WORK_PDF_MIME && !name.endsWith('.pdf')) {
    return { ok: false, code: 'unsupported_file_type' };
  }
  if (input.bytes && !looksLikePdf(input.bytes)) {
    return { ok: false, code: 'invalid_pdf' };
  }
  return { ok: true, filename: sanitizePdfFilename(input.filename) };
}
