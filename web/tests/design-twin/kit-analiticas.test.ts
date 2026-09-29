// KIT-ANALITICAS — lo que se afirma sin mirar una captura: los mecanismos
// (ventana, bandas, comparación, cumplimiento, proyección con el Banister
// real, escala de ejes, estado de cada bloque), el contrato de los casos
// (toda lectura con dato lleva ancla; toda lectura sin dato lleva falta), que
// los cinco atletas recorren los cuatro estados de los ocho bloques (A10). Los
// tokens medidos (contraste AA en claro y oscuro, suelo 15 pt, paleta validada)
// viven en `kit-analiticas-piel.test.ts`.

import { describe, expect, it } from 'vitest';
import { BLOQUES, VENTANAS, type Bloque, type EstadoBloque, type LecturaPanel } from '@/components/design-twin/kit-analiticas/contrato';
import { ESCENARIOS_PORTADA, panelDe } from '@/components/design-twin/kit-analiticas/casos/atletas';
import { detalleCorrerDe, detalleErgoDe, detalleEstacionesDe, detalleFuerzaDe } from '@/components/design-twin/kit-analiticas/casos/detalles';
import { ESCENARIOS_SESION, sesionDe } from '@/components/design-twin/kit-analiticas/casos/sesiones';
import { estadosDe } from '@/components/design-twin/kit-analiticas/derivados';
import { formatear, formatearDelta } from '@/components/design-twin/kit-analiticas/fmt';
import { agruparPuntos, comparar, cumplimientoDe, escalaBonita, estadoDeBloque, estadoFrescuraDe, proyectar, rangoDe, veredictoForma } from '@/components/design-twin/kit-analiticas/mecanismo';
import { BANDAS_FRESCURA_DEFECTO, METODO_DEFECTO, REPARTO_CARRERA_DEFECTO } from '@/components/design-twin/kit-analiticas/metodo';

const HOY = '2026-09-29';

describe('la ventana (A4)', () => {
  it('12 semanas: 84 días cortados en hoy, con el periodo anterior de igual longitud justo antes', () => {
    const r = rangoDe('12s', HOY, '2025-10-13');
    expect(r).toMatchObject({ desde: '2026-07-08', hasta: HOY, dias: 84, paso: 'semana', cubre_todo: false });
    expect(r.anterior).toEqual({ desde: '2026-04-15', hasta: '2026-07-07' });
  });

  it('7 días va por día; «todo» va desde la primera sesión y da permiso para «desde que empezaste»', () => {
    expect(rangoDe('7d', HOY, null).paso).toBe('dia');
    const todo = rangoDe('todo', HOY, '2026-09-08');
    expect(todo.cubre_todo).toBe(true);
    expect(todo.desde).toBe('2026-09-08');
    // Sin primera sesión no hay desde cuándo contar: cae a un año.
    expect(rangoDe('todo', HOY, null).dias).toBe(364);
  });
});

describe('las bandas de frescura y el veredicto (§4)', () => {
  it('cinco estados con los cortes de mercado por defecto', () => {
    const b = (tsb: number) => estadoFrescuraDe(tsb, BANDAS_FRESCURA_DEFECTO).clave;
    expect([b(-35), b(-30), b(-20), b(-11), b(-10), b(0), b(4), b(5), b(29), b(30), b(60)]).toEqual([
      'sobrecarga', 'sobrecarga', 'optimo', 'optimo', 'mantener', 'mantener', 'mantener', 'fresco', 'fresco', 'recargando', 'recargando',
    ]);
  });

  it('el veredicto se retira por debajo de la cobertura mínima y lo dice; con cobertura, juzga por subida y estado', () => {
    const retirado = veredictoForma({ subida: 3, estado: 'optimo', cobertura_pct: 71, estimada_pct: 0, metodo: METODO_DEFECTO });
    expect(retirado.clase).toBe('sin-veredicto');
    expect(retirado.retirado_es).toContain('71 %');
    expect(retirado.retirado_es).toContain('90 %');
    expect(veredictoForma({ subida: 3, estado: 'optimo', cobertura_pct: 100, estimada_pct: 0, metodo: METODO_DEFECTO }).clase).toBe('a-mas');
    expect(veredictoForma({ subida: 7, estado: 'optimo', cobertura_pct: 100, estimada_pct: 0, metodo: METODO_DEFECTO }).clase).toBe('te-pasas');
    expect(veredictoForma({ subida: 0.2, estado: 'mantener', cobertura_pct: 100, estimada_pct: 0, metodo: METODO_DEFECTO }).clase).toBe('mantiene');
    // Con umbral estimado, el veredicto lo dice en la misma frase.
    expect(veredictoForma({ subida: 3, estado: 'optimo', cobertura_pct: 100, estimada_pct: 12, metodo: METODO_DEFECTO }).frase_es).toContain('12 %');
  });
});

