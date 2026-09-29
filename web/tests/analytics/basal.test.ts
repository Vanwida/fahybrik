// LA BASAL (shared/domain/analytics/basal.ts): una sola definición, la del
// readiness, en días locales del atleta, con la ventana del coach.

import { describe, expect, test } from 'vitest';
import {
  basalDe,
  comparaConBasal,
  diaDeSueno,
  diaLocal,
  diasBasal,
  diasRecientes,
  frenteABasal,
  mediaEn,
  nochesDeSueno,
  primerDiaNecesario,
  recienteDe,
  ventanaBasalDe,
  type MuestraDia,
} from '@fahybrid/shared/domain/analytics/basal';
import { DEFAULT_COACH_ANALYTICS_METHOD } from '@fahybrid/shared/domain/analytics/metodo';
import { zonedWallClockToUtc, parseIsoDate } from '@fahybrid/shared/domain/dates';

const V = ventanaBasalDe(DEFAULT_COACH_ANALYTICS_METHOD);

describe('las ventanas', () => {
  test('la basal por defecto es la del readiness: de hoy−60 a hoy−15, 46 días', () => {
    expect(V).toEqual({ dias: 60, excluir_dias: 14 });
    expect(diasBasal('2026-09-29', V)).toEqual({ desde: '2026-07-31', hasta: '2026-09-14' });
  });

  test('la ventana del coach manda', () => {
    expect(diasBasal('2026-09-29', { dias: 28, excluir_dias: 0 })).toEqual({ desde: '2026-09-01', hasta: '2026-09-28' });
  });

  test('lo reciente son los siete días que acaban hoy', () => {
    expect(diasRecientes('2026-09-29')).toEqual({ desde: '2026-09-23', hasta: '2026-09-29' });
    expect(diasRecientes('2026-09-29', 1)).toEqual({ desde: '2026-09-29', hasta: '2026-09-29' });
  });

  test('para cubrir la basal del primer día de un periodo hay que leer desde su basal', () => {
    expect(primerDiaNecesario('2026-07-07', V)).toBe('2026-05-08');
  });
});

describe('la media', () => {
  test('es de las MUESTRAS, no de medias diarias, y cuenta las noches distintas', () => {
    const m: MuestraDia[] = [
      { dia: '2026-09-28', valor: 40 },
      { dia: '2026-09-28', valor: 50 },
      { dia: '2026-09-29', valor: 90 },
    ];
    const r = mediaEn(m, { desde: '2026-09-28', hasta: '2026-09-29' });
    expect(r.valor).toBeCloseTo(60, 10);
    expect([r.muestras, r.noches]).toEqual([3, 2]);
  });

  test('sin muestras la media es null, jamás cero', () => {
    const r = mediaEn([], { desde: '2026-09-01', hasta: '2026-09-29' });
    expect(r.valor).toBeNull();
    expect([r.muestras, r.noches]).toEqual([0, 0]);
  });

  test('los bordes entran y lo de fuera no', () => {
    const m: MuestraDia[] = [
      { dia: '2026-07-30', valor: 1000 },
      { dia: '2026-07-31', valor: 50 },
      { dia: '2026-09-14', valor: 60 },
      { dia: '2026-09-15', valor: 1000 },
    ];
    const b = basalDe(m, '2026-09-29', V);
    expect(b.valor).toBe(55);
    expect(b.noches).toBe(2);
  });
});

describe('frente a la basal', () => {
  test('delta = reciente − basal, sin redondear', () => {
    const m: MuestraDia[] = [
      { dia: '2026-08-10', valor: 60 },
      { dia: '2026-08-11', valor: 61 },
      { dia: '2026-09-28', valor: 50.4 },
    ];
    const r = frenteABasal(m, '2026-09-29', V);
    expect(r.reciente.valor).toBe(50.4);
    expect(r.basal.valor).toBe(60.5);
    expect(r.delta).toBeCloseTo(-10.1, 10);
  });

  test('sin basal no hay delta: «sin basal» no es «igual que siempre»', () => {
    const r = frenteABasal([{ dia: '2026-09-28', valor: 50 }], '2026-09-29', V);
    expect(r.delta).toBeNull();
    expect(recienteDe([{ dia: '2026-09-28', valor: 50 }], '2026-09-29').valor).toBe(50);
  });
});

