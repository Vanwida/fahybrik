import { describe, expect, it } from 'vitest';

import {
  buildWeekCells,
  buildWindowCells,
  chartLayout,
  EMBED_ANCHO_MINIMO,
  rangeBands,
  ZONE_METRICS_EMBED,
  formatDuration,
  formatWeekShort,
  missingWeeksPhrase,
  mondayOf,
  planBands,
  stackOf,
  tickStride,
  weekBreakdown,
  weekTotal,
  zoneScale,
  ZONE_MODALITY_LABEL,
  ZONE_MODALITY_ORDER,
  ZONE_PART_KEYS,
  zoneTotals,
  zoneWindowWeeks,
} from '@/lib/zones/chart';
import type { WeeklyZoneWeek } from '@/lib/zones/weekly';
import type { PlanPathSegmentDTO } from '@fahybrid/shared/domain/plan-path';
import { GRAFICA_MAX_WEEKS } from '@fahybrid/shared/domain/zone-chart';

const M = 60;
const H = 3600;

function week(week_start: string, parts: Partial<Omit<WeeklyZoneWeek, 'week_start'>>): WeeklyZoneWeek {
  const z1_s = parts.z1_s ?? 0;
  const z2_s = parts.z2_s ?? 0;
  const z3_s = parts.z3_s ?? 0;
  const z4_s = parts.z4_s ?? 0;
  const z5_s = parts.z5_s ?? 0;
  const no_hr_s = parts.no_hr_s ?? 0;
  return {
    week_start,
    z1_s,
    z2_s,
    z3_s,
    z4_s,
    z5_s,
    no_hr_s,
    total_s: parts.total_s ?? z1_s + z2_s + z3_s + z4_s + z5_s + no_hr_s,
  };
}

function segment(over: Partial<PlanPathSegmentDTO> & Pick<PlanPathSegmentDTO, 'start_date' | 'end_date'>): PlanPathSegmentDTO {
  return {
    assignment_id: over.assignment_id ?? `a-${over.start_date}`,
    month_template_id: 'mt-1',
    position: over.position ?? 0,
    first_week: over.first_week ?? 1,
    week_count: over.week_count ?? 4,
    weeks_label: over.weeks_label ?? 'S1-S4',
    title: over.title ?? 'Base 1',
    detail: over.detail ?? null,
    start_date: over.start_date,
    end_date: over.end_date,
    current_week: over.current_week ?? null,
    milestone: over.milestone ?? false,
    tone: over.tone ?? 0,
  };
}

// ── EL HUECO: la regla dura de esta pantalla ──────────────────────────────────

describe('buildWeekCells — una semana sin dato es un hueco, nunca un cero', () => {
  it('deja la semana ausente dentro del eje con week = null', () => {
    const cells = buildWeekCells({
      weeks: [week('2026-07-06', { z2_s: H }), week('2026-07-20', { z2_s: H })],
      windowWeeks: 4,
      todayIso: '2026-07-22',
    });

    expect(cells.map((c) => c.week_start)).toEqual([
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
    ]);
    expect(cells.map((c) => c.week != null)).toEqual([false, true, false, true]);
  });

  it('nunca fabrica un cero para la semana que falta', () => {
    const cells = buildWeekCells({
      weeks: [week('2026-07-20', { z2_s: H })],
      windowWeeks: 3,
      todayIso: '2026-07-22',
    });
    const hueco = cells.find((c) => c.week_start === '2026-07-13');
    expect(hueco?.week).toBeNull();
    // El hueco NO trae una semana con ceros: no hay nada que sumar ni que pintar.
    expect(zoneTotals(cells).weeksWithoutData).toBe(2);
  });

  it('llega hasta la semana de hoy aunque el último entreno sea viejo', () => {
    const cells = buildWeekCells({
      weeks: [week('2026-06-01', { z2_s: H })],
      windowWeeks: 4,
      todayIso: '2026-07-22',
    });
    expect(cells[cells.length - 1]!.week_start).toBe('2026-07-20');
    expect(cells[cells.length - 1]!.week).toBeNull();
  });

  it('se estira hacia atrás antes que soltar una semana que el motor sí sirvió', () => {
    const cells = buildWeekCells({
      weeks: [week('2026-06-29', { z2_s: H }), week('2026-07-20', { z2_s: H })],
      windowWeeks: 2,
      todayIso: '2026-07-22',
    });
    expect(cells[0]!.week_start).toBe('2026-06-29');
    expect(cells).toHaveLength(4);
    expect(cells.filter((c) => c.week != null)).toHaveLength(2);
  });

  it('coloca la semana en su lunes aunque el motor mande otro día', () => {
    const cells = buildWeekCells({
      weeks: [week('2026-07-08', { z2_s: H })],
      windowWeeks: 2,
      todayIso: '2026-07-13',
    });
    expect(cells.find((c) => c.week_start === '2026-07-06')?.week).not.toBeNull();
  });
});

