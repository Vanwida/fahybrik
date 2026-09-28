// LO QUE LA FAMILIA WOD DEL IPHONE PIDIÓ AL KIT COMPARTIDO (28-09,
// docs/vivo-iphone/modelo.md §4, §5; `screens/iphone-vivo-wod`).
//
// «Un estado, dos pintores»: nada de esto vive en la pantalla. Lo que le
// faltaba al kit subió a `kit-reloj` y la muñeca lo hereda:
//   · Death by como formato (`deathby.ts`): la escalera, el héroe «reps de
//     este minuto», la cabecera, la voz, «Luego», la fila de la Estructura y
//     el mecanismo «el reloj te caza»;
//   · la puntuación del AMRAP tocada (`girarPuntuacion`) y las reps de una
//     ronda con un remo dentro (`repsDeTarea`: el Row cuenta 1, no 250);
//   · la rejilla sin repetir la cabecera (EMOM sin «minuto», tabata sin
//     «ronda»), el remo en el EMOM y en el AMRAP, el cap como lo que queda;
//   · la ventana ±1 del chipper (`alrededorDe`) y la estación en una línea.

import { describe, expect, it } from 'vitest';
import { REGLAS_AVISO_DEFECTO, type Lecturas, type Parcial, type PasoBase, type Tarea, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import {
  DEATHBY_VENTANAS_DEFECTO,
  cazadoEn,
  deathByDe,
  filaDeathBy,
  heroeDeathBy,
  minutosDeathBy,
  repsDelMinuto,
  resultadoDeathBy,
  vieneDeathBy,
} from '@/components/design-twin/kit-reloj/deathby';
import { familiaDe, formatoDe } from '@/components/design-twin/kit-reloj/familia';
import { heroeDeFamilia, metricasDelPaso, trabajoDe } from '@/components/design-twin/kit-reloj/metricas';
import { luegoDe, posicionDe } from '@/components/design-twin/kit-reloj/posicion';
import { desgloseReps, girarPuntuacion, repsDeTarea, repsPorRonda } from '@/components/design-twin/kit-reloj/tarea';
import { alrededorDe, textoEstacion } from '@/components/design-twin/kit-reloj/alrededor';
import { textoFila } from '@/components/design-twin/kit-reloj/listas';
import { vozInicio } from '@/components/design-twin/kit-reloj/voz';
import { estructuraDe } from '@/components/design-twin/kit-reloj/estructura';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
const R = REGLAS_AVISO_DEFECTO;
let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 19, hecho: null, ritmo: null, ppm: 168, gps: 'no-aplica', ...x });
const reps = (k: number): Tarea['dosis'] => ({ tipo: 'reps', prescrito: k, mide: 'atleta' });
const claves = (m: ReturnType<typeof metricasDelPaso>) => m.map((x) => x.clave);

// ---------------------------------------------------------------------------
// Death by
// ---------------------------------------------------------------------------

