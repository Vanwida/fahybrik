// EL MOMENTO DE «HOY · EL DÍA», CLAVADO SOBRE LOS CATORCE CASOS.
//
// La portada `hoy-dia` cambia de sujeto a lo largo del día. Que el sujeto sea
// el correcto no se ve mirando un mockup: se ve igual de bien un check-in que
// tapa una sesión que al revés. Así que la precedencia se fija aquí, caso a
// caso, y cada paso de la escalera tiene al menos un caso que lo ejercita.

import { describe, expect, it } from 'vitest';
import { CASOS_HOY, casoHoy } from '@/components/design-twin/kit-hoy/casos';
import type { LecturaHoy } from '@/components/design-twin/kit-hoy/contrato';
import {
  instanteDelDia,
  itemsContigo,
  momento,
  puedeUnirse,
  saludo,
  type TipoMomento,
} from '@/components/design-twin/screens/hoy-dia/momento';

const lectura = (id: string): LecturaHoy => casoHoy(id).lectura;

/** El sujeto que toca en cada uno de los catorce escenarios del doble. */
const ESPERADO: Record<string, TipoMomento> = {
  listo: 'sesion',
  manana: 'checkin',
  cargado: 'sesion',
  hecho: 'hecho',
  doble: 'sesion',
  descanso: 'descanso',
  pausado: 'pausa',
  'sin-objetivo': 'sesion',
  alta: 'checkin',
  libre: 'libre',
  'a-medias': 'retoma',
  avisos: 'sesion',
  cargando: 'cargando',
  error: 'error',
};

describe('momento() sobre los catorce casos', () => {
  it('cubre exactamente los catorce escenarios del doble', () => {
    expect(Object.keys(ESPERADO).sort()).toEqual(CASOS_HOY.map((c) => c.id).sort());
  });

  for (const c of CASOS_HOY) {
    it(`${c.id} → ${ESPERADO[c.id]}`, () => {
      expect(momento(c.lectura).tipo).toBe(ESPERADO[c.id]);
    });
  }

  it('la sesión de un día doble es la PRIMERA pendiente, y trae la otra franja sin ser héroe', () => {
    const m = momento(lectura('doble'));
    expect(m.tipo).toBe('sesion');
    if (m.tipo !== 'sesion') return;
    expect(m.sesion.franja).toBe('PM');
    expect(m.sesion.titulo).toBe('Fuerza tren superior');
    expect(m.delDia.map((s) => s.estado)).toEqual(['hecha', 'pendiente']);
  });

  it('retomar es la MISMA sesión de hoy, empezada', () => {
    const m = momento(lectura('a-medias'));
    expect(m).toMatchObject({ tipo: 'retoma', titulo: 'Series 6×800', desde: '8:12' });
    if (m.tipo === 'retoma') expect(m.sesion?.modalidad).toBe('run');
  });

  it('el descanso dice qué toca después', () => {
    expect(momento(lectura('descanso'))).toEqual({
      tipo: 'descanso',
      manana: { titulo: 'Series 8×400', modalidad: 'run', dia: 'mañana' },
    });
  });
});

describe('la precedencia, paso a paso', () => {
  const base = lectura('listo');

  it('cargando gana a todo, incluso a un error', () => {
    expect(momento({ ...base, cargando: true, hoy: { tipo: 'error-carga' } }).tipo).toBe('cargando');
  });

  it('el error gana a no tener coach', () => {
    expect(momento({ ...base, conCoach: false, hoy: { tipo: 'error-carga' } }).tipo).toBe('error');
  });

  it('sin coach gana a un entreno a medias y al check-in (y el a medias baja a «Contigo»)', () => {
    const l: LecturaHoy = {
      ...base,
      conCoach: false,
      checkinPendiente: true,
      reclamos: [{ clave: 'a-medias', titulo: 'Libre', desde: '8:00' }],
    };
    const m = momento(l);
    expect(m.tipo).toBe('libre');
    expect(itemsContigo(l, m).map((i) => i.clave)).toEqual(['a-medias']);
  });

  it('la pausa gana a un entreno a medias', () => {
    const l: LecturaHoy = { ...base, hoy: { tipo: 'pausado' }, reclamos: [{ clave: 'a-medias', titulo: 'X', desde: '8:00' }] };
    expect(momento(l).tipo).toBe('pausa');
  });

  it('el entreno a medias gana al check-in', () => {
    const l: LecturaHoy = { ...base, checkinPendiente: true, reclamos: [{ clave: 'a-medias', titulo: 'Series 6×800', desde: '8:12' }] };
    expect(momento(l).tipo).toBe('retoma');
  });

  it('con el check-in hecho, la recién dada de alta pasa a su primer día', () => {
    expect(momento({ ...lectura('alta'), checkinPendiente: false }).tipo).toBe('primer-dia');
  });

  it('un veterano sin nada publicado después de hoy NO es un primer día', () => {
    expect(momento({ ...base, hoy: { tipo: 'descanso', manana: null } })).toEqual({ tipo: 'descanso', manana: null });
  });

  it('con todas las sesiones cerradas (hecha, a medias o sin hacer) es «Hecho hoy»', () => {
    const l: LecturaHoy = {
      ...base,
      hoy: {
        tipo: 'sesiones',
        sesiones: [
          { franja: 'AM', titulo: 'A', modalidad: 'run', estado: 'parcial', libre: false },
          { franja: 'PM', titulo: 'B', modalidad: 'strength', estado: 'saltada', libre: false },
        ],
      },
    };
    expect(momento(l).tipo).toBe('hecho');
  });
});

