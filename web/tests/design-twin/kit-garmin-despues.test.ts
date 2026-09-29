// EL EXAMEN DE «GARMIN · AL TERMINAR» (docs/garmin-reloj/modelo.md §3, §5, §6, §7 G27–G31, §11).
//
// Cada cara de después (la sesión completada en todas sus variantes, el RPE, cada
// página del resumen de cada sesión real y cada estado del envío) pasa por el
// kit en los CUATRO relojes (454, 390, 260 y 218): cabe en la cuerda del
// círculo, nada baja del 6,2 % de D, el héroe queda en 0,20–0,26 D y sale de la
// bitmap, nada se pisa (ni una barra de pulso ni un glifo con su texto) y las
// cifras las sabe pintar la bitmap.
// Y dos más: los BOTONES (cada pantalla de después responde con una acción de §5
// y no rotula lo que no hace nada; la carcasa de cada escenario, renderizada de
// verdad, dice lo mismo) y los AVISOS (el motor emite lo que promete cada
// descripción y suena como dice §6).
//
// `comprobar` es la de `kit-garmin-caras.test.ts`, ampliada con el sello, el
// glifo y las barras: con cuatro familias copiándola toca subirla a un helper.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  MANDOS,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  accionDe,
  anchoPieza,
  anchoUtilFila,
  componerAvisos,
  eventosDeTransicion,
  esAviso,
  fmtPulsos,
  fmtTono,
  type BotonGarmin,
  type EstadoMandos,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { METODO_RESUMEN_DEFECTO, RPE_PALABRA_DEFECTO, completitud } from '@/components/design-twin/kit-reloj';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { avanzar, cerrar, estadoInicial, lecturasDe, pasoVivo } from '@/components/design-twin/kit-reloj/secuencia';
import { Screen, escenarios } from '@/components/design-twin/screens/garmin-despues';
import { IDS_DE_CASOS, casoDespues, resultadoLibre, resultadoRecuperado, resultadoTerminado } from '@/components/design-twin/screens/garmin-despues/casos';
import { ALTO_NOTA, apilarTexto, type DisposicionFin } from '@/components/design-twin/screens/garmin-despues/comun';
import { ESTADOS_ENVIO, TEXTO_ENVIO, disponerEnvio, notaDeRpe, pideDecidir, type EstadoEnvio } from '@/components/design-twin/screens/garmin-despues/envio';
import { disponerFin, motivoDe, tituloFin, type DatosFin } from '@/components/design-twin/screens/garmin-despues/fin';
import { FILAS_POR_PAGINA, disponerLista, filasDePagina, repartoEnPaginas, type FilaLista } from '@/components/design-twin/screens/garmin-despues/lista';
import { mandoDe, type PantallaFin } from '@/components/design-twin/screens/garmin-despues/mandosFin';
import { paginasDeResumen } from '@/components/design-twin/screens/garmin-despues/paginas';
import { ZONAS_POR_PAGINA, disponerPulso, zonasUsadas } from '@/components/design-twin/screens/garmin-despues/pulso';
import { disponerEjercicio } from '@/components/design-twin/screens/garmin-despues/resumenFuerza';
import { disponerRpe, moverRpe } from '@/components/design-twin/screens/garmin-despues/rpe';
import { resultadoDeVivo } from '@/components/design-twin/screens/reloj-antes-despues/sellar';
import type { Resultado } from '@/components/design-twin/screens/reloj-antes-despues/calculo';
import { resultado479, resultado482, resultado493, resultado494, resultado529, resultado6x1000 } from '@/components/design-twin/screens/reloj-antes-despues/resultados';
import type { Familia } from '@/components/design-twin/screens/reloj-antes-despues/sesiones';
import { normal, tablaDe } from './garmin-modelo';

/** Tolerancia de medida: medio píxel. */
const PX = 0.5;

