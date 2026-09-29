// EL EXAMEN DE «GARMIN · ANTES DE LA SESIÓN» (docs/garmin-reloj/modelo.md §3, §5, §6, §7).
//
// Cada escenario de la familia enseña varias pantallas y, en cada una, el reloj lee
// cosas distintas (GPS que busca o fija, pulso que asienta o falta, móvil que está o
// no, entorno que cambia con UP/DOWN). Todas las combinaciones que un escenario puede
// llegar a enseñar se miden en los CUATRO relojes (454, 390, 260 y 218): la línea cabe
// en la cuerda del círculo, nada baja del 6,2 % de D, el héroe (cuando lo hay) está en
// 0,20–0,26 D, nada se pisa y las cifras las sabe pintar la bitmap.
// Y además: los BOTONES (la carcasa de cada escenario, renderizada de verdad, ofrece lo
// que dice §5), los AVISOS (lo que suena, suena como dice §6, y nada más) y el DOMINIO
// (la estructura es la del coach y no se pierde en silencio, el pulso ausente es «—»,
// sin detalle no hay Empezar, la batería dice los dos hechos, el código de vínculo se
// lee en dos grupos, la sesión interrumpida no promete lo que Garmin no da).
// `comprobar` es la de `kit-garmin-caras.test.ts` y `kit-garmin-correr.test.ts`,
// copiada (allí es local): con tres familias copiándola toca subirla a un helper de tests.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  BOTONES_TABLA,
  FILA_MODELO,
  MANDOS,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  disponerCuenta,
  esAviso,
  fmtPulsos,
  fmtTono,
  type Disposicion,
  type EstadoMandos,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { hoyDe } from '@/components/design-twin/kit-reloj';
import { Screen, escenarios, meta } from '@/components/design-twin/screens/garmin-antes';
import { avisoDelBrief, disponerBrief } from '@/components/design-twin/screens/garmin-antes/brief';
import { carasDeEscena } from '@/components/design-twin/screens/garmin-antes/caras';
import { PPM_EN_REPOSO, SISTEMA_LISTO, escenaDe } from '@/components/design-twin/screens/garmin-antes/casos';
import { completitudDelRescate, opcionesDeAjustes } from '@/components/design-twin/screens/garmin-antes/contenido';
import {
  AJUSTES_DEFECTO,
  agruparCodigo,
  avisosPrevios,
  bateriaNecesaria,
  entornoEfectivo,
  entornoElegible,
  necesitaGps,
  puedeEmpezar,
  usaPulso,
  vistaDeHoy,
} from '@/components/design-twin/screens/garmin-antes/estado';
import { bloquesDelBrief, duracionDelBrief, partesDelResumen } from '@/components/design-twin/screens/garmin-antes/estructura';
import { disponerGlance, disponerLista, disponerSinDetalle, filasDeLista, glanceDe } from '@/components/design-twin/screens/garmin-antes/faces';
import { ESTADO_DE_PANTALLA, EVENTOS_DE_ANTES, mandoDePantalla, type Pantalla } from '@/components/design-twin/screens/garmin-antes/pantallas';
import { disponerPrevio, textoDePrevio } from '@/components/design-twin/screens/garmin-antes/previo';
import {
  OPCIONES_INTERRUMPIDA,
  TEXTO_INTERRUMPIDA,
  TEXTO_VINCULAR,
  disponerInterrumpida,
  disponerVincular,
  lineasDeCodigo,
} from '@/components/design-twin/screens/garmin-antes/vinculo';
import {
  sesion479Brief,
  sesion491Brief,
  sesion493,
  sesion494Brief,
  sesion529,
  sesion535Brief,
  sesionSeisPorMil,
} from '@/components/design-twin/screens/reloj-antes-despues/sesiones';
import { FICHEROS, fuente } from './garmin-antes-fuente';
import { normal, tablaDe } from './garmin-modelo';

/** Tolerancia de medida: medio píxel. */
const PX = 0.5;

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
    if (h.cara === 'cifras') for (const ch of h.texto) expect(SUBCONJUNTO_CIFRAS, donde).toContain(ch);
    cajas.push([h.y, h.y + h.alto, donde]);
  }
  if (d.pista) cajas.push([d.pista.y, d.pista.y + d.pista.alto, `${que} · pista a ${d.D}`]);
  cajas.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < cajas.length; k++) {
    expect(cajas[k]![0], `${cajas[k]![2]} pisa a ${cajas[k - 1]![2]}`).toBeGreaterThanOrEqual(cajas[k - 1]![1] - PX);
  }
}

const IDS = escenarios.map((e) => e.id);

