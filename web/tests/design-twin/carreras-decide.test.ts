// EL SUJETO DE «CARRERAS», CLAVADO SOBRE LOS VEINTE CASOS.
//
// La pestaña cambia de sujeto a lo largo de la temporada (el objetivo, la
// carrera de ayer, la última, la invitación). Que el sujeto sea el correcto no
// se ve mirando un mockup: se ve igual de bien un póster de objetivo que tapa
// una carrera de ayer sin resultado que al revés. Así que la precedencia se fija
// aquí, caso a caso, junto con las cuentas que la pantalla pinta y no calcula.

import { describe, expect, it } from 'vitest';
import { aplicar, prediccionTras } from '@/components/design-twin/kit-carreras/acciones';
import { CASOS_CARRERAS, casoCarreras } from '@/components/design-twin/kit-carreras/casos';
import type { LecturaCarreras, ProximaCarrera } from '@/components/design-twin/kit-carreras/contrato';
import {
  buscarCandidatos,
  CALENDARIO,
  eventosVisibles,
  HOY,
  INDIVIDUAL_2026_VLC,
  PELDANOS_META,
  en,
  pareceEnlaceHyrox,
  pasada,
  proxima,
} from '@/components/design-twin/kit-carreras/datos';
import { textoCuenta, textoPredicho } from '@/components/design-twin/kit-carreras/textos';
import {
  accionObjetivo,
  DIAS_POSTCARRERA,
  estacionesSinPuesto,
  evolucion,
  listaCorta,
  ordenarProximas,
  pendienteReciente,
  principalDe,
  problemasDeLectura,
  proximasRestantes,
  resumenDe,
  soloDeEquipo,
  sujeto,
  type TipoSujeto,
} from '@/components/design-twin/kit-carreras/decide';
import {
  conSigno,
  diasEntre,
  estacionesTotalS,
  fechaConDia,
  fechaCorta,
  fnv1a64,
  fondoDe,
  lineaCategoria,
  mesAnio,
  mesLargo,
  metaTexto,
  puestoTexto,
  reloj,
  relojCarrera,
  sumaDias,
  textoEquipo,
} from '@/components/design-twin/kit-carreras/formato';

const lectura = (id: string): LecturaCarreras => casoCarreras(id).lectura;

/** El sujeto que toca en cada uno de los veinte escenarios del doble. */
const ESPERADO: Record<string, TipoSujeto> = {
  lleno: 'objetivo',
  'solo-objetivo': 'objetivo',
  'solo-historial': 'ultima',
  vacio: 'vacio',
  dobles: 'objetivo',
  parcial: 'objetivo',
  'dia-de-carrera': 'objetivo',
  ayer: 'postcarrera',
  varios: 'objetivo',
  'sin-coach': 'objetivo',
  cargando: 'cargando',
  error: 'error',
  importando: 'vacio',
  'no-soy-yo': 'ultima',
  'sin-pareja': 'objetivo',
  informe: 'objetivo',
  llegando: 'objetivo',
  fallos: 'objetivo',
  'sin-principal': 'objetivo',
  'no-hyrox': 'objetivo',
};

describe('los veinte casos', () => {
  it('son veinte, con ids únicos y todos con su expectativa', () => {
    expect(CASOS_CARRERAS).toHaveLength(20);
    expect(new Set(CASOS_CARRERAS.map((c) => c.id)).size).toBe(20);
    expect(Object.keys(ESPERADO).sort()).toEqual(CASOS_CARRERAS.map((c) => c.id).sort());
  });

  for (const c of CASOS_CARRERAS) {
    it(`${c.id}: lectura coherente (fechas, cuentas, equipo, coach)`, () => {
      // Un caso cargando o en error lleva valores de relleno que la pantalla no lee.
      if (c.lectura.carga.hub !== 'lista') return;
      expect(problemasDeLectura(c.lectura)).toEqual([]);
    });
    it(`${c.id}: el sujeto es «${ESPERADO[c.id]}»`, () => {
      expect(sujeto(c.lectura).tipo).toBe(ESPERADO[c.id]);
    });
  }

  it('cada estado de sujeto lo ejercita al menos un caso', () => {
    const vistos = new Set(CASOS_CARRERAS.map((c) => sujeto(c.lectura).tipo));
    expect([...vistos].sort()).toEqual(['cargando', 'error', 'objetivo', 'postcarrera', 'ultima', 'vacio']);
  });
});

