// LO QUE EL IPHONE PIDIÓ AL KIT COMPARTIDO (28-09, docs/vivo-iphone/modelo.md).
//
// «Un estado, dos pintores»: el iPhone no duplica ni una regla. Lo que le
// faltaba al kit para pintar el móvil subió AQUÍ, y la muñeca lo hereda:
//   · la máquina manda su métrica (§4): la bici se lee por 1000 m, las
//     calorías del ergo se ven siempre, la cadencia medida se ve;
//   · la familia del paso y su rejilla de apoyo (`familiaDe`, `metricasDelPaso`);
//   · el héroe con las reglas de familia encima de P3 (`heroeDeFamilia`);
//   · «Luego» con el «después» (`luegoDe`) y «Recupera 90″ trote» en `textoViene`;
//   · anotar la serie (`anotar.ts`) ya no es de una pantalla: es del kit;
//   · el héroe se ajusta a OTRO lienzo con su escala (`tallaHeroe`, 5.º parámetro).

import { describe, expect, it } from 'vitest';
import {
  REGLAS_AVISO_DEFECTO,
  type Lecturas,
  type Objetivo,
  type PasoBase,
  type ZonasCoach,
} from '@/components/design-twin/kit-reloj/paso';
import { fmtObjetivo, fmtSplit, luegoDe, nombreMaquina, textoObjetivo, textoViene, unidadSplit } from '@/components/design-twin/kit-reloj/reglas';
import { heroeDelPaso, laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { admiteHorizontal, esTest, familiaDe, formatoDe, heroeDeFamilia, metricasDelPaso, trabajoDe } from '@/components/design-twin/kit-reloj/metricas';
import { anotacionDe, confirmar, girar, seriesDelDescanso, type Registro } from '@/components/design-twin/kit-reloj/anotar';
import { vozInicio } from '@/components/design-twin/kit-reloj/voz';
import { T, tallaHeroe } from '@/components/design-twin/kit-reloj/tokens';
import type { PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
const R = REGLAS_AVISO_DEFECTO;

let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: null, ritmo: null, ppm: 160, gps: 'no-aplica', ...x });
const split = (s: number): Objetivo => ({ eje: 'split500', min: s, max: s, papel: 'principal' });

describe('la bici se lee por 1000 m; el remo y el ski, por 500', () => {
  const bici: PasoBase['maquina'] = { tipo: 'bici' };
  const remo: PasoBase['maquina'] = { tipo: 'remo' };

  it('el dato viaja en s/500 y se enseña ×2 en la bici', () => {
    expect(fmtSplit(60, bici)).toBe('2:00');
    expect(fmtSplit(60, remo)).toBe('1:00');
    expect(fmtSplit(null, bici)).toBe('—');
    expect(unidadSplit(bici)).toBe('/1000');
    expect(unidadSplit(remo)).toBe('/500');
  });

  it('el objetivo y su notación siguen a la máquina', () => {
    expect(fmtObjetivo(split(60), bici)).toBe('2:00 /1000');
    expect(fmtObjetivo(split(125), remo)).toBe('2:05 /500');
    expect(textoObjetivo(split(60), bici)).toBe('a 2:00 /1000');
  });

  it('el héroe, la banda y la voz de un paso en bici dicen /1000', () => {
    const p = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'BikeErg', maquina: bici, medida: { tipo: 'distancia', prescrito: 2000, mide: 'ergo' }, objetivos: [split(60)] });
    const l = lect({ split500: 61, hecho: 800 });
    expect(heroeDelPaso(p, l, ZONAS)).toMatchObject({ clase: 'split', texto: '2:02', unidad: '/1000' });
    expect(laminaDelPaso(p, l, ZONAS, R).banda?.rotulo).toBe('2:00 /1000');
    expect(vozInicio(p)).toContain('el mil');
  });

  it('la máquina se llama como en el box', () => {
    expect(nombreMaquina(bici)).toBe('la bici');
    expect(nombreMaquina(remo)).toBe('el remo');
    expect(nombreMaquina(undefined)).toBeNull();
  });
});

