// El editor de Ajustes › Método › Analíticas, puro (sin base de datos): que el
// catálogo cubra las 41 claves del método, que el borrador vaya y vuelva sin
// perder nada, que los mensajes de validación salgan en castellano y en la
// escala que ve el coach, y que los helpers de la escalera de carga nunca
// dejen un estado imposible. La ruta real se cubre en
// `metodo-analiticas.db.test.ts`.

import { describe, expect, test } from 'vitest';
import {
  COACH_ANALYTICS_METHOD_KEYS,
  COACH_ANALYTICS_METHOD_LIST_KEYS,
  COACH_ANALYTICS_METHOD_NUMERIC_KEYS,
  COACH_ANALYTICS_METHOD_TEXT_KEYS,
  DEFAULT_COACH_ANALYTICS_METHOD,
  FUENTES_CARGA,
  MODALIDADES_CARGA,
  defaultCoachAnalyticsMethod,
} from '@fahybrid/shared/domain/analytics/metodo';
import { CAMPOS_POR_GRUPO, DESCRIPTORES_METODO_ANALITICO, GRUPOS, PELDANO_ETIQUETA } from '@/components/v2/ajustes/metodo-analiticas/descriptores';
import {
  anadirPeldano,
  bajarPeldano,
  candidatoDe,
  draftOf,
  formatearBandasFrescura,
  quitarPeldano,
  subirPeldano,
  validarCandidato,
} from '@/components/v2/ajustes/metodo-analiticas/modelo';

describe('descriptores · cobertura del catálogo', () => {
  test('todas las claves del método tienen descriptor, y ninguna sobra', () => {
    expect(new Set(Object.keys(DESCRIPTORES_METODO_ANALITICO))).toEqual(new Set(COACH_ANALYTICS_METHOD_KEYS));
  });

  test('cada clave aparece en exactamente un grupo de pantalla, sin huecos ni duplicados', () => {
    const vistas = GRUPOS.flatMap((g) => CAMPOS_POR_GRUPO[g.id]);
    expect([...vistas].sort()).toEqual([...COACH_ANALYTICS_METHOD_KEYS].sort());
    expect(new Set(vistas).size).toBe(vistas.length);
  });

  test('el tipo del descriptor coincide con la naturaleza de la clave', () => {
    for (const clave of COACH_ANALYTICS_METHOD_LIST_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('escalera');
    for (const clave of COACH_ANALYTICS_METHOD_TEXT_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('seleccion');
    for (const clave of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('numero');
  });

  test('solo Recuperación y Velocidad crítica empiezan plegados', () => {
    expect(GRUPOS.filter((g) => g.plegadoPorDefecto).map((g) => g.id).sort()).toEqual(['capacidad', 'recuperacion'].sort());
  });

  test('PELDANO_ETIQUETA cubre los cuatro peldaños del vocabulario', () => {
    for (const f of FUENTES_CARGA) expect(typeof PELDANO_ETIQUETA[f]).toBe('string');
  });
});

describe('borrador ↔ método', () => {
  test('ida y vuelta de los defectos da exactamente DEFAULT_COACH_ANALYTICS_METHOD', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const resultado = candidatoDe(draftOf(defectos), defectos);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.method).toEqual(DEFAULT_COACH_ANALYTICS_METHOD);
  });

  test('«12,5» y «12.5» se leen igual', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const conComa = candidatoDe({ fuerza_coeficiente: '1,25' }, defectos);
    const conPunto = candidatoDe({ fuerza_coeficiente: '1.25' }, defectos);
    expect(conComa.ok && conComa.method.fuerza_coeficiente).toBe(1.25);
    expect(conPunto.ok && conPunto.method.fuerza_coeficiente).toBe(1.25);
  });

  test('un valor fuera de rango da «Entre X y Y.» en su clave', () => {
    const resultado = candidatoDe({ ctl_days: '5' }, defaultCoachAnalyticsMethod()); // bounds 14-90
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toContainEqual({ clave: 'ctl_days', mensaje: 'Entre 14 y 90.' });
  });

  test('texto no numérico da «Escribe un número.» en su clave, sin validar el conjunto', () => {
    const resultado = candidatoDe({ ctl_days: 'abc' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toEqual([{ clave: 'ctl_days', mensaje: 'Escribe un número.' }]);
  });

  test('atl_days ≥ ctl_days da el mensaje del conjunto (sin clave)', () => {
    const resultado = candidatoDe({ atl_days: '50' }, defaultCoachAnalyticsMethod()); // ctl_days por defecto 42
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas).toContainEqual({
        clave: null,
        mensaje: 'Los días de lo reciente tienen que ser menos que los del fondo.',
      });
    }
  });

  test('bandas de frescura desordenadas dan su mensaje', () => {
    const resultado = candidatoDe({ frescura_optimo_hasta: '-40' }, defaultCoachAnalyticsMethod()); // por debajo de sobrecarga_hasta (-30)
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas).toContainEqual({
        clave: null,
        mensaje: 'Las bandas de frescura tienen que ir de menor a mayor: sobrecarga, óptimo, mantener, fresco.',
      });
    }
  });

  test('la escala de minutos: se enseña en minutos y se guarda en segundos', () => {
    const defectos = defaultCoachAnalyticsMethod(); // 120 s / 900 s
    const borrador = draftOf(defectos);
    expect(borrador.cs_min_duration_s).toBe('2');
    expect(borrador.cs_max_duration_s).toBe('15');

    const resultado = candidatoDe({ cs_min_duration_s: '3' }, defectos);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.method.cs_min_duration_s).toBe(180);
  });

  test('fuera de rango en un campo escalado, el mensaje se dice en minutos, no en los segundos guardados', () => {
    // Bounds reales: 60-600 s (1-10 min). 0,5 min = 30 s, por debajo del mínimo.
    const resultado = candidatoDe({ cs_min_duration_s: '0,5' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toContainEqual({ clave: 'cs_min_duration_s', mensaje: 'Entre 1 y 10.' });
  });
});