function comprobar(d: DisposicionFin, que: string) {
  const suelo = Math.ceil(TG.suelo * d.D);
  const cajas: Array<[number, number, string]> = [];
  for (const l of d.lineas) {
    const donde = `${que} · ${l.rol} «${l.piezas.map((p) => p.texto).join('')}» a ${d.D}`;
    expect.soft(l.cabe, `${donde}: no cabe (${Math.round(l.ancho)} > ${l.anchoUtil})`).toBe(true);
    expect.soft(l.ancho, donde).toBeLessThanOrEqual(l.anchoUtil + PX);
    expect.soft(l.y, donde).toBeGreaterThanOrEqual(0);
    expect.soft(l.y + l.alto, donde).toBeLessThanOrEqual(d.D);
    for (const p of l.piezas) {
      expect.soft(p.cuerpo, `${donde}: bajo el suelo`).toBeGreaterThanOrEqual(suelo);
      if (p.cara === 'cifras') for (const ch of p.texto) expect.soft(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
    }
    cajas.push([l.y, l.y + l.alto, donde]);
  }
  if (d.heroe) {
    const h = d.heroe;
    const donde = `${que} · héroe «${h.texto}» a ${d.D}`;
    expect.soft(h.cara, `${donde}: el número grande sale de la bitmap, no de la sans`).toBe('cifras');
    expect.soft(h.talla.cabe, donde).toBe(true);
    expect.soft(h.talla.cuerpo, donde).toBeGreaterThanOrEqual(Math.round(TG.heroe.min * d.D));
    expect.soft(h.talla.cuerpo, donde).toBeLessThanOrEqual(Math.round(TG.heroe.max * d.D));
    expect.soft(h.talla.ancho, donde).toBeLessThanOrEqual(h.anchoUtil + PX);
    if (h.unidad) expect.soft(h.talla.cuerpoUnidad, donde).toBeGreaterThanOrEqual(suelo);
    for (const ch of h.texto) expect.soft(SUBCONJUNTO_CIFRAS, donde).toContain(ch);
    cajas.push([h.y, h.y + h.alto, donde]);
  }
  if (d.pista) {
    expect.soft(d.pista.ancho, `${que} · pista a ${d.D}`).toBeGreaterThan(0);
    cajas.push([d.pista.y, d.pista.y + d.pista.alto, `${que} · pista a ${d.D}`]);
  }
  // El sello y el glifo: dentro de la cuerda de su altura y por encima de todo el texto.
  for (const g of [d.sello ? { y: d.sello.y, talla: d.sello.talla, n: 'sello' } : null, d.glifo ? { y: d.glifo.y, talla: d.glifo.talla, n: 'glifo' } : null]) {
    if (!g) continue;
    const arriba = g.y - g.talla / 2;
    const donde = `${que} · ${g.n} a ${d.D}`;
    expect.soft(g.talla, `${donde}: más ancho que la cuerda`).toBeLessThanOrEqual(anchoUtilFila(arriba / d.D, g.talla / d.D) * d.D + PX);
    cajas.push([arriba, g.y + g.talla / 2, donde]);
  }
  // Las barras de pulso: dentro de la cuerda y entre la etiqueta y el tiempo de su fila.
  const filas = d.lineas.filter((l) => l.rol === 'zona');
  expect.soft(d.barras?.length ?? 0, `${que} · una barra por zona a ${d.D}`).toBe(filas.length);
  (d.barras ?? []).forEach((b, k) => {
    const l = filas[k]!;
    const donde = `${que} · barra ${k} a ${d.D}`;
    expect.soft(b.alto, donde).toBeGreaterThanOrEqual(1);
    expect.soft(b.ancho, `${donde}: sin sitio entre la etiqueta y el tiempo`).toBeGreaterThan(0);
    expect.soft(b.llena, donde).toBeGreaterThanOrEqual(0);
    expect.soft(b.llena, donde).toBeLessThanOrEqual(1);
    const cuerda = anchoUtilFila(b.y / d.D, b.alto / d.D) * d.D;
    expect.soft(b.x, donde).toBeGreaterThanOrEqual((d.D - cuerda) / 2 - PX);
    expect.soft(b.x + b.ancho, donde).toBeLessThanOrEqual((d.D + cuerda) / 2 + PX);
    expect.soft(b.x, `${donde}: pisa la etiqueta`).toBeGreaterThanOrEqual((d.D - l.anchoUtil) / 2 + anchoPieza(l.piezas[0]!) - PX);
    expect.soft(b.x + b.ancho, `${donde}: pisa el tiempo`).toBeLessThanOrEqual((d.D + l.anchoUtil) / 2 - anchoPieza(l.piezas[1]!) + PX);
    expect.soft(b.y, donde).toBeGreaterThanOrEqual(l.y - PX);
    expect.soft(b.y + b.alto, donde).toBeLessThanOrEqual(l.y + l.alto + PX);
  });
  cajas.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < cajas.length; k++) {
    expect.soft(cajas[k]![0], `${cajas[k]![2]} pisa a ${cajas[k - 1]![2]}`).toBeGreaterThanOrEqual(cajas[k - 1]![1] - PX);
  }
}

const enTodos = (haz: (D: number) => DisposicionFin, que: string) => {
  for (const { D } of TAMANOS) comprobar(haz(D), que);
};

// ---------------------------------------------------------------------------
// Las sesiones del examen
// ---------------------------------------------------------------------------

/** Las sesiones reales de la muñeca, más las que solo tiene el Garmin, cada una con su familia. */
const R6 = { ...resultado6x1000(), rpe: 7 };
const SESIONES: Array<{ id: string; r: Resultado; familia: Familia }> = [
  { id: '6x1000', r: R6, familia: 'correr' },
  { id: '479', r: { ...resultado479(), rpe: 8 }, familia: 'correr' },
  { id: '494', r: { ...resultado494(), rpe: 5 }, familia: 'correr' },
  { id: '529', r: { ...resultado529(), rpe: 7 }, familia: 'fuerza' },
  { id: '493', r: { ...resultado493(), rpe: 9 }, familia: 'circuito' },
  { id: '482', r: { ...resultado482(), rpe: 8 }, familia: 'circuito' },
  { id: 'libre', r: { ...resultadoLibre(), rpe: 3 }, familia: 'libre' },
  { id: 'terminada', r: { ...resultadoTerminado(), rpe: 8 }, familia: 'correr' },
  { id: 'recuperada', r: { ...resultadoRecuperado(), rpe: null }, familia: 'correr' },
  { id: 'sin-rpe', r: { ...R6, rpe: null }, familia: 'correr' },
  { id: 'sin-pulso', r: { ...R6, ppmMedio: null, ppmMax: null, zonasS: [0, 0, 0, 0, 0] }, familia: 'correr' },
  // Una serie cortada a mano a 620 m: «La serie 3 se cortó en 620 m».
  { id: 'cortada', r: { ...R6, series: R6.series.map((s, k) => (k === 2 ? { ...s, metros: 620, segundos: 150, ritmo: 242, veredicto: null } : s)) }, familia: 'correr' },
];

const ENVIOS: Array<{ estado: EstadoEnvio; intentos: number }> = [...ESTADOS_ENVIO.map((estado) => ({ estado, intentos: 1 })), { estado: 'rechazado', intentos: 2 }];

// ---------------------------------------------------------------------------
// G27 · la sesión completada
// ---------------------------------------------------------------------------

