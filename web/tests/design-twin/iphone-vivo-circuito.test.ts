// EL CIRCUITO EN EL IPHONE (28-09, docs/vivo-iphone/modelo.md §5) — lo que
// la familia pidió al kit compartido y lo que decide ella:
//   · la ruta del circuito con parciales (`ruta.ts` de kit-reloj: la muñeca y
//     el iPhone pintan la misma);
//   · un tramo de ergo es continuo, no una serie (`formatoDe`);
//   · la cabecera en dos preguntas (qué haces / dónde estás) y que CABE a
//     390 pt junto al crono total y a los chips, en todos los pasos de todos
//     los planes de la familia;
//   · el objetivo que no es un número vivo (RPE) sale como instrucción;
//   · los planes nuevos (el bloque continuo, el circuito libre) y el ritmo del
//     coach en los runs de la HYROX.

import { describe, expect, it } from 'vitest';
import { anchoChips, partesQueCaben } from '@/components/design-twin/kit-iphone-vivo/cabecera';
import { enlacesDe, type Dispositivos } from '@/components/design-twin/kit-iphone-vivo/enlace';
import { LIENZO, MARGEN, TI, anchoTexto } from '@/components/design-twin/kit-iphone-vivo/tokens';
import { formatoDe as formatoDelKit } from '@/components/design-twin/kit-reloj/familia';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { REGLAS_AVISO_DEFECTO, type Lecturas, type Parcial, type PasoBase, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import { luegoDe } from '@/components/design-twin/kit-reloj/posicion';
import { nombreEnRuta, ritmoDeParcial, roxzoneDe, rutaDe } from '@/components/design-twin/kit-reloj/ruta';
import { estadoInicial, type PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { fmtReloj } from '@/components/design-twin/kit-reloj/reglas';
import { sesion492, sesion493, simulacionHyrox, type Circuito } from '@/components/design-twin/screens/reloj-circuito/planes';
import { TRAMO_CONTINUO_S, bloqueContinuo, circuitoLibre } from '@/components/design-twin/screens/iphone-vivo-circuito/planes';
import { formatoDe, tituloDe } from '@/components/design-twin/screens/iphone-vivo-circuito/texto';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: null, ritmo: null, ppm: 160, gps: 'no-aplica', ...x });
const parcial = (i: number, segundos: number, metros: number | null = null, ppm = 170): Parcial => ({ i, segundos, metros, ppm, hecho: null });
const sim = () => ({ ritmo: 280, ppm: 170, gps: 'listo' as const });

/** Un estado del motor en el paso `i` con los parciales dados (sin correr el motor). */
const estadoEn = (plan: PlanSesion, i: number, parciales: Parcial[], t = 30) => estadoInicial(plan, sim, { i, t, parciales });

const hyrox = () => simulacionHyrox({ pm5: true, roxzone: true, cap: null });