describe('la línea del día', () => {
  it('antes de entrenar, entre dos sesiones, con uno a medias y después', () => {
    expect(instanteDelDia(lectura('listo'))).toEqual({ tipo: 'recorrido', ahora: 'antes', cerradas: 0, total: 1 });
    expect(instanteDelDia(lectura('doble'))).toEqual({ tipo: 'recorrido', ahora: 'entreno', cerradas: 1, total: 2 });
    expect(instanteDelDia(lectura('a-medias'))).toEqual({ tipo: 'recorrido', ahora: 'entreno', cerradas: 0, total: 1 });
    expect(instanteDelDia(lectura('hecho'))).toEqual({ tipo: 'recorrido', ahora: 'despues', cerradas: 1, total: 1 });
  });

  it('sin sesiones dice qué día es en vez de dibujar un recorrido vacío', () => {
    expect(instanteDelDia(lectura('descanso'))).toEqual({ tipo: 'rotulo', texto: 'Día de descanso' });
    expect(instanteDelDia(lectura('pausado'))).toEqual({ tipo: 'rotulo', texto: 'Plan en pausa' });
    expect(instanteDelDia(lectura('alta'))).toEqual({ tipo: 'rotulo', texto: 'Primer día' });
  });

  it('sin coach, cargando o con error no hay día que contar', () => {
    expect(instanteDelDia(lectura('libre'))).toBeNull();
    expect(instanteDelDia(lectura('cargando'))).toBeNull();
    expect(instanteDelDia(lectura('error'))).toBeNull();
  });

  it('el saludo sigue la hora (el corte de InicioView)', () => {
    expect(saludo('7:40', 'Nora')).toBe('Buenos días, Nora');
    expect(saludo('13:05', 'Marina')).toBe('Buenas tardes, Marina');
    expect(saludo('21:30', null)).toBe('Buenas noches');
    expect(saludo('5:59', 'Iván')).toBe('Buenas noches, Iván');
  });
});

describe('«Contigo»', () => {
  it('lo que caduca antes va primero y los comunicados cierran', () => {
    const l = lectura('avisos');
    expect(itemsContigo(l, momento(l)).map((i) => i.clave)).toEqual(['pareja-en-vivo', 'revision', 'tests', 'comunicados']);
  });

  it('el entreno a medias no se repite cuando ya es el sujeto', () => {
    const l = lectura('a-medias');
    expect(itemsContigo(l, momento(l))).toEqual([]);
  });

  it('sin coach no aparece ninguna pieza de coach', () => {
    const l: LecturaHoy = {
      ...lectura('libre'),
      comunicados: 3,
      reclamos: [
        { clave: 'tests', hechos: 0, total: 4 },
        { clave: 'revision', estado: 'propuesta', cuando: null },
        { clave: 'pareja-en-vivo', nombre: 'Biel' },
      ],
    };
    expect(itemsContigo(l, momento(l))).toEqual([]);
  });

  it('con el plan en pausa no hay tests que hacer', () => {
    const l: LecturaHoy = { ...lectura('pausado'), reclamos: [{ clave: 'tests', hechos: 1, total: 4 }] };
    expect(itemsContigo(l, momento(l))).toEqual([]);
  });

  it('el primer día se lleva los tests al sujeto y no se repiten abajo', () => {
    const l: LecturaHoy = { ...lectura('alta'), checkinPendiente: false };
    const items = itemsContigo(l, momento(l)).map((i) => i.clave);
    expect(items).toEqual(['comunicados']);
    // Con el check-in aún por hacer, el sujeto es el check-in y los tests siguen abajo.
    const antes = lectura('alta');
    expect(itemsContigo(antes, momento(antes)).map((i) => i.clave)).toEqual(['tests', 'comunicados']);
  });

  it('«únete en vivo» solo con tu sesión pendiente y el plan en marcha', () => {
    expect(puedeUnirse(lectura('avisos'))).toBe(true);
    expect(puedeUnirse(lectura('hecho'))).toBe(false);
    expect(puedeUnirse(lectura('pausado'))).toBe(false);
    expect(puedeUnirse(lectura('descanso'))).toBe(false);
  });
});
