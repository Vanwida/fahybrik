// IPHONE · CORRER — lo que la familia de correr añadió al kit y lo que
// promete: la cinta como enlace (conectada, «lo dices tú», perdida), la rejilla
// de la cinta sin ritmo cuando nadie lo mide, la instrucción del RPE en el
// sitio de la banda, y que un libre pinta EXACTAMENTE lo mismo que el del coach.

import { describe, expect, it } from 'vitest';
import { enlacesDe, notaEnlace, usaGps, type Dispositivos } from '@/components/design-twin/kit-iphone-vivo/enlace';
import { familiaDe } from '@/components/design-twin/kit-reloj/familia';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { heroeDeFamilia, metricasDelPaso } from '@/components/design-twin/kit-reloj/metricas';
import { REGLAS_AVISO_DEFECTO, type Lecturas } from '@/components/design-twin/kit-reloj/paso';
import { luegoDe, posicionDe } from '@/components/design-twin/kit-reloj/posicion';
import { estadoInicial, lecturasDe, pasoVivo } from '@/components/design-twin/kit-reloj/secuencia';
import { casoDe as casoCorrer } from '@/components/design-twin/screens/reloj-correr/casos';
import { casoDe, conCadencia, sinCinta } from '@/components/design-twin/screens/iphone-vivo-correr/casos';
import { TEMPO_CINTA_I, libreSeisPorMil, tempoCinta } from '@/components/design-twin/screens/iphone-vivo-correr/planes';

const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };
const ZONAS = tempoCinta().zonas;
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 200, hecho: 200, ritmo: null, ppm: 158, gps: 'no-aplica', ...x });