describe('las puertas del coach', () => {
  const m = DEFAULT_COACH_ANALYTICS_METHOD;
  const basal: MuestraDia[] = Array.from({ length: 20 }, (_, i) => ({ dia: `2026-08-${String(i + 1).padStart(2, '0')}`, valor: 60 }));

  test('pasa las dos: delta fiable', () => {
    const r = comparaConBasal([...basal, { dia: '2026-09-27', valor: 55 }, { dia: '2026-09-28', valor: 55 }, { dia: '2026-09-29', valor: 55 }], '2026-09-29', m);
    expect(r.falla).toBeNull();
    expect(r.delta_fiable).toBe(-5);
  });

  test('lo reciente va primero: sin tres noches recientes nadie está midiendo', () => {
    const r = comparaConBasal([...basal, { dia: '2026-09-29', valor: 55 }], '2026-09-29', m);
    expect(r.falla).toBe('reciente');
    expect(r.delta).toBe(-5); // el número existe…
    expect(r.delta_fiable).toBeNull(); // …pero no sostiene nada
  });

  test('con noches recientes y una basal corta, falta la basal', () => {
    const r = comparaConBasal([...basal.slice(0, 5), { dia: '2026-09-27', valor: 55 }, { dia: '2026-09-28', valor: 55 }, { dia: '2026-09-29', valor: 55 }], '2026-09-29', m);
    expect(r.falla).toBe('basal');
    expect(r.delta_fiable).toBeNull();
  });
});

describe('una noche, un número', () => {
  test('de los lotes que subió el teléfono para una noche, el más completo', () => {
    const lotes: MuestraDia[] = [
      { dia: '2026-09-20', valor: 1.25 },
      { dia: '2026-09-20', valor: 8.53 },
      { dia: '2026-09-20', valor: 8.77 },
      { dia: '2026-09-20', valor: 8.39 },
      { dia: '2026-09-21', valor: 5.68 },
      { dia: '2026-09-21', valor: 0 },
    ];
    expect(nochesDeSueno(lotes)).toEqual([
      { dia: '2026-09-20', valor: 8.77 },
      { dia: '2026-09-21', valor: 5.68 },
    ]);
  });
});

describe('a qué día pertenece cada muestra', () => {
  const TZ = 'Europe/Madrid';
  const local = (iso: string, horas: number) => zonedWallClockToUtc(parseIsoDate(iso), TZ, { hours: horas });

  test('una lectura de un instante es del día del calendario del atleta, no del de Greenwich', () => {
    // 23:30 del 28 en Madrid (verano, UTC+2) son las 21:30 UTC del 28… y las 00:30 del 29 son las 22:30 UTC del 28.
    expect(diaLocal(local('2026-09-29', 0.5), TZ)).toBe('2026-09-29');
    expect(diaLocal(local('2026-09-28', 23.5), TZ)).toBe('2026-09-28');
  });

  test('el sueño es del día en que te despiertas; una siesta no es una noche', () => {
    expect(diaDeSueno(local('2026-09-28', 23), TZ)).toBe('2026-09-29');
    expect(diaDeSueno(local('2026-09-28', 18), TZ)).toBe('2026-09-29');
    expect(diaDeSueno(local('2026-09-29', 0), TZ)).toBe('2026-09-29');
    expect(diaDeSueno(local('2026-09-29', 13.99), TZ)).toBe('2026-09-29');
    expect(diaDeSueno(local('2026-09-29', 14), TZ)).toBeNull();
    expect(diaDeSueno(local('2026-09-29', 17.99), TZ)).toBeNull();
  });

  test('la noche del cambio de hora (25 h) sigue siendo una noche', () => {
    // 25-10-2026: a las 03:00 se vuelve a las 02:00. La noche del 24 al 25.
    expect(diaDeSueno(local('2026-10-24', 23), TZ)).toBe('2026-10-25');
    expect(diaDeSueno(local('2026-10-25', 7), TZ)).toBe('2026-10-25');
  });

  test('coincide con la ventana del readiness: [D−60 00:00, D−14 00:00) locales ⇔ día local en la basal', () => {
    const hoy = '2026-11-10'; // la basal cruza el cambio de hora del 25-10
    const desde = zonedWallClockToUtc(parseIsoDate(hoy), TZ, { days: -60, hours: 0 }).getTime();
    const hasta = zonedWallClockToUtc(parseIsoDate(hoy), TZ, { days: -14, hours: 0 }).getTime();
    const b = diasBasal(hoy, V);
    for (let h = -24 * 70; h <= 0; h += 7) {
      const at = new Date(zonedWallClockToUtc(parseIsoDate(hoy), TZ).getTime() + h * 3_600_000);
      const enReadiness = at.getTime() >= desde && at.getTime() < hasta;
      const d = diaLocal(at, TZ);
      const enBasal = d >= b.desde && d <= b.hasta;
      expect(enBasal, at.toISOString()).toBe(enReadiness);
    }
  });
});
