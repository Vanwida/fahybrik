// Pure unit tests for the per-segment running-compliance engine (#66). No DB.
// Covers every verdict path on all three axes, the band builders + tolerances,
// and the session aggregate (incl. the honest null-pct floor).

import { describe, expect, test } from 'vitest';
import {
  PACE_POINT_TOLERANCE_S,
  RECOVERY_COMPLIANCE_LABEL,
  RECOVERY_COMPLIANCE_TIER,
  RECOVERY_DURATION_LABEL,
  RECOVERY_DURATION_TIER,
  RPE_POINT_TOLERANCE,
  RUN_COMPLIANCE_LABEL,
  RUN_COMPLIANCE_TIER,
  WORK_DURATION_LABEL,
  WORK_DURATION_TIER,
  evaluateRecoveryDuration,
  evaluateRecoverySegment,
  evaluateRunSegment,
  evaluateWorkDuration,
  hrBandFromTarget,
  paceBandFromResolvedZone,
  paceBandFromTarget,
  rpeBandFromTarget,
  summarizeRecoveryCompliance,
  summarizeRecoveryDuration,
  summarizeRunCompliance,
  summarizeWorkDuration,
  type RecoveryComplianceVerdict,
  type RecoveryDurationVerdict,
  type RunComplianceVerdict,
  type WorkDurationVerdict,
} from '@fahybrid/shared/domain/adherence';

describe('evaluateRunSegment — pace axis', () => {
  const band = paceBandFromResolvedZone(265, 275); // 4:25–4:35 /km

  test('in band → dentro (edges inclusive)', () => {
    expect(evaluateRunSegment(band, { pace_s: 270 })).toBe('dentro');
    expect(evaluateRunSegment(band, { pace_s: 265 })).toBe('dentro'); // exactly the fast edge
    expect(evaluateRunSegment(band, { pace_s: 275 })).toBe('dentro'); // exactly the slow edge
  });

  test('faster than the band → fuera_rapido', () => {
    expect(evaluateRunSegment(band, { pace_s: 258 })).toBe('fuera_rapido');
  });

  test('slower than the band → fuera_lento', () => {
    expect(evaluateRunSegment(band, { pace_s: 300 })).toBe('fuera_lento');
  });

  test('no pace captured → sin_dato', () => {
    expect(evaluateRunSegment(band, { pace_s: null })).toBe('sin_dato');
    expect(evaluateRunSegment(band, {})).toBe('sin_dato');
    expect(evaluateRunSegment(band, { pace_s: Number.NaN })).toBe('sin_dato');
  });

  test('open easy zone (no slow edge) → only fuera_rapido is possible', () => {
    const easy = paceBandFromResolvedZone(330, null); // Z1: slower than 5:30 is fine
    expect(evaluateRunSegment(easy, { pace_s: 400 })).toBe('dentro'); // jogging slow = ok
    expect(evaluateRunSegment(easy, { pace_s: 330 })).toBe('dentro');
    expect(evaluateRunSegment(easy, { pace_s: 300 })).toBe('fuera_rapido'); // too hard for easy
  });

  test('a band with no edges at all → sin_dato', () => {
    expect(evaluateRunSegment(paceBandFromResolvedZone(null, null), { pace_s: 270 })).toBe('sin_dato');
  });
});

describe('paceBandFromTarget — explicit pace', () => {
  test('a min/max band passes through as-is', () => {
    expect(paceBandFromTarget({ min_s: 265, max_s: 275 })).toEqual({ axis: 'pace', fast_s: 265, slow_s: 275 });
  });

  test('a single value widens by ±PACE_POINT_TOLERANCE_S', () => {
    const b = paceBandFromTarget({ value_s: 270 });
    expect(b).toEqual({ axis: 'pace', fast_s: 270 - PACE_POINT_TOLERANCE_S, slow_s: 270 + PACE_POINT_TOLERANCE_S });
    // within tolerance = dentro, just outside = fuera
    expect(evaluateRunSegment(b, { pace_s: 270 })).toBe('dentro');
    expect(evaluateRunSegment(b, { pace_s: 265 })).toBe('dentro'); // exactly at ±tol edge
    expect(evaluateRunSegment(b, { pace_s: 264 })).toBe('fuera_rapido');
    expect(evaluateRunSegment(b, { pace_s: 276 })).toBe('fuera_lento');
  });

  test('an empty pace target → an edgeless band (sin_dato on compare)', () => {
    expect(evaluateRunSegment(paceBandFromTarget({}), { pace_s: 270 })).toBe('sin_dato');
  });
});