describe('la familia del paso', () => {
  it('cada paso cae en su familia, y la máquina que mide manda sobre la clase', () => {
    expect(familiaDe(paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' } }))).toBe('correr');
    expect(familiaDe(paso({ clase: 'series', rol: 'trabajo', entorno: 'cinta', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' } }))).toBe('cinta');
    expect(familiaDe(paso({ clase: 'estacion', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'distancia', prescrito: 1000, mide: 'ergo' } }))).toBe('ski');
    expect(familiaDe(paso({ clase: 'estacion', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'distancia', prescrito: 1000, mide: 'atleta' }, cierre: 'atleta' }))).toBe('estacion');
    expect(familiaDe(paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Sled Push', medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' }, cierre: 'atleta' }))).toBe('estacion');
    expect(familiaDe(paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 90, mide: 'reloj' } }))).toBe('recupera');
    expect(familiaDe(paso({ clase: 'descanso', rol: 'descanso', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' } }))).toBe('descanso');
    expect(familiaDe(paso({ clase: 'roxzone', rol: 'transicion', roxzone: 'entrada', medida: { tipo: 'abierta', prescrito: null, mide: 'reloj' }, cierre: 'atleta' }))).toBe('roxzone');
  });

  it('el formato del WOD manda: un Run dentro de un EMOM usa la cara de correr', () => {
    const run = { nombre: 'Run', dosis: null, mide: 'cinta' as const, corre: true };
    const row = { nombre: 'Row', dosis: null, mide: 'ergo' as const };
    const enCinta = paso({ clase: 'emom', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 75, mide: 'reloj' }, entorno: 'cinta', wod: { formato: 'emom', tarea: run, ciclo: [run, row], ventanas: 10, ventanaS: 75 } });
    const enRemo = paso({ clase: 'emom', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 75, mide: 'reloj' }, maquina: { tipo: 'remo' }, wod: { formato: 'emom', tarea: row, ciclo: [run, row], ventanas: 10, ventanaS: 75 } });
    expect(familiaDe(enCinta)).toBe('cinta');
    expect(familiaDe(enRemo)).toBe('emom');
  });

  it('un test es su familia (el remo de 2 km es remo) y lleva la marca de test', () => {
    const t = paso({ clase: 'test', rol: 'trabajo', nombre: 'Row', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 2000, mide: 'ergo' } });
    expect(familiaDe(t)).toBe('remo');
    expect(esTest(t)).toBe(true);
    // El héroe de un test sin objetivo es lo que falta, nunca el nombre de la máquina.
    expect(heroeDeFamilia(t, lect({ split500: 112, hecho: 1300 }), ZONAS)).toMatchObject({ clase: 'falta', texto: '700', unidad: 'm' });
    expect(metricasDelPaso(t, lect({ split500: 112, hecho: 1300, cadencia: 30, vatios: 260, cal: 40 }), 'falta', ZONAS)[0]).toMatchObject({ clave: 'split', valor: '1:52' });
  });

  it('el formato se nombra en castellano de box desde UN formateador (dato con defecto)', () => {
    const row = { nombre: 'Row', dosis: null, mide: 'ergo' as const };
    expect(formatoDe(paso({ clase: 'emom', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, wod: { formato: 'emom', tarea: row, ciclo: [row], ventanas: 12, ventanaS: 60 } }))).toBe('EMOM 12′');
    expect(formatoDe(paso({ clase: 'amrap', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 900, mide: 'reloj' }, wod: { formato: 'amrap', tareas: [], duracionS: 900 } }))).toBe('AMRAP 15′');
    expect(formatoDe(paso({ clase: 'fortime', rol: 'trabajo', medida: { tipo: 'reps', prescrito: 20, mide: 'atleta' }, wod: { formato: 'fortime', tarea: null, capS: 1200 } }))).toBe('For Time · cap 20′');
    expect(formatoDe(paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 20, mide: 'reloj' }, wod: { formato: 'pared', trabajoS: 20, descansoS: 10, rondas: 8 } }))).toBe('Tabata 8 × 20″/10″');
    expect(formatoDe(paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' } }))).toBe('Series');
    expect(formatoDe(paso({ clase: 'rodaje', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 3000, mide: 'reloj' } }))).toBe('Rodaje');
    expect(formatoDe(paso({ clase: 'estacion', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' }, posicion: { ronda: { n: 2, de: 5 } } }))).toBe('Circuito');
  });

  it('solo ergo y cinta admiten horizontal (§3)', () => {
    expect(admiteHorizontal('remo')).toBe(true);
    expect(admiteHorizontal('cinta')).toBe(true);
    expect(admiteHorizontal('correr')).toBe(false);
    expect(admiteHorizontal('fuerza')).toBe(false);
  });
});

describe('la rejilla de apoyo (§4): la máquina manda su métrica, el pulso siempre', () => {
  it('correr a ritmo: pulso con zona, distancia y cadencia; nunca repite el héroe', () => {
    const p = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }] });
    const m = metricasDelPaso(p, lect({ ritmo: 230, ppm: 171, cadencia: 178, hecho: 380 }), 'ritmo', ZONAS, { metrosPaso: 380 });
    expect(m.map((x) => x.clave)).toEqual(['pulso', 'distancia', 'cadencia']);
    expect(m[0]).toMatchObject({ valor: '171', unidad: 'ppm', zona: { n: 4 } });
    expect(m[1]).toMatchObject({ valor: '380', unidad: 'm' });
    expect(m[2]).toMatchObject({ valor: '178', unidad: 'pasos' });
  });

  it('correr a zona: el pulso es el héroe, así que la rejilla trae el ritmo', () => {
    const p = paso({ clase: 'rodaje', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 3000, mide: 'reloj' }, objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal' }] });
    const m = metricasDelPaso(p, lect({ ritmo: 330, ppm: 145 }), 'pulso', ZONAS, { metrosPaso: 2200 });
    expect(m.map((x) => x.clave)).toEqual(['ritmo', 'distancia']);
    expect(m[0]).toMatchObject({ valor: '5:30', unidad: '/km' });
  });

  it('el remo: s/min, vatios y calorías SIEMPRE, y el pulso', () => {
    const p = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'Row', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 500, mide: 'ergo' }, objetivos: [split(112)] });
    const m = metricasDelPaso(p, lect({ split500: 113, cadencia: 28, vatios: 240, cal: 18, ppm: 166 }), 'split', ZONAS);
    expect(m.map((x) => x.clave)).toEqual(['cadencia', 'vatios', 'cal', 'pulso']);
    expect(m[0]).toMatchObject({ valor: '28', unidad: 's/min' });
    expect(m[2]).toMatchObject({ valor: '18', unidad: 'cal' });
  });

  it('la bici: rpm y el ritmo por 1000 si el héroe es el pulso; lo que nadie mide no se pinta', () => {
    const p = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'BikeErg', maquina: { tipo: 'bici' }, medida: { tipo: 'tiempo', prescrito: 240, mide: 'ergo' }, objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal' }] });
    const m = metricasDelPaso(p, lect({ split500: 62, cadencia: 88, vatios: null, cal: null }), 'pulso', ZONAS);
    expect(m.map((x) => x.clave)).toEqual(['split', 'cadencia']);
    expect(m[0]).toMatchObject({ valor: '2:04', unidad: '/1000' });
    expect(m[1]).toMatchObject({ valor: '88', unidad: 'rpm' });
  });

  it('un dato viejo del monitor se pinta «—», no el último valor', () => {
    const p = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, objetivos: [split(125)] });
    const m = metricasDelPaso(p, lect({ split500: 120, cadencia: 40, vatios: 210, cal: 12, viejos: ['split500', 'cadencia', 'vatios', 'cal', 'hecho'] }), 'crono', ZONAS);
    expect(m.find((x) => x.clave === 'split')?.valor).toBe('—');
    expect(m.find((x) => x.clave === 'cal')?.valor).toBe('—');
    expect(m.find((x) => x.clave === 'vatios')?.valor).toBe('—');
  });

  it('la cinta: inclinación del segundo objetivo y la distancia de la cinta', () => {
    const p = paso({ clase: 'series', rol: 'trabajo', entorno: 'cinta', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' }, objetivos: [{ eje: 'zona', min: 4, max: 4, papel: 'principal' }, { eje: 'inclinacion', min: 1, max: 1, papel: 'secundario' }] });
    const m = metricasDelPaso(p, lect({ ritmo: 250, ppm: 168 }), 'pulso', ZONAS, { metrosPaso: 192 });
    expect(m.map((x) => x.clave)).toEqual(['ritmo', 'inclinacion', 'distancia']);
    expect(m[1]).toMatchObject({ valor: '1', unidad: '%' });
  });

  it('nunca más de cuatro celdas', () => {
    const p = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'Row', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 500, mide: 'ergo' }, objetivos: [{ eje: 'zona', min: 3, max: 3, papel: 'principal' }] });
    const m = metricasDelPaso(p, lect({ split500: 113, cadencia: 28, vatios: 240, cal: 18, ppm: 155 }), 'pulso', ZONAS);
    expect(m).toHaveLength(4);
  });
});

