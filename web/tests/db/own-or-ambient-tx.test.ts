// Card 140: un escritor que abre su propia transacción revienta si el
// llamador ya tiene una abierta. postgres.js no anida `begin` (el `tx` solo
// expone `savepoint`). Estas pruebas llaman a los writers CON un cliente
// sin `.begin` — hoy explotan; después se unen a esa tx.

import { describe, expect, it, vi } from 'vitest';
import { withOwnOrAmbientTx } from '@fahybrid/shared/domain/sql-tx';
import { updateMonthTemplate, ProgramMonthError } from '@fahybrid/shared/domain/coach/program-months';
import { insertZoneProfileVersion } from '@/lib/dashboard/v2/zone-derivation';
import { computeMeasuredHeader } from '@/lib/execution/measured-header';
import { duplicateWeekIntoMonth } from '@/lib/dashboard/coach/program-months';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import type { Sql } from '@/lib/db';
import type { ResolvedZone } from '@fahybrid/shared/domain/methodology';
import { ZONE_ROLES } from '@fahybrid/shared/domain/methodology';

vi.mock('@/lib/execution/execution-traces', () => ({
  loadExecutionTraces: async () => ({
    hasAnyTrace: true,
    hr: { offsets_s: [0, 60], values: [140, 142] },
    speed: { offsets_s: [], values: [] },
    altitude: { offsets_s: [0, 40], values: [100, 104] },
    distance: { offsets_s: [], values: [] },
  }),
}));

type Call = { raw: string; values: unknown[] };

function makeTxWithoutBegin(handler: (raw: string) => unknown[] | Promise<unknown[]>): {
  sql: Sql;
  calls: Call[];
} {
  const calls: Call[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    return Promise.resolve(handler(raw));
  };
  (tag as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return { sql: tag as unknown as Sql, calls };
}

function sixZones(): ResolvedZone[] {
  return ZONE_ROLES.map((role, i) => ({
    code: `Z${i + 1}`,
    label: `Zona ${i + 1}`,
    color: '#111111',
    role,
    sort_order: i + 1,
    fast_s: 80 + i,
    slow_s: i === 0 ? null : 100 + i,
  }));
}

describe('withOwnOrAmbientTx', () => {
  it('abre begin cuando el cliente es el pool', async () => {
    const seen: string[] = [];
    const pool = {
      kind: 'pool',
      begin: async (fn: (tx: { kind: string }) => Promise<string>) => {
        seen.push('begin');
        return fn({ kind: 'tx' });
      },
    };
    const out = await withOwnOrAmbientTx(pool, async (tx) => {
      seen.push(tx.kind);
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(seen).toEqual(['begin', 'tx']);
  });

  it('no abre begin cuando el cliente ya es un tx', async () => {
    const tx = { kind: 'ambient' };
    const out = await withOwnOrAmbientTx(tx, async (client) => {
      expect(client).toBe(tx);
      return 'joined';
    });
    expect(out).toBe('joined');
  });
});

describe('escritores que no pueden anidar begin', () => {
  it('insertZoneProfileVersion se une al tx del llamador', async () => {
    const recordedAt = new Date('2026-08-25T00:00:00Z');
    const { sql, calls } = makeTxWithoutBegin((raw) => {
      if (/max\(version\)/i.test(raw)) return [{ next_version: 1 }];
      if (/insert into athlete_zone_profiles/i.test(raw)) {
        return [{ id: '41', version: 1, recorded_at: recordedAt }];
      }
      return [];
    });

    const inserted = await insertZoneProfileVersion(
      {
        athlete_id: 7,
        modality: 'run',
        threshold_s: 240,
        pace_unit: 'per_km',
        source_test_slug: null,
        source_benchmark_id: null,
        zones: sixZones(),
        source: 'coach_test',
        needs_review: false,
      },
      sql,
    );

    expect(inserted).toEqual({ id: '41', version: 1, recorded_at: recordedAt });
    expect(calls.some((c) => /insert into athlete_zone_profiles/i.test(c.raw))).toBe(true);
    expect((sql as unknown as { begin?: unknown }).begin).toBeUndefined();
  });

  it('updateMonthTemplate se une al tx del llamador', async () => {
    const { sql } = makeTxWithoutBegin((raw) => {
      if (/from program_month_templates/i.test(raw) && /select id/i.test(raw)) {
        return [{ id: '12' }];
      }
      if (/coalesce\(al\.name/i.test(raw)) {
        return [
          {
            id: '12',
            name: 'Base sólida',
            level: '',
            focus: null,
            updated_at: '2026-08-25T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    const row = await updateMonthTemplate({
      coach_id: 3,
      month_id: 12,
      patch: { name: 'Base sólida' },
      client: sql as never,
    });
    expect(row.name).toBe('Base sólida');
    expect(row.id).toBe('12');
  });

  it('updateMonthTemplate sin fila propia lanza not_found, no begin is not a function', async () => {
    const { sql } = makeTxWithoutBegin(() => []);
    await expect(
      updateMonthTemplate({
        coach_id: 3,
        month_id: 99,
        patch: { name: 'X' },
        client: sql as never,
      }),
    ).rejects.toBeInstanceOf(ProgramMonthError);
  });

  it('duplicateWeekIntoMonth se une al tx del llamador', async () => {
    const { sql } = makeTxWithoutBegin(() => []);
    await expect(
      duplicateWeekIntoMonth({
        coach_id: 3,
        month_id: 12,
        week_id: 44,
        client: sql,
      }),
    ).rejects.toBeInstanceOf(ProgramMonthError);
  });

  it('computeMeasuredHeader escribe pendientes dentro del tx del llamador', async () => {
    const started = new Date('2026-08-01T06:00:00Z');
    const ended = new Date('2026-08-01T06:40:00Z');
    const { sql, calls } = makeTxWithoutBegin((raw) => {
      if (/from workout_executions/i.test(raw) && /select started_at/i.test(raw)) {
        return [{ started_at: started, ended_at: ended }];
      }
      if (/from segment_executions/i.test(raw) && /leg_role/i.test(raw)) {
        return [];
      }
      if (/from segment_executions/i.test(raw) && /modality = 'run'/i.test(raw)) {
        return [
          {
            id: 88,
            started_at: started,
            ended_at: new Date(started.getTime() + 40_000),
            distance_meters: '200',
            incline_pct: null,
          },
        ];
      }
      return [];
    });

    const result = await computeMeasuredHeader({ execution_id: 9, client: sql });
    expect(result.written).toBe(true);
    expect(calls.some((c) => /set\s+avg_gradient_pct/i.test(c.raw))).toBe(true);
  });

  it('instantiateMonthFromTemplate se une al tx del llamador', async () => {
    const { sql } = makeTxWithoutBegin((raw) => {
      if (/from athletes/i.test(raw)) return [{ id: '8' }];
      if (/count\(\*\)/i.test(raw)) return [{ n: 0 }];
      if (/from program_month_templates/i.test(raw)) {
        return [{ id: '12', name: 'Base', level: '' }];
      }
      if (/from program_month_weeks/i.test(raw)) {
        return [
          {
            position: 0,
            week_template_id: '44',
            week_name: 'S1',
            week_focus: null,
          },
        ];
      }
      return [];
    });

    try {
      await instantiateMonthFromTemplate({
        coach_id: 3,
        athlete_id: 8,
        month_template_id: 12,
        start_date: '2026-08-24',
        client: sql,
      });
    } catch (err) {
      expect(String(err)).not.toMatch(/begin is not a function/i);
    }
  });
});