describe('death by: la escalera es dato del paso y el kit la resuelve', () => {
  const burpee: Tarea = { nombre: 'Burpee', dosis: reps(1), corporal: true, mide: 'atleta' };
  const pasos = minutosDeathBy(burpee, { inicio: 1, incremento: 1, ventanaS: 60, tope: null }, (k) => `db${k}`);

  it('sin tope genera las ventanas por defecto; cada minuto lleva sus reps ya resueltas y se cierra por el reloj', () => {
    expect(pasos).toHaveLength(DEATHBY_VENTANAS_DEFECTO);
    expect(repsDelMinuto({ inicio: 1, incremento: 1 }, 7)).toBe(7);
    expect(repsDelMinuto({ inicio: 10, incremento: 2 }, 3)).toBe(14);
    const m7 = pasos[6]!;
    expect(deathByDe(m7)?.tarea.dosis?.prescrito).toBe(7);
    expect(m7.medida).toEqual({ tipo: 'tiempo', prescrito: 60, mide: 'reloj' });
    expect(m7.cierre).toBe('medida');
    expect(m7.posicion?.serie).toEqual({ n: 7, de: DEATHBY_VENTANAS_DEFECTO });
    // Con tope, tantas ventanas como el tope.
    expect(minutosDeathBy(burpee, { inicio: 1, incremento: 1, ventanaS: 60, tope: 12 }, (k) => `t${k}`)).toHaveLength(12);
  });

  it('es su propia familia y su formato se dice en castellano de box', () => {
    const m7 = pasos[6]!;
    expect(familiaDe(m7)).toBe('deathby');
    expect(formatoDe(m7)).toBe('Death by · +1 cada 1′');
    const conTope = minutosDeathBy({ ...burpee, dosis: { tipo: 'cal', prescrito: 10, mide: 'ergo' }, nombre: 'Row', mide: 'ergo' }, { inicio: 10, incremento: 2, ventanaS: 60, tope: 15 }, (k) => `c${k}`)[2]!;
    expect(formatoDe(conTope)).toBe('Death by · 10 y +2 cada 1′ · hasta 15');
    expect(posicionDe(m7)).toEqual(['Minuto 7']);
    expect(posicionDe(conTope)).toEqual(['Minuto 3/15']);
  });

  it('el héroe son las reps de este minuto; el trabajo, lo que queda de él; la rejilla, la vez anterior y el pulso', () => {
    const m7 = pasos[6]!;
    const l = lect({ t: 19 });
    const h = heroeDeFamilia(m7, l, ZONAS);
    expect(h).toMatchObject({ texto: '7', unidad: 'Burpee', etiqueta: 'este minuto' });
    expect(heroeDeathBy(m7, 22)?.etiqueta).toBe('hecho en 0:22 · respiro');
    expect(trabajoDe(m7, l, h.clase)).toEqual({ etiqueta: 'quedan', valor: '0:41' });
    expect(claves(metricasDelPaso(m7, l, h.clase, ZONAS, { ultimaVentana: 31 }, R))).toEqual(['ultima', 'pulso']);
    expect(metricasDelPaso(m7, l, h.clase, ZONAS, { ultimaVentana: 31 }, R)[0]).toMatchObject({ etiqueta: 'la vez anterior', valor: '0:31' });
    // La primera ventana no tiene «vez anterior»: solo el pulso, nunca un dato inventado.
    expect(claves(metricasDelPaso(pasos[0]!, l, h.clase, ZONAS, {}, R))).toEqual(['pulso']);
    // Con carga, en la etiqueta del héroe.
    const kb = minutosDeathBy({ nombre: 'KB Swing', dosis: reps(2), carga: { kg: 24 }, mide: 'atleta' }, { inicio: 2, incremento: 2, ventanaS: 60, tope: null }, (k) => `kb${k}`)[3]!;
    expect(heroeDeFamilia(kb, l, ZONAS)).toMatchObject({ texto: '8', unidad: 'KB Swing', etiqueta: 'este minuto · 24 kg' });
  });

  it('la voz, «Luego» y la Estructura hablan de la escalera, no de «20 × Burpee»', () => {
    expect(vozInicio(pasos[6]!)).toBe('Minuto 7. 7 Burpee.');
    expect(vieneDeathBy(pasos[7]!)).toBe('Minuto 8 · 8 Burpee');
    expect(luegoDe(pasos, 6)).toEqual({ que: 'Minuto 8 · 8 Burpee', despues: null });
    const filas = estructuraDe(pasos)(6);
    expect(filas).toHaveLength(1);
    expect(textoFila(filas[0]!)).toEqual({ linea: 'Death by Burpee', detalle: '1 + 1 cada 1′ · hasta que el reloj te cace' });
    expect(filaDeathBy(paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 20, mide: 'reloj' } }))).toBeNull();
  });

  it('el reloj te caza: un minuto cerrado sin «hecho» es el último, y la puntuación son los minutos completos', () => {
    const hechas = { db0: 6, db1: 9, db2: 13 };
    expect(cazadoEn(pasos, 2, hechas)).toBe(false);
    expect(cazadoEn(pasos, 3, hechas)).toBe(true);
    // Un paso que no es death by nunca «caza».
    expect(cazadoEn([paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' } })], 0, {})).toBe(false);
    expect(resultadoDeathBy(9, null)).toBe('9 minutos completos · te cazó el 10');
    expect(resultadoDeathBy(1, null)).toBe('1 minuto completo · te cazó el 2');
    expect(resultadoDeathBy(15, 15)).toBe('15 minutos completos · hasta el tope');
  });
});

// ---------------------------------------------------------------------------
// AMRAP: la puntuación tocada y el remo en la ronda
// ---------------------------------------------------------------------------

describe('amrap: las reps de una ronda con remo, y la puntuación con los ±', () => {
  const tareas: Tarea[] = [
    { nombre: 'Row', dosis: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, mide: 'ergo' },
    { nombre: 'Wall Ball', dosis: reps(15), carga: { kg: 9 }, mide: 'atleta' },
    { nombre: 'Burpee', dosis: reps(10), corporal: true, mide: 'atleta' },
  ];

  it('un Row de 250 m cuenta 1 en la ronda, no 250 «reps»; las cal cuentan como reps', () => {
    expect(repsDeTarea(tareas[0]!)).toBe(1);
    expect(repsDeTarea({ nombre: 'Row', dosis: { tipo: 'cal', prescrito: 12, mide: 'ergo' }, mide: 'ergo' })).toBe(12);
    expect(repsDeTarea({ nombre: 'Row', dosis: null, mide: 'ergo' })).toBe(0);
    expect(repsPorRonda(tareas)).toBe(26);
    expect(desgloseReps(tareas, 16)).toBe('Row + 15 Wall Ball');
    expect(desgloseReps(tareas, 26)).toBe('Row + 15 Wall Ball + 10 Burpee');
  });

  it('los ± mueven el dato enfocado; las reps llevan a la ronda; desde «—» el primer toque es 1', () => {
    expect(girarPuntuacion({ rondas: 5, reps: null }, 'reps', 1, 26)).toEqual({ rondas: 5, reps: 1 });
    expect(girarPuntuacion({ rondas: 5, reps: null }, 'reps', 10, 26)).toEqual({ rondas: 5, reps: 10 });
    expect(girarPuntuacion({ rondas: 5, reps: 20, }, 'reps', 6, 26)).toEqual({ rondas: 6, reps: 0 });
    expect(girarPuntuacion({ rondas: 5, reps: 0 }, 'reps', -1, 26)).toEqual({ rondas: 4, reps: 25 });
    expect(girarPuntuacion({ rondas: 5, reps: 3 }, 'rondas', -1, 26)).toEqual({ rondas: 4, reps: 3 });
    expect(girarPuntuacion({ rondas: 0, reps: 3 }, 'rondas', -1, 26)).toEqual({ rondas: 0, reps: 3 });
  });

  it('la campana: el héroe es «rondas + reps», lo no dicho es «—»; la rejilla, reps por ronda y pulso', () => {
    const campana = paso({ clase: 'amrap', rol: 'transicion', medida: { tipo: 'abierta', prescrito: null, mide: 'atleta' }, cierre: 'atleta', wod: { formato: 'puntuacion', tareas, duracionS: 720 } });
    const l = lect({});
    expect(heroeDeFamilia(campana, l, ZONAS, { rondas: 5, repsSueltas: null })).toMatchObject({ texto: '5 + —', etiqueta: 'rondas + reps' });
    expect(heroeDeFamilia(campana, l, ZONAS, { rondas: 5, repsSueltas: 16 }).texto).toBe('5 + 16');
    expect(claves(metricasDelPaso(campana, l, 'crono', ZONAS, { rondas: 5 }, R))).toEqual(['repsRonda', 'pulso']);
    // Un solo movimiento: solo las reps.
    const solo = paso({ clase: 'amrap', rol: 'transicion', medida: { tipo: 'abierta', prescrito: null, mide: 'atleta' }, cierre: 'atleta', wod: { formato: 'puntuacion', tareas: [tareas[2]!], duracionS: 240 } });
    expect(heroeDeFamilia(solo, l, ZONAS, { rondas: 0, repsSueltas: 43 })).toMatchObject({ texto: '43', unidad: 'reps', etiqueta: 'Burpee' });
  });

  it('con el remo en la ronda, la rejilla enseña su /500 («—» si no remas) en vez de las reps por ronda', () => {
    const ventana = paso({ clase: 'amrap', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 720, mide: 'reloj' }, maquina: { tipo: 'remo' }, wod: { formato: 'amrap', tareas, duracionS: 720 } });
    const remando = metricasDelPaso(ventana, lect({ split500: 126 }), 'crono', ZONAS, { rondas: 3 }, R);
    expect(claves(remando)).toEqual(['tarea', 'split', 'pulso']);
    expect(remando[1]).toMatchObject({ valor: '2:06', unidad: '/500' });
    expect(metricasDelPaso(ventana, lect({ split500: null }), 'crono', ZONAS, { rondas: 3 }, R)[1]?.valor).toBe('—');
    const sinRemo = paso({ clase: 'amrap', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 720, mide: 'reloj' }, wod: { formato: 'amrap', tareas, duracionS: 720 } });
    expect(claves(metricasDelPaso(sinRemo, lect({}), 'crono', ZONAS, { rondas: 3 }, R))).toEqual(['tarea', 'repsRonda', 'pulso']);
  });
});

