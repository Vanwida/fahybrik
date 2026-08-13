import { describe, expect, it } from 'vitest';
import {
  ATLETA_TABS,
  DEFAULT_ATLETA_TAB,
  normalizeAtletaTab,
  resolveAtletaUrl,
} from '@/lib/dashboard/v2/atleta-detalle-types';
import {
  checkinRespondido,
  estadoSesion,
  formatRaceTime,
  formatSleepHours,
  interpretarAdherencia,
  tendenciaAdherencia,
  semanasHasta,
} from '@/lib/dashboard/v2/ficha-resumen';
import type { PlanSession } from '@/lib/dashboard/coach/athlete-plan';

function sesion(over: Partial<PlanSession> = {}): PlanSession {
  return {
    assignment_id: '1',
    iso_date: '2026-08-12',
    title: 'Fartlek 6×3′',
    status: 'scheduled',
    duration_min: 40,
    format: null,
    rpe: null,
    modality: 'carrera',
    ...over,
  };
}

describe('ficha IA · pestañas', () => {
  it('son cinco y el default es resumen', () => {
    expect([...ATLETA_TABS]).toEqual(['resumen', 'plan', 'rendimiento', 'del-coach', 'atleta']);
    expect(DEFAULT_ATLETA_TAB).toBe('resumen');
    expect(normalizeAtletaTab(undefined)).toBe('resumen');
  });

  it('redirige las ?tab= viejas sin perder la superficie', () => {
    expect(normalizeAtletaTab('perfil')).toBe('atleta');
    expect(normalizeAtletaTab('mensajes')).toBe('mensajes');
    expect(normalizeAtletaTab('del-coach')).toBe('del-coach');
    expect(resolveAtletaUrl('correr', undefined).tab).toBe('rendimiento');
    expect(resolveAtletaUrl('correr', undefined).rendimientoVista).toBe('correr');
    expect(resolveAtletaUrl('ritmos', undefined).rendimientoVista).toBe('zonas');
    expect(resolveAtletaUrl('pagos', undefined).atletaSeccion).toBe('pagos');
    expect(resolveAtletaUrl('sesiones', undefined).atletaSeccion).toBe('sesiones');
    expect(resolveAtletaUrl('rendimiento', 'cuerpo').rendimientoVista).toBe('cuerpo');
  });
});

describe('ficha Resumen · estados de día', () => {
  it('mapea completed/missed/hoy/futuro/vacío', () => {
    expect(estadoSesion(sesion({ status: 'completed' }), false, '2026-08-10', '2026-08-12')).toBe(
      'hecha',
    );
    expect(estadoSesion(sesion({ status: 'missed' }), false, '2026-08-10', '2026-08-12')).toBe(
      'sin_hacer',
    );
    expect(estadoSesion(sesion({ status: 'scheduled' }), false, '2026-08-10', '2026-08-12')).toBe(
      'sin_hacer',
    );
    expect(estadoSesion(sesion({ status: 'scheduled' }), true, '2026-08-12', '2026-08-12')).toBe(
      'en_curso',
    );
    expect(estadoSesion(sesion({ status: 'scheduled' }), false, '2026-08-14', '2026-08-12')).toBe(
      'prevista',
    );
    expect(estadoSesion(undefined, false, '2026-08-16', '2026-08-12')).toBe('descanso');
  });
});

describe('ficha Resumen · adherencia', () => {
  it('marca cayendo solo con un hueco real', () => {
    expect(
      tendenciaAdherencia([
        { week_start: 'a', scheduled: 6, completed: 5, pct: 83 },
        { week_start: 'b', scheduled: 6, completed: 2, pct: 33 },
      ]),
    ).toBe('cayendo');
    expect(
      tendenciaAdherencia([{ week_start: 'a', scheduled: 6, completed: 5, pct: 83 }]),
    ).toBeNull();
  });

  it('escribe la frase solo cuando hay evidencia', () => {
    const days = [
      {
        iso_date: '2026-08-10',
        day_of_week: 1,
        label: 'Lun',
        is_today: false,
        sessions: [sesion({ status: 'completed', modality: 'fuerza', title: 'Fuerza' })],
      },
      {
        iso_date: '2026-08-11',
        day_of_week: 2,
        label: 'Mar',
        is_today: false,
        sessions: [sesion({ status: 'missed', modality: 'carrera', title: 'Fartlek' })],
      },
    ];
    expect(interpretarAdherencia([], days, '2026-08-12')).toBe(
      'Se cae en las sesiones de carrera. Las de fuerza las cumple todas.',
    );
    expect(interpretarAdherencia([], [], '2026-08-12')).toBeNull();
  });
});

describe('ficha Resumen · formatos', () => {
  it('no inventa ceros ni horas sueltas', () => {
    expect(formatSleepHours(6.2)).toBe('6:12');
    expect(formatRaceTime(4800)).toBe('1:20:00');
    expect(semanasHasta(45)).toBe(7);
    expect(
      checkinRespondido('2026-08-12', [
        { sender_role: 'athlete', created_at: '2026-08-12T08:00:00Z' },
      ]),
    ).toBe(false);
    expect(
      checkinRespondido('2026-08-12', [
        { sender_role: 'coach', created_at: '2026-08-12T11:00:00Z' },
      ]),
    ).toBe(true);
  });
});
