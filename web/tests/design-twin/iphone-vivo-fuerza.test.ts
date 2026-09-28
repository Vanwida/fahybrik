// IPHONE · FUERZA — lo que la familia añadió al kit compartido el 28-09 y
// que, si alguien lo deshace, hace que el vivo MIENTA sobre la barra:
//   · la cascada de la carga solo entre series con la MISMA prescripción
//     (en una pirámide, lo cargado al 70 % no es la propuesta del 80 %);
//   · «Viene:» y «Luego ·» con la carga que está en la barra, no la del plan;
//   · la cabecera de fuerza: el ejercicio delante, la serie de ESE ejercicio,
//     las reps no (ya son el héroe), la dosis sí en una isometría; «Colócate»;
//   · la rejilla no repite lo que el héroe ya dice (un dato, un sitio) y el
//     pulso nunca es la celda que cae;
//   · los planes de la propuesta entran en el modelo con cero texto libre, y
//     un libre se pinta igual que uno del coach.

import { describe, expect, it } from 'vitest';
import {
  cargaArrastrada,
  heredaCarga,
  seriesQueHeredan,
  ultimaSerieAnotada,
  type Registro,
} from '@/components/design-twin/kit-reloj/anotar';
import { esFuerza, type PasoFuerza } from '@/components/design-twin/kit-reloj/fuerza';
import { heroeDeFamilia, metricasDelPaso, REJILLA } from '@/components/design-twin/kit-reloj/metricas';
import type { Lecturas, PasoBase } from '@/components/design-twin/kit-reloj/paso';
import { luegoDe, posicionDe, textoViene } from '@/components/design-twin/kit-reloj/posicion';
import { casoDe, planLibre, planP11ContadoPorTi, planPiramide392 } from '@/components/design-twin/screens/iphone-vivo-fuerza/casos';
import { escenarios } from '@/components/design-twin/screens/iphone-vivo-fuerza/index';
import { indiceDe, sesion529, sesion538 } from '@/components/design-twin/screens/reloj-fuerza/planes';

const lect = (x: Partial<Lecturas> = {}): Lecturas => ({ t: 30, hecho: null, ritmo: null, ppm: 126, gps: 'no-aplica', ...x });
const fuerza = (plan: { pasos: PasoBase[] }, id: string): PasoFuerza => {
  const p = plan.pasos[indiceDe(plan as never, id)];
  if (!esFuerza(p)) throw new Error(`${id} no es de fuerza`);
  return p;
};

describe('la carga en cascada respeta la prescripción', () => {
  const p392 = planPiramide392();

  it('en la pirámide 392 las cinco series comparten la banda 75–85 %: lo declarado en la 1 pasa a la 2', () => {
    expect(heredaCarga(fuerza(p392, '392-bs-s2'), fuerza(p392, '392-bs-s1'))).toBe(true);
    const registro: Registro = { '392-bs-s1': { reps: 6, kg: 140 } };
    expect(cargaArrastrada(p392, indiceDe(p392, '392-bs-s2'), registro)).toBe(140);
    expect(seriesQueHeredan(p392, indiceDe(p392, '392-bs-s1'), registro)).toEqual([2, 3, 4, 5]);
    // Declarar la 3 corta la cascada de la 1 en la 3.
    expect(seriesQueHeredan(p392, indiceDe(p392, '392-bs-s1'), { ...registro, '392-bs-s3': { kg: 150 } })).toEqual([2]);
  });

  it('con otra prescripción (5 × 70 % → 3 × 80 %) no se hereda: cada serie propone lo suyo', () => {
    const s1 = fuerza(p392, '392-bs-s1');
    const s2: PasoFuerza = { ...fuerza(p392, '392-bs-s2'), fuerza: { ...s1.fuerza, carga: { tipo: 'rm', pctMin: 80, pctMax: 80, rmKg: 186.5 } } };
    expect(heredaCarga(s2, s1)).toBe(false);
    const plan = { ...p392, pasos: p392.pasos.map((q) => (q.id === s2.id ? s2 : q)) };
    expect(cargaArrastrada(plan, indiceDe(plan, '392-bs-s2'), { '392-bs-s1': { kg: 132.5 } })).toBeNull();
    // Y en el héroe sale la del plan del 80 %: 186,5 × 0,8 = 149 → 150 en la barra.
    expect(heroeDeFamilia(s2, lect(), null, { cargaKg: null })).toMatchObject({ texto: '6 × 150', unidad: 'kg', etiqueta: '80 % RM' });
  });

  it('la carga tuya y los kilos del coach sí se heredan; una aproximación nunca', () => {
    const p529 = sesion529();
    expect(heredaCarga(fuerza(p529, '529-B1-s2'), fuerza(p529, '529-B1-s1'))).toBe(true);
    expect(cargaArrastrada(p529, indiceDe(p529, '529-B1-s2'), { '529-B1-s1': { kg: 140 } })).toBe(140);
    const aprox: PasoFuerza = { ...fuerza(p529, '529-B1-s1'), fuerza: { ...fuerza(p529, '529-B1-s1').fuerza, aproximacion: true } };
    expect(heredaCarga(fuerza(p529, '529-B1-s2'), aprox)).toBe(false);
  });

  it('la última serie anotada del mismo ejercicio, en palabras', () => {
    const p11 = planP11ContadoPorTi();
    const registro: Registro = { 'p11-bs-s1': { reps: 5, kg: 100, esfuerzo: 2 }, 'p11-bs-s2': { reps: 4, kg: 100, esfuerzo: 1 } };
    expect(ultimaSerieAnotada(p11, indiceDe(p11, 'p11-bs-s3'), registro)).toBe('4 × 100 kg · RIR 1');
    expect(ultimaSerieAnotada(p11, indiceDe(p11, 'p11-bs-s1'), registro)).toBeNull();
  });
});

