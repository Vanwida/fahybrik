// Carril del microciclo + badge N de M. Tres nombres, nunca «parcial».
// Caso real (seed Preview 18-ago): Marc, 17–23 draft, 24–30 published.

import { describe, expect, test } from 'vitest';
import {
  EXECUTION_A_MEDIAS,
  PUBLISH_EMPTY_LABEL,
  RAIL_BORRADOR,
  RAIL_VISIBLE,
  executionStatusLabel,
  mcpMicrocicloPhrase,
  publishBadgeLabel,
  publishedWeekCount,
  railWeekLabel,
} from '@fahybrid/shared/domain/coach/microciclo-rail';

/** Marc Vidal · Acumulación 17–30 ago. Semana calendario 17–23 en draft. */
const MARC = {
  session_count: 10,
  week_count: 2,
  draft_week_count: 1,
  weeks: [
    { week_start: '2026-08-17', visible: false },
    { week_start: '2026-08-24', visible: true },
  ],
} as const;

describe('publishBadgeLabel — N de M publicadas', () => {
  test('Marc 17–23 draft + 24–30 published → 1 de 2 publicadas', () => {
    expect(publishBadgeLabel(MARC)).toBe('1 de 2 publicadas');
    expect(publishedWeekCount(MARC.week_count, MARC.draft_week_count)).toBe(1);
  });

  test('todas en borrador → 0 de M, no la palabra borrador en el badge', () => {
    expect(
      publishBadgeLabel({ session_count: 5, week_count: 2, draft_week_count: 2 }),
    ).toBe('0 de 2 publicadas');
  });

  test('todas visibles → N de N publicadas, no «publicado»', () => {
    expect(
      publishBadgeLabel({ session_count: 5, week_count: 2, draft_week_count: 0 }),
    ).toBe('2 de 2 publicadas');
  });

  test('sin sesiones → sin publicar', () => {
    expect(
      publishBadgeLabel({ session_count: 0, week_count: 2, draft_week_count: 2 }),
    ).toBe(PUBLISH_EMPTY_LABEL);
  });

  test('microciclo sin semanas materializadas → sin publicar', () => {
    expect(
      publishBadgeLabel({ session_count: 3, week_count: 0, draft_week_count: 0 }),
    ).toBe(PUBLISH_EMPTY_LABEL);
  });
});

describe('railWeekLabel — Visible / Borrador', () => {
  test('Marc: 17–23 Borrador, 24–30 Visible', () => {
    expect(MARC.weeks.map((w) => [w.week_start, railWeekLabel(w.visible)])).toEqual([
      ['2026-08-17', RAIL_BORRADOR],
      ['2026-08-24', RAIL_VISIBLE],
    ]);
  });

  test('sin fila (sin_marcar) se lee Visible — misma puerta que el chip', () => {
    expect(railWeekLabel(true)).toBe(RAIL_VISIBLE);
  });

  test('draft explícito se lee Borrador, no «No lo ve» (eso es el chip de calendario)', () => {
    expect(railWeekLabel(false)).toBe(RAIL_BORRADOR);
    expect(railWeekLabel(false)).not.toBe('No lo ve');
  });
});

describe('tres nombres — ninguna superficie dice «parcial»', () => {
  test('badge, carril y ejecución son tres frases distintas', () => {
    const badge = publishBadgeLabel(MARC);
    const rail = MARC.weeks.map((w) => railWeekLabel(w.visible));
    const execution = executionStatusLabel('partial');
    const mcp = mcpMicrocicloPhrase({ ...MARC, publish_state: 'partial' });

    expect(badge).toBe('1 de 2 publicadas');
    expect(rail).toEqual(['Borrador', 'Visible']);
    expect(execution).toBe(EXECUTION_A_MEDIAS);
    expect(mcp).toBe('1 de 2 publicadas');

    for (const phrase of [badge, ...rail, execution, mcp].filter(
      (p): p is string => p != null,
    )) {
      expect(phrase.toLowerCase()).not.toContain('parcial');
    }
  });

  test('ejecución completed / missed no se cruzan con el carril', () => {
    expect(executionStatusLabel('completed')).toBe('hecha');
    expect(executionStatusLabel('missed')).toBe('sin hacer');
    expect(executionStatusLabel('partial')).not.toBe(RAIL_BORRADOR);
    expect(executionStatusLabel('partial')).not.toBe(publishBadgeLabel(MARC));
  });
});

describe('mcpMicrocicloPhrase — misma cuenta que el badge, no «publicado a medias»', () => {
  test('publish_state partial → N de M publicadas', () => {
    expect(mcpMicrocicloPhrase({ ...MARC, publish_state: 'partial' })).toBe(
      '1 de 2 publicadas',
    );
  });

  test('todo draft conserva la frase del MCP (él no lo ve)', () => {
    expect(
      mcpMicrocicloPhrase({
        publish_state: 'draft',
        session_count: 5,
        week_count: 2,
        draft_week_count: 2,
      }),
    ).toBe('todavía en borrador (él no lo ve)');
  });

  test('published o vacío no añaden frase', () => {
    expect(
      mcpMicrocicloPhrase({
        publish_state: 'published',
        session_count: 5,
        week_count: 2,
        draft_week_count: 0,
      }),
    ).toBeNull();
    expect(
      mcpMicrocicloPhrase({
        publish_state: 'draft',
        session_count: 0,
        week_count: 2,
        draft_week_count: 2,
      }),
    ).toBeNull();
  });
});
