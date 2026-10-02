import { describe, expect, it } from 'vitest';
import { estadoSummary } from '@/components/v2/atleta-detalle/estado/estado-summary';
import type { FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';

const TODAY = '2026-10-02';
type SummaryState = Pick<FichaEstado, 'readiness' | 'last_checkin' | 'injury'>;
const empty: SummaryState = { readiness: null, last_checkin: null, injury: null };

describe('Estado plegado: evidencia completa y fechada', () => {
  it('distingue un fallo de carga de ausencia de datos y no inventa un estado favorable', () => {
    expect(estadoSummary(null, TODAY)).toBe('No se ha podido cargar el estado.');
    const missing = estadoSummary(empty, TODAY);
    expect(missing).toContain('Sin check-in');
    expect(missing).toContain('Readiness sin datos');
    expect(missing).not.toContain('al día');
  });
  it('nombra primero la lesión activa aunque haya buenos datos de readiness', () => {
    const summary = estadoSummary({ ...empty,
      injury: { id: '4', zone_label: 'Rodilla izquierda', severity_label: 'Moderada', status: 'activa', onset_date: '2026-09-28' },
      readiness: { value: 90, baseline: 85, baseline_readings: 12, trend_14d: [], observed_at: TODAY, band: 'ok' },
    }, TODAY);
    expect(summary.startsWith('Lesión activa: Rodilla izquierda')).toBe(true);
    expect(summary).toContain('Readiness 90 hoy');
    expect(summary).toContain('+5 vs su base 85');
  });
  it('una lectura vieja y un check-in de cero mantienen fecha, valor y falta de base', () => {
    const summary = estadoSummary({ ...empty,
      readiness: { value: 0, baseline: null, baseline_readings: 1, trend_14d: [], observed_at: '2026-09-29', band: 'low' },
      last_checkin: { recorded_for: '2026-09-29', time_label: '08:30', days_ago: 3, soreness: null, mood: null, motivation: null,
        fatigue: null, sleep_quality: null, notes: null, sub_score: 0, adaptive_flag: null, answered: false },
    }, TODAY);
    expect(summary).toContain('Último check-in hace 3 días · 0/100');
    expect(summary).toContain('Readiness 0 el 29 sept');
    expect(summary).toContain('aún sin su base (1 de 7 lecturas)');
    expect(summary).not.toContain('hoy');
  });
});
