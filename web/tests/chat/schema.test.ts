import { describe, expect, it } from 'vitest';
import { sendMessageSchema } from '@/lib/chat/schema';

describe('sendMessageSchema', () => {
  it('accepts a body-only message', () => {
    expect(sendMessageSchema.safeParse({ body: 'hola' }).success).toBe(true);
  });

  it('accepts an attachment-only message with kind', () => {
    expect(
      sendMessageSchema.safeParse({
        attachment_url: 'https://blob.test/file.m4a',
        attachment_kind: 'voice',
      }).success,
    ).toBe(true);
  });

  it('rejects empty body without attachment', () => {
    expect(sendMessageSchema.safeParse({}).success).toBe(false);
  });

  it('rejects attachment_url without attachment_kind', () => {
    const r = sendMessageSchema.safeParse({
      attachment_url: 'https://blob.test/file.m4a',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown attachment_kind', () => {
    const r = sendMessageSchema.safeParse({
      body: 'x',
      attachment_url: 'https://blob.test/file.txt',
      attachment_kind: 'document',
    });
    expect(r.success).toBe(false);
  });
});
