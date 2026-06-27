// Unit tests for the reconcile/adopt matcher (matchPendingRace) — the pure core
// that decides which pending FUTURE race an imported completed result adopts.

import { describe, expect, it } from 'vitest';
import {
  matchPendingRace,
  RECONCILE_DATE_WINDOW_DAYS,
  type ImportedResultKey,
  type PendingRaceCandidate,
} from '@/lib/hyrox/reconcile';

const baseImported: ImportedResultKey = {
  event_id: null,
  race_date: '2026-09-12',
  event_type: 'hyrox',
  format: 'singles',
  division: 'open',
  gender_category: 'men',
};

function pending(over: Partial<PendingRaceCandidate> & { id: number }): PendingRaceCandidate {
  return {
    event_id: null,
    race_date: '2026-09-12',
    event_type: 'hyrox',
    format: 'singles',
    division: 'open',
    gender_category: 'men',
    ...over,
  };
}

describe('matchPendingRace', () => {
  it('matches by catalog event_id when both sides have it (link wins over date)', () => {
    const imported = { ...baseImported, event_id: 99, race_date: '2026-09-12' };
    const cands = [
      pending({ id: 1, event_id: null, race_date: '2026-09-12' }), // same date, no link
      pending({ id: 2, event_id: 99, race_date: '2026-10-01' }), // linked, far date
    ];
    expect(matchPendingRace(imported, cands)?.id).toBe(2);
  });

  it('falls back to date+format within the window', () => {
    const imported = { ...baseImported, race_date: '2026-09-12' };
    const cands = [pending({ id: 7, race_date: '2026-09-13' })]; // +1 day
    expect(matchPendingRace(imported, cands)?.id).toBe(7);
  });

  it('does not match outside the date window', () => {
    const imported = { ...baseImported, race_date: '2026-09-12' };
    const outside = pending({
      id: 8,
      race_date: '2026-09-20', // 8 days > window
    });
    expect(matchPendingRace(imported, [outside])).toBeNull();
    // sanity: the window boundary is inclusive
    const onEdge = pending({ id: 9, race_date: '2026-09-15' }); // +3 days
    expect(RECONCILE_DATE_WINDOW_DAYS).toBe(3);
    expect(matchPendingRace(imported, [onEdge])?.id).toBe(9);
  });

  it('never matches across format (doubles result vs singles objective)', () => {
    const imported = { ...baseImported, format: 'doubles', race_date: '2026-09-12' };
    const cands = [pending({ id: 3, format: 'singles', race_date: '2026-09-12' })];
    expect(matchPendingRace(imported, cands)).toBeNull();
  });

  it('never matches across event_type', () => {
    const imported = { ...baseImported, event_type: 'deka', race_date: '2026-09-12' };
    const cands = [pending({ id: 4, event_type: 'hyrox', race_date: '2026-09-12' })];
    expect(matchPendingRace(imported, cands)).toBeNull();
  });

  it('prefers the same division+gender bracket on a tie', () => {
    const imported = { ...baseImported, division: 'pro', gender_category: 'women' };
    const cands = [
      pending({ id: 5, division: 'open', gender_category: 'men', race_date: '2026-09-12' }),
      pending({ id: 6, division: 'pro', gender_category: 'women', race_date: '2026-09-12' }),
    ];
    expect(matchPendingRace(imported, cands)?.id).toBe(6);
  });

  it('prefers the nearest date when brackets are equal', () => {
    const imported = { ...baseImported, race_date: '2026-09-12' };
    const cands = [
      pending({ id: 10, race_date: '2026-09-14' }), // +2
      pending({ id: 11, race_date: '2026-09-12' }), // exact
    ];
    expect(matchPendingRace(imported, cands)?.id).toBe(11);
  });

  it('returns null for a dateless import with no catalog link', () => {
    const imported = { ...baseImported, event_id: null, race_date: null };
    const cands = [pending({ id: 12, race_date: '2026-09-12' })];
    expect(matchPendingRace(imported, cands)).toBeNull();
  });

  it('returns null when there are no candidates', () => {
    expect(matchPendingRace(baseImported, [])).toBeNull();
  });
});