// ---------------------------------------------------------------------------
// EMOM, tabata y For Time: la rejilla no repite la cabecera
// ---------------------------------------------------------------------------

describe('la rejilla no repite lo que ya dice la cabecera (un dato, un sitio)', () => {
  const row: Tarea = { nombre: 'Row', dosis: null, mide: 'ergo' };
  const bench: Tarea = { nombre: 'Bench Press', dosis: reps(6), carga: { kg: 60 }, mide: 'atleta' };

  it('EMOM con el remo: /500, metros de este minuto, pulso y calorías; sin «minuto 4/12»', () => {
    const minuto = paso({ clase: 'emom', rol: 'trabajo', nombre: 'Row', maquina: { tipo: 'remo' }, medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, posicion: { serie: { n: 4, de: 12 } }, wod: { formato: 'emom', tarea: row, ciclo: [bench, row], ventanas: 12, ventanaS: 60 } });
    const m = metricasDelPaso(minuto, lect({ split500: 132, cal: 9 }), 'crono', ZONAS, { metrosPaso: 91 }, R);
    expect(claves(m)).toEqual(['split', 'distancia', 'pulso', 'cal']);
    expect(posicionDe(minuto)).toEqual(['Minuto 4/12']);
  });

  it('EMOM con carga: cuánto tardó la vez anterior (si se marcó) y el pulso', () => {
    const minuto = paso({ clase: 'emom', rol: 'trabajo', nombre: 'Bench Press', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, posicion: { serie: { n: 5, de: 12 } }, wod: { formato: 'emom', tarea: bench, ciclo: [bench, row], ventanas: 12, ventanaS: 60 } });
    expect(claves(metricasDelPaso(minuto, lect({}), 'crono', ZONAS, { ultimaVentana: 21 }, R))).toEqual(['ultima', 'pulso']);
    expect(claves(metricasDelPaso(minuto, lect({}), 'crono', ZONAS, {}, R))).toEqual(['pulso']);
  });

  it('tabata: el nombre delante en la cabecera; la rejilla, el pulso medio de la ronda anterior y el pulso', () => {
    const info = { formato: 'pared' as const, trabajoS: 20, descansoS: 10, rondas: 8 };
    const r3 = paso({ clase: 'series', rol: 'trabajo', nombre: 'Burpee', medida: { tipo: 'tiempo', prescrito: 20, mide: 'reloj' }, objetivos: [{ eje: 'rpe', min: 10, max: 10, papel: 'principal' }], posicion: { ronda: { n: 3, de: 8 } }, wod: info });
    const r4 = { ...r3, id: 'r4', posicion: { ronda: { n: 4, de: 8 } } };
    expect(posicionDe(r4)).toEqual(['Burpee', 'Ronda 4/8', 'RPE 10']);
    const parcial: Parcial = { i: 4, segundos: 20, metros: null, ppm: 177, hecho: null };
    const m = metricasDelPaso(r4, lect({ ppm: 179 }), 'falta', ZONAS, { anterior: { paso: r3, parcial } }, R);
    expect(claves(m)).toEqual(['ultima', 'pulso']);
    expect(m[0]).toMatchObject({ etiqueta: 'ronda 3', valor: '177', unidad: 'ppm medio' });
    // Sin ronda anterior (la primera) o sin pulso en ella: no se inventa.
    expect(claves(metricasDelPaso(r4, lect({}), 'falta', ZONAS, {}, R))).toEqual(['pulso']);
    expect(claves(metricasDelPaso(r4, lect({}), 'falta', ZONAS, { anterior: { paso: r3, parcial: { ...parcial, ppm: null } } }, R))).toEqual(['pulso']);
  });

  it('For Time: la estación con el nombre delante y sin su dosis; el cap como lo que queda hasta él', () => {
    const wb: Tarea = { nombre: 'Wall Ball', dosis: reps(40), carga: { kg: 9 }, mide: 'atleta' };
    const est = paso({ clase: 'fortime', rol: 'trabajo', nombre: 'Wall Ball', carga: { kg: 9 }, medida: wb.dosis!, cierre: 'atleta', posicion: { estacion: { n: 2, de: 10 } }, wod: { formato: 'fortime', tarea: wb, capS: 1500 } });
    expect(posicionDe(est)).toEqual(['Wall Ball', 'Estación 2/10']);
    const m = metricasDelPaso(est, lect({ t: 48 }), 'crono', ZONAS, { total: 1428, totalEnCabecera: true }, R);
    expect(m[0]).toMatchObject({ clave: 'cap', etiqueta: 'cap en', valor: '1:12' });
    expect(metricasDelPaso(est, lect({ t: 48 }), 'crono', ZONAS, { total: 1530 }, R)[0]).toMatchObject({ etiqueta: 'cap pasado', valor: '0:00' });
    expect(metricasDelPaso(est, lect({ t: 48 }), 'crono', ZONAS, {}, R)[0]).toMatchObject({ etiqueta: 'cap', valor: '25′' });
  });
});