describe('evaluateRunSegment — HR axis', () => {
  const band = hrBandFromTarget({ min: 150, max: 165 });

  test('in range → dentro', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 158 })).toBe('dentro');
  });
  test('above the range (harder) → fuera_rapido', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 172 })).toBe('fuera_rapido');
  });
  test('below the range (easier) → fuera_lento', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 140 })).toBe('fuera_lento');
  });
  test('no HR captured → sin_dato', () => {
    expect(evaluateRunSegment(band, { hr_bpm: null })).toBe('sin_dato');
  });
});

describe('evaluateRunSegment — RPE axis', () => {
  test('band comparison both sides', () => {
    const band = rpeBandFromTarget({ min: 8, max: 9 });
    expect(evaluateRunSegment(band, { rpe: 8 })).toBe('dentro');
    expect(evaluateRunSegment(band, { rpe: 10 })).toBe('fuera_rapido');
    expect(evaluateRunSegment(band, { rpe: 6 })).toBe('fuera_lento');
    expect(evaluateRunSegment(band, { rpe: null })).toBe('sin_dato');
  });

  test('single value widens by ±RPE_POINT_TOLERANCE', () => {
    const band = rpeBandFromTarget({ value: 7 });
    expect(band).toEqual({ axis: 'rpe', min: 7 - RPE_POINT_TOLERANCE, max: 7 + RPE_POINT_TOLERANCE });
    expect(evaluateRunSegment(band, { rpe: 7 })).toBe('dentro');
    expect(evaluateRunSegment(band, { rpe: 9 })).toBe('fuera_rapido');
  });
});

describe('evaluateRunSegment — no target', () => {
  test('null band → sin_dato (no judgment on a tramo without objetivo)', () => {
    expect(evaluateRunSegment(null, { pace_s: 270, hr_bpm: 160 })).toBe('sin_dato');
  });
});

describe('summarizeRunCompliance', () => {
  test('% is over EVALUABLE tramos, excluding sin_dato', () => {
    const verdicts: RunComplianceVerdict[] = [
      'dentro',
      'dentro',
      'dentro',
      'fuera_rapido',
      'sin_dato', // warm-up, no objetivo — not counted in the denominator
    ];
    const s = summarizeRunCompliance(verdicts);
    expect(s).toEqual({
      total: 5,
      evaluable: 4,
      dentro: 3,
      fuera_rapido: 1,
      fuera_lento: 0,
      sin_dato: 1,
      pct_dentro: 75, // 3 / 4
    });
  });

  test('rounds to the nearest whole percent', () => {
    // 2 dentro of 3 evaluable = 66.67 → 67
    expect(summarizeRunCompliance(['dentro', 'dentro', 'fuera_lento']).pct_dentro).toBe(67);
  });

  test('all sin_dato → pct is null, never 0 or NaN', () => {
    const s = summarizeRunCompliance(['sin_dato', 'sin_dato']);
    expect(s.evaluable).toBe(0);
    expect(s.pct_dentro).toBeNull();
  });

  test('empty session → total 0, pct null', () => {
    expect(summarizeRunCompliance([])).toEqual({
      total: 0,
      evaluable: 0,
      dentro: 0,
      fuera_rapido: 0,
      fuera_lento: 0,
      sin_dato: 0,
      pct_dentro: null,
    });
  });
});

describe('verdict presentation maps', () => {
  test('tier: dentro=success, fuera_*=warning, sin_dato=neutral (no error/red)', () => {
    expect(RUN_COMPLIANCE_TIER.dentro).toBe('success');
    expect(RUN_COMPLIANCE_TIER.fuera_rapido).toBe('warning');
    expect(RUN_COMPLIANCE_TIER.fuera_lento).toBe('warning');
    expect(RUN_COMPLIANCE_TIER.sin_dato).toBe('neutral');
  });

  test('every verdict has a label', () => {
    for (const v of ['dentro', 'fuera_rapido', 'fuera_lento', 'sin_dato'] as const) {
      expect(RUN_COMPLIANCE_LABEL[v]).toBeTruthy();
    }
  });
});

