// La carga (CTL/TSB/ACWR) no se pinta sin 42 días de historia: el CTL es una media
// exponencial de τ = 42 d y con menos historia sale bajo por construcción.

import { describe, expect, test } from 'vitest';
import { LOAD_HISTORY_MIN_DAYS, loadHistory, loadHistoryLine } from '@/lib/dashboard/v2/ficha-load-history';
import { CTL_DECAY_DAYS } from '@fahybrid/shared/domain/training-load/banister';

const series = (total: number, firstLoadIndex: number | null) =>
  Array.from({ length: total }, (_, i) => ({ tss: firstLoadIndex != null && i >= firstLoadIndex ? 40 : 0 }));

describe('historia de carga', () => {
  test('la ventana es la constante del modelo (τ del CTL)', () => {
    expect(LOAD_HISTORY_MIN_DAYS).toBe(CTL_DECAY_DAYS);
    expect(LOAD_HISTORY_MIN_DAYS).toBe(42);
  });

  test('sin ninguna carga: 0 días, nada se pinta', () => {
    const h = loadHistory(series(174, null));
    expect(h).toMatchObject({ history_days: 0, enough: false, atl_ready: false, weeks_have: 0, weeks_needed: 6 });
    expect(loadHistoryLine(h)).toBe('necesita 6 semanas de datos, lleva 0 días');
  });

  test('tres semanas (el caso de la revisión): ATL sí, CTL/TSB/ACWR no', () => {
    const h = loadHistory(series(174, 174 - 23));
    expect(h.history_days).toBe(23);
    expect(h.enough).toBe(false);
    expect(h.atl_ready).toBe(true);
    expect(loadHistoryLine(h)).toBe('necesita 6 semanas de datos, lleva 3 semanas');
  });

  test('cuenta desde el PRIMER día con carga, aunque luego haya días de descanso', () => {
    const s = series(174, null);
    s[174 - 42]!.tss = 30; // un solo entreno hace 41 días + hoy
    expect(loadHistory(s)).toMatchObject({ history_days: 42, enough: true });
  });

  test('una semana: frase en singular', () => {
    expect(loadHistoryLine(loadHistory(series(174, 174 - 8)))).toBe('necesita 6 semanas de datos, lleva 1 semana');
    expect(loadHistoryLine(loadHistory(series(174, 173)))).toBe('necesita 6 semanas de datos, lleva 1 día');
  });
});