describe('«Viene:» y «Luego ·» dicen la carga que está en la barra', () => {
  const p392 = planPiramide392();

  it('sin nada declarado, la del plan; declarada, la de la barra', () => {
    const s3 = fuerza(p392, '392-bs-s3');
    expect(textoViene(s3)).toBe('Back Squat · 4 × 150 kg');
    expect(textoViene(s3, 145)).toBe('Back Squat · 4 × 145 kg');
    const i = indiceDe(p392, '392-bs-s2');
    expect(luegoDe(p392.pasos, i)).toEqual({ que: 'Descanso · 2′30″', despues: 'Back Squat · 4 × 150 kg' });
    expect(luegoDe(p392.pasos, i, (j) => (j === i + 2 ? 145 : null))).toEqual({ que: 'Descanso · 2′30″', despues: 'Back Squat · 4 × 145 kg' });
  });

  it('un «Colócate» dice sus segundos y lo que viene detrás', () => {
    const p538 = sesion538();
    const i = indiceDe(p538, '538-sp-s2');
    expect(p538.pasos[i + 1]?.rol).toBe('transicion');
    expect(luegoDe(p538.pasos, i)).toEqual({ que: 'Colócate 5″', despues: 'Serie 3/3 · Side Plank · 20″' });
  });
});

describe('la cabecera de fuerza: el ejercicio delante, la serie de ESE ejercicio', () => {
  it('con hueco de superserie o sin él; las reps no (son el héroe); la isometría con su dosis; el colócate', () => {
    const p529 = sesion529();
    expect(posicionDe(fuerza(p529, '529-A1-s2'))).toEqual(['A1 · Back Squat', 'Serie 2/4']);
    const p392 = planPiramide392();
    expect(posicionDe(fuerza(p392, '392-bs-s2'))).toEqual(['Back Squat', 'Serie 2/5']);
    const p538 = sesion538();
    expect(posicionDe(fuerza(p538, '538-sp-s2'))).toEqual(['Side Plank', 'Serie 2/3', '20″']);
    expect(posicionDe(p538.pasos[indiceDe(p538, '538-sp-s2') + 1]!)).toEqual(['Colócate', '5″']);
    const p488 = sesion529();
    expect(posicionDe(fuerza(p488, '529-A2-s4'))).toEqual(['A2 · Box Jump', 'Serie 4/4']);
  });
});

