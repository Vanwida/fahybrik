// Método del coach sobre un perfil de salto.
//
// La física es mecanismo. Los cortes, la carga por defecto, cuántos intentos
// y si las manos van a la cadera son MÉTODO: otro entrenador lo haría distinto.
// DEFAULT_JUMP_METHOD es el defecto editable (los cortes del informe que
// originó la feature). Un coach que no toca nada ve esos números.

import type { JumpKeep, JumpLoad } from './session';

export interface HeightBand {
  /** Exclusive upper bound. null = abierto por arriba. */
  max: number | null;
  level: 1 | 2 | 3 | 4 | 5;
}

export interface LriBand {
  max: number | null;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
}

export interface JumpMethod {
  default_load: JumpLoad;
  attempts: number;
  keep: JumpKeep;
  rest_s: number;
  arms: 'hips' | 'free';
  height_bands_cm: HeightBand[];
  lri_bands: LriBand[];
}

export const DEFAULT_JUMP_METHOD: JumpMethod = {
  default_load: { kind: 'kg', kg: 15 },
  attempts: 3,
  keep: 'best',
  rest_s: 45,
  arms: 'hips',
  height_bands_cm: [
    { max: 30, level: 1 },
    { max: 35, level: 2 },
    { max: 40, level: 3 },
    { max: 45, level: 4 },
    { max: null, level: 5 },
  ],
  lri_bands: [
    { max: 0.45, level: 5, label: 'Excelente' },
    { max: 0.7, level: 4, label: 'Muy buena' },
    { max: 0.9, level: 3, label: 'Correcta' },
    { max: 1.2, level: 2, label: 'Baja' },
    { max: null, level: 1, label: 'Muy baja' },
  ],
};

export interface LoadResponse {
  drop_abs_cm: number;
  drop_rel: number;
  load_rel: number;
  lri: number;
}

export function loadResponse(
  unloadedCm: number,
  loadedCm: number,
  loadKg: number,
  bodyMassKg: number,
): LoadResponse | null {
  if (!(unloadedCm > 0) || !(bodyMassKg > 0) || !(loadKg > 0)) return null;
  if (!Number.isFinite(loadedCm)) return null;
  const drop_abs_cm = unloadedCm - loadedCm;
  const drop_rel = drop_abs_cm / unloadedCm;
  const load_rel = loadKg / bodyMassKg;
  if (!(load_rel > 0)) return null;
  return { drop_abs_cm, drop_rel, load_rel, lri: drop_rel / load_rel };
}

export function heightLevel(cm: number, method: JumpMethod): 1 | 2 | 3 | 4 | 5 {
  // Informe: <30 · 30–35 · 35–40 · 40–45 · >45. El 45 cierra el 4.
  const bands = method.height_bands_cm;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (b.max == null) return b.level;
    const lastFinite = bands.slice(i + 1).every((x) => x.max == null);
    if (lastFinite ? cm <= b.max : cm < b.max) return b.level;
  }
  return 3;
}

export function lriLevel(lri: number, method: JumpMethod): 1 | 2 | 3 | 4 | 5 {
  // Informe: ≤0,45 · 0,45–0,70 · 0,70–0,90 · 0,90–1,20 · >1,20.
  for (const b of method.lri_bands) {
    if (b.max == null || lri <= b.max) return b.level;
  }
  return 3;
}

/** 47.33 → "47 cm". La precisión real es ±1 cm; los dos decimales no se enseñan. */
export function formatJumpHeightCm(cm: number): string {
  if (!Number.isFinite(cm)) return '—';
  return `${Math.round(cm)} cm`;
}

export function formatLri(lri: number): string {
  if (!Number.isFinite(lri)) return '—';
  return lri.toFixed(2).replace('.', ',');
}
