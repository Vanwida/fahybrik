// El motor de velocidad crítica (CS) y depósito (D') — probado por sus
// DISCIPLINAS, no por el camino feliz. La que más importa: la envolvente
// monótona tiene que atrapar lo que un R² solo jamás vería venir.
//
// El caso de "atleta 67" de más abajo es de producción real (encargo, no
// inventado): 1000 m/230 s, 1600 m/480 s, 10000 m/2917 s. Ajustados los tres
// SIN la puerta de envolvente, el R² sale 0,9994 — un umbral de "R² ≥ 0,95"
// los habría aceptado sin dudar. Es la prueba de que este motor existe.

import { describe, expect, test } from 'vitest';
import {
  ajustarVelocidadCritica,
  type EsfuerzoMaximal,
} from '@fahybrid/shared/domain/analytics/capacidad';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';

const metodo = () => defaultCoachAnalyticsMethod();

// El trío real de producción, sin proyectar ni tocar.
const ATLETA_67: EsfuerzoMaximal[] = [
  { distancia_m: 1000, duracion_s: 230 }, // 4,3478 m/s
  { distancia_m: 1600, duracion_s: 480 }, // 3,3333 m/s
  { distancia_m: 10000, duracion_s: 2917 }, // 3,4282 m/s — MÁS RÁPIDO que el de arriba
];

describe('el caso real que exige esta puerta (atleta 67, producción)', () => {
  test('con la ventana por defecto (120–900 s), el 10 km se descarta y quedan dos → pocos_esfuerzos', () => {
    const res = ajustarVelocidadCritica(ATLETA_67, metodo());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.esfuerzos_admisibles).toBe(2);
    expect(res.razon.por).toBe('pocos_esfuerzos');
    if (res.razon.por !== 'pocos_esfuerzos') throw new Error('razón inesperada');
    expect(res.razon.llevas).toBe(2);
    expect(res.razon.hacen).toBe(3);
  });

  test('sin ventana (alguien la abre), el 10 km entra y rompe la monotonía → no_es_envolvente', () => {
    // R² de esta misma terna, ajustada sin la puerta de envolvente: 0,9994.
    // Es exactamente el escenario que la cabecera del fichero documenta.
    const metodoAbierto = { ...metodo(), cs_max_duration_s: 3600 };
    const res = ajustarVelocidadCritica(ATLETA_67, metodoAbierto);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.esfuerzos_admisibles).toBe(3);
    expect(res.razon.por).toBe('no_es_envolvente');
    if (res.razon.por !== 'no_es_envolvente') throw new Error('razón inesperada');
    // El par que rompe la envolvente: el 1600 m (corto) frente al 10000 m (largo).
    expect(res.razon.detalle.corto_s).toBe(480);
    expect(res.razon.detalle.largo_s).toBe(2917);
  });
});

describe('un ajuste que sí se sostiene', () => {
  // Fabricados EXACTOS desde CS = 4,0 m/s y D' = 200 m: distancia = 4·t + 200.
  const EXACTOS: EsfuerzoMaximal[] = [
    { distancia_m: 800, duracion_s: 150 },
    { distancia_m: 1400, duracion_s: 300 },
    { distancia_m: 2600, duracion_s: 600 },
  ];

  test('recupera CS y D’ con error menor al 0,1 %', () => {
    const res = ajustarVelocidadCritica(EXACTOS, metodo());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('se esperaba ok: true');
    expect(Math.abs(res.cs_m_s - 4.0) / 4.0).toBeLessThan(0.001);
    expect(Math.abs(res.d_prima_m - 200) / 200).toBeLessThan(0.001);
    expect(res.r2).toBeCloseTo(1, 6);
    expect(res.descartados).toBe(0);
    expect(res.esfuerzos_usados).toHaveLength(3);
  });

  test('con ruido pequeño sobre los mismos puntos, sigue ok y con R² alto', () => {
    const conRuido: EsfuerzoMaximal[] = [
      { distancia_m: 803, duracion_s: 150 },
      { distancia_m: 1398, duracion_s: 300 },
      { distancia_m: 2604, duracion_s: 600 },
    ];
    const res = ajustarVelocidadCritica(conRuido, metodo());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('se esperaba ok: true');
    expect(Math.abs(res.cs_m_s - 4.0)).toBeLessThan(0.05);
    expect(Math.abs(res.d_prima_m - 200)).toBeLessThan(5);
    expect(res.r2).toBeGreaterThan(0.99);
  });

  test('acepta cuando la CS ajustada cae cerca del umbral ya medido', () => {
    const res = ajustarVelocidadCritica(EXACTOS, metodo(), { velocidad_m_s: 4.05 });
    expect(res.ok).toBe(true);
  });
});

