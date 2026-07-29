// La regla: un hueco en la carga no puede acabar en «súbele el volumen».
//
// La revisión semanal es donde los números de carga se convierten en acciones —
// incluida una que aplica +5 % a varios atletas de golpe. Con cobertura parcial
// el TSB lee más fresco de lo que el atleta está (las sesiones que faltan son
// las recientes), así que toda afirmación que AÑADA carga se retira y las que la
// QUITAN se quedan. Ver shared/domain/training-load/coverage.ts.

import { describe, expect, test } from 'vitest';
import {
  computeAttention,
  computeMassAdjustments,
  computeTransitions,
} from '@/lib/coach/weekly-review';
import { readLoadCoverage, summarizeLoad } from '@fahybrid/shared/domain/training-load';
import type { CohortRow } from '@fahybrid/shared/domain/coach/types';

function coverage(knownSeconds: number, unknownSeconds: number, unknownSessions: number) {
  return readLoadCoverage(
    summarizeLoad([
      {
        date: '2026-07-01',
        tss: 60,
        known_seconds: knownSeconds,
        unknown_seconds: unknownSeconds,
        unknown_sessions: unknownSessions,
      },
    ]),
  );
}

const FULL = coverage(3600, 0, 0);
/** 50 % del trabajo sin valorar → por debajo del umbral, sin veredicto. */
const HOLED = coverage(1800, 1800, 2);

function row(overrides: Partial<CohortRow> = {}): CohortRow {
  return {
    athlete_id: '1',
    full_name: 'Atleta Real',
    is_demo: false,
    block_type: 'Semana base',
    block_week: 2,
    compliance_pct: 95,
    hrv_delta_ms: null,
    hrv_trend: null,
    acr: null,
    tsb: 8,
    ctl: 40,
    atl: 32,
    load_coverage: FULL,
    next_session: null,
    last_sync_at: null,
    sync_minutes_ago: null,
    race_readiness: null,
    polarization_pct: null,
    z45_pct_7d: null,
    vo2max: null,
    vo2max_trend: null,
    sleep_avg_7d_h: null,
    rhr: null,
    days_to_a_event: null,
    a_event_name: null,
    volume_7d_h: null,
    sessions_today: { am: null, pm: null },
    last_checkin_at: null,
    in_gym_today: false,
    alerts: [],
    primary_alert: null,
    flags: {
      transition_ready: false,
      test_today: false,
      twice_daily_today: false,
      a_event_within_30d: false,
    },
    programming_status: 'ok',
    programming_label: null,
    readiness_score: null,
    ...overrides,
  };
}

function threeFresh(cov: CohortRow['load_coverage']): CohortRow[] {
  return ['1', '2', '3'].map((id) =>
    row({ athlete_id: id, full_name: `Atleta ${id}`, load_coverage: cov }),
  );
}

describe('subir carga en masa exige que la frescura se CONOZCA', () => {
  test('con la carga entera valorada, la oportunidad de +5 % sale', () => {
    const ops = computeMassAdjustments(threeFresh(FULL));
    expect(ops.map((o) => o.id)).toContain('mass-load-increase');
  });

  test('con un hueco en la carga, NO sale: el TSB que la dispara lee más fresco de lo que está', () => {
    const ops = computeMassAdjustments(threeFresh(HOLED));
    expect(ops.map((o) => o.id)).not.toContain('mass-load-increase');
  });

  test('sin TSB no hay frescura: un nulo no vale como «fresco»', () => {
    const ops = computeMassAdjustments(threeFresh(FULL).map((r) => ({ ...r, tsb: null })));
    expect(ops.map((o) => o.id)).not.toContain('mass-load-increase');
  });

  test('el microciclo de recuperación SÍ sobrevive al hueco: quita carga, no la añade', () => {
    const cohort = ['1', '2', '3'].map((id) =>
      row({ athlete_id: id, tsb: -30, load_coverage: HOLED }),
    );
    const ops = computeMassAdjustments(cohort);
    expect(ops.map((o) => o.id)).toContain('mass-recovery-microcycle');
  });
});

