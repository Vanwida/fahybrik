// Los días de una señal se cuentan desde el «hoy» que toca (DECISIONS «Qué día
// es en cada sitio»), no desde el día UTC del reloj: el fin de un microciclo es
// del plan, así que cuenta desde el día del CLUB; sin él, desde el del atleta.
//
// NOW = 2026-06-18 12:00 UTC. Un club en Auckland ya está en el 19: con el día
// UTC, el microciclo que acaba justo en su ventana salía un día más lejos y la
// señal no saltaba.

import { describe, expect, it } from 'vitest';
import { daysBetweenIso } from '@fahybrid/shared/domain/coach/signals';
import { baseFacts, dayOffset, fired, notFired, THRESHOLDS, TODAY } from './facts';

describe('días entre dos fechas ya resueltas', () => {
  it('cuenta días de calendario, con signo', () => {
    expect(daysBetweenIso('2026-06-18', '2026-06-18')).toBe(0);
    expect(daysBetweenIso('2026-06-18', '2026-06-21')).toBe(3);
    expect(daysBetweenIso('2026-06-21', '2026-06-18')).toBe(-3);
    // Cruza un cambio de hora sin perder ni ganar un día.
    expect(daysBetweenIso('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('microcycle_ending cuenta desde el día del club', () => {
  const window = THRESHOLDS.microcycle_ending_days;
  const clubToday = dayOffset(1); // Auckland: ya es el 19

  it('acaba justo al final de la ventana del club: salta', () => {
    const end = daysFromClub(window);
    fired('microcycle_ending', baseFacts({ club_today_iso: clubToday, current_microcycle_end_iso: end }));
  });

  it('un día más allá de la ventana del club: no salta', () => {
    const end = daysFromClub(window + 1);
    notFired('microcycle_ending', baseFacts({ club_today_iso: clubToday, current_microcycle_end_iso: end }));
  });

  it('sin día del club, cuenta desde el del atleta', () => {
    expect(TODAY).toBe(dayOffset(0));
    fired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(window) }));
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(window + 1) }));
  });

  function daysFromClub(n: number): string {
    return dayOffset(1 + n);
  }
});
