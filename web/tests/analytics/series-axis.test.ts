/**
 * Pure (no-DB) unit tests for the analytics chart helpers added with the tab
 * redesign: `seriesAxis` (line-chart y-axis end labels) and `isoWeekStart` (the
 * shared weekly-bucket key). These run in every CI pass — no TEST_DATABASE_URL
 * needed — because they exercise the presentation logic in isolation.
 */

import { describe, expect, test } from 'vitest';
import { isoWeekStart, seriesAxis, type CardSeriesPoint } from '@/lib/athlete/analytics/core';

function pt(height: number, display: string | null): CardSeriesPoint {
  return { id: `${height}`, height, display, current: false, label: null };
}

describe('seriesAxis — line-chart y-axis end labels', () => {
  test('picks the display of the lowest point as min, highest as max', () => {
    const axis = seriesAxis([pt(0.5, '1:58'), pt(0.2, '1:50'), pt(1.0, '2:10')]);
    expect(axis).toEqual({ min_display: '1:50', max_display: '2:10' });
  });

  test('returns null for a single point (no range to label)', () => {
    expect(seriesAxis([pt(1.0, '2:10')])).toBeNull();
    expect(seriesAxis([])).toBeNull();
  });

  test('returns null when an extreme point lacks a display (never fabricates)', () => {
    expect(seriesAxis([pt(0.2, null), pt(1.0, '2:10')])).toBeNull();
    expect(seriesAxis([pt(0.2, '1:50'), pt(1.0, null)])).toBeNull();
  });

  test('a flat series labels the same value top and bottom', () => {
    const axis = seriesAxis([pt(0.5, '120'), pt(0.5, '120')]);
    expect(axis).toEqual({ min_display: '120', max_display: '120' });
  });
});

describe('isoWeekStart — shared weekly bucket key', () => {
  test('maps any day to the Monday (UTC) of its ISO week', () => {
    // 2026-07-08 is a Wednesday → Monday 2026-07-06.
    expect(isoWeekStart('2026-07-08')).toBe('2026-07-06');
    // The Monday itself is a fixed point.
    expect(isoWeekStart('2026-07-06')).toBe('2026-07-06');
    // Sunday belongs to the same week's Monday (Mon=0 convention).
    expect(isoWeekStart('2026-07-12')).toBe('2026-07-06');
  });
});