describe('la precedencia del sujeto', () => {
  it('una carrera de ayer sin resultado va POR DELANTE del objetivo', () => {
    const l = lectura('ayer');
    expect(principalDe(l.proximas)).not.toBeNull();
    const s = sujeto(l);
    expect(s.tipo).toBe('postcarrera');
    if (s.tipo === 'postcarrera') {
      expect(s.dias).toBe(1);
      expect(s.carrera.nombre).toBe('HYROX Madrid');
    }
    // …y el objetivo no se pierde: pasa a la primera fila de «Próximas».
    expect(proximasRestantes(l, s).map((c) => c.raceId)).toEqual([261]);
  });

  it('pasado el plazo, el objetivo vuelve a mandar y la carrera queda como «resultado pendiente»', () => {
    const l = lectura('ayer');
    const vieja: LecturaCarreras = {
      ...l,
      pasadas: l.pasadas.map((p) => (p.resultadoS == null ? { ...p, fecha: sumaDias(HOY, -(DIAS_POSTCARRERA + 1)) } : p)),
    };
    expect(pendienteReciente(vieja)).toBeNull();
    expect(sujeto(vieja).tipo).toBe('objetivo');
    // En el límite (justo el último día del plazo) todavía manda la carrera.
    const limite: LecturaCarreras = { ...vieja, pasadas: vieja.pasadas.map((p) => (p.resultadoS == null ? { ...p, fecha: sumaDias(HOY, -DIAS_POSTCARRERA) } : p)) };
    expect(sujeto(limite).tipo).toBe('postcarrera');
  });

  it('una pendiente sin fecha nunca es «reciente»: no se sabe cuándo se corrió', () => {
    const l: LecturaCarreras = { ...lectura('vacio'), pasadas: [pasada(9, 'HYROX X', null, null)] };
    expect(pendienteReciente(l)).toBeNull();
    // Solo pendientes viejas y nada por delante: no hay «última» (ninguna tiene resultado): invitación.
    expect(sujeto(l).tipo).toBe('vacio');
  });

  it('cargando y error tapan todo lo demás', () => {
    const lleno = lectura('lleno');
    expect(sujeto({ ...lleno, carga: { hub: 'fria', analisis: 'lista' } }).tipo).toBe('cargando');
    expect(sujeto({ ...lleno, carga: { hub: 'error', analisis: 'lista' } }).tipo).toBe('error');
  });

  it('sin principal, el sujeto es la más próxima y NO es principal', () => {
    const s = sujeto(lectura('sin-principal'));
    expect(s.tipo).toBe('objetivo');
    if (s.tipo === 'objetivo') {
      expect(s.principal).toBe(false);
      expect(s.carrera.nombre).toBe('HYROX Madrid');
    }
  });

  it('una fila sin prioridad cuenta como principal (la ruta de creación lo pone por defecto)', () => {
    const c = proxima(1, 'HYROX X', 10, { prioridad: null });
    expect(principalDe([c])?.raceId).toBe(1);
  });

  it('con solo historial el sujeto es la última carrera CON resultado, de equipo o no', () => {
    const l: LecturaCarreras = { ...lectura('solo-historial'), pasadas: [pasada(1, 'Pendiente', en(-40), null), lectura('dobles').pasadas[0]] };
    const s = sujeto(l);
    expect(s.tipo).toBe('ultima');
    if (s.tipo === 'ultima') expect(s.carrera.formato).toBe('doubles');
  });
});