describe('progresar de microciclo exige lo mismo', () => {
  test('con la carga entera valorada, avanza', () => {
    const [t] = computeTransitions([row({ block_week: 3 })]);
    expect(t?.recommendation).toBe('advance');
  });

  test('con un hueco, se queda en hold y el hueco aparece escrito en las señales', () => {
    const [t] = computeTransitions([row({ block_week: 3, load_coverage: HOLED })]);
    expect(t?.recommendation).toBe('hold');
    expect(t?.signals.some((s) => s.includes('valorado'))).toBe(true);
  });

  test('un TSB nulo tampoco avanza (antes contaba como 0 y pasaba la puerta)', () => {
    const [t] = computeTransitions([row({ block_week: 3, tsb: null })]);
    expect(t?.recommendation).toBe('hold');
  });
});

// La imagen especular del bug de la adherencia: allí un null se leía como 1 y
// acababa en «avanzar»; aquí se leía como 0 y acababa en «regresar», con un
// «Compliance 0%» impreso al lado. Un hueco no castiga ni premia: se queda en
// hold y se dice que falta el dato.
describe('una adherencia desconocida no es un 0 %', () => {
  test('sin adherencia NO se recomienda regresar', () => {
    const [t] = computeTransitions([row({ block_week: 3, compliance_pct: null })]);
    expect(t?.recommendation).toBe('hold');
  });

  test('sin adherencia tampoco se avanza', () => {
    const [t] = computeTransitions([row({ block_week: 3, compliance_pct: null })]);
    expect(t?.recommendation).not.toBe('advance');
  });

  test('la señal declara el hueco en vez de imprimir «Compliance 0%»', () => {
    const [t] = computeTransitions([row({ block_week: 3, compliance_pct: null })]);
    expect(t?.signals).toContain('Adherencia sin datos todavía');
    expect(t?.signals.some((s) => s.includes('Compliance 0%'))).toBe(false);
  });

  test('una adherencia BAJA de verdad sí sigue mandando a regresar', () => {
    const [t] = computeTransitions([row({ block_week: 3, compliance_pct: 45 })]);
    expect(t?.recommendation).toBe('regress');
    expect(t?.signals).toContain('Compliance 45%');
  });
});

describe('la cola de atención anota el hueco, pero no lo convierte en alerta', () => {
  test('un atleta sin más problema que la cobertura NO entra en la cola', () => {
    expect(computeAttention([row({ load_coverage: HOLED })])).toEqual([]);
  });

  test('a quien ya está en la cola se le escribe el hueco al lado de sus señales', () => {
    const [item] = computeAttention([
      row({ compliance_pct: 50, load_coverage: HOLED }),
    ]);
    expect(item?.signals.some((s) => s.includes('valorado'))).toBe(true);
  });

  test('y cuando lo único que estorba es el hueco, la recomendación es pedir el RPE, no «monitorizar»', () => {
    // Entra en la cola por el wearable sin sincronizar, con la adherencia sana:
    // sin cobertura, monitorizar otros 7 días una curva con agujeros no arregla
    // nada. Lo que hay que hacer es cerrar el agujero.
    const alerts: CohortRow['alerts'] = [
      { kind: 'no_sync', severity: 'warning', label: 'Sync >24h', detail: 'comprobar wearable' },
    ];
    const [holed] = computeAttention([
      row({ compliance_pct: 95, alerts, load_coverage: HOLED }),
    ]);
    expect(holed?.recommendation).toBe('Pídele el RPE de esas sesiones.');

    const [whole] = computeAttention([
      row({ compliance_pct: 95, alerts, load_coverage: FULL }),
    ]);
    expect(whole?.recommendation).toBe('Monitorizar próximos 7d');
  });
});
