// TODO CABE A 218, Y LO QUE SE PINTA ES LA LÁMINA (docs/garmin-reloj/modelo.md §3, §11).
//
// Cada paso de las sesiones reales de correr (491, 494, 573, 479, 551, 509,
// 538, 535 y la 6 × 1000 del modelo), en varios momentos y en los CUATRO
// relojes, pasa por las caras base del kit: el paso, recupera, descanso,
// 3-2-1/GO, pausa, deshacer, completada, las páginas y los menús. En todas:
// ninguna línea se sale de la cuerda del círculo a su altura, ningún texto
// baja del 6,2 % de D, el héroe cae en 0,20–0,26 D, nada se pisa y lo que va
// en la cara de cifras lo sabe pintar la bitmap del reloj.
//
// Y la cara del paso pinta LA lámina de `laminaDelPaso` (kit-reloj): el
// mismo héroe, el mismo objetivo, lo mismo que falta, el mismo pulso.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CaraPaso,
  PantallaGarmin,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  controlesPorDefecto,
  disponerCompletada,
  disponerCuenta,
  disponerDatos,
  disponerDescanso,
  disponerDeshacer,
  disponerEstructura,
  disponerKm,
  disponerMenu,
  disponerPaso,
  disponerPasoDe,
  disponerPausa,
  disponerRecupera,
  disponerVueltas,
  entornoDe,
  partirEnLineas,
  type Disposicion,
} from '@/components/design-twin/kit-garmin';
import { estructuraDe } from '@/components/design-twin/kit-reloj/estructura';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { filasDeDatos, filasDeVueltas, textoFila } from '@/components/design-twin/kit-reloj/listas';
import type { PasoBase, Vuelta } from '@/components/design-twin/kit-reloj/paso';
import { estadoInicial, lecturasDe, pasoVivo, type PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { avisoDeCierre, sesionDe } from '@/components/design-twin/kit-reloj/vivo';
import { cuerpo } from '@/components/design-twin/screens/reloj-correr/casos';
import {
  seisPorMil,
  sesion479,
  sesion491,
  sesion494,
  sesion509,
  sesion535,
  sesion538,
  sesion551,
  sesion573,
} from '@/components/design-twin/screens/reloj-correr/planes';

const PLANES: Record<string, PlanSesion> = {
  '6×1000': seisPorMil().plan,
  '479': sesion479().plan,
  '491': sesion491().plan,
  '494': sesion494().plan,
  '509': sesion509().plan,
  '535': sesion535().plan,
  '538': sesion538().plan,
  '551': sesion551().plan,
  '573': sesion573().plan,
};

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

/** Los momentos de un paso que se miran: al empezar, a la mitad y al final. */
function momentos(p: PasoBase): Array<{ t: number; metros?: number }> {
  const pr = p.medida.prescrito ?? 60;
  if (p.medida.tipo === 'distancia') return [{ t: 1 }, { t: 60, metros: pr / 2 }, { t: 200, metros: Math.max(0, pr - 30) }];
  if (p.medida.tipo === 'tiempo') return [{ t: 0 }, { t: Math.floor(pr / 2) }, { t: Math.max(0, pr - 2) }];
  return [{ t: 0 }, { t: 30 }];
}

describe('las caras del vivo caben en los cuatro relojes (sesiones reales)', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: cada paso, en cada momento, a 454, 390, 260 y 218`, () => {
      const vistos = new Set<string>();
      plan.pasos.forEach((base, i) => {
        for (const m of momentos(base)) {
          const sim = cuerpo({ partida: { i, t: m.t }, gps: i === 0 && m.t === 0 ? () => 'buscando' : undefined });
          const s = estadoInicial(plan, sim, { i, t: m.t, metros: m.metros, sesionT: 900 + m.t });
          const p = pasoVivo(plan, s);
          const l = lecturasDe(p, s);
          for (const { D } of TAMANOS) {
            const que = `${nombre} · paso ${i} (${p.clase}) t=${m.t}`;
            if (p.rol === 'recuperacion') comprobar(disponerRecupera(p, l, plan.zonas, D), que);
            else if (p.rol === 'descanso') comprobar(disponerDescanso(p, l, D), que);
            else comprobar(disponerPaso(laminaDelPaso(p, l, plan.zonas, plan.reglas), D), que);
            if (p.siguiente && p.siguiente.rol === 'trabajo') {
              comprobar(disponerCuenta(3, p.siguiente, D), `${que} · 3-2-1`);
              comprobar(disponerCuenta(0, p.siguiente, D), `${que} · GO`);
            }
            comprobar(disponerPausa(s.sesionT, p, D), `${que} · pausa`);
            comprobar(disponerDeshacer(avisoDeCierre(p), D), `${que} · deshacer`);
            // Las páginas, una vez por paso y tamaño.
            const clave = `${i}-${D}`;
            if (!vistos.has(clave)) {
              vistos.add(clave);
              comprobar(disponerDatos(filasDeDatos(sesionDe(s), l, p.entorno === 'cinta' ? 'cinta' : undefined), plan.zonas, D), `${que} · Datos`);
              const filas = estructuraDe(plan.pasos)(i).map((f) => ({ ...textoFila(f), estado: f.estado }));
              comprobar(disponerEstructura(filas, D), `${que} · Estructura`);
            }
          }
        }
      });
    });
  }
});

const VUELTAS: Vuelta[] = [
  { n: 1, clase: 'serie', segundos: 231, metros: 1000, ritmo: 231, ppm: 169, veredicto: 'dentro', eje: 'ritmo' },
  { n: 2, clase: 'serie', segundos: 218, metros: 1000, ritmo: 218, ppm: 175, veredicto: 'por-encima', eje: 'ritmo' },
  { n: 3, clase: 'serie', segundos: 244, metros: 1000, ritmo: 244, ppm: 166, veredicto: 'por-debajo', eje: 'ritmo' },
  { n: 4, tanda: 2, clase: 'serie', segundos: 60, metros: 250, ritmo: 240, ppm: 170, veredicto: null },
  { n: 12, clase: 'km', segundos: 292, metros: 1000, ritmo: 292, ppm: 145, veredicto: null },
];

describe('las páginas, los menús y los finales caben en los cuatro', () => {
  it('Vueltas: series contra su objetivo (dentro, ▲ rápido, ▼ lento), por tiempo, y el km', () => {
    for (const { D } of TAMANOS) {
      for (const enCurso of [null, { n: '2·4', valor: '0:52' }, { n: 'km 13', valor: '3:10' }]) {
        const { titulo, filas } = filasDeVueltas(VUELTAS, '3:45–3:55', enCurso ? 3 : 4);
        comprobar(disponerVueltas(titulo, filas, enCurso, D), `Vueltas ${enCurso?.n ?? ''}`);
      }
      comprobar(disponerVueltas(['Series', '3:45–3:55'], [], null, D), 'Vueltas vacía');
    }
  });

  it('Controles con cada foco, sus confirmaciones y el entorno', () => {
    const todos = ['Pausa', 'Reanudar', 'Datos', 'Vueltas', 'Estructura', 'Saltar paso', '+30 s', 'Cambiar entorno', 'Terminar', 'Descartar'];
    const opciones = todos.map((texto, k) => ({ id: String(k), texto }));
    for (const { D } of TAMANOS) {
      opciones.forEach((_, foco) => comprobar(disponerMenu(['Controles'], opciones, foco, D), `Controles foco ${foco}`));
      comprobar(disponerMenu(['¿Terminar?'], [{ id: 'g', texto: 'Guardar lo hecho' }], 0, D), '¿Terminar?');
      comprobar(disponerMenu(['No se guarda nada'], [{ id: 'd', texto: 'Sí, descartar' }], 0, D), '¿Descartar? (2)');
      comprobar(disponerMenu(['Entorno'], ['Calle', 'Cinta', 'Pista'].map((texto) => ({ id: texto, texto })), 1, D), 'Entorno');
    }
  });

  it('Sesión completada (completa y parcial con su motivo), y la vuelta automática', () => {
    for (const { D } of TAMANOS) {
      comprobar(disponerCompletada(true, 3322, { estado: 'completa', cuenta: '6 de 6 series', motivo: null }, 11590, D), 'Completada');
      comprobar(disponerCompletada(false, 1840, { estado: 'parcial', cuenta: '4 de 6 series', motivo: 'Terminaste en la serie 5 de 6' }, 6400, D), 'Terminada');
      comprobar(disponerKm({ titulo: 'Kilómetro 12', valor: '4:52', pie: 'ritmo del km' }, D), 'Km');
    }
  });

  it('los Controles por defecto: +30 s solo en recuperación o descanso; Datos, Vueltas y Estructura solo en AMRAP', () => {
    const plan = seisPorMil().plan;
    const s = estadoInicial(plan, cuerpo(), { i: 5 });
    const seq = { paso: pasoVivo(plan, s), plan, pausado: false } as unknown as Parameters<typeof controlesPorDefecto>[0];
    expect(controlesPorDefecto(seq, 'paso')).toEqual(['pausa', 'saltar', 'entorno', 'terminar', 'descartar']);
    const r = estadoInicial(plan, cuerpo(), { i: 6 });
    const seqR = { paso: pasoVivo(plan, r), plan, pausado: false } as unknown as Parameters<typeof controlesPorDefecto>[0];
    expect(controlesPorDefecto(seqR, 'recupera')).toContain('mas30');
    expect(controlesPorDefecto(seq, 'amrap').slice(1, 4)).toEqual(['datos', 'vueltas', 'estructura']);
  });
});

describe('un texto que no cabe en una línea va en dos, bien cortado', () => {
  it('corta por « · » antes que por un espacio: «Wall Ball» no se parte', () => {
    const r = partirEnLineas('Viene: Serie 2/5 · Wall Ball · 12 reps · 9 kg', 'nota', 29, [360, 312], 'Viene:');
    expect(r).toEqual(['Viene: Serie 2/5 · Wall Ball', '12 reps · 9 kg']);
  });

  it('el prefijo va entero en la primera línea, aunque lleve su propio « · »', () => {
    const r = partirEnLineas('Luego · 1000 m a 3:45–3:55', 'nota', 29, [200, 300], 'Luego ·');
    expect(r?.[0].startsWith('Luego ·')).toBe(true);
  });

  it('el contexto largo del coach («Descanso entre tandas», 509) va en dos líneas a 218', () => {
    const plan = sesion509().plan;
    const i = plan.pasos.findIndex((p) => p.clase === 'descanso-tandas');
    const s = estadoInicial(plan, cuerpo(), { i, t: 30 });
    const d = disponerDescanso(pasoVivo(plan, s), lecturasDe(pasoVivo(plan, s), s), 218);
    const ctx = d.lineas.filter((l) => l.rol === 'contexto').map((l) => l.piezas[0]!.texto);
    expect(ctx).toEqual(['Descanso', 'entre tandas']);
  });
});

describe('la cara del paso pinta la lámina de kit-reloj', () => {
  const plan = seisPorMil().plan;
  const s = estadoInicial(plan, cuerpo({ partida: { i: 5, t: 88 } }), { i: 5, t: 88, metros: 380 });
  const p = pasoVivo(plan, s);
  const l = lecturasDe(p, s);

  it('el mismo héroe, la misma banda, lo mismo que falta y el mismo pulso', () => {
    for (const { D } of TAMANOS) {
      const { lamina, disposicion } = disponerPasoDe(p, l, plan.zonas, D, plan.reglas);
      expect(lamina).toEqual(laminaDelPaso(p, l, plan.zonas, plan.reglas));
      expect(disposicion.heroe?.texto).toBe(lamina.heroe.texto);
      expect(disposicion.heroe?.unidad).toBe(lamina.heroe.unidad);
      expect(disposicion.pista?.banda).toEqual(lamina.banda);
      const texto = (rol: string) => disposicion.lineas.filter((x) => x.rol === rol).flatMap((x) => x.piezas.map((q) => q.texto));
      expect(texto('banda')[0]).toBe(lamina.banda!.rotulo);
      expect(texto('secundaria')).toContain(lamina.segundo!.valor);
      expect(texto('pie')).toContain(lamina.tercero!.valor);
      // El contexto es la lámina, por partes, quitando por el final lo que no cabe.
      expect(lamina.contexto.join(' · ').startsWith(texto('contexto').join(' '))).toBe(true);
    }
  });

  it('y el componente de la cara pinta ese héroe (render de servidor, en los cuatro relojes)', () => {
    const lamina = laminaDelPaso(p, l, plan.zonas, plan.reglas);
    for (const { D } of TAMANOS) {
      const cara = createElement(CaraPaso, { paso: p, lecturas: l, zonas: plan.zonas, reglas: plan.reglas });
      const html = renderToStaticMarkup(createElement(PantallaGarmin, { entorno: entornoDe(D) }, cara));
      const heroe = /data-rol="heroe"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? '';
      expect(heroe.replace(/<[^>]+>/g, '')).toContain(lamina.heroe.texto);
      expect(html).toContain(`width:${D}px`);
    }
  });
});