describe('ordenar las próximas', () => {
  it('por día; a igual día, el principal primero; sin fecha al final', () => {
    const orden = ordenarProximas(lectura('varios').proximas).map((c) => c.raceId);
    // 273 (a 12) · 271 principal y 272 (a 39) · 274 (96) · 277 (124) · 276 (141) · 275 sin fecha.
    expect(orden).toEqual([273, 271, 272, 274, 277, 276, 275]);
  });

  it('es un orden total: barajadas, salen igual', () => {
    const lista = lectura('varios').proximas;
    const base = ordenarProximas(lista).map((c) => c.raceId);
    expect(ordenarProximas([...lista].reverse()).map((c) => c.raceId)).toEqual(base);
    expect(ordenarProximas([...lista.slice(3), ...lista.slice(0, 3)]).map((c) => c.raceId)).toEqual(base);
  });

  it('el sujeto sale de la lista de próximas (no se enseña dos veces)', () => {
    const l = lectura('varios');
    const s = sujeto(l);
    expect(s.tipo === 'objetivo' && s.carrera.raceId).toBe(271);
    expect(proximasRestantes(l, s).map((c) => c.raceId)).toEqual([273, 272, 274, 277, 276, 275]);
  });
});

describe('la acción del póster es la salida del hueco más importante', () => {
  const de = (id: string) => {
    const l = lectura(id);
    const s = sujeto(l);
    if (s.tipo !== 'objetivo') throw new Error('no es objetivo');
    return accionObjetivo(s, l.prediccion).tipo;
  };
  it('ver el camino cuando hay predicho, parcial o «sin datos»', () => {
    expect(de('lleno')).toBe('ver-camino');
    expect(de('parcial')).toBe('ver-camino');
    expect(de('solo-objetivo')).toBe('ver-camino');
  });
  it('sin tiempo objetivo, fijarlo (HYROX o no)', () => {
    expect(de('sin-coach')).toBe('fijar-meta');
    const sinMeta: LecturaCarreras = { ...lectura('no-hyrox'), proximas: [proxima(1, 'Mitja', 141, { tipoEvento: 'other', metaS: null })] };
    const s = sujeto(sinMeta);
    if (s.tipo !== 'objetivo') throw new Error();
    expect(accionObjetivo(s, sinMeta.prediccion)).toEqual({ tipo: 'fijar-meta', etiqueta: 'Fijar tiempo objetivo' });
  });
  it('una carrera que no es HYROX con meta: cambiarla', () => {
    const l = lectura('no-hyrox');
    const s = sujeto(l);
    if (s.tipo !== 'objetivo') throw new Error();
    expect(accionObjetivo(s, l.prediccion)).toEqual({ tipo: 'fijar-meta', etiqueta: 'Cambiar tiempo objetivo' });
  });
  it('sin ser el principal, hacerlo; sin pareja, conectarla', () => {
    expect(de('sin-principal')).toBe('hacer-principal');
    expect(de('sin-pareja')).toBe('conectar-pareja');
  });
});

describe('las cuentas que la pantalla pinta y no calcula', () => {
  it('el resumen de la última: total, estaciones (solo si están las ocho), puesto y delta contra la individual anterior', () => {
    const l = lectura('lleno');
    const r = resumenDe(INDIVIDUAL_2026_VLC, l.pasadas);
    expect(r.totalS).toBe(4012);
    expect(r.correrS).toBe(2170);
    expect(r.estacionesS).toBe(1562);
    expect(r.roxzoneS).toBe(280);
    expect(r.puesto).toBe('Puesto 412 de 1180 · top 35 %');
    // La anterior individual es Barcelona 2025 (4166), no los dobles de Girona.
    expect(r.deltaAnteriorS).toBe(4012 - 4166);
  });

  it('una suma de siete estaciones no es «tus estaciones»', () => {
    const c = { ...INDIVIDUAL_2026_VLC, estaciones: INDIVIDUAL_2026_VLC.estaciones.map((e, i) => (i === 3 ? { ...e, segundos: null } : e)) };
    expect(estacionesTotalS(c)).toBeNull();
  });

  it('una carrera de equipo no compara su tiempo con una individual', () => {
    const l = lectura('lleno');
    const gir = l.pasadas.find((p) => p.formato === 'doubles')!;
    expect(resumenDe(gir, l.pasadas).deltaAnteriorS).toBeNull();
  });

  it('la evolución: las últimas individuales, de la más antigua a la más reciente; los dobles no entran', () => {
    const e = evolucion(lectura('lleno').pasadas)!;
    expect(e.map((p) => p.totalS)).toEqual([4390, 4268, 4166, 4012]);
    expect(e.map((p) => p.ultimo)).toEqual([false, false, false, true]);
    expect(e[0].fraccion).toBe(1);
    expect(e[3].fraccion).toBeCloseTo(4012 / 4390, 5);
  });

  it('con menos de dos individuales no hay evolución que dibujar', () => {
    expect(evolucion([INDIVIDUAL_2026_VLC])).toBeNull();
    expect(evolucion(lectura('dobles').pasadas)).toBeNull();
    expect(evolucion([])).toBeNull();
  });

  it('sin ningún puesto por estación la sección lo declara; con uno, no', () => {
    expect(estacionesSinPuesto(lectura('parcial').analisis!.estaciones)).toBe(true);
    expect(estacionesSinPuesto(lectura('lleno').analisis!.estaciones)).toBe(false);
    expect(estacionesSinPuesto([])).toBe(false);
  });

  it('solo de equipo: el análisis no puede existir y se explica', () => {
    expect(soloDeEquipo(lectura('dobles').pasadas)).toBe(true);
    expect(soloDeEquipo(lectura('lleno').pasadas)).toBe(false);
    expect(soloDeEquipo([])).toBe(false);
  });

  it('listaCorta nombra los que faltan sin pasarse', () => {
    expect(listaCorta(['Wall ball'])).toBe('Wall ball');
    expect(listaCorta(['A', 'B'])).toBe('A y B');
    expect(listaCorta(['A', 'B', 'C'])).toBe('A, B y C');
    expect(listaCorta(['A', 'B', 'C', 'D', 'E'])).toBe('A, B y 3 más');
  });
});