describe('mondayOf', () => {
  it('retrocede al lunes de esa semana', () => {
    expect(mondayOf('2026-07-08')).toBe('2026-07-06');
    expect(mondayOf('2026-07-06')).toBe('2026-07-06');
    expect(mondayOf('2026-07-12')).toBe('2026-07-06');
  });
});

// ── LAS HORAS ─────────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('escribe las horas como las diría un entrenador', () => {
    expect(formatDuration(6 * H + 35 * M)).toBe('6h 35m');
    expect(formatDuration(2 * H)).toBe('2h');
    expect(formatDuration(45 * M)).toBe('45m');
    expect(formatDuration(0)).toBe('0');
  });

  it('no escribe nunca «0h 60m»', () => {
    expect(formatDuration(59 * M + 40)).toBe('1h');
    expect(formatDuration(H - 1)).toBe('1h');
  });

  it('un resto de segundos no se enseña como cero minutos', () => {
    expect(formatDuration(20)).toBe('<1m');
  });
});

describe('zoneScale', () => {
  it('pone el techo en la semana más alta y las marcas en horas limpias', () => {
    const scale = zoneScale(8 * H + 35 * M);
    expect(scale.max).toBe(8 * H + 35 * M);
    expect(scale.ticks).toEqual([0, 2 * H, 4 * H, 6 * H, 8 * H]);
  });

  it('baja de escalón cuando la semana es corta', () => {
    const scale = zoneScale(50 * M);
    expect(scale.ticks).toEqual([0, 15 * M, 30 * M, 45 * M]);
  });

  it('nunca pasa de cinco líneas de rejilla', () => {
    for (const max of [10 * M, H, 3 * H, 9 * H, 20 * H, 40 * H, 100 * H]) {
      expect(zoneScale(max).ticks.length).toBeLessThanOrEqual(5);
    }
  });
});

// ── LA PILA ───────────────────────────────────────────────────────────────────

describe('stackOf', () => {
  it('apila Z1 abajo y el hueco arriba, siempre en el mismo orden', () => {
    const parts = stackOf(week('2026-07-06', { z1_s: 60, z2_s: 60, z3_s: 60, z4_s: 60, z5_s: 60, no_hr_s: 60 }));
    expect(parts.map((p) => p.key)).toEqual([...ZONE_PART_KEYS]);
  });

  it('deja fuera las bandas vacías en vez de dibujarlas a cero', () => {
    const parts = stackOf(week('2026-07-06', { z2_s: 30 * M, no_hr_s: 10 * M }));
    expect(parts).toEqual([
      { key: 'z2', seconds: 30 * M, from: 0, to: 30 * M },
      { key: 'no_hr', seconds: 10 * M, from: 30 * M, to: 40 * M },
    ]);
  });

  it('cada banda llega con su tramo acumulado, seguido y sin saltos', () => {
    const parts = stackOf(week('2026-07-06', { z1_s: 10 * M, z3_s: 20 * M, no_hr_s: 5 * M }));
    expect(parts.map((p) => [p.from, p.to])).toEqual([
      [0, 10 * M],
      [10 * M, 30 * M],
      [30 * M, 35 * M],
    ]);
    expect(parts[parts.length - 1]!.to).toBe(weekTotal(week('2026-07-06', { z1_s: 10 * M, z3_s: 20 * M, no_hr_s: 5 * M })));
  });

  it('el alto de la barra se suma de sus bandas, no de total_s', () => {
    // total_s incoherente a propósito: lo que se pinta es lo que se rotula.
    const w = week('2026-07-06', { z2_s: 30 * M, no_hr_s: 10 * M, total_s: 99 * H });
    expect(weekTotal(w)).toBe(40 * M);
  });
});