describe('el héroe con las reglas de familia (I4)', () => {
  it('For Time: el crono total es el héroe; AMRAP: las rondas; reloj de pared: la fase', () => {
    const row = { nombre: 'Row', dosis: { tipo: 'distancia' as const, prescrito: 500, mide: 'ergo' as const }, mide: 'ergo' as const };
    const ft = paso({ clase: 'fortime', rol: 'trabajo', nombre: 'Row', maquina: { tipo: 'remo' }, medida: row.dosis, wod: { formato: 'fortime', tarea: row, capS: 1200 } });
    expect(heroeDeFamilia(ft, lect({ split500: 120, hecho: 200 }), ZONAS, { total: 850 })).toMatchObject({ clase: 'crono', texto: '14:10', etiqueta: 'total' });

    const tareas = [
      { nombre: 'Wall Ball', dosis: { tipo: 'reps' as const, prescrito: 12, mide: 'atleta' as const }, mide: 'atleta' as const },
      { nombre: 'Burpee', dosis: { tipo: 'reps' as const, prescrito: 8, mide: 'atleta' as const }, mide: 'atleta' as const },
    ];
    const am = paso({ clase: 'amrap', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 900, mide: 'reloj' }, wod: { formato: 'amrap', tareas, duracionS: 900 } });
    expect(heroeDeFamilia(am, lect({ t: 522 }), ZONAS, { rondas: 4 })).toMatchObject({ clase: 'crono', texto: '4', unidad: 'rondas' });

    const info = { formato: 'pared' as const, trabajoS: 20, descansoS: 10, rondas: 8 };
    const tb = paso({ clase: 'series', rol: 'trabajo', nombre: 'Burpee', medida: { tipo: 'tiempo', prescrito: 20, mide: 'reloj' }, posicion: { ronda: { n: 4, de: 8 } }, wod: info });
    expect(heroeDeFamilia(tb, lect({ t: 12 }), ZONAS)).toMatchObject({ clase: 'falta', texto: '0:08', etiqueta: 'trabajo' });
  });

  it('lo que nadie mide dice «lo dices tú»; correr sigue en P3', () => {
    const sled = paso({ clase: 'estacion', rol: 'trabajo', nombre: 'Sled Push', medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' }, cierre: 'atleta' });
    expect(heroeDeFamilia(sled, lect({ t: 38 }), ZONAS)).toMatchObject({ clase: 'crono', texto: '0:38', etiqueta: 'lo dices tú' });
    const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }] });
    expect(heroeDeFamilia(serie, lect({ ritmo: 230, hecho: 380 }), ZONAS)).toEqual(heroeDelPaso(serie, lect({ ritmo: 230, hecho: 380 }), ZONAS));
  });

  it('la fila del trabajo: lo que falta con su dosis, o nada si el héroe ya lo dice', () => {
    const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }] });
    expect(trabajoDe(serie, lect({ ritmo: 230, hecho: 380 }), 'ritmo')).toEqual({ etiqueta: 'quedan', valor: '620', unidad: 'm' });
    expect(trabajoDe(serie, lect({ ritmo: null, hecho: 380 }), 'falta')).toBeNull();
    const squat: PasoBase = { ...paso({ clase: 'fuerza', rol: 'trabajo', nombre: 'Back Squat', medida: { tipo: 'reps', prescrito: 5, mide: 'atleta' }, cierre: 'atleta' }), fuerza: { ejercicio: 'bs', carga: { tipo: 'kg', min: 100, max: 100 }, esfuerzo: { eje: 'rir', min: 2, max: 2 }, pasoKg: 2.5 } };
    expect(trabajoDe(squat, lect({}), 'crono')).toEqual({ etiqueta: 'dosis', valor: '5 × 100 kg · RIR 2' });
  });
});