describe('formateadores', () => {
  it('totales en minutos corridos, parciales en m:ss', () => {
    expect(relojCarrera(4012)).toBe('66:52');
    expect(relojCarrera(3790)).toBe('63:10');
    expect(relojCarrera(6720)).toBe('112:00');
    expect(reloj(252)).toBe('4:12');
    expect(reloj(4012)).toBe('1:06:52');
  });
  it('el delta lleva su signo de verdad', () => {
    expect(conSigno(-154)).toBe('−2:34');
    expect(conSigno(42)).toBe('+0:42');
    expect(conSigno(0)).toBe('±0:00');
  });
  it('la meta: «Sub-N» si son minutos redondos, el reloj exacto si no', () => {
    expect(metaTexto(3900)).toBe('Sub-65');
    expect(metaTexto(3600)).toBe('Sub-60');
    expect(metaTexto(3870)).toBe('64:30');
  });
  it('fechas: sin año si es el de hoy, con día de la semana para lo que viene', () => {
    expect(fechaCorta('2026-11-07', HOY)).toBe('7 nov');
    expect(fechaCorta('2027-03-06', HOY)).toBe('6 mar 2027');
    expect(fechaConDia('2026-11-07', HOY)).toBe('Sáb 7 nov');
    expect(diasEntre(HOY, '2026-11-07')).toBe(39);
    expect(diasEntre('2026-09-28', HOY)).toBe(1);
    expect(sumaDias('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('el puesto: sin campo solo el puesto; sin puesto, nada', () => {
    expect(puestoTexto(412, 1180)).toBe('Puesto 412 de 1180 · top 35 %');
    // El español agrupa a partir de cinco cifras (1180, pero 12.345).
    expect(puestoTexto(1, 12345)).toBe('Puesto 1 de 12.345 · top 1 %');
    expect(puestoTexto(88, null)).toBe('Puesto 88');
    expect(puestoTexto(null, 1000)).toBeNull();
  });
  it('el equipo se dice como se habla', () => {
    expect(textoEquipo([{ posicion: 1, nombre: 'Aina' }])).toBe('con Aina');
    expect(textoEquipo([{ posicion: 2, nombre: 'Joan' }, { posicion: 1, nombre: 'Aina' }, { posicion: 3, nombre: 'Pau' }])).toBe('con Aina, Joan y Pau');
    expect(textoEquipo([])).toBeNull();
  });
  it('la categoría de una carrera que no es HYROX no se pinta (el servidor la rellena por defecto)', () => {
    expect(lineaCategoria(proxima(1, 'HYROX', 3))).toBe('Individual · Open · Hombres');
    expect(lineaCategoria(proxima(1, 'HYROX', 3, { formato: 'doubles', categoria: 'mixed' }))).toBe('Open · Mixto');
    expect(lineaCategoria(proxima(1, 'Mitja', 3, { tipoEvento: 'other' }))).toBeNull();
  });
  it('FNV-1a de 64 bits: el vector publicado, y la foto es estable', () => {
    expect(fnv1a64('a')).toBe(BigInt('0xaf63dc4c8601ec8c'));
    expect(fnv1a64('')).toBe(BigInt('0xcbf29ce484222325'));
    expect(fondoDe('201')).toBe(fondoDe('201'));
    expect(['sled-push', 'running', 'wall-balls']).toContain(fondoDe('202'));
  });
});

describe('el calendario de ejemplo es coherente', () => {
  it('todo evento con fecha es futuro; el provisional no tiene fecha', () => {
    for (const e of CALENDARIO) {
      if (e.fecha) expect(e.fecha >= HOY).toBe(true);
      expect(e.provisional).toBe(e.fecha == null);
    }
  });
});

describe('las acciones cambian la lectura con las reglas del servidor', () => {
  const lleno = lectura('lleno');
  const evento = CALENDARIO[2]; // HYROX Girona, a 71 días

  it('quitar el principal: el sujeto pasa a la más próxima y el predicho se resuelve solo (no hay principal)', () => {
    const l = aplicar(lleno, { tipo: 'quitar', raceId: 201 });
    const s = sujeto(l);
    expect(s.tipo === 'objetivo' && s.principal).toBe(false);
    expect(l.prediccion.tipo).toBe('no-aplica');
    expect(problemasDeLectura(l)).toEqual([]);
  });

  it('quitar la única carrera: el sujeto pasa a la última carrera con resultado', () => {
    const solo = lectura('solo-objetivo');
    expect(sujeto(aplicar(solo, { tipo: 'quitar', raceId: 211 })).tipo).toBe('vacio');
    const conHistorial: LecturaCarreras = { ...lectura('solo-historial'), proximas: [proxima(1, 'X', 5)] };
    expect(sujeto(aplicar(conHistorial, { tipo: 'quitar', raceId: 1 })).tipo).toBe('ultima');
  });

  it('un solo principal a la vez: hacer principal a otra degrada la anterior y recalcula el predicho', () => {
    const l = aplicar(lleno, { tipo: 'hacer-principal', raceId: 202 });
    const prioridades = Object.fromEntries(l.proximas.map((c) => [c.raceId, c.prioridad]));
    expect(prioridades).toEqual({ 201: 'secondary', 202: 'target' });
    expect(l.prediccion).toEqual({ tipo: 'cargando' });
    // El total es del atleta: llega con el hueco contra la meta NUEVA (4080).
    expect(prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: -110 }, l.proximas.find((c) => c.raceId === 202)!)).toEqual({ tipo: 'cifra', totalS: 3790, huecoS: 3790 - 4080, pareja: undefined });
  });

  it('fijar una carrera nueva la hace principal y pasa la anterior a secundaria', () => {
    const l = aplicar(lleno, { tipo: 'fijar', evento, formato: 'singles', division: 'open', categoria: 'men', metaS: 3900, fecha: null });
    const principal = principalDe(l.proximas)!;
    expect(principal.nombre).toBe('HYROX Girona');
    expect(principal.diasHasta).toBe(71);
    expect(l.proximas.filter((c) => (c.prioridad ?? 'target') === 'target')).toHaveLength(1);
    expect(l.proximas.find((c) => c.raceId === 201)?.prioridad).toBe('secondary');
    expect(new Set(l.proximas.map((c) => c.raceId)).size).toBe(l.proximas.length);
    expect(problemasDeLectura(l)).toEqual([]);
  });

  it('cambiar la meta del principal recalcula el hueco; sin meta, el predicho pide fijarla', () => {
    const l = aplicar(lleno, { tipo: 'cambiar-meta', raceId: 201, metaS: null });
    expect(l.prediccion).toEqual({ tipo: 'cargando' });
    expect(prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: -110 }, { ...proxima(201, 'X', 3), metaS: null })).toEqual({ tipo: 'sin-meta' });
    expect(prediccionTras({ tipo: 'sin-meta' }, proxima(201, 'X', 3, { metaS: 3900 }))).toEqual({ tipo: 'sin-datos' });
  });

  it('cambiar la meta de una carrera que no es la principal no toca el predicho', () => {
    const l = aplicar(lleno, { tipo: 'cambiar-meta', raceId: 202, metaS: 4000 });
    expect(l.prediccion).toEqual(lleno.prediccion);
  });

  it('el predicho de una carrera que no es HYROX no existe', () => {
    const mitja: ProximaCarrera = proxima(9, 'Mitja', 141, { tipoEvento: 'other', metaS: 5940 });
    expect(prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: 0 }, mitja)).toEqual({ tipo: 'no-aplica' });
    expect(prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: 0 }, { ...mitja, metaS: null })).toEqual({ tipo: 'sin-meta' });
    expect(prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: 0 }, null)).toEqual({ tipo: 'no-aplica' });
  });

  it('«No soy yo» borra lo importado y deja el objetivo vencido sin resultado', () => {
    const l = aplicar({ ...lleno, pasadas: [...lleno.pasadas, pasada(900, 'HYROX Vencida', en(-60), null)] }, { tipo: 'deshacer-importacion' });
    expect(l.pasadas.map((p) => p.raceId)).toEqual([900]);
    expect(l.analisis).toBeNull();
    expect(sujeto({ ...l, proximas: [] }).tipo).toBe('vacio');
  });

  it('importar llena el historial y el análisis', () => {
    const vacia = lectura('vacio');
    const l = aplicar(vacia, { tipo: 'importar', pasadas: lleno.pasadas, analisis: lleno.analisis });
    expect(sujeto(l).tipo).toBe('ultima');
    expect(l.analisis).not.toBeNull();
  });
});

