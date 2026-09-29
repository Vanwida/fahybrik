// La regla común «¿mejoro?» (shared/domain/analytics/progreso.ts): medidas
// por periodo, la comparación en la unidad del umbral, la palabra que se
// retira con su porqué, y las series.

import { describe, expect, test } from 'vitest';
import {
  comparacionCon,
  faltaDeFamiliaVacia,
  lecturaProgreso,
  medidasDe,
  referenciaRecord,
  serieSemanalDe,
  veredictoDeCambio,
  MINIMO_MEDIA,
  MINIMO_MEJOR,
  type Fechada,
  type FilaProgreso,
  type MedidaPeriodo,
  type MedidasProgreso,
} from '@fahybrid/shared/domain/analytics/progreso';
import { lunesDe } from '@fahybrid/shared/domain/analytics/semanas';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';

// Hoy 2026-09-29; ventana de 4 semanas → 2026-09-02..2026-09-29, anterior
// 2026-08-05..2026-09-01 (el ejemplo del encargo).
const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });
const ventanaTodo = resolverVentana({ clave: 'todo', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

interface Obs extends Fechada {
  valor: number;
}
const obs = (dia: string, valor = 1): Obs => ({ dia, valor });
const contar = (xs: readonly Obs[]) => xs.length;

function medida(valor: number, muestras = 1, ultimo = ventana.hasta): MedidaPeriodo {
  return { valor, muestras, dias_con_dato: muestras, ultimo };
}

function filaBase(overrides: Partial<FilaProgreso> = {}): FilaProgreso {
  return {
    id: 'x',
    grupo: 'progreso',
    familia: 'correr',
    titulo_es: 'x',
    unidad: 'segundos',
    sentido: 'menor',
    umbral: { unidad: 'pct', cambio_minimo: 3 },
    medidas: { actual: null, anterior: null, ultima: null, primera: null },
    minimo: MINIMO_MEJOR,
    ventana,
    procedencia: { de: 'x', explica_es: 'x', medida: true, ancla: null, proveedor: null },
    falta_sin_dato: { por: 'ocasion' },
    ...overrides,
  };
}

describe('medidasDe', () => {
  test('actual = ventana, anterior = ventana anterior, primera = la observación más antigua', () => {
    const datos = [obs('2026-01-01'), obs('2026-08-10'), obs('2026-08-20'), obs('2026-09-05'), obs('2026-09-10')];
    const m = medidasDe(datos, ventana, contar);
    expect(m.actual).toEqual({ valor: 2, muestras: 2, dias_con_dato: 2, ultimo: '2026-09-10' });
    expect(m.anterior).toEqual({ valor: 2, muestras: 2, dias_con_dato: 2, ultimo: '2026-08-20' });
    expect(m.ultima).toBeNull();
    expect(m.primera).toBe('2026-01-01');
  });

  test('ultima solo cuando la ventana está vacía: un periodo de igual longitud que acaba en la última observación previa', () => {
    const datos = [obs('2026-01-01'), obs('2026-07-01'), obs('2026-07-15')];
    const m = medidasDe(datos, ventana, contar);
    expect(m.actual).toBeNull();
    expect(m.anterior).toBeNull(); // nada tampoco en 2026-08-05..2026-09-01
    // Periodo de 28 días que acaba en 2026-07-15 → desde 2026-06-18: caben '07-01' y '07-15', no '01-01'.
    expect(m.ultima).toEqual({ valor: 2, muestras: 2, dias_con_dato: 2, ultimo: '2026-07-15' });
    expect(m.primera).toBe('2026-01-01');
  });
});

describe('lecturaProgreso — lleno (número, comparación y palabra)', () => {
  test('sentido «menor», umbral pct 3: mejor, igual y peor según el delta', () => {
    const base = (actualValor: number): FilaProgreso =>
      filaBase({
        sentido: 'menor',
        umbral: { unidad: 'pct', cambio_minimo: 3 },
        medidas: { actual: medida(actualValor), anterior: medida(100), ultima: null, primera: '2020-01-01' },
      });

    const mejor = lecturaProgreso(base(90));
    expect(mejor.comparacion!.delta).toBeCloseTo(-10, 9);
    expect(mejor.comparacion!.significativo).toBe(true);
    expect(mejor.veredicto).toMatchObject({ code: 'mejor' });

    const igual = lecturaProgreso(base(99));
    expect(igual.comparacion!.delta).toBeCloseTo(-1, 9);
    expect(igual.comparacion!.significativo).toBe(false);
    expect(igual.veredicto).toMatchObject({ code: 'igual' });

    const peor = lecturaProgreso(base(110));
    expect(peor.comparacion!.delta).toBeCloseTo(10, 9);
    expect(peor.veredicto).toMatchObject({ code: 'peor' });
  });

  test('con sentido «mayor» las direcciones se invierten', () => {
    const base = (actualValor: number): FilaProgreso =>
      filaBase({
        sentido: 'mayor',
        medidas: { actual: medida(actualValor), anterior: medida(100), ultima: null, primera: '2020-01-01' },
      });
    expect(lecturaProgreso(base(110)).veredicto).toMatchObject({ code: 'mejor' });
    expect(lecturaProgreso(base(90)).veredicto).toMatchObject({ code: 'peor' });
  });
});

describe('comparacionCon — P1: el delta se juzga en la unidad del umbral', () => {
  test('convierte valor y anterior antes de restar; `anterior` se queda en la unidad del dato', () => {
    // Un 5000 m en segundos, juzgado en s/km (aUnidad: v => v/5).
    const c = comparacionCon({
      valor: 1190,
      anterior: 1200,
      periodo: { desde: ventana.anterior!.desde, hasta: ventana.anterior!.hasta },
      umbral: { unidad: 's_km', cambio_minimo: 3, aUnidad: (v) => v / 5 },
    });
    expect(c.anterior).toBe(1200); // NO convertido: sigue en segundos
    expect(c.unidad).toBe('s_km');
    expect(c.delta).toBeCloseTo(-2, 9); // 1190/5 - 1200/5
    expect(c.significativo).toBe(false); // |-2| < 3
    expect(veredictoDeCambio(c, 'menor')).toMatchObject({ code: 'igual' });
  });
});

describe('poco dato — el número se queda, la palabra se retira con su porqué', () => {
  test('primera observación dentro de la ventana → falta de HISTORIA, con el plazo', () => {
    const f = filaBase({
      medidas: { actual: medida(90), anterior: null, ultima: null, primera: ventana.desde },
    });
    const l = lecturaProgreso(f);
    expect(l.estado).toBe('medida');
    expect(l.dato!.valor).toBe(90);
    expect(l.veredicto).toBeNull();
    // llevas = floor(diffDays(hasta, desde)/7) = floor(27/7) = 3; hacen = ceil(28/7)+1 = 5.
    expect(l.cobertura.falta).toEqual({ por: 'historia', llevas: 3, hacen: 5 });
  });

  test('historia más antigua pero la ventana anterior vino vacía → falta de OCASIÓN', () => {
    const f = filaBase({
      medidas: { actual: medida(90), anterior: null, ultima: null, primera: '2026-01-01' },
    });
    const l = lecturaProgreso(f);
    expect(l.veredicto).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'ocasion' });
  });

  test('por debajo del mínimo del método (MINIMO_MEDIA = 3, solo 2 muestras) → sin veredicto', () => {
    const f = filaBase({
      minimo: MINIMO_MEDIA,
      medidas: { actual: medida(90, 2), anterior: medida(100, 2), ultima: null, primera: '2026-01-01' },
    });
    const l = lecturaProgreso(f);
    expect(l.veredicto).toBeNull();
    expect(l.dato!.valor).toBe(90); // el número no se retira, solo la palabra
    expect(l.cobertura.falta).not.toBeNull();
  });
});

