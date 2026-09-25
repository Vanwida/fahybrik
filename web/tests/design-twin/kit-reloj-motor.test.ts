// EL MOTOR Y LAS PIEZAS QUE SUBIERON AL KIT (consolidación del 25-09).
//
// Lo que tres familias hacían en local y ahora hace el kit una vez: un parcial
// por paso, las lecturas del PM5 (con su aviso y su frase en /500), la Roxzone
// que se cierra al detectar que vuelves a correr, el preaviso que no se repite
// al arrancar dentro de él, la voz de cada familia y el traductor con que una
// familia la reescribe sin tocar el háptico.

import { describe, expect, it } from 'vitest';
import {
  REGLAS_AVISO_DEFECTO,
  type FichaFuerza,
  type Objetivo,
  type PasoBase,
  type ZonasCoach,
} from '@/components/design-twin/kit-reloj/paso';
import { textoObjetivo, textoPasoCorto } from '@/components/design-twin/kit-reloj/reglas';
import { avanzar, cerrar, estadoInicial, type EstadoSecuencia, type PlanSesion, type Simulador } from '@/components/design-twin/kit-reloj/secuencia';
import { conVoz, traducirCon } from '@/components/design-twin/kit-reloj/gancho';
import { vozFinSerie, vozInicio, vozTransicion } from '@/components/design-twin/kit-reloj/voz';
import { duracionEstimada, filasDePasos, hoyDe, lineaBrief } from '@/components/design-twin/kit-reloj/estructura';
import { girarDial } from '@/components/design-twin/kit-reloj/tarea';
import { avisoDeCierre } from '@/components/design-twin/kit-reloj/vivo';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
const R = REGLAS_AVISO_DEFECTO;
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: R });

let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}

/** Corre el motor `segundos` y devuelve el estado y todo lo emitido. */
function correr(p: PlanSesion, sim: Simulador, segundos: number, s0: EstadoSecuencia = estadoInicial(p, sim, { i: 0 })) {
  let s = s0;
  const eventos: Array<{ evento: string; voz?: string }> = [];
  for (let k = 0; k < segundos; k++) {
    const r = avanzar(s, p, sim);
    s = r.estado;
    eventos.push(...r.eventos);
  }
  return { s, eventos };
}

const split = (s: number): Objetivo => ({ eje: 'split500', min: s, max: s, papel: 'principal' });

describe('un parcial por paso', () => {
  const run = paso({ clase: 'carrera', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 200, mide: 'gps' } });
  const sled = paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Sled Push', medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' }, cierre: 'atleta' });
  const p = plan([run, sled, paso({ clase: 'descanso', rol: 'descanso', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' } })]);
  const sim: Simulador = (q) => ({ ritmo: q.clase === 'carrera' ? 250 : null, ppm: 160, gps: 'listo' });

  it('la carrera deja sus metros y sus segundos; la estación que dices tú, su tiempo sin metros', () => {
    const { s } = correr(p, sim, 50);
    expect(s.i).toBe(1);
    expect(s.parciales).toHaveLength(1);
    expect(s.parciales[0]).toMatchObject({ i: 0, segundos: 50, metros: 200, ppm: 160 });
    const c = cerrar(correr(p, sim, 30, s).s, p, 'atleta').estado;
    expect(c.parciales[1]).toMatchObject({ i: 1, segundos: 30, metros: null });
  });

  it('el tiempo de partida sale de los parciales de lo ya hecho', () => {
    const s = estadoInicial(p, sim, { i: 1, t: 12, parciales: [{ i: 0, segundos: 50, metros: 200, ppm: 160, hecho: null }] });
    expect(s.sesionT).toBe(62);
  });
});

describe('el PM5 da su /500 y sus metros', () => {
  const ski = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, objetivos: [split(125)], posicion: { serie: { n: 3, de: 8 } } });
  const p = plan([ski, paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 45, mide: 'reloj' } })]);

  it('los metros del ergómetro cuentan para el paso, no para los km corridos', () => {
    const { s } = correr(p, () => ({ ritmo: null, split500: 125, ppm: 150 }), 30);
    expect(s.metros).toBeCloseTo(120, 5);
    expect(s.sesionErgoM).toBeCloseTo(120, 5);
    expect(s.sesionM).toBe(0);
  });

  it('arrancar a mitad de una serie de ergo: sus metros ya hechos son de la máquina, no km corridos', () => {
    const s = estadoInicial(p, () => ({ ritmo: null, split500: 125, ppm: 150 }), { i: 0, t: 30, metros: 126 });
    expect(s.sesionErgoM).toBe(126);
    expect(s.sesionM).toBe(0);
    const dado = estadoInicial(p, () => ({ ritmo: null, split500: 125, ppm: 150 }), { i: 0, t: 30, metros: 126, sesionErgoM: 626 });
    expect(dado.sesionErgoM).toBe(626);
    expect(dado.sesionM).toBe(0);
  });

  it('el motor avisa contra el /500 («afloja» a los 4 s y cada 20 s, la cadencia del coach) y canta la serie en /500', () => {
    const { s, eventos } = correr(p, () => ({ ritmo: null, split500: 119, ppm: 150 }), 70);
    // 250 m a 1:59/500 son 60 s: avisos a los 4, 24 y 44 s.
    expect(eventos.filter((e) => e.evento === 'afloja')).toHaveLength(3);
    const fin = eventos.find((e) => e.evento === 'fin-serie');
    expect(fin?.voz).toBe('Serie 3: 1:59 el quinientos, rápida.');
    expect(s.vueltas.at(-1)).toMatchObject({ veredicto: 'por-encima', eje: 'split500' });
  });

  it('a 2:04 con un objetivo de 2:05 no avisa ni canta «rápida»: la holgura del coach', () => {
    const { eventos } = correr(p, () => ({ ritmo: null, split500: 124, ppm: 150 }), 70);
    expect(eventos.some((e) => e.evento === 'afloja')).toBe(false);
    expect(eventos.find((e) => e.evento === 'fin-serie')?.voz).toBe('Serie 3: 2:04 el quinientos, dentro.');
  });
});