describe('lo que dice el póster', () => {
  const ctx = { principal: true, tipoEvento: 'hyrox' as const, formato: 'singles' as const, metaS: 3900 };
  it('cifra: el hueco se dice como se habla y la marca dice si vas por delante', () => {
    expect(textoPredicho({ tipo: 'cifra', totalS: 3790, huecoS: -110 }, ctx)).toMatchObject({ valor: '63:10', frase: 'Vas 1:50 por delante de tu objetivo', marca: 'ok', valorEsCifra: true });
    expect(textoPredicho({ tipo: 'cifra', totalS: 3702, huecoS: 42 }, ctx)).toMatchObject({ frase: 'Te faltan 0:42 para tu objetivo', marca: 'aviso' });
    expect(textoPredicho({ tipo: 'cifra', totalS: 3900, huecoS: 0 }, ctx)).toMatchObject({ frase: 'Justo en tu objetivo', marca: null });
    expect(textoPredicho({ tipo: 'cifra', totalS: 3900, huecoS: null }, ctx).frase).toBeNull();
  });
  it('parcial: SIN cifra, con la regleta y lo que falta por su nombre', () => {
    const t = textoPredicho({ tipo: 'parcial', medidos: 8, de: 10, faltan: ['Carrera · 8 km', 'RoxZone'] }, ctx);
    expect(t.valor).toBe('Aún sin cifra');
    expect(t.valorEsCifra).toBe(false);
    expect(t.regleta).toEqual({ n: 8, de: 10 });
    expect(t.frase).toBe('8 de 10 tramos medidos. Te faltan Carrera · 8 km y RoxZone.');
    expect(textoPredicho({ tipo: 'parcial', medidos: 9, de: 10, faltan: ['Wall ball'] }, ctx).frase).toContain('Te falta Wall ball');
  });
  it('en dobles el predicho lleva a la pareja; sin pareja, la salida', () => {
    const dobles = { ...ctx, formato: 'doubles' as const };
    expect(textoPredicho({ tipo: 'cifra', totalS: 3702, huecoS: 42, pareja: 'Aina' }, dobles).etiqueta).toBe('Predicho hoy · con Aina');
    expect(textoPredicho({ tipo: 'sin-pareja' }, dobles).frase).toContain('pareja conectada');
  });
  it('cada hueco declara su porqué y no lleva cifra', () => {
    for (const p of [{ tipo: 'sin-datos' }, { tipo: 'sin-meta' }, { tipo: 'sin-pareja' }, { tipo: 'error' }, { tipo: 'no-aplica' }] as const) {
      const t = textoPredicho(p, ctx);
      expect(t.valorEsCifra).toBe(false);
      expect(t.frase).toBeTruthy();
    }
    expect(textoPredicho({ tipo: 'cargando' }, ctx).esqueleto).toBe(true);
    expect(textoPredicho({ tipo: 'error' }, ctx).reintentar).toBe(true);
  });
  it('sin ser el principal o sin ser HYROX, el predicho dice por qué no hay', () => {
    expect(textoPredicho({ tipo: 'no-aplica' }, { ...ctx, principal: false }).frase).toContain('objetivo principal');
    expect(textoPredicho({ tipo: 'no-aplica' }, { ...ctx, tipoEvento: 'other' }).frase).toContain('solo de HYROX');
  });
  it('la cuenta atrás: cifra y unidad, «Hoy» sin unidad, nada sin fecha', () => {
    expect(textoCuenta(39)).toEqual({ cifra: '39', unidad: 'días' });
    expect(textoCuenta(1)).toEqual({ cifra: '1', unidad: 'día' });
    expect(textoCuenta(0)).toEqual({ cifra: 'Hoy', unidad: null });
    expect(textoCuenta(null)).toBeNull();
  });
});

