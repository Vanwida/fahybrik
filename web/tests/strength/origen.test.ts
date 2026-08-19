// De dónde sale un kilo. El contrato que evita que Resumen diga «medidas»
// de un número que nadie midió en un test.
//
// Marc (Preview 18-ago): sentadilla 80 con source=coach_test y cero sesiones.
// /es/tests dice «Nadie todavía». Eso es verdad. La ficha no puede llamarlo
// medido. Si nació del alta o a mano, se lee así. Si nació de una batería,
// se ve la ocurrencia.

import { describe, expect, it } from 'vitest';
import { leerOrigen, lineaOrigen, type KiloConOrigen } from '@fahybrid/shared/domain/strength';

const kilo = (over: Partial<KiloConOrigen> & Pick<KiloConOrigen, 'source'>): KiloConOrigen => ({
  assignment_id: null,
  test_weight_kg: null,
  test_reps: null,
  ...over,
});

describe('un kilo y una fila de Tests no se contradicen', () => {
  it('la sentadilla 80 de Marc (semilla coach_test, sin sesión) no es un test hecho', () => {
    const lectura = leerOrigen(kilo({ source: 'coach_test' }));
    expect(lectura.origen).toBe('coach');
    expect(lectura.label).toBe('lo anotó el coach');
    expect(lectura.medido).toBe(false);
    expect(lectura.assignment_id).toBeNull();
  });

  it('un kilo del alta no se lee como medido', () => {
    const lectura = leerOrigen(kilo({ source: 'onboarding' }));
    expect(lectura.origen).toBe('alta');
    expect(lectura.label).toBe('del alta');
    expect(lectura.medido).toBe(false);
  });

  it('el atleta apuntándoselo fuera de una batería tampoco es un test hecho', () => {
    const lectura = leerOrigen(kilo({ source: 'athlete_test' }));
    expect(lectura.origen).toBe('atleta');
    expect(lectura.label).toBe('lo apuntó el atleta');
    expect(lectura.medido).toBe(false);
  });

  it('si nació de una batería, se ve la ocurrencia — da igual quién tecleó el resultado', () => {
    const lectura = leerOrigen(kilo({ source: 'coach_test', assignment_id: '4412' }));
    expect(lectura.origen).toBe('test');
    expect(lectura.label).toBe('del test');
    expect(lectura.medido).toBe(true);
    expect(lectura.assignment_id).toBe('4412');
  });

  it('el ancla manda sobre la etiqueta: un onboarding con ocurrencia es un test', () => {
    const lectura = leerOrigen(kilo({ source: 'onboarding', assignment_id: 77 }));
    expect(lectura.origen).toBe('test');
    expect(lectura.medido).toBe(true);
    expect(lectura.assignment_id).toBe('77');
  });

  it('un assignment_id vacío no inventa un protocolo', () => {
    expect(leerOrigen(kilo({ source: 'coach_test', assignment_id: '  ' })).medido).toBe(false);
    expect(leerOrigen(kilo({ source: 'coach_test', assignment_id: '' })).assignment_id).toBeNull();
  });

  it('un source que no reconocemos se lee «sin origen», nunca «medido»', () => {
    const lectura = leerOrigen(kilo({ source: 'unknown' }));
    expect(lectura.origen).toBe('desconocido');
    expect(lectura.label).toBe('sin origen');
    expect(lectura.medido).toBe(false);
  });
});

describe('el set solo se enseña cuando explica el número', () => {
  it('un 1RM estimado de 100 × 5 lo dice', () => {
    const lectura = leerOrigen(
      kilo({ source: 'coach_test', test_weight_kg: 100, test_reps: 5 }),
    );
    expect(lectura.detalle).toBe('de 100 × 5');
  });

  it('reps = 1 no aporta: el peso ya es el 1RM', () => {
    const lectura = leerOrigen(
      kilo({ source: 'coach_test', test_weight_kg: 110, test_reps: 1 }),
    );
    expect(lectura.detalle).toBeNull();
  });

  it('un test hecho no enseña el set: el protocolo es la explicación', () => {
    const lectura = leerOrigen(
      kilo({
        source: 'coach_test',
        assignment_id: '9',
        test_weight_kg: 100,
        test_reps: 5,
      }),
    );
    expect(lectura.origen).toBe('test');
    expect(lectura.detalle).toBeNull();
  });
});

describe('lineaOrigen', () => {
  it('junta etiqueta, set y cuándo sin inventar «medidas»', () => {
    const marc = leerOrigen(kilo({ source: 'coach_test' }));
    expect(lineaOrigen(marc, 'hace 5 sem')).toBe('lo anotó el coach · hace 5 sem');

    const alta = leerOrigen(kilo({ source: 'onboarding' }));
    expect(lineaOrigen(alta, 'hace 5 sem')).toBe('del alta · hace 5 sem');

    const test = leerOrigen(kilo({ source: 'athlete_test', assignment_id: '12' }));
    expect(lineaOrigen(test, '12 ago')).toBe('del test · 12 ago');

    const estimado = leerOrigen(
      kilo({ source: 'coach_test', test_weight_kg: 100, test_reps: 5 }),
    );
    expect(lineaOrigen(estimado, 'hace 3 d')).toBe('lo anotó el coach · de 100 × 5 · hace 3 d');
  });
});