describe('G27 · la sesión completada cabe en los cuatro relojes, en todas sus variantes', () => {
  const ejemplos: Array<[string, Resultado, Partial<DatosFin>]> = [
    ['completa, decide', R6, { natural: true, decide: true }],
    ['parcial por una serie cortada, decide', SESIONES.find((s) => s.id === 'cortada')!.r, { natural: true, decide: true }],
    ['terminada a mano', resultadoTerminado(), { natural: false, decide: false }],
    ['recuperada', resultadoRecuperado(), { natural: false, recuperada: true, decide: false }],
    ['libre', resultadoLibre(), { natural: true, decide: true }],
    ['con enfriamiento libre', R6, { natural: true, libreS: 252, decide: false }],
    ['guardada sola', R6, { natural: true, libreS: 252, solaTrasS: 600, decide: false }],
    ['terminada a mano con enfriamiento y sola', resultadoTerminado(), { natural: true, libreS: 3725, solaTrasS: 600, decide: false }],
    ['una hora y pico', { ...R6, t: 7325 }, { natural: true, decide: true }],
  ];
  for (const [nombre, r, extra] of ejemplos) {
    it(nombre, () => {
      const c = completitud(r);
      const d: DatosFin = { natural: true, t: r.t, metros: r.metros, c, libreS: 0, solaTrasS: null, decide: true, ...extra };
      enTodos((D) => disponerFin(d, D), `G27 ${nombre}`);
    });
  }

  it('lo decide lo hecho: completa / parcial / libre, y el motivo de una recuperada dice «Se cortó», no «Terminaste»', () => {
    expect(completitud(R6).estado).toBe('completa');
    expect(completitud(resultadoLibre()).estado).toBe('libre');
    const t = completitud(resultadoTerminado());
    expect([t.estado, t.cuenta, t.motivo]).toEqual(['parcial', '4 de 6 series', 'Terminaste en la serie 5 de 6']);
    const rec = completitud(resultadoRecuperado());
    expect(rec.estado).toBe('parcial');
    expect(motivoDe({ c: rec, recuperada: true })).toBe('Se cortó en la serie 4 de 6');
    expect(motivoDe({ c: rec, recuperada: false })).toBe('Terminaste en la serie 4 de 6');
    expect(motivoDe({ c: completitud(R6), recuperada: true })).toBeNull();
  });

  it('el título dice qué acabó', () => {
    expect(tituloFin({ natural: true })).toBe('Sesión completada');
    expect(tituloFin({ natural: false })).toBe('Sesión terminada');
    expect(tituloFin({ natural: false, recuperada: true })).toBe('Sesión recuperada');
  });

  it('lo grabado libre va en su propia línea y, si no cabe con lo demás, es lo primero que se pierde (ya está en el tiempo total)', () => {
    const roles = (d: DatosFin, D: number) => disponerFin(d, D).lineas.map((l) => l.rol);
    const base: DatosFin = { natural: true, t: 3570, metros: 11620, c: completitud(R6), libreS: 252, solaTrasS: null, decide: false };
    for (const { D } of TAMANOS) {
      const dicho = disponerFin(base, D).lineas.filter((l) => l.rol === 'libre').map((l) => l.piezas.map((p) => p.texto).join(''));
      expect(dicho, `a ${D}`).toEqual(['+ 4:12 libre']);
      // Con «Guardada sola» encima, la sesión de a 218 no da para las dos cosas: manda lo que explica por qué acabó sola.
      expect(roles({ ...base, solaTrasS: 600 }, D), `a ${D}`).toContain('sola');
    }
    expect(roles({ ...base, solaTrasS: 600 }, 218)).not.toContain('libre');
  });

  it('el héroe es el tiempo total de la sesión, y nunca dice dónde está guardada (eso es G31)', () => {
    for (const { D } of TAMANOS) {
      const d = disponerFin({ natural: true, t: 3318, metros: 11620, c: completitud(R6), libreS: 0, solaTrasS: null, decide: true }, D);
      expect(d.heroe?.texto).toBe('55:18');
      const texto = d.lineas.map((l) => l.piezas.map((p) => p.texto).join('')).join(' ');
      expect(texto).not.toMatch(/guardad|iphone|móvil|enviad/i);
    }
  });
});

// ---------------------------------------------------------------------------
// G28 · el RPE
// ---------------------------------------------------------------------------

describe('G28 · el RPE de 0 a 10 con su palabra', () => {
  for (const valor of [null, ...Array.from({ length: 11 }, (_, k) => k)]) {
    it(`valor ${valor ?? 'sin elegir'}`, () => enTodos((D) => disponerRpe(valor, D), `RPE ${valor}`));
  }

  it('las palabras son del coach: una palabra larga se parte en dos líneas, no rompe la cara', () => {
    const palabras = { ...RPE_PALABRA_DEFECTO, 7: 'casi al límite de lo que puedo' };
    enTodos((D) => disponerRpe(7, D, palabras), 'RPE con palabra larga del coach');
  });

  it('empieza en «—» (sin valor sugerido), UP entra en 1 y DOWN en 0, y no se sale de la escala', () => {
    for (const { D } of TAMANOS) expect(disponerRpe(null, D).heroe?.texto).toBe('—');
    expect(moverRpe(null, 1)).toBe(1);
    expect(moverRpe(null, -1)).toBe(0);
    expect(moverRpe(0, -1)).toBe(0);
    expect(moverRpe(10, 1)).toBe(10);
    expect(moverRpe(6, 1)).toBe(7);
    expect(moverRpe(6, -1)).toBe(5);
  });

  it('un RPE omitido viaja como nulo: «Sin RPE», nunca un 0; y el 0 es «nada», un valor de verdad', () => {
    expect(notaDeRpe(null)).toBe('Sin RPE');
    expect(notaDeRpe(0)).toBe('RPE 0 · nada');
    expect(notaDeRpe(7)).toBe('RPE 7 · fuerte');
    expect(notaDeRpe(7, { 7: 'duro' })).toBe('RPE 7 · duro');
  });

  it('la escala tiene once tramos y los llenos son los del valor', () => {
    const d = disponerRpe(7, 454);
    expect(d.pista?.banda.zonas?.colores).toHaveLength(11);
    expect(d.pista?.banda.zonas?.objetivo).toEqual([1, 8]);
    expect(disponerRpe(null, 454).pista?.banda.zonas?.objetivo).toEqual([0, 0]);
    expect(disponerRpe(0, 454).pista?.banda.zonas?.objetivo).toEqual([1, 1]);
  });
});

// ---------------------------------------------------------------------------
// G29–G31 · las páginas del resumen, de cada sesión, con cada estado de envío
// ---------------------------------------------------------------------------