describe('las hojas de entrada', () => {
  it('la búsqueda por nombre: trozos sin mirar acentos; «zzz» nada; «error» falla', () => {
    expect(buscarCandidatos('marc')).toMatchObject({ tipo: 'ok' });
    expect(buscarCandidatos('marc vila soler')).toMatchObject({ tipo: 'ok', candidatos: [{ slug: 'marc-vila-soler' }] });
    expect(buscarCandidatos('vila')).toMatchObject({ tipo: 'ok' });
    expect(buscarCandidatos('zzz')).toEqual({ tipo: 'vacio' });
    expect(buscarCandidatos('error')).toEqual({ tipo: 'error' });
    expect(buscarCandidatos('m')).toEqual({ tipo: 'vacio' });
  });
  it('el enlace: solo https y el host de resultados de HYROX', () => {
    expect(pareceEnlaceHyrox('https://results.hyrox.com/season-8/athlete?idp=1')).toBe(true);
    expect(pareceEnlaceHyrox('http://results.hyrox.com/x')).toBe(false);
    expect(pareceEnlaceHyrox('https://ejemplo.com/results.hyrox.com')).toBe(false);
    expect(pareceEnlaceHyrox('results.hyrox.com')).toBe(false);
    expect(pareceEnlaceHyrox('')).toBe(false);
  });
  it('el calendario: filtra por texto, familia y ventana, por día y con lo provisional al final', () => {
    const todo = eventosVisibles(CALENDARIO, { consulta: '', familia: null, meses: null });
    expect(todo).toHaveLength(CALENDARIO.length);
    expect(todo[todo.length - 1].fecha).toBeNull();
    expect(eventosVisibles(CALENDARIO, { consulta: 'girona', familia: null, meses: null }).map((e) => e.nombre)).toEqual(['HYROX Girona']);
    expect(eventosVisibles(CALENDARIO, { consulta: '', familia: 'running', meses: null }).map((e) => e.id)).toEqual(['e7']);
    // Tres meses: lo próximo y lo sin fecha (no se puede descartar lo que no se sabe), no lo lejano.
    const cerca = eventosVisibles(CALENDARIO, { consulta: '', familia: null, meses: 3 });
    expect(cerca.every((e) => e.fecha == null || e.fecha <= '2027-01-01')).toBe(true);
    expect(cerca.some((e) => e.nombre === 'HYROX Lisboa')).toBe(false);
    expect(cerca.some((e) => e.fecha == null)).toBe(true);
  });
  it('los peldaños de la meta son minutos redondos y se dicen «Sub-N»', () => {
    for (const p of PELDANOS_META) {
      expect(p.segundos % 60).toBe(0);
      expect(metaTexto(p.segundos)).toBe(p.titulo);
    }
  });
  it('las cabeceras del calendario y del eje de la evolución', () => {
    expect(mesLargo('2026-11-07')).toBe('Noviembre 2026');
    expect(mesAnio('2025-11-02')).toBe('nov 25');
  });
});