describe('la puerta del coach retira la palabra, nunca el número', () => {
  test('una puerta activa se convierte en `cobertura.falta`; dato y comparación se quedan', () => {
    const f = filaBase({
      medidas: { actual: medida(90), anterior: medida(100), ultima: null, primera: '2020-01-01' },
      puerta: { por: 'historia', llevas: 2, hacen: 6 },
    });
    const l = lecturaProgreso(f);
    expect(l.veredicto).toBeNull();
    expect(l.dato!.valor).toBe(90);
    expect(l.comparacion).not.toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'historia', llevas: 2, hacen: 6 });
  });
});

describe('dato viejo — nada en la ventana, algo antes', () => {
  test('el último número que hubo, con su fecha; sin comparación ni palabra', () => {
    const datos = [obs('2026-07-01'), obs('2026-07-15')];
    const medidas = medidasDe(datos, ventana, contar);
    const l = lecturaProgreso(filaBase({ medidas }));
    expect(l.estado).toBe('medida');
    expect(l.dato!.valor).toBe(medidas.ultima!.valor);
    expect(l.cobertura.dias_con_dato).toBe(0);
    expect(l.cobertura.falta).toEqual({ por: 'viejo', ultimo: '2026-07-15' });
    expect(l.comparacion).toBeNull();
    expect(l.veredicto).toBeNull();
  });
});

