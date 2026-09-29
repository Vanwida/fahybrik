// EL EXAMEN DE «GARMIN · WOD Y ERGO» (docs/garmin-reloj/modelo.md §3, §5, §6, §11, §13).
//
// Cada paso de cada caso de la familia (EMOM, AMRAP con su campana, For Time, la
// carrera For Time, Tabata y el ergo sin lectura de la máquina) pasa por sus
// caras en los CUATRO relojes (454, 390, 260 y 218): cabe en la cuerda del
// círculo, nada baja del 6,2 % de D, el héroe queda en 0,20–0,26 D y es el que
// decide `heroeDeFamilia` (o `laminaDelPaso` si lo que se pinta es la cara del
// kit), nada se pisa y las cifras las sabe pintar la bitmap. Se mira cada paso
// de cada sesión y cada caso corrido segundo a segundo por el motor, con lo
// declarado (tareas hechas, rondas y reps) en varios estados.
// Y más: la HONESTIDAD del ergo (sin monitor no hay /500 vivo ni banda sin
// marca), la CARGA que no se pierde a 218, los BOTONES (la carcasa de cada
// escenario ofrece lo que dice §5 y lo que decide la familia) y los AVISOS (el
// motor emite lo que promete cada descripción; la campana suena como se dice).
// `comprobar` es la de `kit-garmin-caras.test.ts` y `kit-garmin-correr.test.ts`,
// copiada: con tres familias copiándola toca subirla a un helper de tests.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  BOTONES_TABLA,
  FILA_MODELO,
  MANDOS,
  MAX_PERFILES,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  componerAvisos,
  controlesPorDefecto,
  disponerCuenta,
  disponerDatos,
  disponerDescanso,
  disponerDeshacer,
  disponerEstructura,
  disponerKm,
  disponerPasoDe,
  disponerPausa,
  disponerRecupera,
  disponerVueltas,
  esAviso,
  eventosDeTransicion,
  fmtPulsos,
  fmtTono,
  perfilesDe,
  type Disposicion,
  type EstadoMandos,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { filasDeDatos, filasDeVueltas, textoFila } from '@/components/design-twin/kit-reloj/listas';
import { estructuraDe } from '@/components/design-twin/kit-reloj/estructura';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { heroeDeFamilia } from '@/components/design-twin/kit-reloj/metricas';
import type { PasoBase } from '@/components/design-twin/kit-reloj/paso';
import { fmtReloj } from '@/components/design-twin/kit-reloj/reglas';
import { avanzar, cerrar, cuentaDe, estadoInicial, lecturasDe, pasoVivo, type EstadoSecuencia } from '@/components/design-twin/kit-reloj/secuencia';
import { wodDe } from '@/components/design-twin/kit-reloj/tarea';
import { avisoDeCierre, sesionDe, vueltasDe } from '@/components/design-twin/kit-reloj/vivo';
import { Screen, escenarios } from '@/components/design-twin/screens/garmin-wod';
import { AVISO_CAMPANA, LINEA_CAMPANA, MELODIA_CAMPANA, emisionCampana, esCampana } from '@/components/design-twin/screens/garmin-wod/avisos';
import {
  acabadoDelTodo,
  disponerCaraWod,
  disponerCuentaWod,
  disponerFinalWod,
  disponerPuntuacion,
  hayCaraPropia,
  tieneCuentaPropia,
  tieneFinalPropio,
  textoCap,
} from '@/components/design-twin/screens/garmin-wod/caras';
import { casoGarminWod, type CasoGarminWod } from '@/components/design-twin/screens/garmin-wod/casos';
import {
  ESTADO_DE_MANDOS,
  MARCADOR_VACIO,
  QUE_HACE_BACK,
  controlesDeWod,
  dialDe,
  estadoWodInicial,
  marcadorDe,
  moverReps,
  porRondaDe,
  rondaHecha,
  textoPuntuacion,
  tipoDeMando,
  tiemposDeRonda,
  type EstadoWod,
  type Marcador,
  type TipoMando,
  type VistaWod,
} from '@/components/design-twin/screens/garmin-wod/estado';
import { estructuraDeWod } from '@/components/design-twin/screens/garmin-wod/estructura';
import { disponerSeries, paginasDe, ritmoDeducido } from '@/components/design-twin/screens/garmin-wod/paginas';
import { normal, tablaDe } from './garmin-modelo';

/** Tolerancia de medida: medio píxel. */
const PX = 0.5;
/** Cada cuántos segundos se mira un caso corrido, y hasta cuándo. */
const MIRA_CADA_S = 5;
const CORRE_HASTA_S = 130;

