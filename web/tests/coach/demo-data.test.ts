import { describe, expect, test } from 'vitest';
import { buildDemoCohort } from '@/lib/coach/demo-data';

describe('buildDemoCohort', () => {
  test('produces 13 personas by default with all flagged is_demo', () => {
    const rows = buildDemoCohort();
    expect(rows.length).toBeGreaterThanOrEqual(13);
    expect(rows.every((r) => r.is_demo)).toBe(true);
  });

  test('first three personas mirror the spec ASCII (Marc V, Sara P, Jordi L)', () => {
    const rows = buildDemoCohort();
    expect(rows[0].full_name).toBe('Marc Vidal');
    expect(rows[0].primary_alert?.kind).toBe('hrv_crash');
    expect(rows[1].full_name).toBe('Sara Puig');
    expect(rows[1].primary_alert?.kind).toBe('no_sync');
    expect(rows[2].full_name).toBe('Jordi Llopis');
  });

  test('alert distribution matches élite triage spec (3+ alerts present)', () => {
    const rows = buildDemoCohort();
    const flagged = rows.filter((r) => r.alerts.length > 0);
    expect(flagged.length).toBeGreaterThanOrEqual(3);
  });

  test('every row carries the élite metric set required by the cohort table', () => {
    for (const row of buildDemoCohort()) {
      expect(row.block_type).toMatch(/ACC|TRANS|REAL/);
      expect(row.compliance_pct).not.toBeNull();
      expect(row.acr).not.toBeNull();
      expect(row.tsb).not.toBeNull();
      expect(row.sync_minutes_ago).not.toBeNull();
    }
  });
});
