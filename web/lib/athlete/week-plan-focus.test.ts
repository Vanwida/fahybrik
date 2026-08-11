import { describe, it, expect } from 'vitest';
import { resolveAthleteFacingFocus } from './week-plan';
import type { WeekPublishState } from '@/lib/mcp/shape-write';

function state(state: WeekPublishState, focus: string | null) {
  return { state, focus };
}

describe('resolveAthleteFacingFocus — semana > plantilla > null', () => {
  it('el foco de la semana del atleta manda sobre el de la plantilla', () => {
    expect(resolveAthleteFacingFocus(state('published', 'Series de umbral'), 'Base aeróbica')).toBe(
      'Series de umbral',
    );
  });

  it('sin override de semana, cae al defecto heredado de la plantilla', () => {
    expect(resolveAthleteFacingFocus(state('published', null), 'Base aeróbica')).toBe('Base aeróbica');
  });

  it('sin ninguno de los dos, no hay foco (nunca se inventa)', () => {
    expect(resolveAthleteFacingFocus(state('published', null), null)).toBeNull();
  });

  it('sin fila de weekly_plans (sin_marcar), cae también a la plantilla', () => {
    expect(resolveAthleteFacingFocus(state('sin_marcar', null), 'Acumulación')).toBe('Acumulación');
  });

  it('una semana archivada sigue mostrando su foco propio', () => {
    expect(resolveAthleteFacingFocus(state('archived', 'Descarga'), 'Base aeróbica')).toBe('Descarga');
  });

  it('una semana en BORRADOR no adelanta su foco propio', () => {
    expect(resolveAthleteFacingFocus(state('draft', 'Foco todavía sin publicar'), 'Base aeróbica')).toBe(
      'Base aeróbica',
    );
  });

  it('una semana en borrador sin plantilla detrás no muestra nada', () => {
    expect(resolveAthleteFacingFocus(state('draft', 'Foco todavía sin publicar'), null)).toBeNull();
  });
});
