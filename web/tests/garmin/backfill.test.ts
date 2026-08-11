import { describe, expect, it, vi } from 'vitest';
import {
  buildBackfillRequests,
  GARMIN_BACKFILL_DAYS,
  GARMIN_BACKFILL_TYPES,
  GARMIN_WELLNESS_BASE,
  requestGarminBackfillType,
  runGarminBackfill,
} from '@/lib/garmin/backfill';

describe('buildBackfillRequests', () => {
  it('pide cada tipo en la ventana de 90 días por defecto', () => {
    const now = new Date('2026-08-11T12:00:00Z');
    const reqs = buildBackfillRequests({ now });
    expect(reqs).toHaveLength(GARMIN_BACKFILL_TYPES.length);
    expect(reqs[0]!.type).toBe('dailies');
    expect(reqs[0]!.url.startsWith(`${GARMIN_WELLNESS_BASE}/backfill/dailies?`)).toBe(true);

    const end = Math.floor(now.getTime() / 1000);
    const start = end - GARMIN_BACKFILL_DAYS * 86_400;
    expect(reqs[0]!.summaryEndTimeInSeconds).toBe(end);
    expect(reqs[0]!.summaryStartTimeInSeconds).toBe(start);
  });

  it('respeta un subconjunto de tipos', () => {
    const reqs = buildBackfillRequests({ types: ['dailies', 'sleeps'] });
    expect(reqs.map((r) => r.type)).toEqual(['dailies', 'sleeps']);
  });
});

describe('requestGarminBackfillType', () => {
  const tokens = { access_token: 'tok', token_secret: 'sec' };

  it('marca ok en 202', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 202 }));
    const r = await requestGarminBackfillType({
      type: 'dailies',
      url: `${GARMIN_WELLNESS_BASE}/backfill/dailies?summaryStartTimeInSeconds=1&summaryEndTimeInSeconds=2`,
      consumer_key: 'ck',
      consumer_secret: 'cs',
      tokens,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(202);
    expect(fetchFn).toHaveBeenCalledOnce();
    const headers = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.authorization?.startsWith('OAuth ')).toBe(true);
  });

  it('trata 409 (ya pedido) como ok no fallido', async () => {
    const fetchFn = vi.fn(async () => new Response('conflict', { status: 409 }));
    const r = await requestGarminBackfillType({
      type: 'sleeps',
      url: `${GARMIN_WELLNESS_BASE}/backfill/sleeps?summaryStartTimeInSeconds=1&summaryEndTimeInSeconds=2`,
      consumer_key: 'ck',
      consumer_secret: 'cs',
      tokens,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('already_requested');
  });

  it('marca fallo en 4xx de rango', async () => {
    const fetchFn = vi.fn(async () => new Response('range too long', { status: 400 }));
    const r = await requestGarminBackfillType({
      type: 'hrv',
      url: `${GARMIN_WELLNESS_BASE}/backfill/hrv?summaryStartTimeInSeconds=1&summaryEndTimeInSeconds=2`,
      consumer_key: 'ck',
      consumer_secret: 'cs',
      tokens,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
});

describe('runGarminBackfill', () => {
  it('sin env de Garmin devuelve todos failed sin llamar a la red', async () => {
    const prev = {
      key: process.env.GARMIN_CONSUMER_KEY,
      secret: process.env.GARMIN_CONSUMER_SECRET,
      cb: process.env.GARMIN_OAUTH_CALLBACK_URL,
    };
    delete process.env.GARMIN_CONSUMER_KEY;
    delete process.env.GARMIN_CONSUMER_SECRET;
    delete process.env.GARMIN_OAUTH_CALLBACK_URL;

    const fetchFn = vi.fn();
    const r = await runGarminBackfill({
      tokens: { access_token: 'a', token_secret: 'b' },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.accepted).toBe(0);
    expect(r.failed).toBe(GARMIN_BACKFILL_TYPES.length);
    expect(fetchFn).not.toHaveBeenCalled();

    if (prev.key) process.env.GARMIN_CONSUMER_KEY = prev.key;
    if (prev.secret) process.env.GARMIN_CONSUMER_SECRET = prev.secret;
    if (prev.cb) process.env.GARMIN_OAUTH_CALLBACK_URL = prev.cb;
  });
});