describe('«Luego ·» con el «después»', () => {
  const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }], posicion: { serie: { n: 3, de: 6 } } });
  const rec = paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 90, mide: 'reloj' }, modoRecupera: 'trote' });
  const serie4 = { ...serie, id: 's4', posicion: { serie: { n: 4, de: 6 } } };

  it('una recuperación se dice con su modo, y detrás el trabajo que viene', () => {
    expect(textoViene(rec)).toBe('Recupera 90″ trote');
    expect(luegoDe([serie, rec, serie4], 0)).toEqual({ que: 'Recupera 90″ trote', despues: '1000\u00A0m a 3:45–3:55' });
  });

  it('desde la recuperación, solo el trabajo; en el último paso, nada', () => {
    expect(luegoDe([serie, rec, serie4], 1)).toEqual({ que: '1000\u00A0m a 3:45–3:55', despues: null });
    expect(luegoDe([serie, rec, serie4], 2)).toBeNull();
  });
});

describe('anotar la serie, ya en el kit', () => {
  const ficha = { ejercicio: 'bs', carga: { tipo: 'rm' as const, pctMin: 65, pctMax: 70, rmKg: 186.5 }, esfuerzo: null, pasoKg: 2.5 };
  const s1: PasoBase = { ...paso({ clase: 'fuerza', rol: 'trabajo', nombre: 'Back Squat', medida: { tipo: 'reps', prescrito: 8, mide: 'atleta' }, cierre: 'atleta', posicion: { serie: { n: 1, de: 4 } } }), fuerza: ficha };
  const d1 = paso({ clase: 'descanso', rol: 'descanso', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' } });
  const s2: PasoBase = { ...s1, id: 's2', posicion: { serie: { n: 2, de: 4 } } };
  const plan: PlanSesion = { pasos: [s1, d1, s2], zonas: ZONAS, reglas: R };

  it('lo propuesto sale del plan y no cuenta hasta confirmarlo', () => {
    expect(seriesDelDescanso(plan, 1)).toEqual([0]);
    const a = anotacionDe(plan, 0, {}, null)!;
    expect(a.reps).toEqual({ valor: 8, estado: 'propuesto' });
    expect(a.kg).toEqual({ valor: 125, estado: 'propuesto' });
    const r: Registro = confirmar({}, s1.id, a);
    expect(r[s1.id]).toEqual({ reps: 8, kg: 125 });
    expect(anotacionDe(plan, 0, r, null)!.kg).toEqual({ valor: 125, estado: 'declarado' });
  });

  it('la carga declarada cae en cascada a la serie siguiente', () => {
    const r: Registro = { [s1.id]: { reps: 8, kg: 127.5 } };
    expect(anotacionDe(plan, 2, r, null)!.kg).toEqual({ valor: 127.5, estado: 'propuesto' });
    expect(girar(s2 as never, 'kg', 127.5, 1)).toBe(130);
  });
});

describe('el héroe en otro lienzo (el iPhone pasa su escala)', () => {
  const IPHONE = { min: 72, max: 176, peso: 600 as const, caja: 0.84 };

  it('en el ancho del iPhone un ritmo cabe por encima del máximo de la muñeca', () => {
    const t = tallaHeroe('3:52', '/km', 358, 200, IPHONE);
    expect(t.cuerpo).toBeGreaterThan(T.heroe.max);
    expect(t.cuerpo).toBeLessThanOrEqual(IPHONE.max);
    expect(t.ancho).toBeLessThanOrEqual(358);
  });

  it('«10:59:59» no se sale a 358 pt y no baja del suelo del iPhone salvo que no quepa', () => {
    const t = tallaHeroe('10:59:59', undefined, 358, 200, IPHONE);
    expect(t.ancho).toBeLessThanOrEqual(358);
    expect(t.cuerpo).toBeGreaterThanOrEqual(IPHONE.min - 1);
  });

  it('sin escala, la muñeca sigue igual', () => {
    expect(tallaHeroe('3:52', '/km').cuerpo).toBeLessThanOrEqual(T.heroe.max);
  });
});
