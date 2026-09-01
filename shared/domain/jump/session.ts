// Un intento de salto y cómo se agrega una serie.
//
// kinds reserva SJ/DJ/brazos libres para no reabrir el modelo. v1 solo ejecuta
// cmj y loaded_cmj.

import { flightTimeSeconds, heightCm, takeoffVelocityMs } from './physics';

export type JumpKind = 'cmj' | 'cmj_free_arms' | 'sj' | 'dj' | 'loaded_cmj';
export type JumpLoad = { kind: 'none' } | { kind: 'kg'; kg: number } | { kind: 'pct_bw'; pct: number };
export type JumpKeep = 'best' | 'mean_best_2';
export type JumpQuality = 'ok' | 'staggered' | 'low_fps' | 'discarded';

export interface JumpAttempt {
  kind: JumpKind;
  takeoff_frame: number;
  landing_frame: number;
  fps: number;
  load: JumpLoad;
  quality: JumpQuality;
}

export interface ResolvedJumpAttempt {
  flight_time_s: number;
  height_cm: number;
  takeoff_velocity_ms: number;
}

export function resolveLoadKg(load: JumpLoad, bodyMassKg: number | null): number | null {
  if (load.kind === 'none') return null;
  if (load.kind === 'kg') return load.kg > 0 ? load.kg : null;
  if (bodyMassKg == null || !(bodyMassKg > 0) || !(load.pct > 0)) return null;
  return (load.pct / 100) * bodyMassKg;
}

export function resolveAttempt(a: JumpAttempt): ResolvedJumpAttempt | null {
  if (a.quality === 'discarded') return null;
  const t = flightTimeSeconds(a.takeoff_frame, a.landing_frame, a.fps);
  if (t == null) return null;
  const h = heightCm(t);
  const v = takeoffVelocityMs(t);
  if (h == null || v == null) return null;
  return { flight_time_s: t, height_cm: h, takeoff_velocity_ms: v };
}

export function aggregateHeights(heightsCm: number[], keep: JumpKeep): number | null {
  const clean = heightsCm.filter((h) => Number.isFinite(h) && h > 0).sort((a, b) => b - a);
  if (clean.length === 0) return null;
  if (keep === 'best') return clean[0]!;
  const top = clean.slice(0, 2);
  return top.reduce((s, h) => s + h, 0) / top.length;
}
