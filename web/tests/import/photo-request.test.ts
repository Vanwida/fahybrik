/**
 * PURE request-validation for the photo-import endpoints — no DB, no I/O.
 * Same style as ./request-validation.test.ts: pins the wire shape of
 * `POST /api/coach/import/upload-url` and the `mode: 'photo'` branch of
 * `POST /api/coach/import/proposal`.
 *
 * Contract note: unlike a naive "client sends a URL" design, an image
 * reference in the photo mode is a PATHNAME upload-url itself signed and
 * returned (`import-photos/<coach_id>/…`) — never a client-chosen URL. So
 * the "reject a foreign host" concern doesn't test a URL allowlist; it tests
 * the pathname's OWNER segment, which is what `resolvePhotoImages`
 * (lib/import/proposal-service.ts) checks before ever asking Blob for it.
 */
import { describe, expect, test } from 'vitest';
import {
  importPhotoRequestSchema,
  importPhotoPathnameOwner,
  IMPORT_PHOTO_MAX_IMAGES,
} from '@/lib/import/proposal-service';
import { importPhotoUploadUrlSchema } from '@/app/api/coach/import/upload-url/route';
import { visionReadingNotice } from '@/lib/dashboard/coach/ai/week-notices';

describe('importPhotoUploadUrlSchema', () => {
  const base = { mime_type: 'image/jpeg', size_bytes: 500_000 };

  test('accepts a minimal valid announcement', () => {
    expect(importPhotoUploadUrlSchema.safeParse(base).success).toBe(true);
  });

  test.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])(
    'accepts %s',
    (mime_type) => {
      expect(importPhotoUploadUrlSchema.safeParse({ ...base, mime_type }).success).toBe(true);
    },
  );

  test('rejects an unsupported MIME (e.g. a video disguised as an image request)', () => {
    const r = importPhotoUploadUrlSchema.safeParse({ ...base, mime_type: 'video/mp4' });
    expect(r.success).toBe(false);
  });
  test('rejects an SVG (scriptable, never allowed for a photo upload)', () => {
    expect(
      importPhotoUploadUrlSchema.safeParse({ ...base, mime_type: 'image/svg+xml' }).success,
    ).toBe(false);
  });
  test('rejects a size over the per-file ceiling', () => {
    const r = importPhotoUploadUrlSchema.safeParse({ ...base, size_bytes: 16 * 1024 * 1024 });
    expect(r.success).toBe(false);
  });
  test('rejects a non-positive size', () => {
    expect(importPhotoUploadUrlSchema.safeParse({ ...base, size_bytes: 0 }).success).toBe(false);
  });
  test('rejects unknown keys (.strict)', () => {
    expect(
      importPhotoUploadUrlSchema.safeParse({ ...base, filename: 'foto.jpg' }).success,
    ).toBe(false);
  });
});

describe('importPhotoRequestSchema', () => {
  const base = {
    microcycle_id: 7,
    mode: 'photo' as const,
    images: [{ pathname: 'import-photos/7/2026/08/uuid-1.jpg' }],
  };

  test('accepts a minimal valid request', () => {
    expect(importPhotoRequestSchema.safeParse(base).success).toBe(true);
  });
  test('accepts several images and an optional start_week', () => {
    const r = importPhotoRequestSchema.safeParse({
      ...base,
      images: [
        { pathname: 'import-photos/7/2026/08/uuid-1.jpg' },
        { pathname: 'import-photos/7/2026/08/uuid-2.jpg' },
      ],
      start_week: 5,
    });
    expect(r.success).toBe(true);
  });
  test('rejects an empty images array', () => {
    expect(importPhotoRequestSchema.safeParse({ ...base, images: [] }).success).toBe(false);
  });
  test(`rejects more than ${IMPORT_PHOTO_MAX_IMAGES} images`, () => {
    const images = Array.from({ length: IMPORT_PHOTO_MAX_IMAGES + 1 }, (_, i) => ({
      pathname: `import-photos/7/2026/08/uuid-${i}.jpg`,
    }));
    expect(importPhotoRequestSchema.safeParse({ ...base, images }).success).toBe(false);
  });
  test(`accepts exactly ${IMPORT_PHOTO_MAX_IMAGES} images`, () => {
    const images = Array.from({ length: IMPORT_PHOTO_MAX_IMAGES }, (_, i) => ({
      pathname: `import-photos/7/2026/08/uuid-${i}.jpg`,
    }));
    expect(importPhotoRequestSchema.safeParse({ ...base, images }).success).toBe(true);
  });
  test('rejects a missing microcycle_id', () => {
    const { microcycle_id: _drop, ...rest } = base;
    expect(importPhotoRequestSchema.safeParse(rest).success).toBe(false);
  });
  test('rejects a wrong mode literal', () => {
    expect(importPhotoRequestSchema.safeParse({ ...base, mode: 'foto' }).success).toBe(false);
  });
  test('rejects start_week out of range', () => {
    expect(importPhotoRequestSchema.safeParse({ ...base, start_week: 0 }).success).toBe(false);
    expect(importPhotoRequestSchema.safeParse({ ...base, start_week: 53 }).success).toBe(false);
  });
  test('rejects a bare url instead of a pathname image ref (.strict + shape)', () => {
    const r = importPhotoRequestSchema.safeParse({
      ...base,
      images: [{ url: 'https://evil.example.com/whatever.jpg' }],
    });
    expect(r.success).toBe(false);
  });
  test('rejects unknown keys (.strict)', () => {
    expect(
      importPhotoRequestSchema.safeParse({ ...base, target_weekday: 3 }).success,
    ).toBe(false);
  });
});

