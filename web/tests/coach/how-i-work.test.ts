/**
 * Cómo trabajo — vacío = no imitar. El GET de B no ve lo de A.
 * Guardar y releer texto. PDF se valida antes de persistir.
 */
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  HOW_I_WORK_BODY_MAX,
  HOW_I_WORK_PDF_MAX_BYTES,
  emptyHowIWork,
  hasHowIWorkMethod,
  looksLikePdf,
  normalizeHowIWorkText,
  sanitizePdfFilename,
  validateHowIWorkPdf,
} from '@fahybrid/shared/domain/coach/how-i-work';
import { coachHowIWorkPutSchema } from '@fahybrid/shared/schema/coach-how-i-work';
import {
  deleteHowIWorkPdf,
  getHowIWork,
  getHowIWorkPdfBytes,
  putHowIWorkPdf,
  upsertHowIWorkText,
} from '@/lib/coach/how-i-work';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

interface StoredRow {
  body_text: string | null;
  pdf_filename: string | null;
  pdf_mime: string | null;
  pdf_bytes: Uint8Array | null;
  pdf_byte_size: number | null;
  pdf_uploaded_at: string | null;
  updated_at: string;
}

function sqlByCoach() {
  const rows = new Map<number, StoredRow>();
  return createFakeSql((text, values) => {
    const coachId = Number(values[0]);
    if (text.includes('delete from coach_how_i_work')) {
      rows.delete(coachId);
      return [];
    }
    if (text.includes('insert into coach_how_i_work')) {
      const existing = rows.get(coachId);
      if (text.includes('pdf_bytes')) {
        const next: StoredRow = {
          body_text: existing?.body_text ?? (values[1] as string | null),
          pdf_filename: String(values[2]),
          pdf_mime: 'application/pdf',
          pdf_bytes: values[4] as Uint8Array,
          pdf_byte_size: Number(values[5]),
          pdf_uploaded_at: '2026-08-17T10:00:00.000Z',
          updated_at: '2026-08-17T10:00:00.000Z',
        };
        rows.set(coachId, next);
        return [next];
      }
      const next: StoredRow = {
        body_text: (values[1] as string | null) ?? null,
        pdf_filename: existing?.pdf_filename ?? null,
        pdf_mime: existing?.pdf_mime ?? null,
        pdf_bytes: existing?.pdf_bytes ?? null,
        pdf_byte_size: existing?.pdf_byte_size ?? null,
        pdf_uploaded_at: existing?.pdf_uploaded_at ?? null,
        updated_at: '2026-08-17T10:00:00.000Z',
      };
      rows.set(coachId, next);
      return [next];
    }
    if (text.includes('update coach_how_i_work')) {
      const existing = rows.get(coachId);
      if (!existing) return [];
      const next: StoredRow = {
        ...existing,
        pdf_filename: null,
        pdf_mime: null,
        pdf_bytes: null,
        pdf_byte_size: null,
        pdf_uploaded_at: null,
        updated_at: '2026-08-17T11:00:00.000Z',
      };
      rows.set(coachId, next);
      return [next];
    }
    if (text.includes('from coach_how_i_work')) {
      const row = rows.get(coachId);
      return row ? [row] : [];
    }
    return [];
  });
}

describe('hasHowIWorkMethod — vacío no imita', () => {
  test('sin texto ni PDF es vacío', () => {
    expect(hasHowIWorkMethod({})).toBe(false);
    expect(hasHowIWorkMethod({ body_text: null, has_pdf: false })).toBe(false);
    expect(hasHowIWorkMethod({ body_text: '   ', has_pdf: false })).toBe(false);
    expect(emptyHowIWork()).toEqual({ body_text: null, pdf: null });
  });

  test('texto o PDF basta para imitar', () => {
    expect(hasHowIWorkMethod({ body_text: 'Primero estaciones', has_pdf: false })).toBe(true);
    expect(hasHowIWorkMethod({ body_text: '', has_pdf: true })).toBe(true);
  });

  test('recorta espacios', () => {
    expect(normalizeHowIWorkText('  hola  ')).toBe('hola');
    expect(normalizeHowIWorkText('\n\t')).toBeNull();
  });
});