describe('la rejilla de fuerza no repite al héroe y el pulso nunca cae', () => {
  const p11 = planP11ContadoPorTi();
  const p392 = planPiramide392();

  it('el RIR va encima del héroe, no en una celda; la carga del plan solo si dice algo más', () => {
    const s3 = fuerza(p11, 'p11-bs-s3');
    const heroe = heroeDeFamilia(s3, lect(), null);
    expect(heroe.etiqueta).toBe('RIR 2');
    const claves = metricasDelPaso(s3, lect(), heroe.clase, null, { ultimaSerie: '5 × 100 kg · RIR 2' }).map((m) => m.clave);
    expect(claves).not.toContain('esfuerzo');
    // 100 kg del coach: no hay «carga del plan» aparte del héroe.
    expect(claves).not.toContain('carga');
    expect(claves).toEqual(['serie', 'tempo', 'pulso', 'ultima']);
    expect(claves.length).toBeLessThanOrEqual(REJILLA.max);
  });

  it('una banda de %RM sí se enseña (el héroe solo lleva la barra); un % único igual a la barra, no', () => {
    const s2 = fuerza(p392, '392-bs-s2');
    const m = metricasDelPaso(s2, lect(), 'falta', null, { cargaKg: 140 });
    expect(m.find((x) => x.clave === 'carga')).toMatchObject({ valor: '140–159 kg' });
    const unico: PasoFuerza = { ...s2, fuerza: { ...s2.fuerza, carga: { tipo: 'rm', pctMin: 80, pctMax: 80, rmKg: 100 } } };
    // 80 % de 100 = 80 kg y en la barra hay 80: la celda diría lo mismo que el héroe.
    expect(metricasDelPaso(unico, lect(), 'falta', null, { cargaKg: 80 }).map((x) => x.clave)).not.toContain('carga');
    expect(metricasDelPaso(unico, lect(), 'falta', null, { cargaKg: 82.5 }).map((x) => x.clave)).toContain('carga');
  });

  it('con tempo, última serie y descanso, lo que cae es el descanso, no el pulso', () => {
    const s3 = fuerza(p11, 'p11-bs-s3');
    const claves = metricasDelPaso(s3, lect(), 'falta', null, { ultimaSerie: '5 × 100 kg · RIR 2', descansoS: 120 }).map((m) => m.clave);
    expect(claves.slice(0, REJILLA.max)).toContain('pulso');
    expect(claves.slice(0, REJILLA.max)).not.toContain('descanso');
  });
});

describe('los planes de la propuesta entran en el modelo sin texto libre', () => {
  it('la pirámide 392: cinco series con SU medida, la banda 75–85 % en todas, descanso entre ellas', () => {
    const p = planPiramide392();
    const series = p.pasos.filter(esFuerza);
    expect(series.map((s) => s.medida.prescrito)).toEqual([6, 6, 4, 4, 3]);
    series.forEach((s) => expect(s.fuerza.carga).toEqual({ tipo: 'rm', pctMin: 75, pctMax: 85, rmKg: 186.5 }));
    expect(p.pasos.filter((q) => q.rol === 'descanso')).toHaveLength(4);
    expect(series.map((s) => s.posicion?.serie?.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('P11 contado por ti: el mismo ejemplo, la serie la cierra el atleta', () => {
    const p = planP11ContadoPorTi();
    p.pasos.filter(esFuerza).forEach((s) => {
      expect(s.medida.mide).toBe('atleta');
      expect(s.cierre).toBe('atleta');
      expect(s.fuerza.esfuerzo).toEqual({ eje: 'rir', min: 2, max: 2 });
      expect(s.tempo).toEqual({ excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0 });
    });
  });

  it('el libre se pinta igual que uno del coach: misma cabecera, mismo héroe, misma rejilla', () => {
    const p = planLibre();
    const s2 = fuerza(p, 'libre-bs-s2');
    expect(posicionDe(s2)).toEqual(['Back Squat', 'Serie 2/4']);
    expect(heroeDeFamilia(s2, lect(), null, { cargaKg: 80 })).toMatchObject({ texto: '10 × 80', unidad: 'kg', etiqueta: 'carga tuya' });
    expect(metricasDelPaso(s2, lect(), 'falta', null, { ultimaSerie: '10 × 80 kg' }).map((m) => m.clave)).toEqual(['serie', 'pulso', 'ultima']);
    // Sin la última vez, nada se inventa: «10 reps» y carga tuya.
    const pm = fuerza(p, 'libre-pm-s1');
    expect(heroeDeFamilia(pm, lect(), null)).toMatchObject({ texto: '8', unidad: 'reps', etiqueta: 'carga tuya' });
  });

  it('cada escenario declarado se construye y arranca en un paso de su plan', () => {
    escenarios.forEach((e) => {
      const c = casoDe(e.id);
      expect(c.plan.pasos[c.inicio.i]).toBeDefined();
      expect(c.plan.pasos.every((q) => q.id)).toBe(true);
    });
    expect(new Set(escenarios.map((e) => e.id)).size).toBe(escenarios.length);
  });
});