describe('comparar en la unidad que juzga (A3) y cumplir por tramo (A8)', () => {
  it('el delta va en la unidad del dato y «significativo» lo decide el umbral del método', () => {
    const c = comparar({ actual: 252, referencia: 262, contra: 'periodo_anterior', umbral: METODO_DEFECTO.umbrales_cambio.ritmo_umbral_s_km, etiqueta_es: 'vs antes' });
    expect(c.delta).toBe(-10);
    expect(c.significativo).toBe(true);
    expect(comparar({ actual: 252, referencia: 254, contra: 'periodo_anterior', umbral: 3, etiqueta_es: '' }).significativo).toBe(false);
    expect(comparar({ actual: 10, referencia: 0, contra: 'basal', umbral: 1, etiqueta_es: '' }).delta_pct).toBeNull();
  });

  it('«más» es MÁS INTENSIDAD: menos segundos en ritmo, menos RIR, más kg', () => {
    const t = METODO_DEFECTO.tolerancias;
    expect(cumplimientoDe('ritmo', [225, 235], 230, t)).toBe('dentro');
    expect(cumplimientoDe('ritmo', [225, 235], 220, t)).toBe('por-encima');
    expect(cumplimientoDe('ritmo', [225, 235], 240, t)).toBe('por-debajo');
    expect(cumplimientoDe('rir', 2, 1, t)).toBe('dentro');
    expect(cumplimientoDe('rir', 2, 4, t)).toBe('por-debajo');
    expect(cumplimientoDe('kg', 100, 102.5, t)).toBe('dentro');
    expect(cumplimientoDe('kg', 100, 105, t)).toBe('por-encima');
    expect(cumplimientoDe('reps', 8, 6, t)).toBe('por-debajo');
    expect(cumplimientoDe('reps', 8, null, t)).toBe('no-hecha');
  });
});

describe('la proyección usa el Banister de shared (A7) y los ejes son redondos', () => {
  it('pasado y futuro se parten donde acaba lo hecho, y la curva continúa sin salto', () => {
    const hecho = Array.from({ length: 60 }, (_, i) => ({ date: `2026-0${i < 30 ? 8 : 9}-${String((i % 30) + 1).padStart(2, '0')}`, tss: 60 }));
    const plan = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, tss: 40 }));
    const p = proyectar(hecho, plan, METODO_DEFECTO);
    expect(p.pasado).toHaveLength(60);
    expect(p.futuro).toHaveLength(10);
    const ultimo = p.pasado[p.pasado.length - 1]!;
    const primero = p.futuro[0]!;
    expect(Math.abs(primero.ctl - ultimo.ctl)).toBeLessThan(2);
    // Con menos carga que la forma, la forma baja y la frescura sube: el taper.
    expect(p.futuro[9]!.ctl).toBeLessThan(ultimo.ctl);
    expect(p.futuro[9]!.tsb).toBeGreaterThan(ultimo.tsb);
  });

  it('la escala cubre el rango con marcas redondas y nunca deja un valor fuera', () => {
    const e = escalaBonita(0, 730, 4, { desdeCero: true });
    expect(e.min).toBe(0);
    expect(e.max).toBeGreaterThanOrEqual(730);
    expect(e.ticks.every((t) => Number.isInteger(t) && t % 100 === 0 || t % 200 === 0)).toBe(true);
    const h = escalaBonita(0, 12.4, 4, { desdeCero: true });
    expect(h.ticks).toEqual([0, 5, 10, 15]);
  });

  it('agrupar suma lo que hay y deja a null un grupo entero sin dato (el hueco no se tapa)', () => {
    const g = agruparPuntos([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'c', v: null }, { t: 'd', v: null }], 2);
    expect(g).toEqual([{ t: 'a', v: 3 }, { t: 'c', v: null }]);
  });
});