describe('la ruta del circuito (kit-reloj/ruta.ts): la muñeca y el iPhone pintan la misma', () => {
  it('493: cabeceras de ronda, lo hecho con su parcial, lo de ahora, lo que viene; el calentamiento fuera', () => {
    const c = sesion493();
    // Ronda 1 hecha (run + ski), en el descanso de la ronda 1.
    const e = estadoEn(c.plan, 3, [parcial(0, 360), parcial(1, 268, 1003), parcial(2, 122, 500)], 40);
    const filas = rutaDe(c.plan.pasos, e, { desde: c.inicio, cabecerasDeRonda: true, sueltas: 'ahora' });
    expect(filas[0]).toEqual({ tipo: 'ronda', n: 1, de: 5 });
    expect(filas[1]).toMatchObject({ tipo: 'paso', i: 1, estado: 'hecho', suelta: false });
    expect(filas[2]).toMatchObject({ tipo: 'paso', i: 2, estado: 'hecho', parcial: { segundos: 122 } });
    // El descanso de ahora sale suelto; los pendientes, sin parcial.
    expect(filas[3]).toMatchObject({ tipo: 'paso', i: 3, estado: 'ahora', suelta: true });
    expect(filas[4]).toEqual({ tipo: 'ronda', n: 2, de: 5 });
    expect(filas[5]).toMatchObject({ tipo: 'paso', i: 4, estado: 'pendiente', parcial: null });
    expect(filas.some((f) => f.tipo === 'paso' && f.i === 0)).toBe(false);
  });

  it('HYROX: sin cabeceras; las Roxzone pasadas salen sueltas solo si el pintor las pide', () => {
    const c = hyrox();
    // Run 1, Roxzone de entrada, SkiErg y Roxzone de salida hechos; en el Run 2.
    const e = estadoEn(c.plan, 4, [parcial(0, 280, 1003), parcial(1, 34), parcial(2, 252, 1000), parcial(3, 17)]);
    const muneca = rutaDe(c.plan.pasos, e, { sueltas: 'ahora' });
    expect(muneca.filter((f) => f.tipo === 'ronda')).toHaveLength(0);
    expect(muneca.filter((f) => f.tipo === 'paso' && f.suelta)).toHaveLength(0);
    const iphone = rutaDe(c.plan.pasos, e, { sueltas: 'pasadas' });
    expect(iphone.filter((f) => f.tipo === 'paso' && f.suelta).map((f) => (f.tipo === 'paso' ? f.i : -1))).toEqual([1, 3]);
    expect(iphone.find((f) => f.tipo === 'paso' && f.i === 4)).toMatchObject({ estado: 'ahora' });
    // La Roxzone sumada: las dos cerradas.
    expect(roxzoneDe(c.plan.pasos, e)).toBe(51);
    expect(roxzoneDe(sesion493().plan.pasos, e)).toBeNull();
  });

  it('los nombres: «Run 4» en HYROX, «Run 1000 m» en rondas, la estación por su nombre, lo suelto por su clase', () => {
    const c = hyrox();
    expect(nombreEnRuta(c.plan.pasos[12]!, true)).toBe('Run 4');
    expect(nombreEnRuta(c.plan.pasos[12]!, false)).toBe('Run 1000 m');
    expect(nombreEnRuta(c.plan.pasos[2]!, true)).toBe('SkiErg');
    expect(nombreEnRuta(c.plan.pasos[1]!, true)).toBe('Roxzone');
    expect(nombreEnRuta(sesion493().plan.pasos[3]!, false)).toBe('Descanso');
  });

  it('lo que dice un parcial medido: /km al correr (salvo el km justo), /500 en la máquina, nada sin metros', () => {
    const run = sesion493().plan.pasos[1]!;
    expect(ritmoDeParcial(run, parcial(1, 268, 1000))).toBeNull();
    expect(ritmoDeParcial(run, parcial(1, 214, 800))).toBe('4:28 /km');
    const ski = sesion493().plan.pasos[2]!;
    expect(ritmoDeParcial(ski, parcial(2, 122, 500))).toBe('2:02 /500');
    expect(ritmoDeParcial(sesion493().plan.pasos[5]!, parcial(5, 112))).toBeNull();
  });
});

describe('lo que la familia decide: la cabecera en dos preguntas', () => {
  const c493 = sesion493();
  const c492 = sesion492();
  const h = hyrox();

  it('fila 1 = qué haces, el nombre delante; fila 2 = el formato y dónde estás', () => {
    expect(tituloDe(h.plan.pasos[16]!, h)).toEqual(['Run 5/8', '1000 m']);
    expect(formatoDe(h.plan.pasos[16]!, h, 'Circuito')).toEqual(['HYROX']);
    expect(tituloDe(h.plan.pasos[6]!, h)).toEqual(['Sled Push']);
    expect(formatoDe(h.plan.pasos[6]!, h, 'Circuito')).toEqual(['HYROX', 'Estación 2/8']);
    // La estación medida lleva lo prescrito arriba: la fila del trabajo no lo dice (el héroe es lo que falta).
    expect(tituloDe(h.plan.pasos[2]!, h)).toEqual(['SkiErg', '1000 m']);
    expect(tituloDe(h.plan.pasos[1]!, h)).toEqual(['Roxzone']);
    expect(formatoDe(h.plan.pasos[1]!, h, 'Circuito')).toEqual(['HYROX', 'Estación 1/8']);
    expect(tituloDe(c493.plan.pasos[1]!, c493)).toEqual(['Run', '1000 m']);
    expect(formatoDe(c493.plan.pasos[1]!, c493, 'Circuito')).toEqual(['Circuito', 'Ronda 1/5']);
    expect(tituloDe(c492.plan.pasos[2]!, c492)).toEqual(['Sled Pull']);
    expect(formatoDe(c492.plan.pasos[2]!, c492, 'Circuito')).toEqual(['Circuito', 'Ronda 1/5', 'Estación 2/3']);
    // El descanso: lo que dice el kit arriba, la ronda abajo.
    expect(tituloDe(c493.plan.pasos[3]!, c493)).toEqual(['Descanso', '90″']);
    expect(formatoDe(c493.plan.pasos[3]!, c493, 'Circuito')).toEqual(['Circuito', 'Ronda 1/5']);
  });

  it('a 390 pt la fila 1 cabe entera junto al crono total en TODOS los pasos, y la fila 2 junto a los chips', () => {
    const ancho = LIENZO.minAncho;
    const cronoLargo = anchoTexto('1:02:05', TI.crono.cuerpo, TI.crono.peso) + 44;
    const util1 = ancho - 2 * MARGEN - cronoLargo - 16;
    const circuitos: Circuito[] = [c493, c492, h, circuitoLibre()];
    for (const c of circuitos) {
      // Desde el primer paso del circuito: el calentamiento es del kit (y de correr).
      c.plan.pasos.slice(c.inicio).forEach((p) => {
        const titulo = tituloDe(p, c).join(' · ');
        expect(anchoTexto(titulo, TI.posicion.cuerpo, TI.posicion.peso), titulo).toBeLessThanOrEqual(util1);
        // Los chips de este paso, con todas las máquinas emparejadas y una banda de pulso.
        const d: Dispositivos = { reloj: 'sin', maquina: p.maquina?.tipo ?? null, pulsometro: 'banda' };
        const chips = enlacesDe(d, p, lect({ gps: 'listo', split500: 120 }));
        // La fila 2 se queda con lo que dejan los chips: el formato y la ronda sobreviven siempre;
        // el contador de estación (lo menos importante: la estación ya está en la fila 1) puede caer.
        const formato = formatoDe(p, c, 'Circuito');
        const caben = partesQueCaben(formato, ancho - 2 * MARGEN - anchoChips(chips) - 10, TI.etiqueta.cuerpo, TI.etiqueta.peso);
        expect(caben.length, `${formato.join(' · ')} + ${chips.map((x) => x.texto).join(',')}`).toBeGreaterThanOrEqual(Math.min(2, formato.length));
      });
    }
  });

  it('la acción del kit y la del circuito se entienden: el crono total es el de la muñeca', () => {
    expect(fmtReloj(17 * 60 + 42)).toBe('17:42');
  });
});