describe('importPhotoPathnameOwner — el cierre de host/coach ajeno', () => {
  test('lee el coach_id de un pathname bien formado, propio', () => {
    expect(importPhotoPathnameOwner('import-photos/42/2026/08/uuid.jpg')).toBe(BigInt(42));
  });

  test('un pathname de OTRO coach resuelve a OTRO id — la ruta lo rechaza al comparar', () => {
    const foreignOwner = importPhotoPathnameOwner('import-photos/99/2026/08/uuid.jpg');
    const callingCoachId = BigInt(42);
    expect(foreignOwner).not.toBeNull();
    expect(foreignOwner).not.toBe(callingCoachId);
  });

  test('un string ajeno sin el prefijo import-photos/ no resuelve a ningún dueño', () => {
    expect(importPhotoPathnameOwner('https://evil.example.com/steal.jpg')).toBeNull();
    expect(importPhotoPathnameOwner('chat/42/2026/08/uuid.jpg')).toBeNull();
    expect(importPhotoPathnameOwner('../../etc/passwd')).toBeNull();
  });

  test('un pathname truncado (sin fichero final) no resuelve', () => {
    expect(importPhotoPathnameOwner('import-photos/42/2026')).toBeNull();
  });

  test('un segmento de coach no numérico no resuelve', () => {
    expect(importPhotoPathnameOwner('import-photos/abc/2026/08/uuid.jpg')).toBeNull();
  });
});

describe('visionReadingNotice — las señales de honestidad de la lectura por foto', () => {
  test('lectura limpia (sin dudas, sin notas): null, no se avisa nada', () => {
    expect(visionReadingNotice([], null)).toBeNull();
    expect(visionReadingNotice([], '')).toBeNull();
    expect(visionReadingNotice([], '   ')).toBeNull();
  });

  test('con líneas dudosas: warning, código vision_uncertain, las cita', () => {
    const notice = visionReadingNotice(
      ['el título del jueves, tapado por el dedo', 'la última fila de la captura 2'],
      null,
    );
    expect(notice).not.toBeNull();
    expect(notice!.code).toBe('vision_uncertain');
    expect(notice!.tone).toBe('warning');
    expect(notice!.message).toContain('el título del jueves, tapado por el dedo');
    expect(notice!.message).toContain('la última fila de la captura 2');
  });

  test('solo una nota libre, sin dudas: info, no warning', () => {
    const notice = visionReadingNotice([], 'La captura 2 llega hasta el jueves.');
    expect(notice).not.toBeNull();
    expect(notice!.tone).toBe('info');
    expect(notice!.message).toContain('La captura 2 llega hasta el jueves.');
  });

  test('dudas Y nota a la vez: las dos llegan en un único aviso, warning gana', () => {
    const notice = visionReadingNotice(['el RIR del viernes'], 'Falta la semana 3 en las capturas.');
    expect(notice!.tone).toBe('warning');
    expect(notice!.message).toContain('el RIR del viernes');
    expect(notice!.message).toContain('Falta la semana 3 en las capturas.');
  });
});