describe('la Roxzone de salida se cierra al detectar que vuelves a correr', () => {
  const salida = paso({ clase: 'roxzone', rol: 'transicion', roxzone: 'salida', medida: { tipo: 'abierta', prescrito: null, mide: 'sensor' } });
  const run = paso({ clase: 'carrera', rol: 'trabajo', nombre: 'Run', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' } });
  const p = plan([salida, run]);

  it('andando no se cierra; a los 3 s seguidos corriendo, sí, con GO y su parcial', () => {
    const sim: Simulador = (_q, _i, t) => ({ ritmo: t <= 6 ? 690 : 280, ppm: 165, gps: 'listo' });
    const { s: andando } = correr(p, sim, 6);
    expect(andando.i).toBe(0);
    const { s, eventos } = correr(p, sim, 9);
    expect(s.i).toBe(1);
    expect(s.parciales[0]).toMatchObject({ i: 0, segundos: 9 });
    expect(eventos.some((e) => e.evento === 'go')).toBe(true);
  });
});

describe('el preaviso que ya sonó no se repite', () => {
  const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, posicion: { serie: { n: 4, de: 6 } } });
  const p = plan([serie, paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' } })]);
  const sim: Simulador = () => ({ ritmo: 240, ppm: 170, gps: 'listo' });

  it('arrancar a 8 s del final: no dice «Quedan diez segundos»', () => {
    const { eventos } = correr(p, sim, 5, estadoInicial(p, sim, { i: 0, t: 52 }));
    expect(eventos.some((e) => e.evento === 'preaviso')).toBe(false);
  });

  it('`preavisado: false` lo pide igualmente', () => {
    const { eventos } = correr(p, sim, 2, estadoInicial(p, sim, { i: 0, t: 52, preavisado: false }));
    expect(eventos.some((e) => e.evento === 'preaviso')).toBe(true);
  });
});

describe('el motor cuenta el tiempo en cada zona y el pulso máximo', () => {
  it('Z2 y Z4, segundo a segundo', () => {
    const p = plan([paso({ clase: 'rodaje', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 600, mide: 'reloj' } })]);
    const { s } = correr(p, (_q, _i, t) => ({ ritmo: 300, ppm: t <= 10 ? 145 : 170, gps: 'listo' }), 20);
    // El primer segundo (estadoInicial, t = 0) también es una muestra.
    expect(s.zonasS).toEqual([0, 11, 0, 10, 0]);
    expect(s.ppmMax).toBe(170);
  });
});

describe('el traductor reescribe la voz sin tocar el háptico', () => {
  const t = {
    plan: plan([]),
    antes: {} as EstadoSecuencia,
    despues: {} as EstadoSecuencia,
    quien: 'motor' as const,
    eventos: [{ evento: 'go' as const, voz: 'Serie 1 de 4.' }, { evento: 'accion' as const }],
  };

  it('`conVoz`: cambia la frase del GO, deja el resto', () => {
    const r = traducirCon(conVoz((e) => (e === 'go' ? 'A1, Back Squat.' : undefined)), t);
    expect(r).toEqual([{ evento: 'go', voz: 'A1, Back Squat.' }, { evento: 'accion' }]);
  });

  it('`null` calla la frase pero el evento (y su háptico) sigue', () => {
    const r = traducirCon(conVoz(() => null), t);
    expect(r[0]).toEqual({ evento: 'go', voz: undefined });
  });

  it('sin traductor sale lo del motor', () => {
    expect(traducirCon(undefined, t)).toBe(t.eventos);
  });
});

describe('la voz sabe de cada familia', () => {
  const ficha: FichaFuerza = { ejercicio: 'bs', carga: { tipo: 'rm', pctMin: 65, pctMax: 70, rmKg: 186.5 }, esfuerzo: { eje: 'rir', min: 3, max: 3 }, pasoKg: 2.5 };
  const bs = paso({ clase: 'fuerza', rol: 'trabajo', nombre: 'Back Squat', medida: { tipo: 'reps', prescrito: 8, mide: 'atleta' }, posicion: { serie: { n: 2, de: 4 }, slot: 'A1' }, fuerza: ficha });

  it('fuerza: el ejercicio y la carga del plan, o la que está en la barra', () => {
    expect(vozInicio(bs)).toBe('A1, Back Squat. Serie 2 de 4: 8 repeticiones con 121 a 131 kilos, RIR 3.');
    expect(vozInicio(bs, { kg: 125 })).toBe('A1, Back Squat. Serie 2 de 4: 8 repeticiones con 125 kilos, RIR 3.');
  });

  it('«Colócate» dice lo que viene, no «Serie, 5 segundos»', () => {
    const colocate = paso({ clase: 'fuerza', rol: 'transicion', medida: { tipo: 'tiempo', prescrito: 5, mide: 'reloj' } });
    expect(vozTransicion(colocate, { ...bs, nombre: 'Isometría en puente de glúteo' })).toBe('Colócate: isometría en puente de glúteo.');
  });

  it('la Roxzone de entrada entra con GO y dice a qué estación', () => {
    const rox = paso({ clase: 'roxzone', rol: 'transicion', roxzone: 'entrada', medida: { tipo: 'abierta', prescrito: null, mide: 'reloj' }, cierre: 'atleta' });
    const wb = paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Wall Balls', medida: { tipo: 'reps', prescrito: 100, mide: 'atleta' }, cierre: 'atleta' });
    const run = paso({ clase: 'carrera', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' } });
    const c = cerrar(estadoInicial(plan([run, rox, wb]), () => ({ ritmo: 280, ppm: 170 }), { i: 0, t: 200, metros: 1000 }), plan([run, rox, wb]), 'medida');
    expect(c.eventos).toContainEqual({ evento: 'go', voz: 'Roxzone. Entras a Wall Balls.' });
  });

  it('EMOM: la tarea con su carga, no la ventana', () => {
    const bench = { nombre: 'Bench Press', dosis: { tipo: 'reps' as const, prescrito: 6, mide: 'atleta' as const }, carga: { kg: 60 }, mide: 'atleta' as const };
    const emom = paso({ clase: 'emom', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, posicion: { serie: { n: 3, de: 12 } }, wod: { formato: 'emom', tarea: bench, ciclo: [bench], ventanas: 12, ventanaS: 60 } });
    expect(vozInicio(emom)).toBe('3 de 12. 6 Bench Press, 60 kilos.');
  });

  it('ergo: la máquina y su posición, el objetivo en /500', () => {
    const ski = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'SkiErg', medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, objetivos: [split(125)], posicion: { serie: { n: 4, de: 8 } } });
    expect(vozInicio(ski)).toBe('SkiErg, 4 de 8. Doscientos cincuenta metros a 2:05 el quinientos.');
  });

  it('a pulso por tiempo, la serie se canta sin su tiempo (es lo prescrito)', () => {
    const tramo = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'Row', medida: { tipo: 'tiempo', prescrito: 60, mide: 'ergo' }, objetivos: [{ eje: 'zona', min: 3, max: 3, papel: 'principal' }], posicion: { tramo: { n: 2, de: 3 } } });
    expect(vozFinSerie(tramo, { n: 2, clase: 'tramo', segundos: 60, metros: 260, ritmo: 230, ppm: 156, veredicto: 'dentro', eje: 'zona' })).toBe('Tramo 2: dentro.');
  });
});