describe('cada puerta rechaza por su propio motivo', () => {
  test('dos esfuerzos casi iguales en duración → poca_separacion', () => {
    const casiIguales: EsfuerzoMaximal[] = [
      { distancia_m: 900, duracion_s: 200 },
      { distancia_m: 920, duracion_s: 210 },
      { distancia_m: 935, duracion_s: 220 }, // 220/200 = 1,1 — muy por debajo del 3 exigido
    ];
    const res = ajustarVelocidadCritica(casiIguales, metodo());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.razon.por).toBe('poca_separacion');
    if (res.razon.por !== 'poca_separacion') throw new Error('razón inesperada');
    expect(res.razon.separacion).toBeCloseTo(1.1, 5);
    expect(res.razon.hacen).toBe(3);
  });

  test('un frenazo violento entre esfuerzos da CS ≤ 0 → parametro_imposible (D’ sale positivo igualmente)', () => {
    // Por qué esto y no "D' negativo": con la envolvente ya sostenida (duración
    // creciente, velocidad estrictamente decreciente), la desigualdad de
    // Chebyshev ponderada garantiza que la ordenada del ajuste es SIEMPRE
    // positiva — ver la cabecera de capacidad.ts. El único camino real hacia
    // "parametro_imposible" es una CS que sale ≤ 0, como aquí: un esfuerzo
    // brevísimo altísimo seguido de un frenazo tan brusco que la distancia
    // deja de crecer con el tiempo al ritmo que el primer punto sugería.
    const metodoAbierto = { ...metodo(), cs_min_duration_s: 60, cs_max_duration_s: 400 };
    const frenazo: EsfuerzoMaximal[] = [
      { distancia_m: 100000, duracion_s: 100 }, // 1000 m/s — sprint imposible, a propósito
      { distancia_m: 101, duracion_s: 101 }, // 1 m/s — cae en seco
      { distancia_m: 175, duracion_s: 350 }, // 0,5 m/s — sigue cayendo, mantiene la envolvente
    ];
    const res = ajustarVelocidadCritica(frenazo, metodoAbierto);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.razon.por).toBe('parametro_imposible');
    if (res.razon.por !== 'parametro_imposible') throw new Error('razón inesperada');
    expect(res.razon.cs_m_s).toBeLessThan(0);
    expect(res.razon.d_prima_m).toBeGreaterThan(0);
  });

  test('CS lejísimos del umbral ya medido → lejos_del_umbral', () => {
    const exactos: EsfuerzoMaximal[] = [
      { distancia_m: 800, duracion_s: 150 },
      { distancia_m: 1400, duracion_s: 300 },
      { distancia_m: 2600, duracion_s: 600 },
    ];
    // CS ajustada = 4,0 m/s; umbral ya medido = 3,0 m/s → 33,3 % de desvío.
    const res = ajustarVelocidadCritica(exactos, metodo(), { velocidad_m_s: 3.0 });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.razon.por).toBe('lejos_del_umbral');
    if (res.razon.por !== 'lejos_del_umbral') throw new Error('razón inesperada');
    expect(res.razon.desvio_pct).toBeCloseTo(33.33, 1);
    expect(res.razon.hace).toBe(15);
  });
});

describe('los bordes no lanzan', () => {
  test('lista vacía → pocos_esfuerzos', () => {
    const res = ajustarVelocidadCritica([], metodo());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.razon.por).toBe('pocos_esfuerzos');
    expect(res.esfuerzos_admisibles).toBe(0);
  });

  test('lista de uno → pocos_esfuerzos', () => {
    const res = ajustarVelocidadCritica([{ distancia_m: 1000, duracion_s: 230 }], metodo());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.razon.por).toBe('pocos_esfuerzos');
    if (res.razon.por !== 'pocos_esfuerzos') throw new Error('razón inesperada');
    expect(res.razon.llevas).toBe(1);
  });

  test('números rotos (NaN, Infinity, distancia 0, duración negativa) se descartan sin lanzar', () => {
    const conBasura: EsfuerzoMaximal[] = [
      { distancia_m: Number.NaN, duracion_s: 200 },
      { distancia_m: 500, duracion_s: Number.POSITIVE_INFINITY },
      { distancia_m: 0, duracion_s: 200 },
      { distancia_m: 500, duracion_s: -200 },
      { distancia_m: 500, duracion_s: 200 }, // el único válido
    ];
    expect(() => ajustarVelocidadCritica(conBasura, metodo())).not.toThrow();
    const res = ajustarVelocidadCritica(conBasura, metodo());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('se esperaba ok: false');
    expect(res.esfuerzos_admisibles).toBe(1);
  });

  test('un umbral con un número roto se ignora en vez de romper el ajuste', () => {
    const exactos: EsfuerzoMaximal[] = [
      { distancia_m: 800, duracion_s: 150 },
      { distancia_m: 1400, duracion_s: 300 },
      { distancia_m: 2600, duracion_s: 600 },
    ];
    const res = ajustarVelocidadCritica(exactos, metodo(), { velocidad_m_s: Number.NaN });
    expect(res.ok).toBe(true);
  });
});

describe('la contabilidad cuadra siempre con la entrada', () => {
  test('esfuerzos_usados + descartados == esfuerzos de entrada', () => {
    const entrada: EsfuerzoMaximal[] = [
      { distancia_m: 800, duracion_s: 150 },
      { distancia_m: 1400, duracion_s: 300 },
      { distancia_m: 2600, duracion_s: 600 },
      { distancia_m: 4200, duracion_s: 1000 }, // fuera de ventana (> 900 s)
      { distancia_m: Number.NaN, duracion_s: 400 }, // número roto
    ];
    const res = ajustarVelocidadCritica(entrada, metodo());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('se esperaba ok: true');
    expect(res.esfuerzos_usados.length + res.descartados).toBe(entrada.length);
    expect(res.esfuerzos_usados).toHaveLength(3);
    expect(res.descartados).toBe(2);
  });
});