describe('zoneTotals', () => {
  it('suma la ventana, cuenta los huecos y saca la parte sin repartir', () => {
    const cells = buildWeekCells({
      weeks: [
        week('2026-07-06', { z2_s: H, no_hr_s: H }),
        week('2026-07-20', { z2_s: 2 * H }),
      ],
      windowWeeks: 4,
      todayIso: '2026-07-22',
    });
    const totals = zoneTotals(cells);
    expect(totals.total).toBe(4 * H);
    expect(totals.parts.z2).toBe(3 * H);
    expect(totals.parts.no_hr).toBe(H);
    expect(totals.sinZonaShare).toBeCloseTo(0.25, 5);
    expect(totals.weeksWithData).toBe(2);
    expect(totals.weeksWithoutData).toBe(2);
    expect(totals.maxWeek).toBe(2 * H);
  });

  it('una ventana entera vacía no divide por cero', () => {
    const cells = buildWeekCells({ weeks: [], windowWeeks: 4, todayIso: '2026-07-22' });
    const totals = zoneTotals(cells);
    expect(totals.total).toBe(0);
    expect(totals.sinZonaShare).toBe(0);
    expect(totals.weeksWithoutData).toBe(4);
  });
});

// ── LA BANDA DEL PLAN ─────────────────────────────────────────────────────────

describe('planBands', () => {
  const cells = buildWeekCells({ weeks: [], windowWeeks: 6, todayIso: '2026-07-22' });
  // Las celdas van del 2026-06-15 al 2026-07-20.

  it('alinea cada tramo con las semanas que ocupa', () => {
    const bands = planBands(cells, [
      segment({ start_date: '2026-06-29', end_date: '2026-07-12', title: 'Base 1', tone: 0 }),
      segment({ start_date: '2026-07-13', end_date: '2026-07-26', title: 'Base 2', tone: 1 }),
    ]);
    expect(bands.map((b) => [b.title, b.from, b.to])).toEqual([
      ['Base 1', 2, 3],
      ['Base 2', 4, 5],
    ]);
  });

  it('recorta el tramo que entra a medias en la ventana', () => {
    const bands = planBands(cells, [
      segment({ start_date: '2026-05-04', end_date: '2026-06-28', title: 'Antes', tone: 2 }),
    ]);
    // Arrancó siete semanas antes de la ventana: la banda empieza en el borde.
    expect(bands).toHaveLength(1);
    expect(bands[0]!.from).toBe(0);
    expect(bands[0]!.to).toBe(1);
  });

  it('no dibuja el tramo que no pisa la ventana', () => {
    const bands = planBands(cells, [
      segment({ start_date: '2026-01-05', end_date: '2026-02-01' }),
      segment({ start_date: '2026-09-07', end_date: '2026-10-04' }),
    ]);
    expect(bands).toEqual([]);
  });

  it('sin plan no hay banda', () => {
    expect(planBands(cells, [])).toEqual([]);
  });

  it('lleva el tono, el hito y dónde cae hoy tal cual los sirve el motor', () => {
    const bands = planBands(cells, [
      segment({ start_date: '2026-06-29', end_date: '2026-07-26', tone: 3, milestone: true, current_week: 2 }),
    ]);
    expect(bands[0]).toMatchObject({ tone: 3, milestone: true, current: true });
  });
});

// ── PALABRAS ──────────────────────────────────────────────────────────────────