describe('lo que subió al kit compartido', () => {
  it('un tramo de ergo es continuo (remo 15′ → ski 15′), no una serie', () => {
    const plan = bloqueContinuo();
    expect(plan.pasos).toHaveLength(3);
    expect(plan.pasos.map((p) => p.nombre)).toEqual(['Remo', 'Ski', 'Bici']);
    expect(plan.pasos.map((p) => p.maquina?.tipo)).toEqual(['remo', 'ski', 'bici']);
    expect(plan.pasos.every((p) => p.medida.prescrito === TRAMO_CONTINUO_S && p.medida.mide === 'ergo')).toBe(true);
    expect(formatoDelKit(plan.pasos[0]!)).toBe('Continuo');
    const serie: PasoBase = { ...plan.pasos[0]!, posicion: { serie: { n: 1, de: 8 } } };
    expect(formatoDelKit(serie)).toBe('Series');
    // «Luego» dice la máquina que viene, no solo «15′ a Z2».
    expect(luegoDe(plan.pasos, 0)?.que).toBe('Ski · 15′ a Z2');
    expect(luegoDe(plan.pasos, 2)).toBeNull();
  });

  it('«Luego»: el descanso de la ronda 2 no abre la ronda; el run de la ronda 3, sí', () => {
    const c = sesion493();
    // El paso 4 es el Run de la ronda 2; el 6, el descanso de la ronda 2; el 7, el Run de la ronda 3.
    expect(luegoDe(c.plan.pasos, 5)).toEqual({ que: 'Descanso · 90″', despues: 'Ronda 3/5 · Run · 1000 m a RPE 8' });
    expect(luegoDe(c.plan.pasos, 4)?.que).toBe('Burpee Broad Jump · 40 m');
  });

  it('el objetivo que no es un número vivo sale como instrucción (P3): el run de 493 a RPE 8', () => {
    const run = sesion493().plan.pasos[1]!;
    const lamina = laminaDelPaso(run, lect({ ritmo: 268, ppm: 170, gps: 'listo', hecho: 830 }), ZONAS, REGLAS_AVISO_DEFECTO);
    expect(lamina.banda).toBeNull();
    expect(lamina.instruccion).toBe('RPE 8 · ritmo de carrera');
    expect(lamina.heroe.etiqueta).toBe('quedan');
  });

  it('la HYROX admite el ritmo que el coach fija a los runs; sin él, los runs no llevan objetivo (la 441)', () => {
    const conRitmo = simulacionHyrox({ pm5: true, roxzone: true, cap: null, run: [{ eje: 'ritmo', min: 275, max: 285, papel: 'principal' }] });
    const runs = conRitmo.plan.pasos.filter((p) => p.clase === 'carrera');
    expect(runs).toHaveLength(8);
    expect(runs.every((p) => p.objetivos[0]?.eje === 'ritmo')).toBe(true);
    expect(hyrox().plan.pasos.filter((p) => p.clase === 'carrera').every((p) => p.objetivos.length === 0)).toBe(true);
  });

  it('el circuito libre es el mismo objeto que uno del coach: rondas, estaciones medidas y sin medir', () => {
    const c = circuitoLibre();
    expect(c.formato).toBe('rondas');
    expect(c.plan.pasos).toHaveLength(12);
    expect(c.plan.pasos[1]).toMatchObject({ clase: 'estacion', nombre: 'Wall Balls', cierre: 'atleta', carga: { kg: 9 } });
    expect(c.plan.pasos[2]).toMatchObject({ clase: 'estacion', nombre: 'Row', cierre: 'medida', maquina: { tipo: 'remo' } });
    expect(c.plan.pasos.every((p) => p.objetivos.length === 0)).toBe(true);
  });
});
