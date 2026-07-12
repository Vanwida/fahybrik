import { describe, expect, it } from 'vitest';
import type { InjuryDTO } from '@fahybrid/shared/schema/injuries';
import {
  statusMeta,
  severityMeta,
  injuryBadge,
  transitionsFor,
  buildTimeline,
  suggestsPause,
  formatInjuryDate,
  sinceOnset,
  LONG_LAYOFF_DAYS,
} from '@/components/v2/atleta-detalle/injuries/injury-presentation';

function baseInjury(over: Partial<InjuryDTO> = {}): InjuryDTO {
  return {
    id: '1',
    zone: 'rodilla',
    type: 'tendinitis rotuliana',
    severity: 'moderada',
    status: 'activa',
    onset_date: '2026-07-03',
    resolved_date: null,
    expected_return: null,
    registered_by: 'athlete',
    note: 'Molestia tras la tirada larga.',
    pause_id: null,
    updated_at: '2026-07-03T10:00:00.000Z',
    updates: [],
    ...over,
  };
}

describe('statusMeta / severityMeta — tones are the two SEPARATE axes', () => {
  it('status → lifecycle tone', () => {
    expect(statusMeta('activa').tone).toBe('danger');
    expect(statusMeta('en_recuperacion').tone).toBe('warn');
    expect(statusMeta('resuelta').tone).toBe('ok');
  });
  it('severity → its own tone, independent of status', () => {
    expect(severityMeta('leve').tone).toBe('ok');
    expect(severityMeta('moderada').tone).toBe('warn');
    expect(severityMeta('severa').tone).toBe('danger');
  });
});

describe('injuryBadge — the at-a-glance roster chip (open injuries only)', () => {
  it('activa reads "Lesión · <zona>" in danger', () => {
    expect(injuryBadge('rodilla', 'activa')).toEqual({ label: 'Lesión · Rodilla', tone: 'danger' });
  });
  it('en_recuperacion reads "En retorno · <zona>" in warn', () => {
    expect(injuryBadge('isquios', 'en_recuperacion')).toEqual({
      label: 'En retorno · Isquios',
      tone: 'warn',
    });
  });
});

describe('transitionsFor — mirrors the canonical state machine', () => {
  it('activa → en_recuperacion + resuelta', () => {
    expect(transitionsFor('activa').map((t) => t.to)).toEqual(['en_recuperacion', 'resuelta']);
  });
  it('en_recuperacion can flare to activa or discharge', () => {
    expect(transitionsFor('en_recuperacion').map((t) => t.to)).toEqual(['activa', 'resuelta']);
  });
  it('resuelta is terminal — no transition buttons', () => {
    expect(transitionsFor('resuelta')).toEqual([]);
  });
});

describe('buildTimeline — registration first, then updates in order', () => {
  it('synthesizes the registration entry (no injury_updates row exists for it)', () => {
    const t = buildTimeline(baseInjury());
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      kind: 'created',
      at: '2026-07-03',
      by: 'athlete',
      note: 'Molestia tras la tirada larga.',
      status: null,
    });
  });
  it('appends updates chronologically after the registration', () => {
    const t = buildTimeline(
      baseInjury({
        updates: [
          {
            id: '10',
            status: null,
            note: 'Check-in: molestia 2/5, bajando.',
            recorded_by: 'athlete',
            recorded_at: '2026-07-08T09:00:00.000Z',
          },
          {
            id: '11',
            status: 'en_recuperacion',
            note: 'Adapto lunes y miércoles.',
            recorded_by: 'coach',
            recorded_at: '2026-07-09T09:00:00.000Z',
          },
        ],
      }),
    );
    expect(t.map((e) => e.kind)).toEqual(['created', 'update', 'update']);
    expect(t[2]).toMatchObject({ status: 'en_recuperacion', by: 'coach' });
  });
});

describe('suggestsPause — fork 3: suggest (never auto) for severe / long layoff', () => {
  const farReturn = new Date(Date.now() + (LONG_LAYOFF_DAYS + 5) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const soonReturn = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  it('severe injury always suggests, regardless of return date', () => {
    expect(suggestsPause('severa', null)).toBe(true);
    expect(suggestsPause('severa', soonReturn)).toBe(true);
  });
  it('a long expected layoff suggests even when not severe', () => {
    expect(suggestsPause('leve', farReturn)).toBe(true);
  });
  it('a mild injury with a near / no return does NOT suggest', () => {
    expect(suggestsPause('leve', soonReturn)).toBe(false);
    expect(suggestsPause('leve', null)).toBe(false);
    expect(suggestsPause('moderada', null)).toBe(false);
  });
});

describe('formatInjuryDate — date-only never shifts a day across timezones', () => {
  it('renders a YYYY-MM-DD as "D mmm"', () => {
    expect(formatInjuryDate('2026-07-03')).toBe('3 jul');
  });
  it('null → em dash', () => {
    expect(formatInjuryDate(null)).toBe('—');
  });
});

describe('sinceOnset — human "desde hace…"', () => {
  it('today → desde hoy', () => {
    // Build "today" in LOCAL time to match daysUntil's date-only semantics —
    // toISOString() is UTC and reads as yesterday between 00:00 and 02:00 Madrid.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    expect(sinceOnset(today)).toBe('desde hoy');
  });
  it('null → null', () => {
    expect(sinceOnset(null)).toBeNull();
  });
});