describe('weekBreakdown', () => {
  it('dice el total y el desglose de una semana con dato', () => {
    const cell = { week_start: '2026-07-06', week: week('2026-07-06', { z2_s: H, no_hr_s: 30 * M }) };
    expect(weekBreakdown(cell)).toBe(
      'Semana del 6 de julio: 1h 30m en total. Z2 base 1h, Sin zona 30m',
    );
  });

  it('dice «sin datos» en el hueco, sin inventar un cero', () => {
    expect(weekBreakdown({ week_start: '2026-07-13', week: null })).toBe(
      'Semana del 13 de julio: sin datos',
    );
  });
});

describe('missingWeeksPhrase', () => {
  it('cuenta los huecos en palabras', () => {
    expect(missingWeeksPhrase(0)).toBe('');
    expect(missingWeeksPhrase(1)).toBe('1 semana sin dato');
    expect(missingWeeksPhrase(7)).toBe('7 semanas sin dato');
  });
});

describe('tickStride', () => {
  it('rotula como mucho ocho semanas del eje', () => {
    expect(tickStride(6)).toBe(1);
    expect(tickStride(26)).toBe(4);
    expect(tickStride(52)).toBe(7);
    expect(Math.ceil(52 / tickStride(52))).toBeLessThanOrEqual(8);
  });
});

describe('formatWeekShort', () => {
  it('rotula el eje con la fecha del lunes', () => {
    expect(formatWeekShort('2026-07-06')).toContain('6');
  });
});

// ── EL FILTRO ─────────────────────────────────────────────────────────────────

describe('el filtro por tipo de entreno', () => {
  it('ofrece exactamente las modalidades del contrato, sin inventar ni olvidar', () => {
    expect([...ZONE_MODALITY_ORDER].sort()).toEqual(Object.keys(ZONE_MODALITY_LABEL).sort());
  });

  it('todas llevan nombre en castellano', () => {
    for (const m of ZONE_MODALITY_ORDER) {
      expect(ZONE_MODALITY_LABEL[m]).toMatch(/\S/);
    }
  });
});

// ── EL ANCHO ──────────────────────────────────────────────────────────────────

describe('chartLayout', () => {
  it('llena el ancho que le dan cuando las semanas caben', () => {
    const { slot, width } = chartLayout(1100, 26);
    expect(slot).toBeCloseTo((1100 - 46 - 10) / 26, 5);
    expect(width).toBeCloseTo(1100, 5);
  });

  it('scrollea en vez de encoger la semana por debajo de lo legible', () => {
    const { slot, width } = chartLayout(358, 26);
    expect(slot).toBe(34);
    expect(width).toBeGreaterThan(358);
  });

  it('deja de estirarse antes de dejar cada barra en su descampado', () => {
    const { slot, barW } = chartLayout(1440, 6);
    expect(slot).toBe(64);
    expect(barW).toBe(24);
  });

  it('sin medida todavía dibuja la versión estrecha, nunca una de ancho cero', () => {
    const { slot, barW, width } = chartLayout(0, 26);
    expect(slot).toBe(34);
    expect(barW).toBeGreaterThan(0);
    expect(width).toBe(46 + 34 * 26 + 10);
  });

  it('la barra nunca llena su hueco: siempre queda aire entre semanas', () => {
    for (const boxW of [0, 320, 390, 768, 1100, 1440, 2200]) {
      const { slot, barW } = chartLayout(boxW, 26);
      expect(barW).toBeLessThan(slot);
      expect(barW).toBeLessThanOrEqual(24);
    }
  });
});

describe('zoneWindowWeeks', () => {
  it('traduce la ventana a semanas', () => {
    expect(zoneWindowWeeks('3m')).toBe(13);
    expect(zoneWindowWeeks('6m')).toBe(26);
    expect(zoneWindowWeeks('12m')).toBe(52);
  });
});

// ── LA VENTANA CONGELADA DE UNA NOTA FIRMADA ─────────────────────────────────

