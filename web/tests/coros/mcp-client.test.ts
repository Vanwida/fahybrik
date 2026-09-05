import { describe, expect, it } from 'vitest';
import {
  extractActivities,
  extractFitBytes,
  extractFirstUrl,
  parseActivityRow,
  unwrapToolResult,
} from '@/lib/coros/mcp-client';

describe('COROS MCP parse (defensive)', () => {
  it('extracts an activity from a nested sportRecords envelope', () => {
    const list = extractActivities({
      sportRecords: [
        {
          activityId: '99',
          startTime: '2026-09-01T08:00:00Z',
          duration: 3600,
          distance: 10000,
          avgHr: 150,
          sport: 'Run',
        },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('99');
    expect(list[0]!.durationSeconds).toBe(3600);
    expect(list[0]!.distanceMeters).toBe(10000);
  });

  it('rejects a row without a stable id', () => {
    expect(parseActivityRow({ startTime: '2026-09-01T08:00:00Z', duration: 60 })).toBeNull();
  });

  it('unwraps MCP text content JSON', () => {
    const raw = unwrapToolResult({
      content: [{ type: 'text', text: JSON.stringify({ records: [{ activityId: '1' }] }) }],
    });
    expect(raw).toEqual({ records: [{ activityId: '1' }] });
  });

  it('decodes a FIT blob and a download URL', () => {
    const bytes = extractFitBytes({ blob: Buffer.from('FITFILEHEADER!!').toString('base64') });
    expect(bytes).not.toBeNull();
    expect(extractFirstUrl({ downloadUrl: 'https://files.coros.com/a.fit' })).toBe(
      'https://files.coros.com/a.fit',
    );
  });
});
