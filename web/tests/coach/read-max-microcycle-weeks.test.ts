import { describe, expect, test } from 'vitest';
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';
import { readMaxMicrocycleWeeksFromLevelsResponse } from '@/lib/coach/read-max-microcycle-weeks';

describe('readMaxMicrocycleWeeksFromLevelsResponse', () => {
  test('404 HTML de Clerk (prod sin cookie) → defecto, no tira', async () => {
    const res = new Response('<!DOCTYPE html><html id="__next_error__"></html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    await expect(readMaxMicrocycleWeeksFromLevelsResponse(res)).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });

  test('500 HTML si el GET revienta → defecto, no tira', async () => {
    const res = new Response('Internal Server Error', {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
    await expect(readMaxMicrocycleWeeksFromLevelsResponse(res)).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });

  test('401 JSON sin tope → defecto', async () => {
    const res = new Response(JSON.stringify({ error: { message: 'Sesión requerida' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readMaxMicrocycleWeeksFromLevelsResponse(res)).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });

  test('200 con tope del coach → ese número', async () => {
    const res = new Response(JSON.stringify({ levels: [], max_microcycle_weeks: 3 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readMaxMicrocycleWeeksFromLevelsResponse(res)).resolves.toBe(3);
  });

  test('200 sin el campo → defecto', async () => {
    const res = new Response(JSON.stringify({ levels: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readMaxMicrocycleWeeksFromLevelsResponse(res)).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });
});
