'use client';

// EL ARO = LA SESIÓN. Reutiliza el aro de estructura de `kit-watch` (lo mejor
// del diseño de hoy según la auditoría: mejor que Garmin) y solo le pone el
// dato: un arco por paso del plan, el trabajo de la parte principal en naranja
// y todo lo demás (calentamiento, recuperaciones, descansos, vuelta a la
// calma) en gris. El brillo dice dónde estás: hecho, en curso, por venir.
//
// Cuánto perímetro lleva cada paso lo dice un ESTIMADOR (`duracionEstimada`
// por defecto, en estructura.ts). Una familia que sabe más (el circuito sabe
// lo que dura una estación de HYROX a su dosis) pasa el suyo en `duracion`.

import { AroEstructura, type ArcoDeTramo } from '../kit-watch/bisel';
import { duracionEstimada } from './estructura';
import type { Lecturas, PasoBase } from './paso';
import { faltaDe } from './reglas';

/** Cuánto dura un paso, en s, SOLO para repartir el aro (nunca se pinta como tiempo). */
export type Estimador = (p: PasoBase) => number;

export function arcosDePlan(pasos: PasoBase[], duracion: Estimador = duracionEstimada): ArcoDeTramo[] {
  return pasos.map((p) => ({ trabajo: p.rol === 'trabajo' && p.fase === 'principal', peso: duracion(p) }));
}

/** Avance dentro del paso, 0..1. Cero si nadie lo mide (el arco no promete lo que no sabe). */
export function fraccionDelPaso(p: PasoBase, l: Lecturas): number {
  const pr = p.medida.prescrito;
  const f = faltaDe(p, l);
  if (pr == null || pr <= 0 || f == null) return 0;
  return Math.min(1, Math.max(0, 1 - f / pr));
}

export function AroSesion({
  pasos,
  i,
  paso,
  lecturas,
  duracion,
}: {
  pasos: PasoBase[];
  i: number;
  paso: PasoBase;
  lecturas: Lecturas;
  duracion?: Estimador;
}) {
  return <AroEstructura arcos={arcosDePlan(pasos, duracion)} enCurso={i} fraccion={fraccionDelPaso(paso, lecturas)} />;
}