describe('el estado de un bloque se deriva (A10)', () => {
  const base = (x: Partial<LecturaPanel>): LecturaPanel => ({
    id: 'x',
    bloque: 'forma',
    familia: 'todas',
    titulo_es: 'x',
    estado: 'medida',
    dato: { valor: 1, unidad: 'tss', comparacion: null },
    serie: null,
    reparto: null,
    cobertura: { muestras: 10, dias_ventana: 84, dias_con_dato: 60, pct: 71, estimada_pct: 0, ultimo_dato: HOY, falta: null },
    procedencia: { de: 'x', explica_es: 'x', medida: true, proveedor: null, ancla: 'medida' },
    ...x,
  });
  it('vacío sin lecturas o sin nada andado; poco con historia empezada o pocas muestras; viejo por edad; lleno si no', () => {
    expect(estadoDeBloque([], HOY, METODO_DEFECTO)).toBe('vacio');
    expect(estadoDeBloque([base({ estado: 'sin_dato', dato: null, cobertura: { muestras: 0, dias_ventana: 84, dias_con_dato: 0, pct: null, estimada_pct: null, ultimo_dato: null, falta: { por: 'historia', llevas: 0, hacen: 6 } } })], HOY, METODO_DEFECTO)).toBe('vacio');
    expect(estadoDeBloque([base({ estado: 'sin_dato', dato: null, cobertura: { muestras: 0, dias_ventana: 84, dias_con_dato: 0, pct: null, estimada_pct: null, ultimo_dato: null, falta: { por: 'historia', llevas: 3, hacen: 6 } } })], HOY, METODO_DEFECTO)).toBe('poco');
    expect(estadoDeBloque([base({ cobertura: { muestras: 2, dias_ventana: 84, dias_con_dato: 2, pct: null, estimada_pct: 0, ultimo_dato: HOY, falta: null } })], HOY, METODO_DEFECTO)).toBe('poco');
    expect(estadoDeBloque([base({ cobertura: { muestras: 10, dias_ventana: 84, dias_con_dato: 60, pct: 71, estimada_pct: 0, ultimo_dato: '2026-09-06', falta: null } })], HOY, METODO_DEFECTO)).toBe('viejo');
    expect(estadoDeBloque([base({})], HOY, METODO_DEFECTO)).toBe('lleno');
  });
});

