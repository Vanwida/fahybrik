// LOS AYUDANTES DEL EXAMEN DE «GARMIN · FUERZA» (kit-garmin-fuerza*.test.ts).
//
// Las sesiones de fuerza de los planes (529, 488, 492, 538 y el ejemplo de P11
// con las reps que dice el atleta), el examen de una disposición (el MISMO de
// las caras base de `kit-garmin-caras.test.ts`: cabe en la cuerda, nada baja del
// 6,2 % de D, el héroe en 0,20–0,26 D, nada se pisa, cifras en la bitmap) y
// cómo recorrer una sesión con el motor. Sin `describe` ni `it`: solo ayuda.

import { expect } from 'vitest';
import { SUBCONJUNTO_CIFRAS, TG, anchoUtilFila, type Disposicion } from '@/components/design-twin/kit-garmin';
import {
  anotacionDe,
  cerrar,
  confirmar,
  esFuerza,
  estadoInicial,
  type EstadoSecuencia,
  type PlanSesion,
  type Registro,
} from '@/components/design-twin/kit-reloj';
import { cuerpo } from '@/components/design-twin/screens/reloj-fuerza/casos';
import { sesion488, sesion492, sesion529, sesion538 } from '@/components/design-twin/screens/reloj-fuerza/planes';
import type { DisposicionAnotar } from '@/components/design-twin/screens/garmin-fuerza/caras';
import { ejemploDeclarado } from '@/components/design-twin/screens/garmin-fuerza/casos';
import type { ContextoAnotar } from '@/components/design-twin/screens/garmin-fuerza/modelo';

export const PLANES: Record<string, PlanSesion> = {
  '529': sesion529(),
  '488': sesion488(),
  '492': sesion492(),
  '538': sesion538(),
  'P11 (reps del atleta)': ejemploDeclarado(),
};

/** Tolerancia de medida: medio píxel. */
export const PX = 0.5;

// ---------------------------------------------------------------------------
// El examen de una disposición (el mismo de las caras base del kit)
// ---------------------------------------------------------------------------

interface Caja1 {
  y0: number;
  y1: number;
  donde: string;
}

function cajasDe(d: Disposicion, que: string): Caja1[] {
  const cajas: Caja1[] = [];
  const suelo = Math.ceil(TG.suelo * d.D);
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
    cajas.push({ y0: l.y, y1: l.y + l.alto, donde });
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
    cajas.push({ y0: h.y, y1: h.y + h.alto, donde });
  }
  if (d.pista) cajas.push({ y0: d.pista.y, y1: d.pista.y + d.pista.alto, donde: `${que} · pista a ${d.D}` });
  return cajas;
}

function sinPisarse(cajas: Caja1[]) {
  const orden = [...cajas].sort((a, b) => a.y0 - b.y0);
  for (let k = 1; k < orden.length; k++) expect(orden[k]!.y0, `${orden[k]!.donde} pisa a ${orden[k - 1]!.donde}`).toBeGreaterThanOrEqual(orden[k - 1]!.y1 - PX);
}

export function comprobar(d: Disposicion, que: string) {
  sinPisarse(cajasDe(d, que));
}

/** El descanso que anota: la base, cada celda dentro de la cuerda a su altura y ninguna encima de otra ni de una línea. */
export function comprobarAnotar(a: DisposicionAnotar, que: string) {
  const D = a.base.D;
  const cajas = cajasDe(a.base, que);
  const suelo = Math.ceil(TG.suelo * D);
  a.celdas.forEach((c, k) => {
    const donde = `${que} · celda ${k} a ${D}`;
    for (const l of c.d.lineas) {
      expect(l.cabe, `${donde} · ${l.rol}: no cabe (${Math.round(l.ancho)} > ${l.anchoUtil})`).toBe(true);
      for (const p of l.piezas) {
        expect(p.cuerpo, `${donde}: bajo el suelo`).toBeGreaterThanOrEqual(suelo);
        if (p.cara === 'cifras') for (const ch of p.texto) expect(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
      }
    }
    // La celda entera dentro del círculo: su ancho y su distancia al centro caben en la cuerda de su fila.
    const cuerda = anchoUtilFila(c.y / D, c.alto / D) * D;
    expect(2 * Math.abs(c.cx - D / 2) + c.ancho, `${donde}: se sale de la cuerda`).toBeLessThanOrEqual(cuerda + PX);
    if (k > 0) expect(c.cx - a.celdas[k - 1]!.cx, `${donde}: pisa a la anterior`).toBeGreaterThanOrEqual(c.ancho - PX);
  });
  // Las celdas comparten fila: para lo demás son UNA caja (de la más alta a la más baja).
  if (a.celdas.length > 0) cajas.push({ y0: Math.min(...a.celdas.map((c) => c.y)), y1: Math.max(...a.celdas.map((c) => c.y + c.alto)), donde: `${que} · fila de celdas a ${D}` });
  sinPisarse(cajas);
}

// ---------------------------------------------------------------------------
// Recorrer una sesión con el motor
// ---------------------------------------------------------------------------

/** Cada paso de la sesión, con el estado del motor al empezarlo (cerrando cada paso a mano, como BACK/LAP). */
export function recorrer(plan: PlanSesion): EstadoSecuencia[] {
  const out: EstadoSecuencia[] = [];
  let s = estadoInicial(plan, cuerpo, { i: 0 });
  for (let k = 0; k < plan.pasos.length; k++) {
    out.push(s);
    if (k < plan.pasos.length - 1) s = cerrar(s, plan, 'atleta').estado;
  }
  return out;
}

/** Todo lo hecho hasta `i`, confirmado tal cual se proponía (lo propuesto pasa a declarado). */
export function declaradoHasta(plan: PlanSesion, i: number): Registro {
  let r: Registro = {};
  plan.pasos.forEach((p, j) => {
    if (j >= i || !esFuerza(p) || p.fuerza.aproximacion || p.medida.tipo !== 'reps') return;
    const a = anotacionDe(plan, j, r, null);
    if (a) r = confirmar(r, p.id, a);
  });
  return r;
}

export const contextoDe = (plan: PlanSesion, s: EstadoSecuencia): ContextoAnotar => ({ plan, estado: s, sim: cuerpo, i: s.i, pasoId: plan.pasos[s.i]!.id });

/** Momentos de un paso que se miran: al empezar y a la mitad de lo que dura. */
export const MOMENTOS = [0, 9];
