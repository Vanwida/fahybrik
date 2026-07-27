// createAttachmentUploadTarget — las reglas que protegen el almacén se aplican
// ANTES de firmar nada: tipo desconocido, extensión fuera de lista y tamaño por
// encima del tope por tipo rechazan sin tocar la red. Sin BLOB_READ_WRITE_TOKEN
// no hay firma posible (503), nunca un fallback silencioso.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttachmentUploadTarget, UploadError } from '@/lib/chat/upload';
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/schema';

const BASE = {
  athlete_id: BigInt(42),
  kind: 'image',
  filename: 'foto.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
};

async function expectUploadError(
  args: Parameters<typeof createAttachmentUploadTarget>[0],
  code: string,
  status: number,
): Promise<void> {
  try {
    await createAttachmentUploadTarget(args);
    expect.unreachable('should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).code).toBe(code);
    expect((err as UploadError).status).toBe(status);
  }
}

describe('createAttachmentUploadTarget — validation before signing', () => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  beforeEach(() => {
    // Ningún caso de este fichero debe llegar a la red: si lo hiciera, fallaría
    // con storage_unavailable en vez del código esperado.
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterEach(() => {
    if (savedToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it('rejects an unknown kind', async () => {
    await expectUploadError({ ...BASE, kind: 'sticker' }, 'invalid_kind', 400);
  });

  it('rejects an extension outside the kind allow-list', async () => {
    await expectUploadError(
      { ...BASE, kind: 'image', filename: 'nota.pdf', mime_type: 'application/pdf' },
      'invalid_extension',
      400,
    );
  });

  it('rejects SVG even though it is an image format (script-bearing document)', async () => {
    await expectUploadError(
      { ...BASE, filename: 'logo.svg', mime_type: 'image/svg+xml' },
      'invalid_extension',
      400,
    );
  });

  it('rejects a declared size over the per-kind cap (413)', async () => {
    await expectUploadError(
      { ...BASE, size_bytes: CHAT_ATTACHMENT_MAX_BYTES.image + 1 },
      'too_large',
      413,
    );
  });

  it('accepts every kind exactly at its cap, failing only at the storage gate (503)', async () => {
    // Con las reglas superadas y sin token, el siguiente paso es el almacén:
    // 503 aquí demuestra que la validación dejó pasar el caso límite.
    const atCap: Array<[string, string, string]> = [
      ['voice', 'nota.m4a', 'audio/mp4'],
      ['video', 'tecnica.mp4', 'video/mp4'],
      ['image', 'foto.jpg', 'image/jpeg'],
      ['file', 'plan.pdf', 'application/pdf'],
    ];
    for (const [kind, filename, mime_type] of atCap) {
      await expectUploadError(
        {
          ...BASE,
          kind,
          filename,
          mime_type,
          size_bytes: CHAT_ATTACHMENT_MAX_BYTES[kind as keyof typeof CHAT_ATTACHMENT_MAX_BYTES],
        },
        'storage_unavailable',
        503,
      );
    }
  });
});
