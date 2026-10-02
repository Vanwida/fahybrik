import { describe, expect, it } from 'vitest';
import { coachReturn, withCoachReturn } from '@/components/v2/shared/context-link';
import { libraryView } from '@/components/v2/biblioteca/library-view';
import { rendimientoVista } from '@/components/v2/atleta-detalle/rendimiento/rendimiento-navigation';
import { resolveAtletaUrl } from '@/lib/dashboard/v2/atleta-detalle-types';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resumenGrupo } from '@/components/v2/ajustes/metodo-analiticas/resumen';

describe('continuidad del dashboard', () => {
  it('conserva atleta, periodo, zoom y roster a través del programa y del grupo', () => {
    const athlete = '/es/atletas/72?tab=plan&fecha=2026-09-14&zoom=semana&desde=estado%3Dtodos';
    const program = withCoachReturn('/programar/programas/31', athlete);
    expect(program.startsWith('/programar/programas/31?')).toBe(true);
    const back = new URL(program, 'https://x').searchParams.get('volver');
    expect(coachReturn(back, 'es')).toEqual({ href: athlete, label: 'Volver al atleta' });
    const group = withCoachReturn('/es/programar/grupos/14', athlete);
    const viaGroup = withCoachReturn('/programar/programas/31', group);
    expect(coachReturn(new URL(viaGroup, 'https://x').searchParams.get('volver'), 'es')?.href).toBe(group);
  });
  it.each(['https://other.example/es/atletas/1', '//other.example/es/atletas/1', '/en/atletas/1', '/es/api/coach/1', '/es/atletas/abc', '/es/atletas/1\n', '/es/\\other.example/atletas/1'])('rechaza un regreso fuera del dashboard: %s', (value) => {
    expect(coachReturn(value, 'es')).toBeNull();
  });
  it.each([
    ['forma', 'resumen'], ['recuperacion', 'resumen'], ['semanas', 'carga'], ['intensidad', 'carga'],
    ['tiempo-en-zonas', 'carga'], ['progreso', 'progreso'], ['records', 'progreso'], ['un-rm-medido', 'progreso'],
    ['tramos', 'sesiones'], ['correr', 'carreras'], ['carrera', 'carreras'], ['carreras', 'carreras'],
    ['umbrales', 'zonas'], ['zonas', 'zonas'], ['fisiologia', 'fisiologia'],
  ])('el enlace a %s abre la capa %s y la URL lo acepta', (section, layer) => {
    expect(resolveAtletaUrl({ tab: 'rendimiento', seccion: section }).seccion).toBe(section);
    expect(rendimientoVista(section)).toBe(layer);
  });
  it('Biblioteca recuerda categoría, pero los enlaces explícitos y antiguos prevalecen', () => {
    expect(libraryView(new URLSearchParams())).toBe('entrenos');
    expect(libraryView(new URLSearchParams(), 'ejercicios')).toBe('ejercicios');
    expect(libraryView(new URLSearchParams('ver=comunicados'), 'ejercicios')).toBe('comunicados');
    expect(libraryView(new URLSearchParams('tab=sesiones'), 'ejercicios')).toBe('entrenos');
    expect(libraryView(new URLSearchParams('tab=ejercicios'), 'bloques')).toBe('ejercicios');
  });
  it('el resumen de Método respeta escalas, unidades y ajustes propios', () => {
    const defaults = defaultCoachAnalyticsMethod();
    expect(resumenGrupo('forma', { ...defaults, ctl_days: 60 }, defaults)).toContain('60 días');
    expect(resumenGrupo('forma', { ...defaults, ctl_days: 60 }, defaults)).toContain('Con ajustes propios');
    expect(resumenGrupo('capacidad', defaults, defaults)).toContain(`${defaults.cs_min_duration_s / 60} min`);
    expect(resumenGrupo('cumplimiento', defaults, defaults)).not.toContain('[object Object]');
  });
});