describe('cada página del resumen de cada sesión cabe en los cuatro relojes', () => {
  for (const s of SESIONES) {
    for (const e of ENVIOS) {
      it(`${s.id} · envío ${e.estado}${e.intentos > 1 ? ' (2.ª vez)' : ''}`, () => {
        const paginas = paginasDeResumen(s.r, s.familia, completitud(s.r), { metodo: METODO_RESUMEN_DEFECTO, envio: e });
        expect(paginas.length, 'una sesión siempre tiene al menos su resumen y su envío').toBeGreaterThanOrEqual(2);
        expect(paginas[paginas.length - 1]!.envio, 'la última página es SIEMPRE la del envío').toBe(true);
        expect(paginas.filter((p) => p.envio)).toHaveLength(1);
        expect(new Set(paginas.map((p) => p.id)).size, 'ids únicos').toBe(paginas.length);
        for (const p of paginas) enTodos(p.disponer, `${s.id} · ${p.id}`);
      });
    }
  }
});

describe('las listas: lo que dice su capacidad cabe', () => {
  const peor = (n: number): FilaLista[] =>
    Array.from({ length: n }, (_, k) => ({ n: `2·${k + 1}`, valor: '3:49', apoyo: '3:28', cola: { texto: '▲ rápido', fuerte: true } }));
  it('la mayor página de series (la fila más cargada) cabe entera, y sobra: caben más de las que se ponen', () => {
    enTodos((D) => disponerLista(['Series', '3:45–3:55', '1/2'], peor(FILAS_POR_PAGINA.sola), D), 'lista de series al tope');
    enTodos((D) => disponerLista(['Series'], peor(FILAS_POR_PAGINA.sola + 1), D), 'lista de series con una fila de sobra');
  });
  it('la mayor página de estaciones (con su dosis debajo) cabe entera', () => {
    const est: FilaLista[] = Array.from({ length: FILAS_POR_PAGINA.conDetalle }, () => ({ valor: '1:52', cola: { texto: 'Burpee Broad Jump', fuerte: true }, detalle: '40 m · 2 × 30 kg' }));
    enTodos((D) => disponerLista(['Estaciones', '9:21'], est, D), 'lista de estaciones al tope');
  });
  it('los km de una tirada larga, con su desnivel y su pulso, caben', () => {
    const km: FilaLista[] = Array.from({ length: 5 }, (_, k) => ({ n: `${k + 12}`, valor: '4:56', apoyo: '−12 m', cola: { texto: '148', fuerte: false } }));
    enTodos((D) => disponerLista(['Kilómetros', '+100 m'], km, D), 'km al tope');
  });
  it('lo que no se hizo y lo cortado también caben', () => {
    const f: FilaLista[] = [
      { n: '4', valor: '—', cola: { texto: 'sin hacer', fuerte: false }, tenue: true },
      { n: '3', valor: '620 m', cola: { texto: 'cortada', fuerte: false } },
      { n: '2·4', valor: '12:34', apoyo: '4:10', cola: { texto: '▼ lento', fuerte: true } },
    ];
    enTodos((D) => disponerLista(['Series', 'RPE 8', '1/2'], f, D), 'lista con lo que falta');
  });
  it('una lista vacía se dice, no se pinta en blanco', () => {
    enTodos((D) => disponerLista(['Series'], [], D), 'lista vacía');
  });
  it('el reparto en páginas es parejo: 6 series caben en una; 8 con capacidad 6 → 4 + 4; 17 km → 6 + 6 + 5', () => {
    expect(repartoEnPaginas(6, FILAS_POR_PAGINA.sola)).toEqual([6]);
    expect(repartoEnPaginas(8, FILAS_POR_PAGINA.sola)).toEqual([4, 4]);
    expect(repartoEnPaginas(17, FILAS_POR_PAGINA.sola)).toEqual([6, 6, 5]);
    expect(repartoEnPaginas(17, 5)).toEqual([5, 4, 4, 4]);
    expect(repartoEnPaginas(0, 5)).toEqual([]);
    expect(repartoEnPaginas(5, 5)).toEqual([5]);
    const filas = Array.from({ length: 17 }, (_, k) => k);
    const reparto = repartoEnPaginas(17, FILAS_POR_PAGINA.sola);
    expect(reparto.flatMap((_, k) => filasDePagina(filas, reparto, k))).toEqual(filas);
  });
});

describe('el pulso: cada zona, con su barra, de 3 a 9 zonas del coach', () => {
  for (const n of [3, 5, 7, 9]) {
    it(`${n} zonas, todas con tiempo`, () => {
      const techos = Array.from({ length: n }, (_, k) => 120 + k * 12);
      const zonasS = Array.from({ length: n }, (_, k) => 60 + k * 431);
      const r = { zonas: { techos }, zonasS, ppmMedio: 152, ppmMax: 181 };
      const paginas = Math.ceil(n / ZONAS_POR_PAGINA);
      expect(zonasUsadas(zonasS)).toHaveLength(n);
      for (let k = 0; k < paginas; k++) enTodos((D) => disponerPulso(r, k, D), `pulso ${n} zonas, página ${k}`);
    });
  }
  it('solo se listan las zonas que la sesión tocó, con «—» en las del medio sin tiempo (nunca un cero)', () => {
    expect(zonasUsadas([900, 3800, 100, 0, 0])).toEqual([0, 1, 2]);
    expect(zonasUsadas([0, 5, 0, 7, 0])).toEqual([1, 2, 3]);
    expect(zonasUsadas([0, 0, 0])).toEqual([]);
    const d = disponerPulso({ zonas: { techos: [138, 150, 160, 173, 192] }, zonasS: [0, 5, 0, 7, 0], ppmMedio: 150, ppmMax: 170 }, 0, 218);
    const tiempos = d.lineas.filter((l) => l.rol === 'zona').map((l) => l.piezas[1]!.texto);
    expect(tiempos).toEqual(['0:05', '—', '0:07']);
    expect(d.barras?.[1]?.llena).toBe(0);
  });
  it('sin pulso en la sesión, la página lo dice', () => {
    enTodos((D) => disponerPulso({ zonas: { techos: [138, 150, 160, 173, 192] }, zonasS: [0, 0, 0, 0, 0], ppmMedio: null, ppmMax: null }, 0, D), 'pulso sin lectura');
  });
});