// ── Recuperación (#66, Alex 12-ago): la dirección que importa se invierte ─────
describe('evaluateRecoverySegment — solo "demasiado rápida" es un fallo', () => {
  const band = paceBandFromResolvedZone(330, 360); // Z1: 5:30–6:00/km

  test('dentro de la banda → controlada', () => {
    expect(evaluateRecoverySegment(band, { pace_s: 345 })).toBe('controlada');
  });

  test('más rápido que la banda (más intenso) → demasiado_rapida — el único fallo real', () => {
    expect(evaluateRecoverySegment(band, { pace_s: 300 })).toBe('demasiado_rapida');
  });

  test('MÁS LENTO que la banda (recuperación de sobra, o directamente parado) → controlada, NUNCA un fallo', () => {
    // Un ritmo mucho más lento del pedido — o un "parado" que registre un
    // ritmo carísimo/nulo — sigue siendo controlada: nadie falla por
    // descansar de más. Esta es la prueba que distingue este módulo del
    // trabajo, donde el mismo desvío sería 'fuera_lento' (un aviso).
    expect(evaluateRecoverySegment(band, { pace_s: 600 })).toBe('controlada');
  });

  test('sin muestra ejecutada → sin_dato', () => {
    expect(evaluateRecoverySegment(band, { pace_s: null })).toBe('sin_dato');
  });

  test('sin banda (no debería llamarse así desde el wire, pero es honesto igual) → sin_dato', () => {
    expect(evaluateRecoverySegment(null, { pace_s: 345 })).toBe('sin_dato');
  });

  test('funciona igual en el eje de FC y de RPE — la dirección "más intenso" es la misma señal en cualquier eje', () => {
    const hrBand = hrBandFromTarget({ min: 120, max: 140 });
    expect(evaluateRecoverySegment(hrBand, { hr_bpm: 160 })).toBe('demasiado_rapida'); // pulso alto = recuperación que no lo fue
    expect(evaluateRecoverySegment(hrBand, { hr_bpm: 100 })).toBe('controlada'); // pulso bajo = de sobra, no es un fallo

    const rpeBand = rpeBandFromTarget({ value: 3 });
    expect(evaluateRecoverySegment(rpeBand, { rpe: 8 })).toBe('demasiado_rapida');
    expect(evaluateRecoverySegment(rpeBand, { rpe: 1 })).toBe('controlada');
  });
});

describe('summarizeRecoveryCompliance', () => {
  test('pct_controlada cuenta demasiado_rapida como el único fallo — el resto son controladas', () => {
    const verdicts: RecoveryComplianceVerdict[] = [
      'controlada',
      'controlada',
      'controlada',
      'demasiado_rapida',
      'sin_dato',
    ];
    const s = summarizeRecoveryCompliance(verdicts);
    expect(s).toEqual({
      total: 5,
      evaluable: 4,
      controlada: 3,
      demasiado_rapida: 1,
      sin_dato: 1,
      pct_controlada: 75, // 3 / 4
    });
  });

  test('todo sin_dato → pct null, nunca 0 ni NaN', () => {
    const s = summarizeRecoveryCompliance(['sin_dato', 'sin_dato']);
    expect(s.evaluable).toBe(0);
    expect(s.pct_controlada).toBeNull();
  });

  test('sesión vacía (ninguna recuperación con objetivo) → total 0, pct null', () => {
    expect(summarizeRecoveryCompliance([])).toEqual({
      total: 0,
      evaluable: 0,
      controlada: 0,
      demasiado_rapida: 0,
      sin_dato: 0,
      pct_controlada: null,
    });
  });
});

describe('verdict presentation maps — recuperación', () => {
  test('tier: controlada=success, demasiado_rapida=warning, sin_dato=neutral', () => {
    expect(RECOVERY_COMPLIANCE_TIER.controlada).toBe('success');
    expect(RECOVERY_COMPLIANCE_TIER.demasiado_rapida).toBe('warning');
    expect(RECOVERY_COMPLIANCE_TIER.sin_dato).toBe('neutral');
  });

  test('every verdict has a label', () => {
    for (const v of ['controlada', 'demasiado_rapida', 'sin_dato'] as const) {
      expect(RECOVERY_COMPLIANCE_LABEL[v]).toBeTruthy();
    }
  });
});

// ── Duración (#66, el coach al verificar la recuperación, 12-ago) ─────────────
// Tolerancia: 10% relativo, reutilizada de bands.ts (bandRuleFor({measure_kind:
// 'duration'}).on_target_max) — así que 90 s prescritos dan una ventana de
// [81, 99] s, y 600 s (10 min) dan [540, 660] s. Los números de estos tests
// están elegidos para caer justo dentro/fuera de esas ventanas.
describe('evaluateRecoveryDuration — el fallo es PASARSE de tiempo', () => {
  test('dentro de la ventana de tolerancia (10%) → duracion_controlada', () => {
    expect(evaluateRecoveryDuration(90, 90)).toBe('duracion_controlada');
    expect(evaluateRecoveryDuration(90, 99)).toBe('duracion_controlada'); // borde inclusive
    expect(evaluateRecoveryDuration(90, 81)).toBe('duracion_controlada'); // borde inclusive
  });

  test('se pasó de tiempo (más allá del 10%) → duracion_excedida — el único fallo', () => {
    expect(evaluateRecoveryDuration(90, 100)).toBe('duracion_excedida');
    // El caso del encargo: 90 s pedidos, 3 min (180 s) reales.
    expect(evaluateRecoveryDuration(90, 180)).toBe('duracion_excedida');
  });

  test('se quedó corto (menos del 10%) → duracion_controlada, NUNCA un fallo — es un mérito si acaso', () => {
    expect(evaluateRecoveryDuration(90, 80)).toBe('duracion_controlada');
    expect(evaluateRecoveryDuration(90, 10)).toBe('duracion_controlada'); // incluso pararse casi de inmediato
    expect(evaluateRecoveryDuration(90, 0)).toBe('duracion_controlada');
  });

  test('sin duración ejecutada capturada → sin_dato', () => {
    expect(evaluateRecoveryDuration(90, null)).toBe('sin_dato');
  });
});