describe('los cinco atletas recorren los cuatro estados de los ocho bloques (A10)', () => {
  it('cada bloque pasa por vacío, poco, lleno y viejo en algún escenario (ventana de 12 semanas)', () => {
    const vistos: Record<Bloque, Set<EstadoBloque>> = Object.fromEntries(BLOQUES.map((b) => [b, new Set<EstadoBloque>()])) as Record<Bloque, Set<EstadoBloque>>;
    for (const e of ESCENARIOS_PORTADA) {
      const est = estadosDe(panelDe(e, '12s'), METODO_DEFECTO);
      for (const b of BLOQUES) vistos[b].add(est[b]);
    }
    for (const b of BLOQUES) expect([...vistos[b]].sort(), b).toEqual(['lleno', 'poco', 'vacio', 'viejo']);
  });

  it('el panel es determinista y obedece la ventana entera: todas las ventanas producen un panel coherente', () => {
    expect(panelDe('lleno', '12s')).toEqual(panelDe('lleno', '12s'));
    for (const v of VENTANAS) {
      const p = panelDe('lleno', v);
      expect(p.ventana.ventana).toBe(v);
      const forma = p.forma.lecturas.find((l) => l.id === 'forma.forma');
      // Un día por punto dentro de la ventana; una ventana más larga que la historia enseña la historia entera y nada más.
      const historia = p.historia.desde ? Math.round((Date.parse(HOY) - Date.parse(p.historia.desde)) / 86_400_000) + 1 : 0;
      expect(forma?.serie?.hecho.length).toBe(Math.min(p.ventana.dias, historia));
    }
  });

  it('toda lectura con dato lleva ancla y toda lectura sin dato lleva su falta; las series de plan van alineadas con las de hecho', () => {
    for (const e of ESCENARIOS_PORTADA) {
      const p = panelDe(e, '12s');
      const todas = [...p.estado.lecturas, ...p.forma.lecturas, ...p.semanas.lecturas, ...p.intensidad.lecturas, ...p.progreso, ...p.recuperacion];
      for (const l of todas) {
        if (l.estado === 'medida') {
          expect(l.dato, l.id).not.toBeNull();
          expect(['medida', 'declarada', 'estimada', 'poblacional'], l.id).toContain(l.procedencia.ancla);
        } else {
          expect(l.cobertura.falta, l.id).not.toBeNull();
          expect(l.dato).toBeNull();
        }
        if (l.serie?.plan) {
          expect(l.serie.plan.map((q) => q.t)).toEqual(l.serie.hecho.map((q) => q.t));
        }
      }
    }
  });

  it('una previsión de carrera parcial no inventa un tiempo (Pau: 11 de 17 tramos → sin previsto ni hueco)', () => {
    const pau = panelDe('mixto', '12s');
    expect(pau.carrera?.cobertura.con_dato).toBeLessThan(17);
    expect(pau.carrera?.previsto_s).toBeNull();
    expect(pau.carrera?.hueco_s).toBeNull();
    const marta = panelDe('lleno', '12s');
    expect(marta.carrera?.previsto_s).toBe(marta.carrera?.tramos.reduce((s, t) => s + (t.previsto_s ?? 0), 0));
    // El reparto de referencia suma 1: el objetivo se reparte entero.
    expect(Math.abs(Object.values(REPARTO_CARRERA_DEFECTO).reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.001);
  });

  it('un atleta de tres semanas no se compara con un periodo en el que no existía (pero sí con hace 7 días, que sí existía)', () => {
    const jordi = panelDe('poco', '12s');
    for (const l of jordi.forma.lecturas) if (l.dato?.comparacion?.contra === 'periodo_anterior') expect.fail(`${l.id} se compara con un periodo anterior que no existía`);
    expect(jordi.estado.lecturas.find((l) => l.id === 'estado.fatiga')?.dato?.comparacion?.etiqueta_es).toBe('vs hace 7 días');
  });
});

describe('los detalles y las sesiones tienen la forma del contrato', () => {
  it('cada familia con dato produce su detalle y sin familia no produce nada', () => {
    expect(detalleCorrerDe('lleno', '12s')).not.toBeNull();
    expect(detalleCorrerDe('vacio', '12s')).toBeNull();
    expect(detalleErgoDe('mixto', '12s', 'bici')).toBeNull();
    expect(detalleErgoDe('lleno', '12s', 'bici')?.umbral.dato?.unidad).toBe('w');
    expect(detalleFuerzaDe('poco', '12s')?.ejercicios.length).toBe(2);
    expect(detalleEstacionesDe('lleno', '12s')?.oficial?.tramos).toHaveLength(17);
  });

  it('cada sesión tiene su carga por peldaño y la de los trineos sin kg no se sabe (cuenta contra la cobertura)', () => {
    for (const id of ESCENARIOS_SESION) {
      const s = sesionDe(id);
      expect(s.tramos.length).toBeGreaterThan(0);
      for (const t of s.tramos) if (t.carga.tss != null) expect(t.carga.peldano).not.toBeNull();
    }
    const trineos = sesionDe('fuerza-trineos');
    expect(trineos.tramos.filter((t) => t.carga.tss == null)).toHaveLength(2);
    expect(trineos.carga.cobertura_pct).toBeLessThan(100);
    const cinta = sesionDe('cinta-4x1000');
    expect(cinta.tramos.filter((t) => t.rol === 'trabajo').map((t) => t.cumplimiento)).toEqual(['dentro', 'dentro', 'por-debajo', 'dentro']);
  });
});

describe('formato: un formateador por unidad', () => {
  it('escribe cada unidad como se lee en el box', () => {
    expect(formatear(252, 's_km')).toBe('4:12/km');
    expect(formatear(108.1, 's_500m')).toBe('1:48/500m');
    expect(formatear(4470, 'segundos')).toBe('1:14:30');
    expect(formatear(7.1, 'horas')).toBe('7,1 h');
    expect(formatear(132, 'kg')).toBe('132 kg');
    expect(formatearDelta(-4, 's_km')).toBe('−4 s/km');
    expect(formatearDelta(2.5, 'kg')).toBe('+2,5 kg');
    expect(formatearDelta(112, 'segundos')).toBe('+1:52');
  });
});