describe('una sola notación del objetivo (brief, esfera, Estructura)', () => {
  it('«a 3:45–3:55», «a Z2», «RPE 7», «máx 142 ppm», «al 1 %»; nunca «@»', () => {
    expect(textoObjetivo({ eje: 'ritmo', min: 225, max: 235, papel: 'principal' })).toBe('a 3:45–3:55');
    expect(textoObjetivo({ eje: 'zona', min: 2, max: 2, papel: 'principal' })).toBe('a Z2');
    expect(textoObjetivo({ eje: 'rpe', min: 7, max: 7, papel: 'principal' })).toBe('RPE 7');
    expect(textoObjetivo({ eje: 'ppm', min: null, max: 142, papel: 'techo' })).toBe('máx 142 ppm');
    expect(textoObjetivo({ eje: 'inclinacion', min: 1, max: 1, papel: 'secundario' })).toBe('al 1 %');
  });

  it('el brief y lo de hoy la usan', () => {
    const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }], posicion: { serie: { n: 1, de: 6 } } });
    const rec = paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 90, mide: 'reloj' }, modoRecupera: 'trote' });
    const pasos = [serie, rec, { ...serie, id: 's2', posicion: { serie: { n: 2, de: 6 } } }];
    const brief = lineaBrief(filasDePasos(pasos)[0]!);
    expect(brief.linea).toBe('2 × 1000 m a 3:45–3:55');
    expect(brief.linea).not.toContain('@');
    expect(hoyDe(pasos).sub).toBe('a 3:45–3:55 · r 90″');
  });
});