describe('evaluateWorkDuration — el fallo es QUEDARSE CORTO, la imagen especular de recuperación', () => {
  test('dentro de la ventana → duracion_completa', () => {
    expect(evaluateWorkDuration(600, 600)).toBe('duracion_completa');
    expect(evaluateWorkDuration(600, 660)).toBe('duracion_completa'); // borde inclusive
    expect(evaluateWorkDuration(600, 540)).toBe('duracion_completa'); // borde inclusive
  });

  test('se quedó corto (menos del 10%) → duracion_incompleta — el único fallo', () => {
    expect(evaluateWorkDuration(600, 400)).toBe('duracion_incompleta');
  });

  test('se pasó de tiempo (más del 10%) → duracion_completa, NUNCA un fallo — hizo al menos lo pedido', () => {
    expect(evaluateWorkDuration(600, 800)).toBe('duracion_completa');
    expect(evaluateWorkDuration(600, 1200)).toBe('duracion_completa');
  });

  test('sin duración ejecutada capturada → sin_dato', () => {
    expect(evaluateWorkDuration(600, null)).toBe('sin_dato');
  });
});

describe('summarizeRecoveryDuration', () => {
  test('pct_controlada cuenta duracion_excedida como el único fallo', () => {
    const verdicts: RecoveryDurationVerdict[] = [
      'duracion_controlada',
      'duracion_controlada',
      'duracion_controlada',
      'duracion_excedida',
      'sin_dato',
    ];
    expect(summarizeRecoveryDuration(verdicts)).toEqual({
      total: 5,
      evaluable: 4,
      controlada: 3,
      excedida: 1,
      sin_dato: 1,
      pct_controlada: 75,
    });
  });

  test('sesión sin recuperaciones con duración prescrita → total 0, pct null', () => {
    expect(summarizeRecoveryDuration([])).toEqual({
      total: 0,
      evaluable: 0,
      controlada: 0,
      excedida: 0,
      sin_dato: 0,
      pct_controlada: null,
    });
  });
});

describe('summarizeWorkDuration', () => {
  test('pct_completa cuenta duracion_incompleta como el único fallo', () => {
    const verdicts: WorkDurationVerdict[] = [
      'duracion_completa',
      'duracion_completa',
      'duracion_incompleta',
      'sin_dato',
    ];
    expect(summarizeWorkDuration(verdicts)).toEqual({
      total: 4,
      evaluable: 3,
      completa: 2,
      incompleta: 1,
      sin_dato: 1,
      pct_completa: 67,
    });
  });

  test('sin tramos de trabajo con duración prescrita → total 0, pct null', () => {
    expect(summarizeWorkDuration([])).toEqual({
      total: 0,
      evaluable: 0,
      completa: 0,
      incompleta: 0,
      sin_dato: 0,
      pct_completa: null,
    });
  });
});

describe('verdict presentation maps — duración', () => {
  test('tier de recuperación: duracion_controlada=success, duracion_excedida=warning, sin_dato=neutral', () => {
    expect(RECOVERY_DURATION_TIER.duracion_controlada).toBe('success');
    expect(RECOVERY_DURATION_TIER.duracion_excedida).toBe('warning');
    expect(RECOVERY_DURATION_TIER.sin_dato).toBe('neutral');
  });

  test('tier de trabajo: duracion_completa=success, duracion_incompleta=warning, sin_dato=neutral', () => {
    expect(WORK_DURATION_TIER.duracion_completa).toBe('success');
    expect(WORK_DURATION_TIER.duracion_incompleta).toBe('warning');
    expect(WORK_DURATION_TIER.sin_dato).toBe('neutral');
  });

  test('cada veredicto de duración (trabajo y recuperación) tiene etiqueta', () => {
    for (const v of ['duracion_controlada', 'duracion_excedida', 'sin_dato'] as const) {
      expect(RECOVERY_DURATION_LABEL[v]).toBeTruthy();
    }
    for (const v of ['duracion_completa', 'duracion_incompleta', 'sin_dato'] as const) {
      expect(WORK_DURATION_LABEL[v]).toBeTruthy();
    }
  });
});