describe('cada ejercicio de fuerza cabe, con su carga, su RIR y lo que se quedó por defecto', () => {
  for (const [id, r] of [['529', resultado529()], ['479', resultado479()]] as const) {
    r.fuerza.forEach((e, k) => {
      it(`${id} · ${e.paso.posicion?.slot ?? ''} ${e.paso.nombre}`.trim(), () => enTodos((D) => disponerEjercicio(e, D), `${id} ejercicio ${k}`));
    });
  }
  it('un ejercicio con ocho series de cargas de tres cifras y RIR en cada una cabe', () => {
    const base = resultado529().fuerza[0]!;
    const e = { ...base, series: Array.from({ length: 8 }, (_, k) => ({ reps: 8, kg: 120 + k * 5, rir: (k % 4) as number, confirmada: k % 3 !== 0 })) };
    enTodos((D) => disponerEjercicio(e, D), 'ejercicio de ocho series');
  });
});

describe('las cuentas del resumen son las de la muñeca', () => {
  it('529: 22 de 22 series, 3 sin anotar; el volumen solo suma lo que lleva carga', () => {
    const r = resultado529();
    const p = paginasDeResumen({ ...r, rpe: 7 }, 'fuerza', completitud(r), { metodo: METODO_RESUMEN_DEFECTO, envio: { estado: 'en-reloj', intentos: 0 } });
    const d = p[0]!.disponer(454);
    expect(d.heroe?.texto).toBe('22/22');
    expect(d.heroe?.unidad).toBe('series');
    const texto = d.lineas.map((l) => l.piezas.map((q) => q.texto).join('')).join(' | ');
    expect(texto).toContain('3 sin anotar');
    // 5 ejercicios: A1, A2, B1, B2 y el trineo; una página por ejercicio + resumen + pulso + envío.
    expect(p.map((x) => x.id)).toEqual(['resumen', 'ejercicio-0', 'ejercicio-1', 'ejercicio-2', 'ejercicio-3', 'ejercicio-4', 'pulso-0', 'envio']);
  });
  it('493: el coste sale en s/km sobre el fresco (+14) con 4 pares; 482 no lo da con 3 y dice cuántos hay', () => {
    const coste = (r: Resultado, familia: Familia) => {
      const p = paginasDeResumen(r, familia, completitud(r), { metodo: METODO_RESUMEN_DEFECTO, envio: { estado: 'en-reloj', intentos: 0 } });
      return p.find((x) => x.id === 'coste')!.disponer(454);
    };
    const hay = coste(resultado493(), 'circuito');
    expect([hay.heroe?.texto, hay.heroe?.unidad]).toEqual(['+14', 's/km']);
    // El cálculo sigue en prueba (Alex, 25-09): «En prueba» no se pierde en ningún reloj.
    for (const { D } of TAMANOS) {
      const p = paginasDeResumen(resultado493(), 'circuito', completitud(resultado493()), { metodo: METODO_RESUMEN_DEFECTO, envio: { estado: 'en-reloj', intentos: 0 } });
      const txt = p.find((x) => x.id === 'coste')!.disponer(D).lineas.map((l) => l.piezas.map((q) => q.texto).join('')).join(' | ');
      expect(txt, `a ${D}`).toContain('En prueba');
    }
    const faltan = coste(resultado482(), 'circuito');
    expect([faltan.heroe?.texto, faltan.heroe?.unidad]).toEqual(['3/4', 'pares']);
    const texto = faltan.lineas.map((l) => l.piezas.map((q) => q.texto).join('')).join(' | ');
    expect(texto).toContain('Sería adivinar');
    expect(texto).toContain('Aún sin coste');
  });
  it('6 × 1000 m: «5/6 dentro» y el ritmo de las series, no la media; 494: la distancia manda', () => {
    const p6 = paginasDeResumen(R6, 'correr', completitud(R6), { metodo: METODO_RESUMEN_DEFECTO, envio: { estado: 'en-reloj', intentos: 0 } });
    expect([p6[0]!.disponer(454).heroe?.texto, p6[0]!.disponer(454).heroe?.unidad]).toEqual(['5/6', 'dentro']);
    const r494 = { ...resultado494(), rpe: 5 };
    const p494 = paginasDeResumen(r494, 'correr', completitud(r494), { metodo: METODO_RESUMEN_DEFECTO, envio: { estado: 'en-reloj', intentos: 0 } });
    expect([p494[0]!.disponer(454).heroe?.texto, p494[0]!.disponer(454).heroe?.unidad]).toEqual(['16,49', 'km']);
    // 17 km en tres páginas de 6, 6 y 5; no hay series.
    expect(p494.filter((x) => x.id.startsWith('km-')).length).toBe(3);
    expect(p494.some((x) => x.id.startsWith('series-'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// G31 · el envío honesto
// ---------------------------------------------------------------------------

describe('G31 · el estado de envío dice lo que el reloj sabe', () => {
  it('cada estado, con y sin RPE y con el RPE 0 (que es «nada», no «sin RPE»), cabe en los cuatro relojes', () => {
    for (const estado of ESTADOS_ENVIO) for (const rpe of [null, 0, 7, 10]) enTodos((D) => disponerEnvio(estado, rpe, D), `envío ${estado} RPE ${rpe}`);
    enTodos((D) => disponerEnvio('rechazado', 7, D, { intentos: 2 }), 'envío rechazado 2.ª vez');
  });

  it('solo el rechazo pide una decisión al atleta; «reintentando» no le pide nada', () => {
    expect(ESTADOS_ENVIO.filter(pideDecidir)).toEqual(['rechazado']);
  });

  it('nunca dice «Guardado en el iPhone», nunca promete Garmin Connect y solo «Enviado» es «enviado»', () => {
    for (const e of ESTADOS_ENVIO) {
      const t = TEXTO_ENVIO[e];
      expect(`${t.titulo} ${t.detalle}`, e).not.toMatch(/iphone|garmin connect|training|carga|vo2/i);
    }
    expect(ESTADOS_ENVIO.filter((e) => /enviado/i.test(TEXTO_ENVIO[e].titulo))).toEqual(['enviado']);
    expect(TEXTO_ENVIO['en-reloj'].titulo).toBe('Guardado en el reloj');
    expect(TEXTO_ENVIO['en-reloj'].detalle).toBe('Sube al tener el móvil');
  });

  it('cada estado tiene su glifo, y por su forma se distinguen (los del reloj y el del sin-subir coinciden a propósito: ambos «en el reloj»)', () => {
    const glifos = new Map(ESTADOS_ENVIO.map((e) => [e, TEXTO_ENVIO[e].glifo]));
    expect(glifos.get('enviado')).toBe('visto');
    expect(glifos.get('rechazado')).toBe('aviso');
    expect(glifos.get('reintentando')).toBe('reintento');
    expect(glifos.get('enviando')).toBe('nube');
    expect(glifos.get('en-reloj')).toBe(glifos.get('sin-subir'));
    expect(new Set([...glifos.values()]).size).toBe(5);
  });

  it('un rechazo repetido lo dice: repetirlo da lo mismo', () => {
    const texto = (intentos: number) => disponerEnvio('rechazado', 7, 454, { intentos }).lineas.filter((l) => l.rol === 'detalle').map((l) => l.piezas.map((p) => p.texto).join('')).join(' ');
    expect(texto(1)).toContain('El servidor no la ha aceptado');
    expect(texto(2)).toContain('Sigue sin aceptarla');
  });
});

describe('un texto apilado parte por partes y cada línea con SU cuerda', () => {
  it('«Parcial · 4 de 6 series» se parte entre partes, no por una palabra', () => {
    for (const { D } of TAMANOS) {
      const { lineas } = apilarTexto('t', ['Parcial', '4 de 6 series'], 0.62, TG.nota, D);
      const dicho = lineas.map((l) => l.piezas.map((p) => p.texto).join(''));
      expect(dicho.join(' ').replace(' · ', ' ')).toBe('Parcial 4 de 6 series');
      for (const l of lineas) expect(l.cabe, `a ${D}`).toBe(true);
    }
  });
  it('un texto sin partes largo baja por palabras y cabe (o lo dice)', () => {
    const { lineas, y1 } = apilarTexto('t', 'El servidor no la ha aceptado. Sigue en tu reloj', 0.5, TG.nota, 454);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas.every((l) => l.cabe)).toBe(true);
    expect(y1).toBeGreaterThan(0.5 + ALTO_NOTA);
  });
});

// ---------------------------------------------------------------------------
// Los botones: cada pantalla de después responde con una acción de §5
// ---------------------------------------------------------------------------

const TABLA_MANDOS = tablaDe('## 5. Interacción');
const TABLA = (b: BotonGarmin) => accionDe('resumen', b);

/** Todas las pantallas de después, con lo que cada una tiene que decir en §5. */
const PANTALLAS: Array<[string, PantallaFin]> = [
  ['G27 decide', { tipo: 'decide' }],
  ['G27 guardada', { tipo: 'guardada' }],
  ['G28 RPE sin valor', { tipo: 'rpe', conValor: false }],
  ['G28 RPE con valor', { tipo: 'rpe', conValor: true }],
  ['resumen · primera', { tipo: 'pagina', n: 0, de: 5, rechazo: false }],
  ['resumen · intermedia', { tipo: 'pagina', n: 2, de: 5, rechazo: false }],
  ['resumen · última', { tipo: 'pagina', n: 4, de: 5, rechazo: false }],
  ['resumen · envío rechazado', { tipo: 'pagina', n: 4, de: 5, rechazo: true }],
  ['salida', { tipo: 'salida' }],
];

describe('los botones de después son los de §5, sin inventar ninguno', () => {
  const filaResumen = TABLA_MANDOS.find((f) => normal(f[0]!) === 'RPE / Resumen')!;

  it('la fila de §5 que manda es «RPE / Resumen»: START confirmar / siguiente, BACK atrás, UP valor +, DOWN valor −', () => {
    expect(filaResumen.slice(1, 5).map(normal)).toEqual(['confirmar / siguiente', 'atrás', 'valor +', 'valor −']);
    expect(MANDOS.resumen.start?.accion).toBe('confirmar');
    expect(MANDOS.resumen.back?.accion).toBe('atras');
  });

  for (const [nombre, p] of PANTALLAS) {
    it(`${nombre}: toda tecla que responde lo hace con una acción de §5`, () => {
      const permitidas: Record<string, Set<string>> = {
        start: new Set(['confirmar']),
        back: new Set(['atras']),
        up: new Set([MANDOS.resumen.up!.accion, MANDOS.paso.up!.accion]),
        down: new Set([MANDOS.resumen.down!.accion, MANDOS.paso.down!.accion]),
      };
      for (const b of ['start', 'back', 'up', 'down'] as const) {
        const m = mandoDe(p, b, TABLA(b));
        if (m) {
          expect(permitidas[b]!.has(m.accion), `${nombre} · ${b}: «${m.accion}»`).toBe(true);
          expect(m.rotulo.trim().length, `${nombre} · ${b}: sin rótulo`).toBeGreaterThan(0);
        }
      }
      // LIGHT es del sistema; UP largo no existe en el resumen: la tabla de §5, tal cual.
      expect(mandoDe(p, 'light', TABLA('light'))).toEqual(TABLA('light'));
      expect(mandoDe(p, 'upLargo', TABLA('upLargo'))).toEqual(TABLA('upLargo'));
      expect(TABLA('upLargo')).toBeNull();
    });
  }

  it('el «+» y el «−» solo se rotulan donde hay un valor que mover (el RPE), y ahí sí', () => {
    for (const [nombre, p] of PANTALLAS) {
      for (const b of ['up', 'down'] as const) {
        const m = mandoDe(p, b, TABLA(b));
        const esValor = m?.rotulo === '+' || m?.rotulo === '−';
        expect(esValor, `${nombre} · ${b}`).toBe(p.tipo === 'rpe');
      }
    }
    expect(mandoDe({ tipo: 'rpe', conValor: false }, 'up', TABLA('up'))?.rotulo).toBe('+');
    expect(mandoDe({ tipo: 'rpe', conValor: false }, 'down', TABLA('down'))?.rotulo).toBe('−');
  });

  it('lo que rotula cada pantalla es lo que hace', () => {
    const r = (p: PantallaFin, b: BotonGarmin) => mandoDe(p, b, TABLA(b))?.rotulo ?? null;
    expect([r({ tipo: 'decide' }, 'start'), r({ tipo: 'decide' }, 'back'), r({ tipo: 'decide' }, 'up'), r({ tipo: 'decide' }, 'down')]).toEqual(['Guardar', 'Seguir', null, null]);
    expect([r({ tipo: 'guardada' }, 'start'), r({ tipo: 'guardada' }, 'back')]).toEqual(['Siguiente', null]);
    // Sin valor no hay nada que confirmar; con valor, sí. Saltar siempre está.
    expect(r({ tipo: 'rpe', conValor: false }, 'start')).toBeNull();
    expect(r({ tipo: 'rpe', conValor: true }, 'start')).toBe('Confirmar');
    expect(r({ tipo: 'rpe', conValor: false }, 'back')).toBe('Saltar');
    // En el resumen: UP y DOWN pasan página, START siguiente (Listo en la última), BACK atrás (nada en la primera).
    expect(r({ tipo: 'pagina', n: 0, de: 5, rechazo: false }, 'back')).toBeNull();
    expect(r({ tipo: 'pagina', n: 1, de: 5, rechazo: false }, 'back')).toBe('Atrás');
    expect(r({ tipo: 'pagina', n: 3, de: 5, rechazo: false }, 'start')).toBe('Siguiente');
    expect(r({ tipo: 'pagina', n: 4, de: 5, rechazo: false }, 'start')).toBe('Listo');
    expect(mandoDe({ tipo: 'pagina', n: 1, de: 5, rechazo: false }, 'up', TABLA('up'))?.accion).toBe('pagina-anterior');
    expect(mandoDe({ tipo: 'pagina', n: 1, de: 5, rechazo: false }, 'down', TABLA('down'))?.accion).toBe('pagina-siguiente');
    // El rechazo decide: START reintenta, BACK deja la sesión en el reloj.
    expect(r({ tipo: 'pagina', n: 4, de: 5, rechazo: true }, 'start')).toBe('Reintentar');
    expect(r({ tipo: 'pagina', n: 4, de: 5, rechazo: true }, 'back')).toBe('Guardar en el reloj');
  });

  it('lo que dice §5 (`dice`) no se toca: solo cambia el rótulo', () => {
    for (const [, p] of PANTALLAS) {
      for (const b of ['start', 'back'] as const) {
        const m = mandoDe(p, b, TABLA(b));
        if (m) expect(m.dice).toBe(MANDOS.resumen[b]!.dice);
      }
    }
  });
});

/** Lo que el botón anuncia en la carcasa: su `aria-label` («START/STOP · Guardar»). */
function botonesDe(html: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [, nombre, rotulo] of html.matchAll(/aria-label="(START\/STOP|BACK\/LAP|UP|DOWN|LIGHT)(?: · ([^"]*))?"/g)) r[nombre!] = rotulo ?? '';
  return r;
}
const dibujar = (id: string) => renderToStaticMarkup(createElement(Screen, { orientation: 'portrait', appearance: 'dark', escenario: id, vista: 'propuesta', onLog: () => {} }));

describe('la carcasa de cada escenario, renderizada de verdad, dice lo que dice la pantalla', () => {
  const ENTRADA: Record<string, PantallaFin | EstadoMandos> = {
    'final-libre': { tipo: 'decide' },
    recuperada: { tipo: 'guardada' },
    rpe: { tipo: 'rpe', conValor: false },
    'rpe-omitido': { tipo: 'rpe', conValor: false },
    'resumen-479': { tipo: 'pagina', n: 0, de: 0, rechazo: false },
    'resumen-529': { tipo: 'pagina', n: 0, de: 0, rechazo: false },
    'final-natural': 'paso',
    'final-parcial': 'controles',
    'hueco-tirada': 'paso',
    'seguir-quieto': 'paso',
  };
  for (const [id, entrada] of Object.entries(ENTRADA)) {
    it(id, () => {
      const html = dibujar(id);
      const b = botonesDe(html);
      if (typeof entrada === 'string') {
        // El vivo: los rótulos son los de la tabla de §5 de ese estado.
        expect(b['START/STOP'], `${id} · START`).toBe(MANDOS[entrada].start!.rotulo);
        expect(b['BACK/LAP'], `${id} · BACK/LAP`).toBe(MANDOS[entrada].back!.rotulo);
        return;
      }
      const de = (boton: BotonGarmin) => mandoDe(entrada.tipo === 'pagina' ? { ...entrada, de: 6 } : entrada, boton, TABLA(boton))?.rotulo ?? '';
      expect(b['START/STOP'], `${id} · START`).toBe(de('start'));
      expect(b['BACK/LAP'], `${id} · BACK/LAP`).toBe(de('back'));
      expect(b['UP'], `${id} · UP`).toBe(de('up'));
      expect(b['DOWN'], `${id} · DOWN`).toBe(de('down'));
      expect(b['LIGHT'], `${id} · LIGHT`).toBe('Luz');
    });
  }

  it('«Sesión completada» ya no rotula un «+» ni un «−» donde no mueven nada', () => {
    const html = dibujar('final-libre');
    expect(html).not.toMatch(/>\+</);
    expect(html).not.toMatch(/>−</);
    expect(html).toMatch(/Guardar/);
    expect(html).toMatch(/Seguir/);
  });

  it('el RPE sí rotula el «+» y el «−»', () => {
    const html = dibujar('rpe');
    expect(html).toMatch(/aria-label="UP · \+"/);
    expect(html).toMatch(/aria-label="DOWN · −"/);
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

describe('los avisos de después salen, y suenan como dice §6', () => {
  it('final-natural: el motor emite UNA vez «sesión hecha» (3 largas + SUCCESS ×2), en el último segundo', () => {
    const e = casoDespues('final-natural').escena!;
    expect(e.arranque.en).toBe('vivo');
    if (e.arranque.en !== 'vivo') return;
    const { plan } = e.sesion;
    let estado = estadoInicial(plan, e.arranque.sim, e.arranque.inicio);
    const oidos: Array<[number, EventoGarmin]> = [];
    for (let t = 1; t <= 30 && !estado.terminado; t++) {
      const antes = estado;
      const r = avanzar(estado, plan, e.arranque.sim);
      estado = r.estado;
      const tr: Transicion = { plan, antes, despues: estado, quien: 'motor', eventos: r.eventos };
      for (const ev of eventosDeTransicion(tr)) oidos.push([t, ev]);
    }
    expect(estado.terminado).toBe(true);
    const sesion = oidos.filter(([, ev]) => ev === 'sesion');
    expect(sesion, 'una sola vez').toHaveLength(1);
    expect(sesion[0]![0], 'a los 10 s de la vuelta a la calma').toBeGreaterThanOrEqual(9);
    expect(sesion[0]![0]).toBeLessThanOrEqual(11);
    expect(suena('sesion')).toEqual(dichoPor6('Sesión hecha'));
    expect(componerAvisos(1, ['sesion']).suena).toBe('sesion');
  });

  it('el envío no avisa: §6 no tiene fila para él y un evento sin aviso propio no vibra', () => {
    expect(Object.keys(AVISOS).filter((k) => /envio|enviado|subid|rechaz/i.test(k))).toEqual([]);
    expect(TABLA_AVISOS.map((f) => normal(f[0]!)).filter((x) => /envi|subid|rechaz/i.test(x))).toEqual([]);
  });

  it('BACK/LAP al cerrar el último paso: el acuse de la tecla va delante y luego «sesión hecha»', () => {
    const e = casoDespues('hueco-tirada').escena!;
    if (e.arranque.en !== 'vivo') throw new Error('el hueco arranca en el vivo');
    const { plan } = e.sesion;
    const antes = estadoInicial(plan, e.arranque.sim, e.arranque.inicio);
    const r = cerrar(antes, plan, 'atleta');
    const eventos = eventosDeTransicion({ plan, antes, despues: r.estado, quien: 'atleta', eventos: r.eventos });
    expect(eventos).toContain('paso-a-mano');
    expect(eventos).toContain('sesion');
    const c = componerAvisos(1, eventos);
    expect(c.acuse).toBe('paso-a-mano');
    expect(c.suena).toBe('sesion');
  });
});

// ---------------------------------------------------------------------------
// El hueco del modelo que ya sabemos
// ---------------------------------------------------------------------------

describe('HUECO DEL MODELO · un paso continuo cortado a mano sale «Completa»', () => {
  // ESTE TEST DOCUMENTA UN FALLO (no lo celebra): `completitud` (kit-reloj/despues.ts) juzga solo por SERIES.
  // La tirada 494 es un único paso de 80′; cerrarlo con BACK/LAP a los 24′ es el final natural y sin series
  // no hay nada «cortado»: sale «completa». Cuando el modelo juzgue también un paso continuo, este test
  // fallará: es la señal para pasar el escenario `hueco-tirada` a «Parcial · 24′ de 80′» y borrar este bloque.
  it('la tirada cerrada a los 24′ de 80′ sale completa (el modelo no ve un paso cortado)', () => {
    const e = casoDespues('hueco-tirada').escena!;
    if (e.arranque.en !== 'vivo') throw new Error('el hueco arranca en el vivo');
    const { plan } = e.sesion;
    const antes = estadoInicial(plan, e.arranque.sim, e.arranque.inicio);
    const cerrado = cerrar(antes, plan, 'atleta').estado;
    expect(cerrado.terminado, 'cerrar el único paso es el final natural').toBe(true);
    const r = resultadoDeVivo(plan, { estado: cerrado, final: 'natural' }, null);
    expect(r.t, 'lleva 24′ de los 80′ prescritos').toBeLessThan(plan.pasos[0]!.medida.prescrito! / 2);
    expect(completitud(r).estado, 'HUECO: debería ser parcial').toBe('completa');
    // Por la otra puerta (Terminar desde Controles) sí sale parcial: juzga por dónde llegó.
    const porControles = resultadoDeVivo(plan, { estado: antes, final: 'atleta' }, null);
    expect(completitud(porControles).estado).toBe('parcial');
  });
});

// ---------------------------------------------------------------------------
// Cada escenario existe, monta y su primera cara cabe
// ---------------------------------------------------------------------------

describe('el inventario de escenarios', () => {
  const ids = escenarios.map((x) => x.id);

  it('cada escenario tiene caso y cada caso tiene escenario; los de motor quieto son solo las comparaciones', () => {
    expect([...ids].sort()).toEqual([...IDS_DE_CASOS].sort());
    for (const id of ids) {
      const c = casoDespues(id);
      expect(Boolean(c.comparar), id).toBe(id.startsWith('tamanos-'));
      expect(Boolean(c.escena) !== Boolean(c.comparar), id).toBe(true);
    }
  });

  it('cada escenario se monta (renderiza sin romper) con la carcasa de cinco botones', () => {
    for (const id of ids) {
      const html = dibujar(id);
      expect(html.length, id).toBeGreaterThan(500);
      if (!id.startsWith('tamanos-')) expect(Object.keys(botonesDe(html)).sort(), id).toEqual(['BACK/LAP', 'DOWN', 'LIGHT', 'START/STOP', 'UP']);
    }
  });

  it('el vivo de cada escenario que arranca en él tiene el héroe de `laminaDelPaso` (la vista no decide)', () => {
    for (const id of ids) {
      const c = casoDespues(id).escena;
      if (!c || c.arranque.en !== 'vivo') continue;
      const { plan } = c.sesion;
      const s = estadoInicial(plan, c.arranque.sim, c.arranque.inicio);
      const p = pasoVivo(plan, s);
      const l = lecturasDe(p, s);
      expect(laminaDelPaso(p, l, plan.zonas, plan.reglas).heroe.texto, id).toBeTruthy();
    }
  });

  it('las descripciones no dicen «iPhone» en un reloj Garmin ni escriben una marca', () => {
    for (const x of escenarios) expect(x.descripcion, x.id).not.toMatch(/hyrox|pablo|fabrik/i);
  });
});