describe('buildWindowCells', () => {
  it('dibuja EXACTAMENTE las semanas del periodo, ni una más', () => {
    const cells = buildWindowCells({
      weeks_data: [week('2026-05-04', { z2_s: H })],
      week_start: '2026-05-04',
      weeks: 4,
    });
    expect(cells.map((c) => c.week_start)).toEqual([
      '2026-05-04',
      '2026-05-11',
      '2026-05-18',
      '2026-05-25',
    ]);
  });

  it('no crece con el reloj: un dato posterior al periodo no entra en el eje', () => {
    const cells = buildWindowCells({
      weeks_data: [week('2026-05-04', { z2_s: H }), week('2026-07-06', { z5_s: H })],
      week_start: '2026-05-04',
      weeks: 3,
    });
    expect(cells).toHaveLength(3);
    expect(cells.some((c) => c.week_start === '2026-07-06')).toBe(false);
  });

  it('una semana sin dato deja hueco, nunca un cero', () => {
    const cells = buildWindowCells({
      weeks_data: [week('2026-05-11', { z2_s: H })],
      week_start: '2026-05-04',
      weeks: 2,
    });
    expect(cells[0]!.week).toBeNull();
    expect(cells[1]!.week).not.toBeNull();
  });
});

// ── LAS MARCAS DEL COACH ─────────────────────────────────────────────────────

describe('rangeBands', () => {
  const cells = buildWindowCells({ weeks_data: [], week_start: '2026-05-04', weeks: 5 });

  it('alinea la marca con sus celdas, ambas puntas inclusive', () => {
    const [b] = rangeBands(cells, [
      { week_start: '2026-05-11', week_end: '2026-05-25', label: 'Sierra', tone: 'atencion' },
    ]);
    expect(b!.from).toBe(1);
    expect(b!.to).toBe(3);
    expect(b!.label).toBe('Sierra');
  });

  it('una semana suelta es una marca de una celda', () => {
    const [b] = rangeBands(cells, [
      { week_start: '2026-05-18', week_end: '2026-05-18', label: 'Ojo', tone: 'bien' },
    ]);
    expect(b!.from).toBe(2);
    expect(b!.to).toBe(2);
  });

  it('recorta la que asoma por un borde y descarta la que no pisa el periodo', () => {
    const bands = rangeBands(cells, [
      { week_start: '2026-04-06', week_end: '2026-05-11', label: 'Viene de antes', tone: 'neutro' },
      { week_start: '2026-08-03', week_end: '2026-08-10', label: 'Fuera', tone: 'neutro' },
    ]);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.from).toBe(0);
    expect(bands[0]!.to).toBe(1);
  });

  it('dos marcas del mismo tramo no comparten clave', () => {
    const bands = rangeBands(cells, [
      { week_start: '2026-05-04', week_end: '2026-05-11', label: 'Una', tone: 'bien' },
      { week_start: '2026-05-04', week_end: '2026-05-11', label: 'Otra', tone: 'atencion' },
    ]);
    expect(bands[0]!.key).not.toBe(bands[1]!.key);
  });
});

// ── LA MEDIDA EMBEBIDA ───────────────────────────────────────────────────────

describe('chartLayout embebido', () => {
  it('medio año cabe dentro de la tarjeta sin scroll horizontal', () => {
    const { width } = chartLayout(EMBED_ANCHO_MINIMO, 26, ZONE_METRICS_EMBED);
    expect(width).toBeLessThanOrEqual(EMBED_ANCHO_MINIMO);
  });

  it('la ventana MÁS LARGA que se puede firmar también cabe', () => {
    const { width } = chartLayout(EMBED_ANCHO_MINIMO, GRAFICA_MAX_WEEKS, ZONE_METRICS_EMBED);
    expect(width).toBeLessThanOrEqual(EMBED_ANCHO_MINIMO);
  });

  it('la barra nunca desaparece: siempre queda algo que ver', () => {
    const { barW } = chartLayout(EMBED_ANCHO_MINIMO, GRAFICA_MAX_WEEKS, ZONE_METRICS_EMBED);
    expect(barW).toBeGreaterThanOrEqual(2);
  });
});