function comprobar(d: Disposicion, que: string) {
  const suelo = Math.ceil(TG.suelo * d.D);
  const cajas: Array<[number, number, string]> = [];
  for (const l of d.lineas) {
    const donde = `${que} · ${l.rol} «${l.piezas.map((p) => p.texto).join('')}» a ${d.D}`;
    expect(l.cabe, `${donde}: no cabe (${Math.round(l.ancho)} > ${l.anchoUtil})`).toBe(true);
    expect(l.ancho, donde).toBeLessThanOrEqual(l.anchoUtil + PX);
    expect(l.y, donde).toBeGreaterThanOrEqual(0);
    expect(l.y + l.alto, donde).toBeLessThanOrEqual(d.D);
    for (const p of l.piezas) {
      expect(p.cuerpo, `${donde}: bajo el suelo`).toBeGreaterThanOrEqual(suelo);
      if (p.cara === 'cifras') for (const ch of p.texto) expect(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
    }
    cajas.push([l.y, l.y + l.alto, donde]);
  }
  if (d.heroe) {
    const h = d.heroe;
    const donde = `${que} · héroe «${h.texto}» a ${d.D}`;
    expect(h.talla.cabe, donde).toBe(true);
    expect(h.talla.cuerpo, donde).toBeGreaterThanOrEqual(Math.round(TG.heroe.min * d.D));
    expect(h.talla.cuerpo, donde).toBeLessThanOrEqual(Math.round(TG.heroe.max * d.D));
    expect(h.talla.ancho, donde).toBeLessThanOrEqual(h.anchoUtil + PX);
    if (h.unidad) expect(h.talla.cuerpoUnidad, donde).toBeGreaterThanOrEqual(suelo);
    if (h.cara === 'cifras') for (const ch of h.texto) expect(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
    cajas.push([h.y, h.y + h.alto, donde]);
  }
  if (d.pista) cajas.push([d.pista.y, d.pista.y + d.pista.alto, `${que} · pista a ${d.D}`]);
  cajas.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < cajas.length; k++) {
    expect(cajas[k]![0], `${cajas[k]![2]} pisa a ${cajas[k - 1]![2]}`).toBeGreaterThanOrEqual(cajas[k - 1]![1] - PX);
  }
}

const textoDe = (d: Disposicion, rol: string) => d.lineas.filter((l) => l.rol === rol).map((l) => l.piezas.map((p) => p.texto).join('')).join(' ');
const todoElTexto = (d: Disposicion) => d.lineas.map((l) => l.piezas.map((p) => p.texto).join('')).join(' | ');

// ---------------------------------------------------------------------------
// Los casos
// ---------------------------------------------------------------------------

const IDS = escenarios.map((e) => e.id);
const CASOS: Array<[string, CasoGarminWod]> = IDS.map((id) => [id, casoGarminWod(id)]);

/** Una sesión, una vez: las que salen en varios escenarios (498, 505…) no se examinan repetidas. */
const firma = (pasos: PasoBase[]) => pasos.map((p) => `${p.clase}:${p.medida.tipo}:${p.medida.prescrito}:${p.posicion ? JSON.stringify(p.posicion) : ''}:${p.wod ? p.wod.formato : ''}`).join('|');
const SESIONES = new Map<string, CasoGarminWod>();
for (const [, c] of CASOS) SESIONES.set(firma(c.datos.plan.pasos), c);

/** Lo declarado en varios estados: nada, todas las tareas marcadas, y los AMRAP con rondas y reps sueltas o sin decir. */
function estadosDeWod(c: CasoGarminWod): EstadoWod[] {
  const { pasos } = c.datos.plan;
  const vacio: EstadoWod = { hechas: {}, marcadores: {} };
  const hechas: EstadoWod = { hechas: Object.fromEntries(pasos.filter((p) => wodDe(p)?.formato === 'emom').map((p) => [p.id, 22])), marcadores: {} };
  const marcadores = (m: Marcador): EstadoWod => ({ hechas: {}, marcadores: Object.fromEntries(pasos.filter((p) => wodDe(p)?.formato === 'amrap').map((p) => [p.id, m])) });
  const rondas = (n: number) => Array.from({ length: n }, (_, k) => 90 * (k + 1));
  return [vacio, hechas, marcadores({ cierres: rondas(4), reps: 14 }), marcadores({ cierres: rondas(4), reps: null }), marcadores({ cierres: rondas(12), reps: 0 }), marcadores({ cierres: [], reps: 3 })];
}

const vistaEn = (c: CasoGarminWod, s: EstadoSecuencia, wod: EstadoWod): VistaWod => {
  const { plan } = c.datos;
  const paso = pasoVivo(plan, s);
  return { paso, lecturas: lecturasDe(paso, s), plan, estado: s, wod, anterior: plan.pasos[s.i - 1] ?? null };
};

/** Lo que el héroe tiene que ser: lo que dice `heroeDeFamilia` con lo que sabe esa familia (el crono total, las rondas, la puntuación). */
function heroeEsperado(v: VistaWod): { texto: string; unidad?: string } {
  const w = wodDe(v.paso);
  const m = marcadorDe(v);
  if (w?.formato === 'puntuacion') return { texto: textoPuntuacion(dialDe(m), w.tareas.length > 1), unidad: w.tareas.length > 1 ? undefined : 'reps' };
  // Una carrera For Time pinta la cara de correr del kit: el héroe es el de la lámina (el crono total va en el contexto).
  if (w?.formato === 'fortime' && !w.tarea) {
    const h = laminaDelPaso(v.paso, v.lecturas, v.plan.zonas, v.plan.reglas).heroe;
    return { texto: h.texto, unidad: h.unidad };
  }
  const h = heroeDeFamilia(v.paso, v.lecturas, v.plan.zonas, { total: v.estado.sesionT, rondas: m.cierres.length });
  // «total» solo lo usa el For Time, «rondas» solo el AMRAP de varias tareas: el resto sale de P3.
  return { texto: h.texto, unidad: h.unidad };
}

/** Todo lo que pinta el reloj en un estado del motor y de lo declarado, a un tamaño. */
function carasDe(c: CasoGarminWod, s: EstadoSecuencia, wod: EstadoWod, D: number, que: string) {
  const { plan } = c.datos;
  const v = vistaEn(c, s, wod);
  const { paso: p, lecturas: l } = v;
  const propia = disponerCaraWod(v, D);
  expect(propia !== null, `${que}: ¿cara propia?`).toBe(hayCaraPropia(p));
  if (propia) {
    comprobar(propia, `${que} · cara`);
    const h = heroeEsperado(v);
    expect(propia.heroe?.texto, `${que} · héroe`).toBe(h.texto);
    expect(propia.heroe?.unidad, `${que} · unidad del héroe`).toBe(h.unidad);
  } else if (p.rol === 'recuperacion') comprobar(disponerRecupera(p, l, plan.zonas, D), `${que} · recupera`);
  else if (p.rol === 'descanso') comprobar(disponerDescanso(p, l, D), `${que} · descanso`);
  else comprobar(disponerPasoDe(p, l, plan.zonas, D, plan.reglas).disposicion, `${que} · paso del kit`);

  // El 3-2-1 y el GO: los de la familia si la tiene (con la tarea y su carga), si no los del kit.
  const n = cuentaDe(plan, s);
  if (n != null && p.siguiente) comprobar(tieneCuentaPropia(p.siguiente) ? disponerCuentaWod(n, p.siguiente, D) : disponerCuenta(n, p.siguiente, D), `${que} · 3-2-1`);
  if (s.goHasta > s.sesionT) comprobar(tieneCuentaPropia(p) ? disponerCuentaWod(0, p, D) : disponerCuenta(0, p, D), `${que} · GO`);
  comprobar(disponerPausa(s.sesionT, p, D), `${que} · pausa`);
  comprobar(disponerDeshacer(avisoDeCierre(p), D), `${que} · deshacer`);
  if (s.banner) comprobar(disponerKm(s.banner, D), `${que} · vuelta`);

  // Las páginas de UP/DOWN de la familia (Estructura, Minutos, Series, Datos).
  for (const pg of paginasDe(c.datos)) comprobar(pg.disponer(v, D), `${que} · página ${pg.id}`);
  // En un AMRAP (y en el resto, que no las usa por UP/DOWN) las tres páginas de Controles son del kit.
  comprobar(disponerDatos(filasDeDatos(sesionDe(s), l, p.entorno === 'cinta' ? 'cinta' : undefined), plan.zonas, D), `${que} · Datos del kit`);
  const { objetivo, enCurso } = vueltasDe({ paso: p, lecturas: l, estado: s });
  const { titulo, filas } = filasDeVueltas(s.vueltas, objetivo, enCurso ? 3 : 4);
  comprobar(disponerVueltas(titulo, filas, enCurso, D), `${que} · Vueltas del kit`);
  const estructura = estructuraDeWod(c.datos) ?? estructuraDe(plan.pasos);
  comprobar(disponerEstructura(estructura(s.i).map((f) => ({ ...textoFila(f), estado: f.estado })), D), `${que} · Estructura del kit`);

  // El final: el crono congelado o la puntuación, y el resto por el kit.
  if (tieneFinalPropio({ ...v, estado: { ...s, terminado: true, parciales: [...s.parciales, { i: plan.pasos.length - 1, segundos: 0, metros: null, ppm: null, hecho: null }] } })) {
    const fin = { ...v, estado: { ...s, terminado: true, parciales: [{ i: plan.pasos.length - 1, segundos: 0, metros: null, ppm: null, hecho: null }] } };
    comprobar(disponerFinalWod(fin, D), `${que} · final`);
  }
}

/** Los momentos de un paso que se miran: al empezar, a la mitad y al final. */
function momentos(p: PasoBase): Array<{ t: number; metros?: number }> {
  const pr = p.medida.prescrito ?? 60;
  if (p.medida.tipo === 'distancia') return [{ t: 1 }, { t: 60, metros: pr / 2 }, { t: 200, metros: Math.max(0, pr - 30) }];
  if (p.medida.tipo === 'tiempo') return [{ t: 0 }, { t: Math.floor(pr / 2) }, { t: Math.max(0, pr - 2) }];
  return [{ t: 0 }, { t: 30 }];
}

describe('cada paso de cada sesión del WOD cabe en los cuatro relojes', () => {
  for (const [, c] of SESIONES) {
    const { plan } = c.datos;
    it(`${c.datos.titulo} · ${plan.pasos.length} pasos`, () => {
      for (const wod of estadosDeWod(c)) {
        plan.pasos.forEach((base, i) => {
          for (const m of momentos(base)) {
            const s = estadoInicial(plan, c.sim, { i, t: m.t, metros: m.metros, sesionT: 900 + m.t });
            for (const { D } of TAMANOS) carasDe(c, s, wod, D, `${c.datos.titulo} paso ${i} (${base.clase}) t=${m.t} a ${D}`);
          }
        });
      }
    });
  }

  it('el crono total de un For Time cabe también pasada la hora (1:02:05) y con el cap pasado', () => {
    const c = casoGarminWod('fortime');
    for (const sesionT of [59, 600, 3725, 7199]) {
      const s = estadoInicial(c.datos.plan, c.sim, { i: 6, t: 30, sesionT });
      for (const { D } of TAMANOS) carasDe(c, s, { hechas: {}, marcadores: {} }, D, `for time ${sesionT}s a ${D}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Cada caso, corrido por el motor
// ---------------------------------------------------------------------------

interface Tic {
  t: number;
  estado: EstadoSecuencia;
  eventos: EventoGarmin[];
  transicion: Transicion;
}

/** El caso corrido `hasta` segundos: el estado de cada tic y los eventos de Garmin que emite (los mismos que oye el atleta). */
function correr(c: CasoGarminWod, hasta = CORRE_HASTA_S): Tic[] {
  const { plan } = c.datos;
  let estado = estadoInicial(plan, c.sim, c.inicio);
  const inicio: Transicion = { plan, antes: estado, despues: estado, quien: 'motor', eventos: [] };
  const tics: Tic[] = [{ t: 0, estado, eventos: [], transicion: inicio }];
  for (let t = 1; t <= hasta && !estado.terminado; t++) {
    const antes = estado;
    const r = avanzar(estado, plan, c.sim);
    estado = r.estado;
    const transicion: Transicion = { plan, antes, despues: estado, quien: 'motor', eventos: r.eventos };
    tics.push({ t, estado, eventos: eventosDeTransicion(transicion), transicion });
  }
  return tics;
}

describe('cada caso, segundo a segundo, cabe en los cuatro relojes', () => {
  for (const [id, c] of CASOS) {
    it(`${id}`, () => {
      const wod = estadoWodInicial(c.datos.plan, c.wod);
      for (const x of correr(c)) {
        if (x.t % MIRA_CADA_S !== 0 && x.eventos.length === 0 && !x.estado.banner) continue;
        for (const { D } of TAMANOS) carasDe(c, x.estado, wod, D, `${id} t=${x.t} a ${D}`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Lo que declara el atleta: rondas, reps, tareas
// ---------------------------------------------------------------------------

describe('el marcador del AMRAP: rondas y reps sin cero inventado', () => {
  const RONDA = 30;

  it('lo no dicho es «—», nunca 0: UP desde «—» dice 1; DOWN desde «—» dice 0 (lo que se dice, se dice)', () => {
    expect(MARCADOR_VACIO.reps).toBeNull();
    expect(textoPuntuacion(dialDe(MARCADOR_VACIO), true)).toBe('0+—');
    expect(moverReps(MARCADOR_VACIO, 1, RONDA, 10).reps).toBe(1);
    expect(moverReps(MARCADOR_VACIO, -1, RONDA, 10).reps).toBe(0);
  });

  it('las reps llevan a la ronda como en la corona (29 → 30 es una ronda más) y la devuelven al bajar', () => {
    const m: Marcador = { cierres: [100, 200], reps: 29 };
    const sube = moverReps(m, 1, RONDA, 250);
    expect(sube).toEqual({ cierres: [100, 200, 250], reps: 0 });
    expect(moverReps(sube, -1, RONDA, 260)).toEqual({ cierres: [100, 200], reps: 29 });
  });

  it('BACK/LAP cierra la ronda y las reps de la nueva quedan sin decir; los tiempos son las diferencias', () => {
    const m = rondaHecha({ cierres: [104, 213], reps: 7 }, 326);
    expect(m).toEqual({ cierres: [104, 213, 326], reps: null });
    expect(tiemposDeRonda(m)).toEqual([104, 109, 113]);
  });

  it('un movimiento solo no tiene ronda que llevar: las reps no saltan de ronda; la campana de un solo movimiento dice las reps', () => {
    const c = casoGarminWod('amrap-506');
    const ventana = c.datos.plan.pasos[1]!;
    expect(porRondaDe(ventana)).toBe(0);
    expect(moverReps({ cierres: [], reps: 999 }, 1, 0, 5)).toEqual({ cierres: [], reps: 1000 });
    expect(textoPuntuacion({ rondas: 0, reps: null }, false)).toBe('—');
    expect(textoPuntuacion({ rondas: 0, reps: 18 }, false)).toBe('18');
  });

  it('las reps por ronda salen de las tareas (12 + 10 + 8), no de un número escrito', () => {
    expect(porRondaDe(casoGarminWod('amrap-15').datos.plan.pasos[0]!)).toBe(30);
  });

  it('la campana lee el MISMO marcador que la ventana: lo contado en vivo ya es la puntuación', () => {
    const c = casoGarminWod('tamanos-campana');
    const s = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const v = vistaEn(c, s, estadoWodInicial(c.datos.plan, c.wod));
    for (const { D } of TAMANOS) {
      const d = disponerPuntuacion(v, D);
      expect(d.heroe?.texto).toBe('7+18');
      expect(textoDe(d, 'guardar')).toBe('BACK · guardar');
      expect(textoDe(d, 'desglose')).toContain('12 Wall Ball + 6 KB Swing');
    }
    const sinDecir = vistaEn(c, s, { hechas: {}, marcadores: { [c.datos.plan.pasos[0]!.id]: { cierres: [1, 2, 3, 4, 5, 6, 7], reps: null } } });
    for (const { D } of TAMANOS) {
      expect(disponerPuntuacion(sinDecir, D).heroe?.texto).toBe('7+—');
      expect(textoDe(disponerPuntuacion(sinDecir, D), 'desglose')).toBe('reps de la ronda 8');
    }
  });
});

// ---------------------------------------------------------------------------
// Honestidad y carga
// ---------------------------------------------------------------------------

describe('el ergo sin lectura de la máquina no pinta lo que nadie mide (G7, §13)', () => {
  const c = casoGarminWod('ergo-505');
  const { plan } = c.datos;
  const s = estadoInicial(plan, c.sim, c.inicio);
  const v = vistaEn(c, s, estadoWodInicial(plan, c.wod));

  it('ningún paso depende del monitor de la máquina y el cuerpo no da /500 ni metros', () => {
    for (const cc of [c, ...CASOS.map(([, x]) => x)]) {
      for (const p of cc.datos.plan.pasos) expect(p.medida.mide, `${cc.datos.titulo} · ${p.clase}`).not.toBe('ergo');
      cc.datos.plan.pasos.forEach((p, i) => {
        const l = cc.sim(p, i, 20, 300);
        expect([l.split500 ?? null, l.metros ?? null, l.vatios ?? null, l.cadencia ?? null, l.cal ?? null]).toEqual([null, null, null, null, null]);
      });
    }
  });

  it('el héroe es el CRONO del paso con «lo dices tú»; el objetivo, una instrucción sin banda ni marca', () => {
    for (const { D } of TAMANOS) {
      const d = disponerCaraWod(v, D)!;
      expect(d.heroe?.texto).toBe(fmtReloj(v.lecturas.t));
      expect(textoDe(d, 'etiqueta')).toBe('lo dices tú');
      expect(textoDe(d, 'instruccion')).toBe('a 2:05 /500');
      expect(d.pista, 'una banda sin marca sería un calibre roto').toBeNull();
      expect(todoElTexto(d)).not.toMatch(/PM5|FTMS|Bluetooth/);
    }
  });

  it('una distancia que solo dice el atleta la cierra el atleta: el motor no la cierra solo', () => {
    const paso = plan.pasos[4]!;
    expect(paso.cierre).toBe('atleta');
    expect(paso.medida.mide).toBe('atleta');
    const tics = correr(c, 120);
    expect(tics.every((x) => x.estado.i === 4), 'sigue en la serie 3 dos minutos después: nadie la cerró').toBe(true);
  });

  it('el /500 de una serie se DEDUCE del crono que cerró el atleta y de los metros prescritos', () => {
    expect(ritmoDeducido({ segundos: 60 }, plan.pasos[4])).toBe(120);
    expect(ritmoDeducido({ segundos: 62 }, plan.pasos[4])).toBe(124);
    // Una serie por tiempo (o sin metros) no da /500.
    expect(ritmoDeducido({ segundos: 120 }, casoGarminWod('ergo-530').datos.plan.pasos[0])).toBeNull();
  });

  it('la página Series enseña el /500 deducido contra el objetivo del coach, con el crono al lado', () => {
    const cierre = casoGarminWod('ergo-505-cierre');
    const s0 = estadoInicial(cierre.datos.plan, cierre.sim, cierre.inicio);
    const s1 = cerrar(s0, cierre.datos.plan, 'atleta').estado;
    const vs = vistaEn(cierre, s1, estadoWodInicial(cierre.datos.plan, cierre.wod));
    for (const { D } of TAMANOS) {
      const d = disponerSeries(vs, D);
      comprobar(d, `series a ${D}`);
      const filas = d.lineas.filter((l) => l.rol === 'vuelta').map((l) => l.piezas.map((p) => p.texto).join(' '));
      // Serie 3: cerrada a los 57 s = 250 m en 0:57 = 1:54 /500 (▲ rápido contra 2:05); 1 y 2, del historial (59 s y 62 s).
      expect(filas.join(' | '), `a ${D}`).toContain('1:54');
    }
    expect(s1.vueltas.at(-1)?.metros, 'el motor no inventó metros').toBeNull();
  });
});

describe('la tarea con su carga no la pierde ningún reloj', () => {
  it('«6 Bench Press · 60 kg» (EMOM 498) y «20 Wall Ball · 9 kg» (For Time) llevan su carga entera a 218', () => {
    for (const [id, i, carga] of [
      ['emom-alterno', 2, '60 kg'],
      ['fortime', 7, '9 kg'],
    ] as const) {
      const c = casoGarminWod(id);
      const s = estadoInicial(c.datos.plan, c.sim, { ...c.inicio, i, t: 10 });
      for (const { D } of TAMANOS) {
        const d = disponerCaraWod(vistaEn(c, s, estadoWodInicial(c.datos.plan, undefined)), D)!;
        expect(textoDe(d, 'tarea'), `${id} a ${D}`).toContain(carga);
      }
    }
  });

  it('la tarjeta del GO dice la tarea con su carga y dónde entras', () => {
    const c = casoGarminWod('emom-alterno');
    const bench = c.datos.plan.pasos[2]!;
    expect(tieneCuentaPropia(bench)).toBe(true);
    for (const { D } of TAMANOS) {
      const d = disponerCuentaWod(0, bench, D);
      expect(d.heroe?.texto).toBe('GO');
      expect(textoDe(d, 'tarea')).toContain('60 kg');
      expect(textoDe(d, 'contexto')).toContain('Minuto 3/12');
    }
  });
});

describe('el For Time: el crono total es la puntuación y el cap se lee como lo que queda', () => {
  const c = casoGarminWod('fortime');
  it('el héroe es el crono TOTAL de la sesión, no el del movimiento; el cap, en el contexto', () => {
    const s = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const v = vistaEn(c, s, estadoWodInicial(c.datos.plan, c.wod));
    for (const { D } of TAMANOS) {
      const d = disponerCaraWod(v, D)!;
      expect(d.heroe?.texto).toBe(fmtReloj(s.sesionT));
      expect(d.heroe?.texto).not.toBe(fmtReloj(s.t));
      expect(textoDe(d, 'contexto')).toContain('cap en 5:50');
    }
    expect(textoCap(1200, 1199)).toBe('cap en 0:01');
    expect(textoCap(1200, 1200)).toBe('cap pasado');
  });

  it('«Ronda 3/3 · cap en 5:50» no pierde ninguna de las dos partes ni a 218 (pasa a dos líneas)', () => {
    const s = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const d = disponerCaraWod(vistaEn(c, s, estadoWodInicial(c.datos.plan, c.wod)), 218)!;
    const ctx = d.lineas.filter((l) => l.rol === 'contexto');
    expect(ctx.length).toBe(2);
    expect(textoDe(d, 'contexto')).toBe('Ronda 3/3 cap en 5:50');
  });

  it('el último movimiento lo cierra BACK/LAP y congela el crono: «Tu tiempo»', () => {
    const f = casoGarminWod('fortime-final');
    const s0 = estadoInicial(f.datos.plan, f.sim, f.inicio);
    const s1 = cerrar(s0, f.datos.plan, 'atleta').estado;
    expect(s1.terminado).toBe(true);
    const v = vistaEn(f, s1, estadoWodInicial(f.datos.plan, f.wod));
    expect(acabadoDelTodo(v)).toBe(true);
    expect(tieneFinalPropio(v)).toBe(true);
    // Terminar desde Controles (sin cerrar el último paso) NO es «tu tiempo».
    expect(tieneFinalPropio(vistaEn(f, { ...s0, terminado: true }, estadoWodInicial(f.datos.plan, f.wod)))).toBe(false);
    for (const { D } of TAMANOS) {
      const d = disponerFinalWod(v, D);
      comprobar(d, `final a ${D}`);
      expect(d.heroe?.texto).toBe(fmtReloj(s1.sesionT));
      expect(textoDe(d, 'titulo')).toBe('Tu tiempo');
      expect(textoDe(d, 'resultado')).toContain('3 rondas');
    }
  });
});

describe('el Tabata: manda el reloj y no se estira', () => {
  const c = casoGarminWod('tabata');
  it('no hay «+30 s» en ningún control del Tabata (DECISIONS 28-09), y sí en un descanso que no es de reloj de pared', () => {
    const descanso = c.datos.plan.pasos[1]!;
    expect(descanso.rol).toBe('descanso');
    const seq = { paso: { ...descanso, siguiente: null }, plan: c.datos.plan, pausado: false } as unknown as Parameters<typeof controlesPorDefecto>[0];
    expect(controlesPorDefecto(seq, 'recupera')).toContain('mas30');
    expect(controlesDeWod(descanso, controlesPorDefecto(seq, 'recupera'), c.datos.plan.pasos)).not.toContain('mas30');
    const ergo = casoGarminWod('ergo-505').datos.plan;
    expect(controlesDeWod(ergo.pasos[5]!, ['pausa', 'mas30'], ergo.pasos)).toContain('mas30');
  });

  it('«Cambiar entorno» solo aparece si la sesión corre de verdad: no en un Tabata, un AMRAP, un For Time ni un ergo; sí en un EMOM con Run, un chipper con Run, el 5K y un calentamiento con Run', () => {
    const controles = ['pausa', 'saltar', 'entorno', 'terminar'] as const;
    const ofrece = (id: string) => {
      const { plan } = casoGarminWod(id).datos;
      return controlesDeWod(plan.pasos[0]!, [...controles], plan.pasos).includes('entorno');
    };
    for (const id of ['tabata', 'amrap-15', 'fortime', 'ergo-505', 'ergo-escalera', 'emom-alterno']) expect(ofrece(id), id).toBe(false);
    for (const id of ['emom-75', 'amrap-506', 'carrera-5k', 'ergo-530']) expect(ofrece(id), id).toBe(true);
  });

  it('una marca por ronda (8 glifos) y la palabra «trabajo» / «descanso» sobre el número, no un color', () => {
    const trabajo = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const descanso = estadoInicial(c.datos.plan, c.sim, { ...c.inicio, i: 7, t: 4 });
    for (const { D } of TAMANOS) {
      const dT = disponerCaraWod(vistaEn(c, trabajo, estadoWodInicial(c.datos.plan, undefined)), D)!;
      const dD = disponerCaraWod(vistaEn(c, descanso, estadoWodInicial(c.datos.plan, undefined)), D)!;
      const marcas = (d: Disposicion) => d.lineas.find((l) => l.rol === 'rondas')?.piezas.map((p) => p.glifo);
      // El caso arranca en la ronda 4 de 8 (paso 6): tres hechas, la de ahora y cuatro por venir; y en el descanso, cuatro hechas.
      expect(marcas(dT), `trabajo a ${D}`).toEqual(['hecho', 'hecho', 'hecho', 'ahora', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
      expect(marcas(dD), `descanso a ${D}`).toEqual(['hecho', 'hecho', 'hecho', 'hecho', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
      expect(textoDe(dT, 'etiqueta')).toBe('trabajo');
      expect(textoDe(dD, 'etiqueta')).toBe('descanso');
    }
  });
});

describe('las carreras: el kit, sin reinventar (P10)', () => {
  it('la ventana de correr de un EMOM y el paso de correr de un chipper pintan la cara del kit', () => {
    const emom = casoGarminWod('emom-75');
    const run = emom.datos.plan.pasos[emom.inicio.i]!;
    expect(hayCaraPropia(run)).toBe(false);
    const chipper = casoGarminWod('amrap-506');
    expect(hayCaraPropia(chipper.datos.plan.pasos[0]!)).toBe(false);
  });

  it('el 5K For Time lleva el crono total en el contexto y el héroe que decide la lámina', () => {
    const c = casoGarminWod('carrera-5k');
    const s = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const v = vistaEn(c, s, estadoWodInicial(c.datos.plan, undefined));
    for (const { D } of TAMANOS) {
      const d = disponerCaraWod(v, D)!;
      expect(textoDe(d, 'contexto'), `a ${D}`).toContain(`For Time ${fmtReloj(s.sesionT)}`);
      expect(d.heroe?.texto).toBe('1,06');
      expect(d.heroe?.unidad).toBe('km');
    }
  });
});

// ---------------------------------------------------------------------------
// Los avisos: lo que promete cada descripción, y cómo suena (§6)
// ---------------------------------------------------------------------------

const TABLA_AVISOS = tablaDe('## 6. Vocabulario de aviso');

function dichoPor6(inicio: string): { vibra: string; tono: string } {
  const f = TABLA_AVISOS.find((x) => normal(x[0]!).startsWith(inicio));
  if (!f) throw new Error(`§6 no tiene «${inicio}»`);
  return { vibra: normal(f[1]!), tono: normal(f[2]!) };
}

function suena(e: EventoGarmin) {
  const a = AVISOS[e];
  if (!esAviso(a)) throw new Error(`${e} no suena`);
  return { vibra: fmtPulsos(a), tono: fmtTono(a) };
}

/** Los tics (s desde el arranque del caso) en que sale cada evento. */
function cuando(c: CasoGarminWod, hasta = CORRE_HASTA_S): Map<EventoGarmin, number[]> {
  const m = new Map<EventoGarmin, number[]>();
  for (const x of correr(c, hasta)) for (const e of x.eventos) m.set(e, [...(m.get(e) ?? []), x.t]);
  return m;
}

describe('los avisos de cada caso salen, y suenan como dice §6', () => {
  it('emom-alterno: preaviso a 10 s del final de la ventana y GO al empezar la siguiente, sin 3-2-1 entre ventanas', () => {
    const ev = cuando(casoGarminWod('emom-alterno'), 45);
    expect(ev.get('preaviso')).toHaveLength(1);
    expect(ev.get('go')).toHaveLength(1);
    expect(ev.get('cuenta')).toBeUndefined();
    expect(ev.get('preaviso')![0]!).toBeLessThan(ev.get('go')![0]!);
    expect(suena('preaviso')).toEqual(dichoPor6('Preaviso'));
    expect(suena('go')).toEqual(dichoPor6('Empieza trabajo'));
  });

  it('amrap-campana: un preaviso y, al agotarse el tiempo, LA CAMPANA (una vez) en vez del «recupera» del motor', () => {
    const c = casoGarminWod('amrap-campana');
    const tics = correr(c, 20);
    const campanas = tics.filter((x) => esCampana(x.transicion));
    expect(campanas, 'una campana').toHaveLength(1);
    expect(campanas[0]!.t).toBe(11);
    // El motor la trata como «empieza recuperación»: es lo que la familia sustituye.
    expect(campanas[0]!.eventos).toContain('recupera');
    // El preaviso de los últimos 10 s suena una vez, antes de la campana.
    expect(tics.filter((x) => x.eventos.includes('preaviso'))).toHaveLength(1);
    // Solo la del MOTOR: si el atleta salta el AMRAP desde Controles no ha acabado el tiempo.
    expect(esCampana({ ...campanas[0]!.transicion, quien: 'atleta' })).toBe(false);
    // Al pasar por la puntuación de un chipper (506) también suena.
    const chipper = correr(casoGarminWod('amrap-506'), 20);
    expect(chipper.filter((x) => esCampana(x.transicion))).toHaveLength(1);
  });

  it('la campana: 3 largas y un tono propio de 3 notas, distinta de «sesión hecha» y de «sensor perdido» por su tono, y cabe en una llamada', () => {
    expect(fmtPulsos(AVISO_CAMPANA)).toBe('3 largas');
    expect(AVISO_CAMPANA.tono).toEqual({ melodia: MELODIA_CAMPANA });
    expect(MELODIA_CAMPANA).toHaveLength(3);
    expect(perfilesDe(AVISO_CAMPANA.pulsos).map((p) => p.intensidad)).toEqual([100, 0, 100, 0, 100]);
    expect(perfilesDe(AVISO_CAMPANA.pulsos).length).toBeLessThanOrEqual(MAX_PERFILES);
    for (const e of ['sesion', 'enlace'] as const) {
      const otra = AVISOS[e];
      expect(esAviso(otra) && fmtPulsos(otra), 'HUECO DEL MODELO: la vibración de la campana es la de «sesión hecha» y «sensor perdido»').toBe('3 largas');
      expect(esAviso(otra) && 'sistema' in otra.tono, 'pero su tono es de sistema, no una melodía').toBe(true);
    }
    // La prioridad la pone por encima de lo que puede coincidir en el mismo segundo.
    for (const a of Object.values(AVISOS).filter(esAviso)) expect(AVISO_CAMPANA.prioridad).toBeGreaterThan(a.prioridad);
    expect(emisionCampana(3).linea).toBe(LINEA_CAMPANA);
    expect(LINEA_CAMPANA).toContain('3 largas');
  });

  it('amrap-506: tras la campana, 3-2-1 al Run de 800 m y el GO (a pantalla entera del kit)', () => {
    const c = casoGarminWod('amrap-506');
    const ev = cuando(c, 40);
    expect(ev.get('cuenta')).toHaveLength(3);
    expect(ev.get('go')).toHaveLength(1);
  });

  it('tabata: sin preaviso en ventanas de 20″ ni 10″; del descanso al trabajo, el 3-2-1 y el GO', () => {
    const ev = cuando(casoGarminWod('tabata'), 30);
    expect(ev.get('preaviso')).toBeUndefined();
    expect(ev.get('cuenta')).toHaveLength(3);
    expect(ev.get('go')).toBeDefined();
    expect(ev.get('recupera')).toBeDefined();
  });

  it('ergo-escalera: al cambiar de tramo suena el GO pero no hay 3-2-1 (es seguido) y ningún «aprieta» por el pulso que llega tarde', () => {
    const ev = cuando(casoGarminWod('ergo-escalera'), 40);
    expect(ev.get('go')).toHaveLength(1);
    expect(ev.get('cuenta')).toBeUndefined();
    expect(ev.get('aprieta')).toBeUndefined();
  });

  it('ergo-514: el techo de pulso avisa UN «afloja» al pasarlo y nada por abajo', () => {
    const ev = cuando(casoGarminWod('ergo-514'), 40);
    expect(ev.get('afloja')).toHaveLength(1);
    expect(ev.get('aprieta')).toBeUndefined();
  });

  it('cerrar a mano una tarea o un movimiento es el acuse de BACK/LAP (1 muy corta + KEY)', () => {
    const c = casoGarminWod('fortime');
    const s = estadoInicial(c.datos.plan, c.sim, c.inicio);
    const r = cerrar(s, c.datos.plan, 'atleta');
    const t: Transicion = { plan: c.datos.plan, antes: s, despues: r.estado, quien: 'atleta', eventos: r.eventos };
    expect(eventosDeTransicion(t)).toContain('paso-a-mano');
    expect(componerAvisos(1, eventosDeTransicion(t)).acuse).toBe('paso-a-mano');
  });
});

// ---------------------------------------------------------------------------
// Los botones: lo que dice §5 y lo que decide la familia
// ---------------------------------------------------------------------------

const TABLA_MANDOS = tablaDe('## 5. Interacción');

/** Lo que el botón anuncia en la carcasa: su `aria-label` («BACK/LAP · Paso»). */
function botonesDe(html: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [, nombre, rotulo] of html.matchAll(/aria-label="(START\/STOP|BACK\/LAP|UP|DOWN|LIGHT)(?: · ([^"]*))?"/g)) r[nombre!] = rotulo ?? '';
  return r;
}

describe('los botones de la familia son los de §5', () => {
  it('cada fila de §5 que usa la familia dice en el documento lo que dice la tabla del código', () => {
    const porNombre = new Map(Object.entries(FILA_MODELO).map(([e, n]) => [n, e as EstadoMandos]));
    for (const estado of ['paso', 'deshacer', 'recupera', 'fuerza', 'amrap', 'pausa', 'controles'] as const) {
      const fila = TABLA_MANDOS.find((f) => porNombre.get(f[0]!) === estado)!;
      BOTONES_TABLA.forEach((b, k) => {
        const celda = normal(fila[k + 1]!);
        const mando = MANDOS[estado][b];
        if (celda === '—') expect(mando, `${estado} · ${b}`).toBeNull();
        else expect(mando?.dice, `${estado} · ${b}`).toBe(celda);
      });
    }
  });

  it('AMRAP / puntuación (§5): START pausa, BACK/LAP ronda hecha, UP reps +1, DOWN reps −1, UP largo Controles', () => {
    const f = MANDOS.amrap;
    expect(f.start?.accion).toBe('pausa');
    expect(f.back?.accion).toBe('ronda-hecha');
    expect(f.up?.accion).toBe('reps-mas');
    expect(f.down?.accion).toBe('reps-menos');
    expect(f.upLargo?.accion).toBe('controles');
    // En los Controles de un AMRAP están Datos, Vueltas y Estructura (aquí no hay UP/DOWN de página).
    expect(controlesPorDefecto({ paso: { rol: 'trabajo' }, plan: { pasos: [] } } as never, 'amrap').slice(1, 4)).toEqual(['datos', 'vueltas', 'estructura']);
  });

  it('un AMRAP siempre lleva Datos, Vueltas y Estructura en Controles, también en los 5 s de un deshacer (cuando el kit no los daría)', () => {
    const { plan } = casoGarminWod('amrap-15').datos;
    for (const i of [0, 1]) {
      const c = controlesDeWod(plan.pasos[i]!, ['pausa', 'saltar', 'terminar', 'descartar'], plan.pasos);
      expect(c.slice(0, 4), `paso ${i}`).toEqual(['pausa', 'datos', 'vueltas', 'estructura']);
      expect(c).not.toContain('entorno');
    }
    // Y solo el AMRAP: un EMOM no los mete en Controles (sus páginas van por UP/DOWN).
    const emom = casoGarminWod('emom-alterno').datos.plan;
    expect(controlesDeWod(emom.pasos[0]!, ['pausa', 'saltar'], emom.pasos)).toEqual(['pausa', 'saltar']);
  });

  it('cada tipo de paso del WOD elige una fila de §5 y dice qué hace BACK/LAP', () => {
    const esperado: Record<TipoMando, { fila: EstadoMandos | null; back: string; accion: string | null }> = {
      'emom-tarea': { fila: 'fuerza', back: 'tarea-hecha', accion: 'serie-hecha' },
      'emom-ventana': { fila: 'paso', back: 'nada', accion: 'siguiente-paso' },
      'amrap-rondas': { fila: 'amrap', back: 'ronda-hecha', accion: 'ronda-hecha' },
      'amrap-reps': { fila: 'amrap', back: 'nada', accion: 'ronda-hecha' },
      puntuacion: { fila: 'amrap', back: 'guardar', accion: 'ronda-hecha' },
      pared: { fila: null, back: 'nada', accion: null },
      kit: { fila: null, back: 'kit', accion: null },
    };
    for (const [tipo, e] of Object.entries(esperado) as Array<[TipoMando, (typeof esperado)[TipoMando]]>) {
      expect(ESTADO_DE_MANDOS[tipo], tipo).toBe(e.fila);
      expect(QUE_HACE_BACK[tipo], tipo).toBe(e.back);
      if (e.fila && e.accion) expect(MANDOS[e.fila].back?.accion, tipo).toBe(e.accion);
    }
  });

  it('las «ventanas que cierra el reloj» son las únicas donde BACK/LAP no hace nada: un BACK sudado no se salta una ventana', () => {
    const sinBack = (Object.keys(QUE_HACE_BACK) as TipoMando[]).filter((t) => QUE_HACE_BACK[t] === 'nada');
    expect(sinBack.sort()).toEqual(['amrap-reps', 'emom-ventana', 'pared']);
  });

  it('el estado de cada escenario en el vivo es el de su primer paso, y así lo dice la carcasa', () => {
    for (const [id, c] of CASOS) {
      if (c.comparar) continue;
      const { plan } = c.datos;
      const wod = estadoWodInicial(plan, c.wod);
      const paso = plan.pasos[c.inicio.i]!;
      const base: EstadoMandos = paso.rol === 'trabajo' ? 'paso' : 'recupera';
      const esperado = ESTADO_DE_MANDOS[tipoDeMando(paso, wod)] ?? base;
      const html = renderToStaticMarkup(createElement(Screen, { orientation: 'portrait', appearance: 'dark', escenario: id, vista: 'propuesta', onLog: () => {} }));
      const b = botonesDe(html);
      expect(b['START/STOP'], `${id} · START`).toBe(MANDOS[esperado].start!.rotulo);
      expect(b['BACK/LAP'], `${id} · BACK/LAP`).toBe(MANDOS[esperado].back!.rotulo);
      expect(b['UP'], `${id} · UP`).toBe(MANDOS[esperado].up!.rotulo);
      expect(b['DOWN'], `${id} · DOWN`).toBe(MANDOS[esperado].down!.rotulo);
      expect(b['LIGHT'], `${id} · LIGHT`).toBe('Luz');
    }
  });

  it('una tarea con dosis se marca; un minuto entero de remo, una ventana de correr o una ya marcada, no', () => {
    const c = casoGarminWod('emom-alterno');
    const [bench, row] = [c.datos.plan.pasos[2]!, c.datos.plan.pasos[3]!];
    const vacio: EstadoWod = { hechas: {}, marcadores: {} };
    expect(tipoDeMando(bench, vacio)).toBe('emom-tarea');
    expect(tipoDeMando(bench, { hechas: { [bench.id]: 22 }, marcadores: {} })).toBe('emom-ventana');
    expect(tipoDeMando(row, vacio)).toBe('emom-ventana');
    const c572 = casoGarminWod('emom-75');
    expect(tipoDeMando(c572.datos.plan.pasos[c572.inicio.i]!, vacio)).toBe('emom-ventana');
  });
});

// ---------------------------------------------------------------------------
// El inventario
// ---------------------------------------------------------------------------

describe('el inventario de escenarios', () => {
  it('cada escenario tiene caso y descripción, y los de motor quieto son solo las comparaciones', () => {
    for (const [id, c] of CASOS) {
      expect(c.datos.plan.pasos.length, id).toBeGreaterThan(0);
      expect(Boolean(c.comparar), id).toBe(id.startsWith('tamanos-'));
      expect(escenarios.find((e) => e.id === id)!.descripcion.length, `${id}: descripción`).toBeGreaterThan(80);
    }
  });

  it('los escenarios que la muñeca tenía y este no, están dichos con su motivo (nada se cae en silencio)', async () => {
    const { meta } = await import('@/components/design-twin/screens/garmin-wod');
    for (const cae of ['amrap-boton', 'ergo-505', 'PM5', 'doble toque']) expect(meta.enApp, cae).toContain(cae);
  });

  it('las páginas de UP/DOWN de cada formato salen del plan: un AMRAP y una carrera no las tienen (UP/DOWN son reps; el kit lleva las de correr)', () => {
    const paginas = (id: string) => paginasDe(casoGarminWod(id).datos).map((p) => p.id);
    expect(paginas('emom-alterno')).toEqual(['estructura', 'minutos', 'datos']);
    // 572 no tiene ninguna tarea que marcar (todo son minutos enteros): sin página de Minutos, que sería una lista de rayas.
    expect(paginas('emom-75')).toEqual(['estructura', 'datos']);
    expect(paginas('amrap-15')).toEqual([]);
    expect(paginas('carrera-5k')).toEqual([]);
    expect(paginas('fortime')).toEqual(['estructura', 'datos']);
    expect(paginas('ergo-505')).toEqual(['series', 'datos', 'estructura']);
    expect(paginas('ergo-530')).toEqual(['datos', 'estructura']);
    expect(paginas('tabata')).toEqual(['estructura', 'datos']);
  });
});