describe('cada escenario, cada cara que puede enseñar, cabe en los cuatro relojes', () => {
  for (const id of IDS) {
    it(id, () => {
      const escena = escenaDe(id);
      for (const { D } of TAMANOS) for (const c of carasDeEscena(escena, D)) comprobar(c.d, `${id} · ${c.que}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Los botones: la carcasa de cada escenario ofrece lo que dice §5
// ---------------------------------------------------------------------------

const TABLA_MANDOS = tablaDe('## 5. Interacción');

/** Lo que el botón anuncia en la carcasa: su `aria-label` («START/STOP · Empezar»). */
function botonesDe(html: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [, nombre, rotulo] of html.matchAll(/aria-label="(START\/STOP|BACK\/LAP|UP|DOWN|LIGHT)(?: · ([^"]*))?"/g)) r[nombre!] = rotulo ?? '';
  return r;
}

/** Escenarios que pintan un reloj con carcasa y botones (no las comparaciones). */
const CON_CARCASA = IDS.filter((id) => !id.startsWith('tamanos-') && id !== 'glance-estados');

describe('los botones de la familia son los de §5', () => {
  for (const id of CON_CARCASA) {
    it(`${id}: la carcasa ofrece la fila de §5 de su pantalla de arranque`, () => {
      const estado: EstadoMandos = ESTADO_DE_PANTALLA[escenaDe(id).arranque.p];
      const html = renderToStaticMarkup(createElement(Screen, { orientation: 'portrait', appearance: 'dark', escenario: id, vista: 'propuesta', onLog: () => {} }));
      const b = botonesDe(html);
      // La fila de §5, con lo que la pantalla afina: una tecla que no hace nada ahí no se rotula (`teclasDe`).
      const { arranque, hoy } = escenaDe(id);
      const elegible = arranque.p === 'brief' && entornoElegible(hoy.sesiones[arranque.k]!.sesion);
      const rotulo = (boton: 'start' | 'back' | 'up' | 'down') => mandoDePantalla(arranque, elegible, boton, MANDOS[estado][boton])?.rotulo ?? '';
      expect(b['START/STOP'], `${id} · START`).toBe(rotulo('start'));
      expect(b['BACK/LAP'], `${id} · BACK/LAP`).toBe(rotulo('back'));
      expect(b['UP'], `${id} · UP`).toBe(rotulo('up'));
      expect(b['DOWN'], `${id} · DOWN`).toBe(rotulo('down'));
      expect(b['LIGHT'], `${id} · LIGHT`).toBe('Luz');
    });
  }

  it('las filas de §5 que usa la familia son las del documento: Brief, Lista del día, Controles, Cuenta atrás y Resumen', () => {
    const porNombre = new Map(Object.entries(FILA_MODELO).map(([est, nombre]) => [nombre, est as EstadoMandos]));
    const usados = new Set(Object.values(ESTADO_DE_PANTALLA).filter((x) => x !== 'paso'));
    for (const estado of usados) {
      const fila = TABLA_MANDOS.find((f) => porNombre.get(f[0]!) === estado)!;
      BOTONES_TABLA.forEach((b, k) => {
        const celda = normal(fila[k + 1]!);
        const mando = MANDOS[estado][b];
        if (celda === '—') expect(mando, `${estado} · ${b}`).toBeNull();
        else expect(mando?.dice, `${estado} · ${b}`).toBe(celda);
      });
    }
    // La fila Brief, con lo que la familia hace con ella.
    expect(MANDOS.brief.start?.accion).toBe('empezar');
    expect(MANDOS.brief.back?.accion).toBe('salir');
    expect(MANDOS.brief.up?.accion).toBe('cambiar-entorno');
    expect(MANDOS.brief.down?.accion).toBe('estructura-completa');
    expect(MANDOS.brief.upLargo?.accion).toBe('ajustes');
    expect(MANDOS['lista-del-dia'].up?.accion).toBe('sesion-anterior');
    expect(MANDOS['lista-del-dia'].down?.accion).toBe('sesion-siguiente');
    expect(MANDOS.cuenta.start?.accion).toBe('cancelar');
    expect(MANDOS.cuenta.back?.accion).toBe('cancelar');
  });

  it('los menús (Ajustes, sesión interrumpida) usan «Controles»; la cuenta atrás, la suya; las listas de elegir, «Lista del día»; todo lo demás, «Brief»', () => {
    expect(ESTADO_DE_PANTALLA.ajustes).toBe('controles');
    expect(ESTADO_DE_PANTALLA.interrumpida).toBe('controles');
    expect(ESTADO_DE_PANTALLA.cuenta).toBe('cuenta');
    for (const p of ['lista', 'libre'] as const) expect(ESTADO_DE_PANTALLA[p], p).toBe('lista-del-dia');
    for (const p of ['glance', 'brief', 'estructura', 'previo', 'espera', 'no-toca', 'sin-plan', 'sin-detalle', 'vincular'] as const) expect(ESTADO_DE_PANTALLA[p], p).toBe('brief');
  });

  it('una tecla que no hace nada no se rotula: un glance no «Empieza», una espera de GPS no cambia de entorno, y un plan que fija el entorno no ofrece UP', () => {
    const rotulo = (p: Pantalla, b: 'start' | 'back' | 'up' | 'down' | 'upLargo', elegible = false) => mandoDePantalla(p, elegible, b, MANDOS[ESTADO_DE_PANTALLA[p.p]][b])?.rotulo ?? null;
    const glance: Pantalla = { p: 'glance' };
    expect([rotulo(glance, 'start'), rotulo(glance, 'back'), rotulo(glance, 'up'), rotulo(glance, 'down'), rotulo(glance, 'upLargo')]).toEqual(['Abrir', 'Salir', null, null, null]);
    const brief: Pantalla = { p: 'brief', k: 0 };
    expect(rotulo(brief, 'up', true)).toBe('Entorno');
    expect(rotulo(brief, 'up', false)).toBeNull();
    expect(rotulo(brief, 'down', false)).toBe('Estructura');
    const espera = { p: 'espera' } as Pantalla;
    expect([rotulo(espera, 'start'), rotulo(espera, 'up'), rotulo(espera, 'down')]).toEqual(['Sin GPS', null, null]);
    expect(rotulo({ p: 'sin-detalle' }, 'start')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Los avisos: solo los de §6, y suenan como dice §6
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

describe('los avisos de antes: GPS listo, el 3-2-1 y el GO, y ninguno más', () => {
  it('suenan como dice §6', () => {
    expect(suena('gps')).toEqual(dichoPor6('GPS listo'));
    expect(suena('cuenta')).toEqual(dichoPor6('3-2-1'));
    expect(suena('go')).toEqual(dichoPor6('Empieza trabajo'));
    const a = AVISOS.cuenta;
    expect(esAviso(a) && a.repite, 'una corta por segundo, tres veces').toBe(3);
  });

  it('el flujo no emite nada que no esté en la lista: las tarjetas de antes de salir no suenan', () => {
    const usados = new Set([...fuente('flujo.tsx').matchAll(/emitir\('([a-z-]+)'\)/g)].map((m) => m[1]!));
    expect(usados.size, 'el flujo emite algo').toBeGreaterThan(0);
    for (const e of usados) expect(EVENTOS_DE_ANTES as readonly string[], `«${e}»`).toContain(e);
    for (const e of EVENTOS_DE_ANTES) expect(esAviso(AVISOS[e]), e).toBe(true);
    expect(usados.has('bateria')).toBe(false);
    expect(usados.has('enlace')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El dominio de antes
// ---------------------------------------------------------------------------

const texto = (d: Disposicion, rol: string) => d.lineas.filter((l) => l.rol === rol).map((l) => l.piezas.map((p) => p.texto).join(' ')).join(' ');
const todo = (d: Disposicion) => d.lineas.map((l) => l.piezas.map((p) => p.texto).join(' ')).join(' | ');
/** El texto sin separadores ni espacios de más, para comparar un dato con lo que se pintó (una línea partida por « · » pierde el separador). */
const plano = (t: string) => t.replace(/[·|]/g, ' ').replace(/[\u00A0\s]+/g, ' ').trim();
/** Lo mismo para un dato del glance o de la lista: los textos del kit llevan espacios duros entre la cifra y su unidad. */
const sinDuros = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\u00A0/g, ' '));

const SESIONES = {
  '6x1000': sesionSeisPorMil(),
  '479': sesion479Brief(),
  '491': sesion491Brief(),
  '494': sesion494Brief(),
  '529': sesion529(),
  '535': sesion535Brief(),
  '493': sesion493(),
};
type Clave = keyof typeof SESIONES;

const datosBrief = (k: Clave, sis: Partial<typeof SISTEMA_LISTO> = {}, entorno = entornoEfectivo(SESIONES[k], null, 'calle')) => ({
  sesion: SESIONES[k],
  dia: 'Hoy',
  entorno,
  elegible: entornoElegible(SESIONES[k]),
  sistema: { ...SISTEMA_LISTO, ...sis },
  frescura: { tipo: 'al-dia' } as const,
});
const brief = (k: Clave, sis: Partial<typeof SISTEMA_LISTO>, D: number, entorno = entornoEfectivo(SESIONES[k], null, 'calle')) =>
  disponerBrief(datosBrief(k, sis, entorno), D).disposicion;

describe('la estructura del brief es la del coach y no se pierde en silencio', () => {
  for (const [nombre, s] of Object.entries(SESIONES)) {
    it(`${nombre}: en cada reloj, o está pintada entera o hay un resumen «N bloques · duración ↓»; el título siempre, y la duración UNA vez`, () => {
      const bloques = bloquesDelBrief(s.plan.pasos);
      for (const { D } of TAMANOS) {
        const b = disponerBrief(datosBrief(nombre as Clave), D);
        const e = b.estructura;
        expect(e.nivel, `${nombre} a ${D}`).not.toBe('apretado');
        expect(e.cabe, `${nombre} a ${D}`).toBe(true);
        expect(e.visibles.length + e.ocultos, `${nombre} a ${D}: nada se cae en silencio`).toBe(bloques.length);
        expect(e.visibles, `${nombre} a ${D}: el título`).toContain(bloques.findIndex((x) => x.peso === 'titulo'));
        const pintado = plano(b.disposicion.lineas.filter((l) => ['bloque', 'detalle', 'cue', 'resumen'].includes(l.rol)).map((l) => l.piezas.map((p) => p.texto).join(' ')).join(' '));
        // Cada bloque visible está entero: su línea y todo su detalle, tal como lo escribió el coach.
        for (const k of e.visibles) {
          expect(pintado, `${nombre} a ${D}: «${bloques[k]!.linea}»`).toContain(plano(bloques[k]!.linea));
          for (const parte of bloques[k]!.detalle?.split(' · ') ?? []) expect(pintado, `${nombre} a ${D}: «${parte}»`).toContain(plano(parte));
        }
        // La duración sale de `duracionHumana` y aparece UNA sola vez en el brief: arriba con todo a la vista, o en la línea del resumen.
        const duracion = duracionDelBrief(s.plan.pasos);
        const dicha = b.disposicion.lineas.filter((l) => ['contexto', 'resumen'].includes(l.rol)).map((l) => l.piezas.map((p) => p.texto).join(' ')).join(' ');
        expect(dicha.split(duracion).length - 1, `${nombre} a ${D}: la duración «${duracion}» una sola vez`).toBe(1);
        if (e.ocultos > 0) {
          expect(e.nivel).toBe('resumen');
          expect(plano(texto(b.disposicion, 'resumen')), `${nombre} a ${D}`).toBe(plano(partesDelResumen(bloques.length, duracion).join(' · ')));
          expect(e.visibles, `${nombre} a ${D}: solo el que manda`).toHaveLength(1);
        } else expect(texto(b.disposicion, 'resumen')).toBe('');
      }
    });
  }

  it('«6 × 1000 m a 3:45–3:55» con su «r 90″ trote» debajo, como lo escribió el coach (el ejemplo del modelo)', () => {
    const d = brief('6x1000', {}, 454);
    expect(plano(todo(d))).toContain('6 × 1000 m a 3:45–3:55');
    expect(plano(todo(d))).toContain('r 90″ trote');
    expect(plano(todo(d))).toContain('Hoy 55′');
  });

  it('el 479 no pierde el descanso ni la carga de los Wall Ball en ningún reloj, y el 494 conserva el cue del coach', () => {
    for (const { D } of TAMANOS) {
      const d479 = plano(todo(brief('479', {}, D)));
      expect(d479, `a ${D}`).toContain('r 2′30″ trote');
      expect(d479, `a ${D}`).toContain('9 kg');
      expect(plano(todo(brief('494', {}, D))), `a ${D}`).toContain('mirar el pulso');
    }
  });
});

describe('el brief dice solo lo que se sabe (G1, G7) y solo lo que hace falta', () => {
  it('un pulso que no llega se pinta «—», nunca un cero; con lectura, su valor', () => {
    for (const { D } of TAMANOS) {
      for (const pulso of [{ tipo: 'fijando' }, { tipo: 'ausente' }] as const) {
        const pie = texto(brief('479', { pulso }, D), 'pie');
        expect(pie, `${pulso.tipo} a ${D}`).toContain('—');
        expect(pie, `${pulso.tipo} a ${D}`).not.toMatch(/\b0\b/);
      }
      expect(texto(brief('479', { pulso: { tipo: 'ok', ppm: PPM_EN_REPOSO } }, D), 'pie')).toContain(String(PPM_EN_REPOSO));
      expect(texto(brief('479', { pulso: { tipo: 'ok', ppm: 188 } }, D), 'pie')).toContain('188');
    }
  });

  it('la acción es «START · Empezar», en naranja, una sola vez', () => {
    for (const { D } of TAMANOS) {
      const acciones = brief('479', {}, D).lineas.filter((l) => l.rol === 'accion');
      expect(acciones, `a ${D}`).toHaveLength(1);
      expect(acciones[0]!.piezas.map((p) => p.texto).join('')).toBe('START · Empezar');
      expect(acciones[0]!.piezas[0]!.tono).toBe('accion');
    }
  });

  it('el GPS se dice buscando o listo solo si hay GPS que esperar: nada en fuerza ni en cinta', () => {
    for (const { D } of TAMANOS) {
      expect(texto(brief('479', { gps: 'buscando' }, D), 'estado')).toContain('Buscando GPS');
      expect(texto(brief('479', { gps: 'listo' }, D), 'estado')).toContain('GPS listo');
      expect(todo(brief('529', { gps: 'buscando' }, D)), `fuerza a ${D}`).not.toMatch(/GPS|Calle|Cinta|Pista/);
      expect(texto(brief('529', { pulso: { tipo: 'fijando' } }, D), 'estado')).toBe('Fijando pulso');
      expect(texto(brief('529', {}, D), 'estado')).toBe('Listo');
      const cinta = brief('535', { gps: 'buscando' }, D);
      expect(texto(cinta, 'estado'), `cinta a ${D}`).toContain('sin GPS');
      expect(todo(cinta), `cinta a ${D}`).not.toMatch(/Buscando GPS|GPS listo/);
    }
  });

  it('cambiar el entorno con UP/DOWN cambia lo que hay que esperar: en cinta no hay GPS; en calle y pista, sí', () => {
    const s = SESIONES['479'];
    expect(entornoElegible(s)).toBe(true);
    for (const e of ['calle', 'cinta', 'pista'] as const) expect(necesitaGps(s, entornoEfectivo(s, e, 'calle'))).toBe(e !== 'cinta');
    for (const { D } of TAMANOS) expect(texto(brief('479', { gps: 'buscando' }, D, 'cinta'), 'estado')).toContain('Cinta');
  });

  it('la flecha de entorno solo sale si UP hace algo: no si la prescripción lo fija (494, 535, 6 × 1000), ni en fuerza', () => {
    expect(entornoElegible(SESIONES['479'])).toBe(true);
    expect(entornoElegible(SESIONES['491'])).toBe(true);
    for (const k of ['494', '535', '6x1000', '529'] as const) expect(entornoElegible(SESIONES[k]), k).toBe(false);
    expect(texto(brief('479', {}, 454), 'estado')).toContain('↑');
    for (const k of ['494', '535', '6x1000', '529'] as const) expect(texto(brief(k, {}, 454), 'estado'), k).not.toContain('↑');
    // La prescripción manda sobre lo elegido y sobre Ajustes; lo elegido, sobre Ajustes.
    expect(entornoEfectivo(SESIONES['535'], 'calle', 'pista')).toBe('cinta');
    expect(entornoEfectivo(SESIONES['479'], 'cinta', 'pista')).toBe('cinta');
    expect(entornoEfectivo(SESIONES['479'], null, 'pista')).toBe('pista');
    expect(entornoEfectivo(SESIONES['529'], 'cinta', 'pista')).toBeNull();
  });

  it('el móvil ausente no bloquea («se graba igual»); el plan viejo dice su edad y pide acercar el móvil, y sigue habiendo Empezar', () => {
    expect(avisoDelBrief({ tipo: 'al-dia' }, true)).toBeNull();
    expect(avisoDelBrief({ tipo: 'al-dia' }, false)?.texto).toBe('Se graba sin móvil');
    expect(avisoDelBrief({ tipo: 'viejo', dias: 3 }, false)?.texto).toBe('Plan de hace 3 días · acerca el móvil');
    expect(avisoDelBrief({ tipo: 'viejo', dias: 1 }, false)?.texto).toBe('Plan de ayer · acerca el móvil');
    for (const { D } of TAMANOS) {
      const d = disponerBrief({ ...datosBrief('494', { movil: false }), frescura: { tipo: 'viejo', dias: 3 } }, D).disposicion;
      expect(plano(texto(d, 'aviso')), `a ${D}`).toBe('Plan de hace 3 días acerca el móvil');
      expect(d.lineas.filter((l) => l.rol === 'accion'), 'el detalle está: sigue habiendo Empezar').toHaveLength(1);
    }
  });
});

describe('sin detalle no hay Empezar (DECISIONS 2026-09-28); sin plan y día libre llevan al entreno libre', () => {
  it('una sesión sin detalle no se puede empezar y su cara no ofrece START', () => {
    const e = escenaDe('sin-detalle');
    expect(vistaDeHoy(e.hoy)).toBe('sin-detalle');
    expect(puedeEmpezar(e.hoy.sesiones[0]!)).toBe(false);
    for (const { D } of TAMANOS) {
      const d = disponerSinDetalle('Tirada 80′', '80′', D);
      expect(todo(d), `a ${D}`).toContain('Falta la sesión en el reloj');
      expect(todo(d), `a ${D}`).toContain('acerca el móvil');
      expect(todo(d), `a ${D}`).not.toMatch(/START|Empezar/);
      expect(d.lineas.some((l) => l.rol === 'accion')).toBe(false);
    }
  });

  it('qué pantalla toca según lo que hay hoy, y el día libre y el sin plan ofrecen «START · Entreno libre»', () => {
    expect(vistaDeHoy(escenaDe('glance').hoy)).toBe('una');
    expect(vistaDeHoy(escenaDe('varias').hoy)).toBe('varias');
    expect(vistaDeHoy(escenaDe('no-toca').hoy)).toBe('no-toca');
    expect(vistaDeHoy(escenaDe('sin-plan').hoy)).toBe('sin-plan');
    expect(vistaDeHoy(escenaDe('plan-viejo').hoy)).toBe('una');
    for (const id of ['no-toca', 'sin-plan']) {
      for (const { D } of TAMANOS) {
        const d = carasDeEscena(escenaDe(id), D).find((c) => c.que === (id === 'no-toca' ? 'hoy no toca' : 'sin plan'))!.d;
        expect(texto(d, 'accion'), `${id} a ${D}`).toBe('START · Entreno libre');
      }
    }
  });
});

describe('el glance es una tarjeta mínima: «Hoy · duración» y el título', () => {
  it('lo que guarda para cada estado del día', () => {
    expect(sinDuros(glanceDe(escenaDe('glance').hoy))).toEqual({ etiqueta: ['Hoy', '55′'], linea: ['6 × 1000 m'], nota: null });
    expect(sinDuros(glanceDe(escenaDe('no-toca').hoy))).toEqual({ etiqueta: ['Hoy'], linea: ['Descanso'], nota: 'Mañana · 6 × 1000 m' });
    expect(glanceDe(escenaDe('sin-plan').hoy)).toEqual({ etiqueta: ['Hoy'], linea: ['Sin plan'], nota: 'acerca el móvil' });
    expect(glanceDe(escenaDe('plan-viejo').hoy).nota).toBe('Plan de hace 3 días');
    expect(glanceDe(escenaDe('sin-detalle').hoy).nota).toBe('Falta la sesión');
    const varias = glanceDe(escenaDe('varias-tarde').hoy);
    expect(sinDuros(varias.etiqueta), 'la franja de la que toca ahora').toEqual(['Hoy', 'Tarde']);
    expect(sinDuros(varias.linea), 'la que toca ahora: la de la tarde').toEqual(['4 × 8 Back Squat']);
  });

  it('cabe en los cuatro relojes con el marco naranja (START la abre), en tres líneas como mucho y sin héroe', () => {
    for (const id of ['glance', 'no-toca', 'sin-plan', 'plan-viejo', 'sin-detalle', 'varias', 'varias-tarde']) {
      for (const { D } of TAMANOS) {
        const d = disponerGlance(glanceDe(escenaDe(id).hoy), D);
        expect(d.marco, `${id} a ${D}`).toBeTruthy();
        expect(d.lineas.length, `${id} a ${D}`).toBeLessThanOrEqual(3);
        expect(d.heroe).toBeNull();
      }
    }
  });
});

describe('varias sesiones el mismo día: la lista', () => {
  it('cada sesión con su franja y si está hecha; la enfocada, con su marco', () => {
    const filas = filasDeLista(escenaDe('varias-tarde').hoy);
    expect(sinDuros(filas.map((f) => [f.franja, f.titulo, f.hecha]))).toEqual([
      ['manana', '6 × 1000 m', true],
      ['tarde', '4 × 8 Back Squat', false],
    ]);
    for (const { D } of TAMANOS) {
      for (const foco of [0, 1]) {
        const d = disponerLista(filas, foco, D);
        expect(d.marco, `foco ${foco} a ${D}`).toBeTruthy();
        expect(d.lineas.filter((l) => l.rol === `sesion:${foco}`)).toHaveLength(1);
        expect(d.lineas.find((l) => l.rol === 'sesion:0')!.piezas[0]!.glifo, `la de la mañana, hecha, a ${D}`).toBe('hecho');
        expect(d.lineas.find((l) => l.rol === 'sesion:1')!.piezas[0]!.glifo).toBe('pendiente');
      }
    }
  });
});

describe('G26 · lo que se dice antes de empezar', () => {
  it('la batería: los dos hechos, cuando la carga no da para la duración; lo que da, no avisa', () => {
    expect(bateriaNecesaria(80 * 60)).toBe(21);
    expect(avisosPrevios(SESIONES['494'], { ...SISTEMA_LISTO, bateriaPct: 14 })).toEqual(['bateria-baja']);
    expect(avisosPrevios(SESIONES['494'], { ...SISTEMA_LISTO, bateriaPct: 86 })).toEqual([]);
    // Más larga, más batería: la 494 (80′) pide más que la 6 × 1000 (55′).
    expect(bateriaNecesaria(80 * 60)).toBeGreaterThan(bateriaNecesaria(55 * 60));
    const t = textoDePrevio('bateria-baja', { bateriaPct: 14, duracion: hoyDe(SESIONES['494'].plan.pasos).dur });
    expect(t.heroe).toEqual({ texto: '14', unidad: '%' });
    expect(t.detalle).toBe('para 80′ de sesión');
    expect(t.sigue, 'no promete «no llegarás»: nadie ha medido el gasto (T12)').toBe('Puede no llegar al final');
  });

  it('el pulso ausente avisa solo si la sesión va a zona; se pinta «—», jamás un cero', () => {
    const sinPulso = { ...SISTEMA_LISTO, pulso: { tipo: 'ausente' } } as const;
    expect(usaPulso(SESIONES['479'].plan)).toBe(true);
    expect(usaPulso(SESIONES['494'].plan)).toBe(true);
    expect(usaPulso(SESIONES['6x1000'].plan)).toBe(false);
    expect(usaPulso(SESIONES['529'].plan)).toBe(false);
    expect(avisosPrevios(SESIONES['479'], sinPulso)).toEqual(['pulso-ausente']);
    expect(avisosPrevios(SESIONES['6x1000'], sinPulso), 'a ritmo no hace falta el pulso para juzgar').toEqual([]);
    expect(avisosPrevios(SESIONES['479'], { ...SISTEMA_LISTO, pulso: { tipo: 'fijando' } }), 'aún fijando no es ausente').toEqual([]);
    expect(textoDePrevio('pulso-ausente', { bateriaPct: 86, duracion: '55′' }).heroe).toEqual({ texto: '—' });
  });

  it('el móvil ausente no bloquea: no hay aviso previo que lo pare', () => {
    expect(avisosPrevios(SESIONES['479'], { ...SISTEMA_LISTO, movil: false })).toEqual([]);
  });

  it('cada tarjeta lleva su «START · Empezar» y su héroe (donde lo hay) en 0,20–0,26 D: es la tarjeta de sistema de la carrera', () => {
    for (const { D } of TAMANOS) {
      for (const a of ['bateria-baja', 'pulso-ausente', 'sin-movil'] as const) {
        const d = disponerPrevio(a, { bateriaPct: 14, duracion: '80′' }, D);
        expect(texto(d, 'accion'), `${a} a ${D}`).toBe('START · Empezar');
        if (a === 'sin-movil') expect(d.heroe).toBeNull();
        else expect(d.heroe, `${a} a ${D}`).toBeTruthy();
      }
    }
  });
});

describe('G06 · vincular: un código grande y legible, sin contraseñas', () => {
  it('el código se lee en dos grupos de tres, cada uno tan grande como pueda (≥ 0,20 D) en su línea', () => {
    expect(agruparCodigo('K7M4QX')).toBe('K7M 4QX');
    for (const { D } of TAMANOS) {
      const l = lineasDeCodigo('K7M4QX', D);
      expect(l.map((x) => x.piezas[0]!.texto)).toEqual(['K7M', '4QX']);
      for (const x of l) expect(x.piezas[0]!.cuerpo, `a ${D}`).toBeGreaterThanOrEqual(Math.round(TG.heroe.min * D));
      expect(l[0]!.piezas[0]!.cuerpo).toBe(l[1]!.piezas[0]!.cuerpo);
    }
  });

  it('dice dónde escribirlo y cuánto le queda; el caducado ofrece otro; el vinculado lleva su sello y no pinta título encima', () => {
    for (const { D } of TAMANOS) {
      const espera = disponerVincular({ tipo: 'espera', codigo: 'K7M4QX', restanteS: 582 }, D);
      expect(plano(todo(espera)), `a ${D}`).toContain('Escríbelo en la app del móvil');
      expect(plano(todo(espera)), `a ${D}`).toContain('caduca en 9:42');
      expect(todo(espera), 'el reloj nunca pide una contraseña ni un email').not.toMatch(/contraseña|email|correo/i);
      expect(texto(disponerVincular({ tipo: 'caducado' }, D), 'accion')).toBe(TEXTO_VINCULAR.otro);
      const hecho = disponerVincular({ tipo: 'vinculado' }, D);
      expect(hecho.sello, `a ${D}`).toBeTruthy();
      expect(hecho.lineas.some((l) => l.rol === 'contexto'), 'nada bajo el sello').toBe(false);
    }
  });
});

describe('G07 · sesión interrumpida: la verdad de la plataforma, en pantalla', () => {
  const r = escenaDe('interrumpida').rescate!;

  it('dice cuánto se grabó, dónde iba, que Garmin no puede reanudarla y que Seguir abre otra grabación', () => {
    for (const { D } of TAMANOS) {
      for (const foco of [0, 1]) {
        const d = disponerInterrumpida({ sesionT: r.control.sesionT, donde: 'Serie 4/6', foco }, D);
        const t = plano(todo(d));
        expect(t, `a ${D}`).toContain('31:58');
        expect(t, `a ${D}`).toContain('hasta Serie 4/6');
        for (const frase of TEXTO_INTERRUMPIDA.honesto) expect(t, `a ${D}`).toContain(plano(frase));
        expect(OPCIONES_INTERRUMPIDA.map((o) => o.texto)).toEqual(['Seguir', 'Guardar lo hecho']);
        expect(d.lineas.filter((l) => l.rol.startsWith('opcion:'))).toHaveLength(2);
        expect(d.marco, 'la enfocada lleva el marco de la acción').toBeTruthy();
      }
    }
  });

  it('«Guardar lo hecho» lo deja parcial, y lo dice lo hecho: 3 series de 6 y dónde se quedó', () => {
    const c = completitudDelRescate(r);
    expect(c.estado).toBe('parcial');
    expect(c.cuenta).toBe('3 de 6 series');
    expect(c.motivo).toBe('Terminaste en la serie 4 de 6');
  });
});

describe('Ajustes: lo mínimo que un atleta cambia en la muñeca, y nada de método', () => {
  it('solo el entorno por defecto (un valor editable, no una constante del reloj) y desvincular', () => {
    expect(AJUSTES_DEFECTO.entornoPorDefecto).toBe('calle');
    expect(opcionesDeAjustes(AJUSTES_DEFECTO).map((o) => o.id)).toEqual(['entorno', 'desvincular']);
    expect(opcionesDeAjustes({ entornoPorDefecto: 'cinta' })[0]!.texto).toBe('Entorno · Cinta');
  });
});

describe('la cuenta atrás al empezar: a qué entras', () => {
  it('3, 2, 1 y GO caben en los cuatro relojes con el primer paso de cada sesión', () => {
    for (const s of Object.values(SESIONES)) {
      for (const { D } of TAMANOS) for (const n of [3, 2, 1, 0]) comprobar(disponerCuenta(n, s.plan.pasos[0]!, D), `cuenta ${n}`);
    }
  });
});

// ---------------------------------------------------------------------------
// El código de la familia
// ---------------------------------------------------------------------------

describe('el código cumple las reglas del proyecto', () => {
  it('ficheros de menos de 500 líneas', () => {
    for (const f of FICHEROS) expect(fuente(f).split('\n').length, f).toBeLessThan(500);
  });

  it('ningún fontSize, ningún hex a mano y ningún nombre propio (método = dato, HARD RULE Nº0)', () => {
    for (const f of FICHEROS) {
      const codigo = fuente(f)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      // El estudio (rótulos y leyendas de la comparación) no es pantalla del reloj: puede llevar su tipo de `ESTUDIO`.
      expect(codigo.replace(/fontSize: ESTUDIO\.[a-zA-Z.]+/g, ''), f).not.toMatch(/fontSize/);
      expect(codigo, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(codigo, f).not.toMatch(/Pablo|Fabrik|Fahybrik|FAHYBRI|HYROX/i);
      expect(codigo, f).not.toContain('console.log');
    }
  });
});

describe('el inventario de escenarios', () => {
  it('ids únicos, y las comparaciones son las que empiezan por «tamanos-»', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const id of IDS) expect(Boolean(escenaDe(id).comparar), id).toBe(id.startsWith('tamanos-'));
    expect(escenaDe('glance-estados').estadosDeGlance).toHaveLength(6);
  });

  it('los guiones van en orden de tiempo, y lo que no se porta de la muñeca de Apple se dice en `enApp`', () => {
    for (const id of IDS) {
      const g = escenaDe(id).guion.map((x) => x.en);
      expect(g, id).toEqual([...g].sort((a, b) => a - b));
    }
    expect(meta.dispositivo).toBe('garmin');
    expect(meta.estado).toBe('propuesta');
    for (const palabra of ['Glance', 'Smart Stack', 'esfera', 'complicación', '¿Dónde corres?', 'doble toque', 'corona']) expect(meta.enApp, palabra).toContain(palabra);
  });

  it('cada escenario tiene su descripción, y están los de Apple que se portan', () => {
    for (const e of escenarios) expect(e.descripcion.length, e.id).toBeGreaterThan(40);
    const ids = new Set(IDS);
    for (const id of ['brief-479', 'brief-491', 'brief-494', 'brief-529', 'brief-cinta', 'empezar', 'entorno', 'no-toca']) expect(ids.has(id), id).toBe(true);
  });
});