describe('la cinta es un enlace aunque el paso no la declare como máquina', () => {
  const tempo = tempoCinta().pasos[TEMPO_CINTA_I]!;

  it('el paso es de la familia cinta, no usa GPS y por tanto no tiene Mapa', () => {
    expect(familiaDe(tempo)).toBe('cinta');
    expect(usaGps(tempo)).toBe(false);
  });

  it('conectada: chip «Cinta» sin nota; sin conectar: «Conectar la cinta» y «lo dices tú»; perdida: «sin señal»', () => {
    const ok = enlacesDe({ ...MOVIL, maquina: 'cinta' }, tempo, lect({ ritmo: 259 }));
    expect(ok.find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Cinta', estado: 'ok', nota: null });
    expect(notaEnlace(ok)).toBeNull();
    const sin = enlacesDe(MOVIL, tempo, lect({}));
    expect(sin.find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Conectar la cinta', estado: 'apagado' });
    expect(notaEnlace(sin)).toBe('sin la cinta · lo dices tú');
    const perdida = enlacesDe({ ...MOVIL, maquina: 'cinta' }, tempo, lect({ viejos: ['ritmo', 'hecho'] }));
    expect(perdida.find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Cinta · sin señal', estado: 'perdido' });
    expect(notaEnlace(perdida)).toBe('sin señal de la cinta · toca para reconectar');
  });

  it('conectada manda el ritmo de la cinta; sin conectar el héroe cae a lo que falta y el ritmo NO se pinta', () => {
    const con = laminaDelPaso(tempo, lect({ ritmo: 259 }), ZONAS);
    expect(con.heroe).toMatchObject({ clase: 'ritmo', texto: '4:19', unidad: '/km' });
    expect(con.banda?.palabra?.texto).toBe('dentro');
    expect(metricasDelPaso(tempo, lect({ ritmo: 259 }), 'ritmo', ZONAS, { metrosPaso: 769 }).map((m) => m.clave)).toEqual(['pulso', 'inclinacion', 'distancia']);

    const sin = laminaDelPaso(tempo, lect({}), ZONAS);
    expect(sin.heroe).toMatchObject({ clase: 'falta', texto: '16:40', etiqueta: 'quedan' });
    expect(sin.banda?.marca).toBeNull();
    // Nadie mide el ritmo ni los metros: ni «—» ni cero. Solo lo que sí se sabe.
    expect(metricasDelPaso(tempo, lect({}), 'falta', ZONAS, { metrosPaso: null }).map((m) => m.clave)).toEqual(['pulso', 'inclinacion']);
    // Se medía y se perdió: entonces sí «—».
    const perdido = metricasDelPaso(tempo, lect({ viejos: ['ritmo'] }), 'falta', ZONAS, {});
    expect(perdido.find((m) => m.clave === 'ritmo')?.valor).toBe('—');
  });

  it('el cuerpo sin cinta no da ritmo ni cadencia, y el motor no inventa metros', () => {
    const c = casoDe('cinta-lo-dices-tu');
    const e = estadoInicial(c.plan, c.sim, c.inicio);
    const l = lecturasDe(c.plan.pasos[e.i]!, e);
    expect(l.ritmo).toBeNull();
    expect(l.cadencia).toBeNull();
    expect(e.midio).toBe(false);
    expect(l.ppm).not.toBeNull();
    const base = sinCinta(() => ({ ritmo: 250, ppm: 150, cadencia: 178 }));
    expect(base(c.plan.pasos[TEMPO_CINTA_I]!, TEMPO_CINTA_I, 10, 10)).toMatchObject({ ritmo: null, cadencia: null, ppm: 150 });
  });
});

describe('la calle: la cadencia la mide el teléfono', () => {
  it('con ritmo hay cadencia; sin ritmo (GPS buscando) no se inventa', () => {
    const sim = conCadencia((p) => (p.rol === 'trabajo' ? { ritmo: 230, ppm: 170, gps: 'listo' } : { ritmo: null, ppm: 120, gps: 'buscando' }));
    const c = casoCorrer('serie-dentro');
    const serie = c.datos.plan.pasos[5]!;
    const l = sim(serie, 5, 10, 10);
    expect(l.cadencia).toBeGreaterThan(170);
    expect(sim({ ...serie, rol: 'recuperacion' }, 6, 10, 10).cadencia).toBeUndefined();
  });

  it('la rejilla de la serie en calle: pulso con zona, distancia del paso y cadencia', () => {
    const c = casoDe('serie-dentro');
    const e = estadoInicial(c.plan, c.sim, c.inicio);
    const p = pasoVivo(c.plan, e);
    const l = lecturasDe(p, e);
    const heroe = heroeDeFamilia(p, l, c.plan.zonas, { metrosPaso: e.metros });
    expect(heroe.clase).toBe('ritmo');
    const m = metricasDelPaso(p, l, heroe.clase, c.plan.zonas, { metrosPaso: e.metros }, REGLAS_AVISO_DEFECTO);
    expect(m.map((x) => x.clave)).toEqual(['pulso', 'distancia', 'cadencia']);
    expect(m[2]).toMatchObject({ unidad: 'pasos' });
  });
});

describe('el RPE es una instrucción, no un número vivo', () => {
  it('el stride a RPE 7: héroe lo que falta, sin banda, con la instrucción «RPE 7 · fuerte»', () => {
    const c = casoDe('rpe');
    const e = estadoInicial(c.plan, c.sim, c.inicio);
    const p = pasoVivo(c.plan, e);
    const l = laminaDelPaso(p, lecturasDe(p, e), c.plan.zonas);
    expect(l.heroe).toMatchObject({ clase: 'falta', etiqueta: 'quedan' });
    expect(l.banda).toBeNull();
    expect(l.instruccion).toBe('RPE 7 · fuerte');
  });
});

describe('un libre y uno del coach son el mismo objeto (I1)', () => {
  it('el 6 × 1000 m libre pinta la misma cabecera, el mismo héroe, la misma banda, la misma rejilla y el mismo «Luego»', () => {
    const coach = casoDe('serie-dentro');
    const libre = casoDe('libre');
    expect(libre.plan.pasos).toHaveLength(coach.plan.pasos.length);
    const eC = estadoInicial(coach.plan, coach.sim, coach.inicio);
    const eL = estadoInicial(libre.plan, libre.sim, libre.inicio);
    const pC = pasoVivo(coach.plan, eC);
    const pL = pasoVivo(libre.plan, eL);
    const lC = lecturasDe(pC, eC);
    const lL = lecturasDe(pL, eL);
    expect(posicionDe(pL)).toEqual(posicionDe(pC));
    expect(laminaDelPaso(pL, lL, libre.plan.zonas)).toEqual(laminaDelPaso(pC, lC, coach.plan.zonas));
    expect(metricasDelPaso(pL, lL, 'ritmo', libre.plan.zonas, { metrosPaso: eL.metros })).toEqual(metricasDelPaso(pC, lC, 'ritmo', coach.plan.zonas, { metrosPaso: eC.metros }));
    expect(luegoDe(libre.plan.pasos, eL.i)).toEqual(luegoDe(coach.plan.pasos, eC.i));
    // Lo único que difiere es de quién es: el libre no lleva bloques del coach.
    expect(libreSeisPorMil().pasos.every((p) => p.bloque == null && p.cue == null)).toBe(true);
  });
});

describe('cada escenario arranca donde dice', () => {
  it('rodaje a zona: manda el pulso con la Z2 y la primaria es la vuelta; el progresivo arranca a 10 s del tramo 4', () => {
    const r = casoDe('rodaje-z2');
    const e = estadoInicial(r.plan, r.sim, r.inicio);
    const p = pasoVivo(r.plan, e);
    const l = laminaDelPaso(p, lecturasDe(p, e), r.plan.zonas);
    expect(l.heroe.clase).toBe('pulso');
    expect(l.banda?.zonas?.objetivo).toEqual([2, 2]);
    expect(p.vueltaAutoM).toBe(1000);
    const g = casoDe('progresivo');
    const eg = estadoInicial(g.plan, g.sim, g.inicio);
    expect(g.plan.pasos[eg.i]!.posicion?.tramo).toEqual({ n: 3, de: 8 });
    expect(g.plan.pasos[eg.i]!.medida.prescrito! - eg.t).toBe(10);
  });
});