// ---------------------------------------------------------------------------
// El chipper: la ventana ±1
// ---------------------------------------------------------------------------

describe('la lista del chipper: lo hecho con su tiempo, lo que viene y cuántas quedan', () => {
  const t = (nombre: string, dosis: Tarea['dosis'], carga?: Tarea['carga']): PasoBase =>
    paso({ clase: 'fortime', rol: 'trabajo', nombre, carga, medida: dosis!, cierre: 'atleta', wod: { formato: 'fortime', tarea: { nombre, dosis, carga, mide: 'atleta' }, capS: 1500 } });
  const pasos = [t('Double Under', reps(50)), t('Wall Ball', reps(40), { kg: 9 }), t('Row', { tipo: 'cal', prescrito: 30, mide: 'ergo' }), t('Burpee', reps(20)), t('Box Jump', reps(20))];
  const parciales: Parcial[] = [{ i: 0, segundos: 62, metros: null, ppm: 158, hecho: null }];

  it('en la estación 2 de 5: la 1 hecha en 1:02, luego el Row, +2 más', () => {
    const a = alrededorDe(pasos, 1, parciales);
    expect(a.anterior?.paso.nombre).toBe('Double Under');
    expect(a.anterior?.segundos).toBe(62);
    expect(a.siguiente?.nombre).toBe('Row');
    expect(a.masAtras).toBe(0);
    expect(a.masAdelante).toBe(2);
  });

  it('en la primera no hay anterior; en la última no hay siguiente; las recuperaciones no cuentan', () => {
    expect(alrededorDe(pasos, 0, []).anterior).toBeNull();
    const ultima = alrededorDe(pasos, 4, []);
    expect(ultima.siguiente).toBeNull();
    expect(ultima.masAtras).toBe(3);
    const conRec = [pasos[0]!, paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' } }), pasos[1]!];
    expect(alrededorDe(conRec, 2, []).anterior?.paso.nombre).toBe('Double Under');
  });

  it('la estación en una línea, desde su tarea: dosis, nombre y carga', () => {
    expect(textoEstacion(pasos[1]!)).toBe('40 Wall Ball · 9 kg');
    expect(textoEstacion(pasos[2]!)).toBe('30 cal Row');
    expect(textoEstacion(paso({ clase: 'carrera', rol: 'trabajo', nombre: 'Run', medida: { tipo: 'distancia', prescrito: 800, mide: 'gps' } }))).toBe('Run · 800 m');
  });
});
