// TEXTO DE UNA MEDIDA — los tres formateadores que el plan compacto y la
// estación de dobles necesitan (`estacionDe`). Puros y sin dependencias del
// kit: viven aquí para que el servidor los use igual que el reloj.
// `kit-reloj/reglas.ts` los re-exporta (cero cambio de comportamiento).

import type { Medida, Objetivo, PasoBase } from './paso';

export const dos = (n: number) => String(n).padStart(2, '0');

/** Duración prescrita en notación de pista: «20″», «90″», «1′», «2′30″», «50′». */
export function fmtDuracion(s: number): string {
  if (s < 60 || (s <= 90 && s % 60 !== 0)) return `${s}″`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}′` : `${m}′${dos(r)}″`;
}

/** Lo prescrito de una medida, para el contexto y el «Luego»: «1000 m», «1′», «12 reps». */
export function fmtPrescrito(m: Medida): string {
  const p = m.prescrito;
  if (p == null || m.tipo === 'abierta') return '';
  switch (m.tipo) {
    case 'distancia':
      return p >= 5000 && p % 1000 === 0 ? `${p / 1000}\u00A0km` : `${p}\u00A0m`;
    case 'tiempo':
      return fmtDuracion(p);
    case 'reps':
      return `${p}\u00A0reps`;
    case 'cal':
      return `${p}\u00A0cal`;
  }
}

/** El objetivo `principal` del paso: lo que manda en el héroe (P3). */
export function principal(p: PasoBase): Objetivo | null {
  return p.objetivos.find((o) => o.papel === 'principal') ?? null;
}