describe('las piezas que subieron', () => {
  it('«Viene:» lleva la carga del implemento (M7)', () => {
    const pull = paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Sled Pull', medida: { tipo: 'distancia', prescrito: 25, mide: 'atleta' }, carga: { kg: 135 } });
    expect(textoPasoCorto(pull)).toBe('Sled Pull · 25 m · 135 kg');
  });

  it('un trineo no se dibuja a ritmo de carrera', () => {
    const sled = paso({ clase: 'estacion', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' } });
    expect(duracionEstimada(sled)).toBe(60);
    const run = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }] });
    expect(duracionEstimada(run)).toBe(230);
  });

  it('la puntuación del AMRAP: de «—» a 1, y 29 + 1 en una ronda de 30 es una ronda más', () => {
    expect(girarDial({ rondas: 7, reps: null }, 1, 30)).toEqual({ rondas: 7, reps: 1 });
    expect(girarDial({ rondas: 7, reps: 29 }, 1, 30)).toEqual({ rondas: 8, reps: 0 });
    expect(girarDial({ rondas: 8, reps: 0 }, -1, 30)).toEqual({ rondas: 7, reps: 29 });
  });

  it('el aviso de deshacer habla la lengua de cada familia y cabe en el pie', () => {
    const ficha: FichaFuerza = { ejercicio: 'x', carga: { tipo: 'corporal' }, esfuerzo: null, pasoKg: 2.5 };
    const a2 = { ...paso({ clase: 'fuerza', rol: 'trabajo', nombre: 'Box Jump', medida: { tipo: 'reps', prescrito: 6, mide: 'atleta' }, posicion: { serie: { n: 1, de: 4 }, slot: 'A2' }, fuerza: ficha }), siguiente: null };
    expect(avisoDeCierre(a2)).toBe('A2 · serie 1 hecha');
    const bbj = { ...paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Burpee Broad Jump', medida: { tipo: 'distancia', prescrito: 80, mide: 'atleta' } }), siguiente: null };
    expect(avisoDeCierre(bbj)).toBe('Estación hecha');
    const ergo = { ...paso({ clase: 'ergo', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, posicion: { serie: { n: 3, de: 8 } } }), siguiente: null };
    expect(avisoDeCierre(ergo)).toBe('Serie 3 cerrada');
  });
});