describe('vacío no copia a otro coach', () => {
  test('A guarda texto; B sin fila sigue vacío', async () => {
    const sql = sqlByCoach();
    const saved = await upsertHowIWorkText(10, 'Si el sueño es malo, bajo intensidad', sql);
    expect(saved.has_method).toBe(true);
    expect(saved.body_text).toBe('Si el sueño es malo, bajo intensidad');

    const empty = await getHowIWork(11, sql);
    expect(empty.has_method).toBe(false);
    expect(empty.body_text).toBeNull();
    expect(empty.pdf).toBeNull();
  });
});

describe('guardar y releer', () => {
  test('GET posterior devuelve el texto escrito', async () => {
    const sql = sqlByCoach();
    await upsertHowIWorkText(7, 'Hablo de tú', sql);
    const read = await getHowIWork(7, sql);
    expect(read.has_method).toBe(true);
    expect(read.body_text).toBe('Hablo de tú');
  });

  test('texto vacío sin PDF borra la fila', async () => {
    const sql = sqlByCoach();
    await upsertHowIWorkText(3, 'algo', sql);
    const cleared = await upsertHowIWorkText(3, '   ', sql);
    expect(cleared.has_method).toBe(false);
    expect(cleared.body_text).toBeNull();
    expect((await getHowIWork(3, sql)).has_method).toBe(false);
  });

  test('PDF solo cuenta como método; B no lo descarga', async () => {
    const sql = sqlByCoach();
    const saved = await putHowIWorkPdf(
      4,
      { filename: 'metodo.pdf', bytes: PDF_BYTES, byte_size: PDF_BYTES.length },
      sql,
    );
    expect(saved.has_method).toBe(true);
    expect(saved.pdf?.filename).toBe('metodo.pdf');

    expect((await getHowIWork(5, sql)).has_method).toBe(false);
    expect(await getHowIWorkPdfBytes(5, sql)).toBeNull();
    expect((await getHowIWorkPdfBytes(4, sql))?.byte_size).toBe(PDF_BYTES.length);
  });

  test('quitar el PDF con texto conserva el texto', async () => {
    const sql = sqlByCoach();
    await upsertHowIWorkText(8, 'Primero estaciones', sql);
    await putHowIWorkPdf(
      8,
      { filename: 'm.pdf', bytes: PDF_BYTES, byte_size: PDF_BYTES.length },
      sql,
    );
    const after = await deleteHowIWorkPdf(8, sql);
    expect(after.has_method).toBe(true);
    expect(after.body_text).toBe('Primero estaciones');
    expect(after.pdf).toBeNull();
  });
});

describe('coachHowIWorkPutSchema', () => {
  test('acepta texto y rechaza extras o exceso', () => {
    expect(coachHowIWorkPutSchema.safeParse({ body_text: '' }).success).toBe(true);
    expect(coachHowIWorkPutSchema.safeParse({ body_text: 'x'.repeat(HOW_I_WORK_BODY_MAX) }).success).toBe(
      true,
    );
    expect(
      coachHowIWorkPutSchema.safeParse({ body_text: 'x'.repeat(HOW_I_WORK_BODY_MAX + 1) }).success,
    ).toBe(false);
    expect(coachHowIWorkPutSchema.safeParse({ body_text: 'ok', coach_id: 1 }).success).toBe(false);
    expect(coachHowIWorkPutSchema.safeParse({ philosophy: 'no' }).success).toBe(false);
  });
});

describe('validateHowIWorkPdf', () => {
  test('acepta un PDF real y rechaza el resto', () => {
    expect(
      validateHowIWorkPdf({
        mime: 'application/pdf',
        byte_size: PDF_BYTES.length,
        filename: 'Metodo.pdf',
        bytes: PDF_BYTES,
      }).ok,
    ).toBe(true);
    expect(
      validateHowIWorkPdf({
        mime: 'image/png',
        byte_size: 10,
        filename: 'foto.png',
        bytes: new Uint8Array([1, 2, 3]),
      }).ok,
    ).toBe(false);
    expect(
      validateHowIWorkPdf({
        mime: 'application/pdf',
        byte_size: HOW_I_WORK_PDF_MAX_BYTES + 1,
        filename: 'gordo.pdf',
      }).ok,
    ).toBe(false);
    expect(
      validateHowIWorkPdf({
        mime: 'application/pdf',
        byte_size: 4,
        filename: 'falso.pdf',
        bytes: new Uint8Array([1, 2, 3, 4]),
      }).ok,
    ).toBe(false);
    expect(looksLikePdf(PDF_BYTES)).toBe(true);
    expect(sanitizePdfFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
  });
});
