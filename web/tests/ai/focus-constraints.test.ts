import { describe, expect, test } from 'vitest';
import {
  parseFocusConstraints,
  GROUP_SLUGS,
  SESSIONS_SINGLE,
  SESSIONS_DOUBLE,
} from '@/lib/dashboard/coach/ai/focus-constraints';

/**
 * Stress-test del parser contra focos REALES que un coach escribe. El caso 1 es
 * el foco LITERAL que Alex tecleó en producción y que la app tiró a la basura:
 * si este test se pone rojo, el fallo original ha vuelto.
 */
describe('parseFocusConstraints — el foco de Alex (regresión del fallo en prod)', () => {
  const FOCO_ALEX = 'Créame 1 semana con doble sesión entre running e híbrido enfocado en hyrox';

  test('detecta DOBLE SESIÓN', () => {
    expect(parseFocusConstraints(FOCO_ALEX).sessions_per_day).toBe(SESSIONS_DOUBLE);
  });

  test('"1 semana" NO se confunde con 1 día de entreno', () => {
    expect(parseFocusConstraints(FOCO_ALEX).days_per_week).toBeNull();
  });

  test('extrae running + híbrido + hyrox, priorizando el orden en que los dijo', () => {
    const c = parseFocusConstraints(FOCO_ALEX);
    expect(c.group_slugs).toContain(GROUP_SLUGS.running);
    expect(c.group_slugs).toContain(GROUP_SLUGS.wods);
    expect(c.group_slugs).toContain(GROUP_SLUGS.circuitos);
    expect(c.group_slugs).toContain(GROUP_SLUGS.simulaciones);
    // "running" va antes que "hyrox" en la frase → manda en la prioridad.
    expect(c.group_slugs.indexOf(GROUP_SLUGS.running)).toBeLessThan(
      c.group_slugs.indexOf(GROUP_SLUGS.simulaciones),
    );
  });
});

describe('parseFocusConstraints — doble sesión, formas naturales', () => {
  test.each([
    'doble sesión toda la semana',
    'dobles sesiones',
    'quiero dos sesiones al día',
    '2 sesiones al día',
    'entrenar dos veces al día',
    'sesión doble los martes',
  ])('«%s» → 2 sesiones/día', (focus) => {
    expect(parseFocusConstraints(focus).sessions_per_day).toBe(SESSIONS_DOUBLE);
  });

  test.each(['semana normal de fuerza', 'una sesión de running', 'semana suave'])(
    '«%s» → 1 sesión/día (no inventa dobles)',
    (focus) => {
      expect(parseFocusConstraints(focus).sessions_per_day).toBe(SESSIONS_SINGLE);
    },
  );
});

describe('parseFocusConstraints — días de entreno', () => {
  test.each([
    ['semana de 4 días', 4],
    ['5 dias de entreno', 5],
    ['quiero entrenar 3 días', 3],
  ])('«%s» → %i días', (focus, expected) => {
    expect(parseFocusConstraints(focus as string).days_per_week).toBe(expected);
  });

  test.each(['1 semana de fuerza', '12 semanas de plan', 'semana de 2 días', 'semana de 9 días'])(
    '«%s» → sin días fijados (fuera del dominio 3..7 o unidad ≠ día)',
    (focus) => {
      expect(parseFocusConstraints(focus).days_per_week).toBeNull();
    },
  );
});

describe('parseFocusConstraints — modalidades, con tildes y sin ellas', () => {
  test('«hyrox» pide simulaciones + WODs', () => {
    const c = parseFocusConstraints('semana enfocada en hyrox');
    expect(c.group_slugs).toEqual([GROUP_SLUGS.simulaciones, GROUP_SLUGS.wods]);
  });

  test('«fuerza» pide fuerza base + explosiva', () => {
    expect(parseFocusConstraints('semana de fuerza').group_slugs).toContain(GROUP_SLUGS.fuerzaBase);
  });

  test('«híbrido» y «hibrido» dan lo mismo (tildes indiferentes)', () => {
    expect(parseFocusConstraints('trabajo híbrido').group_slugs).toEqual(
      parseFocusConstraints('trabajo hibrido').group_slugs,
    );
  });

  test('«ergos» / «remo» piden ergómetros', () => {
    expect(parseFocusConstraints('series de remo').group_slugs).toContain(GROUP_SLUGS.ergometros);
  });

  test('«core y movilidad» pide preventivos', () => {
    expect(parseFocusConstraints('core y movilidad').group_slugs).toContain(GROUP_SLUGS.core);
  });

  test('«tapering» pide tapering', () => {
    expect(parseFocusConstraints('tapering pre-carrera').group_slugs).toContain(
      GROUP_SLUGS.tapering,
    );
  });

  test('«z2» / «recuperación» piden zona 2', () => {
    expect(parseFocusConstraints('rodaje suave en z2').group_slugs).toContain(GROUP_SLUGS.zona2);
  });

  test('un foco sin modalidad no fuerza ningún grupo', () => {
    const c = parseFocusConstraints('semana normal, lo que veas');
    expect(c.group_slugs).toEqual([]);
    expect(c.sessions_per_day).toBe(SESSIONS_SINGLE);
    expect(c.days_per_week).toBeNull();
  });

  test('«carrera» a secas NO se mapea: es ambiguo (race vs correr)', () => {
    expect(parseFocusConstraints('la semana antes de la carrera').group_slugs).not.toContain(
      GROUP_SLUGS.running,
    );
  });
});