describe('validarCandidato', () => {
  test('un método íntegramente por defecto no da problemas', () => {
    expect(validarCandidato(defaultCoachAnalyticsMethod()).ok).toBe(true);
  });
});

describe('los helpers de la escalera de carga', () => {
  test('subir y bajar intercambian con el vecino; en los extremos no hacen nada', () => {
    expect(subirPeldano(['a', 'b', 'c'], 1)).toEqual(['b', 'a', 'c']);
    expect(subirPeldano(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c']);
    expect(bajarPeldano(['a', 'b', 'c'], 1)).toEqual(['a', 'c', 'b']);
    expect(bajarPeldano(['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c']);
  });

  test('quitar nunca deja la escalera vacía', () => {
    expect(quitarPeldano(['pulso', 'esfuerzo'], 0)).toEqual(['esfuerzo']);
    expect(quitarPeldano(['pulso'], 0)).toEqual(['pulso']);
  });

  test('añadir no admite un peldaño que esa modalidad no puede preciar (potencia en correr)', () => {
    expect(anadirPeldano(['ritmo'], 'run', 'potencia')).toEqual(['ritmo']);
    expect(anadirPeldano(['ritmo'], 'run', 'pulso')).toEqual(['ritmo', 'pulso']);
  });

  test('añadir no duplica un peldaño que ya está', () => {
    expect(anadirPeldano(['ritmo', 'pulso'], 'run', 'pulso')).toEqual(['ritmo', 'pulso']);
  });

  test('todas las modalidades tienen descriptor de escalera', () => {
    for (const modalidad of MODALIDADES_CARGA) {
      expect(DESCRIPTORES_METODO_ANALITICO[`fuentes_${modalidad}`].tipo).toBe('escalera');
    }
  });
});

describe('lectura en vivo de las bandas de frescura', () => {
  test('con los defectos, da los cinco tramos exactos', () => {
    expect(formatearBandasFrescura(-30, -11, 4, 29)).toBe(
      'Pasado de carga ≤ −30 · Construyendo −29 a −11 · Manteniendo −10 a 4 · Fresco 5 a 29 · Recargando ≥ 30',
    );
  });
});
