import { describe, expect, it } from 'vitest';
import { chatContextInputSchema, messageDtoSchema, sendMessageSchema } from '@/lib/chat/schema';

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

  // ---------------------------------------------------------------------------
  // Contexto (migración 0186) — docs/DECISIONS.md 2026-08-12.
  // ---------------------------------------------------------------------------

  it('accepts a message with body AND context', () => {
    const r = sendMessageSchema.safeParse({
      body: '¿cuántas series hago?',
      context: { kind: 'session', ref: '1234' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts session context with sub (el ejercicio DENTRO del entreno)', () => {
    const r = sendMessageSchema.safeParse({
      body: 'sobre este ejercicio',
      context: { kind: 'session', ref: '1234', sub: 'back-squat-uid' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a context-only message with no body and no attachment (regla 3)', () => {
    const r = sendMessageSchema.safeParse({
      context: { kind: 'session', ref: '1234' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a context with an attachment and no body', () => {
    const r = sendMessageSchema.safeParse({
      attachment_url: 'https://blob.test/foto.jpg',
      attachment_kind: 'image',
      context: { kind: 'exercise', ref: '55' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects context_sub with kind="exercise" (regla 4)', () => {
    const r = sendMessageSchema.safeParse({
      body: 'x',
      context: { kind: 'exercise', ref: '55', sub: 'algo' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects context_sub with kind="race" (regla 4)', () => {
    const r = sendMessageSchema.safeParse({
      body: 'x',
      context: { kind: 'race', ref: '77', sub: 'algo' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a context with an unknown kind', () => {
    const r = sendMessageSchema.safeParse({
      body: 'x',
      context: { kind: 'weekly_plan', ref: '1' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a context with an empty ref', () => {
    const r = sendMessageSchema.safeParse({
      body: 'x',
      context: { kind: 'session', ref: '' },
    });
    expect(r.success).toBe(false);
  });

  it('a message with no context at all keeps working exactly like before', () => {
    const r = sendMessageSchema.safeParse({ body: 'hola, como siempre' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.context).toBeUndefined();
  });
});

describe('chatContextInputSchema', () => {
  it('accepts the three kinds without sub', () => {
    for (const kind of ['session', 'exercise', 'race'] as const) {
      expect(chatContextInputSchema.safeParse({ kind, ref: '1' }).success).toBe(true);
    }
  });

  it('accepts sub only with kind=session', () => {
    expect(
      chatContextInputSchema.safeParse({ kind: 'session', ref: '1', sub: '2' }).success,
    ).toBe(true);
    expect(
      chatContextInputSchema.safeParse({ kind: 'exercise', ref: '1', sub: '2' }).success,
    ).toBe(false);
    expect(
      chatContextInputSchema.safeParse({ kind: 'race', ref: '1', sub: '2' }).success,
    ).toBe(false);
  });

  it('never accepts a label from the client — the field does not exist on the input schema', () => {
    // `safeParse` toma `unknown`: TS no puede rechazar el campo extra en el
    // literal, así que la garantía real es la de RUNTIME que se comprueba
    // abajo — Zod (sin .strict()) admite el objeto pero DESCARTA `label` de
    // la salida, así el resto del pipeline nunca ve un label puesto por el
    // cliente.
    const parsed = chatContextInputSchema.safeParse({
      kind: 'session',
      ref: '1',
      label: 'lo que sea',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect('label' in parsed.data).toBe(false);
  });
});

describe('messageDtoSchema — el contexto viaja SIEMPRE (null u objeto), nunca ausente', () => {
  const base = {
    id: '1',
    thread_id: '1',
    sender_user_id: '1',
    sender_role: 'athlete' as const,
    body: 'hola',
    attachment_url: null,
    attachment_kind: null,
    attachment_meta: null,
    created_at: '2026-08-18T10:00:00.000Z',
    read_at: null,
    edited_at: null,
  };

  it('valida un mensaje sin contexto', () => {
    expect(messageDtoSchema.safeParse({ ...base, context: null }).success).toBe(true);
  });

  it('valida un mensaje con contexto resuelto (con label) y su previsualización viva', () => {
    const r = messageDtoSchema.safeParse({
      ...base,
      context: {
        kind: 'session',
        ref: '1234',
        sub: null,
        label: 'Fuerza A · mar 18',
        preview: '4×5 · 80% RM',
        exists: true,
        state: 'pending',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un contexto sin preview/exists/state — deben ir siempre, aunque sean null', () => {
    const r = messageDtoSchema.safeParse({
      ...base,
      context: { kind: 'session', ref: '1234', sub: null, label: 'Fuerza A · mar 18' },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza un mensaje sin el campo `context` (debe ir explícito, `base` no lo lleva)', () => {
    expect(messageDtoSchema.safeParse(base).success).toBe(false);
  });
});
