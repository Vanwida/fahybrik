'use client';

// EL ARO = LA SESIÓN. Reutiliza el aro de estructura de `kit-watch` (lo mejor
// del diseño de hoy según la auditoría: mejor que Garmin) y solo le pone el
// dato: un arco por paso del plan, el trabajo de la parte principal en naranja
// y todo lo demás (calentamiento, recuperaciones, descansos, vuelta a la
// calma) en gris. El brillo dice dónde estás: hecho, en curso, por venir.

import { AroEstructura, type ArcoDeTramo } from '../kit-watch/bisel';
import type { Lecturas, PasoBase } from './paso';
import { faltaDe, principal } from './reglas';

/** Ritmo neutro para repartir el perímetro cuando un paso por metros no trae ritmo. Solo dibuja. */
const RITMO_DIBUJO_S_KM = 300;

/** Cuánto dura un paso, estimado, para darle su parte del perímetro. */
export function duracionEstimada(p: PasoBase): number {
  const pr = p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return pr;
  if (p.medida.tipo === 'distancia') {
    const o = principal(p);
    const ritmo = o?.eje === 'ritmo' && o.min != null && o.max != null ? (o.min + o.max) / 2 : RITMO_DIBUJO_S_KM;
    return (pr / 1000) * ritmo;
  }
  return 60;
}

export function arcosDePlan(pasos: PasoBase[]): ArcoDeTramo[] {
  return pasos.map((p) => ({ trabajo: p.rol === 'trabajo' && p.fase === 'principal', peso: duracionEstimada(p) }));
}

/** Avance dentro del paso, 0..1. Cero si nadie lo mide (el arco no promete lo que no sabe). */
export function fraccionDelPaso(p: PasoBase, l: Lecturas): number {
  const pr = p.medida.prescrito;
  const f = faltaDe(p, l);
  if (pr == null || pr <= 0 || f == null) return 0;
  return Math.min(1, Math.max(0, 1 - f / pr));
}

export function AroSesion({ pasos, i, paso, lecturas }: { pasos: PasoBase[]; i: number; paso: PasoBase; lecturas: Lecturas }) {
  return <AroEstructura arcos={arcosDePlan(pasos)} enCurso={i} fraccion={fraccionDelPaso(paso, lecturas)} />;
}