describe('vacío — ninguna observación', () => {
  test('faltaDeFamiliaVacia: historia para quien no ha entrenado nada, ocasión para quien no ha hecho esta familia', () => {
    expect(faltaDeFamiliaVacia(true, { dias: 28 })).toEqual({ por: 'historia', llevas: 0, hacen: 5 });
    expect(faltaDeFamiliaVacia(false, { dias: 28 })).toEqual({ por: 'ocasion' });
  });

  test('lecturaProgreso sin ninguna observación → sin_dato, con la falta declarada', () => {
    const l = lecturaProgreso(
      filaBase({
        medidas: { actual: null, anterior: null, ultima: null, primera: null },
        falta_sin_dato: { por: 'historia', llevas: 0, hacen: 5 },
      }),
    );
    expect(l.estado).toBe('sin_dato');
    expect(l.dato).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'historia', llevas: 0, hacen: 5 });
  });
});

describe('ventana «todo» — sin anterior', () => {
  test('sin periodo anterior no hay comparación, ni palabra, ni falta', () => {
    const l = lecturaProgreso(
      filaBase({
        ventana: ventanaTodo,
        medidas: { actual: medida(90, 1, ventanaTodo.hasta), anterior: null, ultima: null, primera: '2026-01-01' },
      }),
    );
    expect(l.comparacion).toBeNull();
    expect(l.veredicto).toBeNull();
    expect(l.cobertura.falta).toBeNull();
  });
});

describe('serieSemanalDe', () => {
  test('empieza en la PRIMERA semana con dato (las anteriores no se emiten) y llega a la semana de `hasta`', () => {
    const conDato1 = '2026-09-16'; // semana del lunes 2026-09-14
    const conDato2 = '2026-09-25'; // semana del lunes 2026-09-21
    const datos = [obs(conDato1, 5), obs(conDato2, 7)];
    const suma = (xs: readonly Obs[]) => xs.reduce((a, x) => a + x.valor, 0);
    const serie = serieSemanalDe(datos, ventana, 'segundos', suma);

    expect(serie.paso).toBe('semana');
    // NO lunesDe(ventana.desde) = '2026-08-31': esa semana (y la siguiente, sin dato) no se emiten.
    expect(serie.puntos[0]!.t).toBe(lunesDe(conDato1));
    expect(serie.puntos[serie.puntos.length - 1]!.t).toBe(lunesDe(ventana.hasta));
    expect(serie.puntos).toHaveLength(3); // 09-14 (dato), 09-21 (dato), 09-28 (hueco)
    expect(serie.puntos.map((p) => p.v)).toEqual([5, 7, null]);
  });

  test('una semana SIN dato posterior a la primera con dato sigue apareciendo, con un hueco real (null)', () => {
    const conDato = '2026-09-05'; // semana del lunes 2026-08-31 (la primera de la ventana)
    const serie = serieSemanalDe([obs(conDato, 5)], ventana, 'segundos', (xs) => xs.reduce((a, x) => a + x.valor, 0));
    const semanaSiguiente = serie.puntos.find((p) => p.t === '2026-09-07');
    expect(semanaSiguiente).toBeDefined();
    expect(semanaSiguiente!.v).toBeNull();
  });

  test('sin ninguna observación en la ventana: la serie no tiene puntos, ni siquiera huecos', () => {
    const serie = serieSemanalDe([obs('2026-01-01', 5)], ventana, 'segundos', (xs) => xs.length);
    expect(serie.puntos).toEqual([]);
  });
});

describe('referenciaRecord', () => {
  test('delta = número mostrado − récord', () => {
    const medidas: MedidasProgreso = { actual: medida(90), anterior: null, ultima: null, primera: '2020-01-01' };
    expect(referenciaRecord(medidas, 95)).toEqual({ valor: 95, delta: -5, de: 'record' });
    expect(referenciaRecord(medidas, null)).toBeNull();
    expect(referenciaRecord({ actual: null, anterior: null, ultima: null, primera: null }, 95)).toBeNull();
  });
});
