'use client';

// Motor de simulación del doble: guiones deterministas por escenario.
//
// La filosofía es que la INTERACCIÓN real (tocar botones) es estado React
// normal dentro de la pantalla, y lo que en la vida real es asíncrono (el PM5
// que aparece al escanear, el GPS que fija, las pulsaciones que suben) es un
// guion de pasos con tiempos. El remount por escenario garantiza que cada
// reproducción parte de cero.

import { useEffect, useRef, useState } from 'react';

export interface TimelineStep {
  /** Milisegundos desde el arranque del escenario. */
  at: number;
  run: () => void;
}

/**
 * Ejecuta pasos a sus tiempos; limpia TODOS los timers al desmontar. Pasar
 * `enabled: false` para guiones que arrancan tras un gesto (p. ej. el escaneo
 * BLE empieza al abrir la pantalla de conexión, no al montar el flujo).
 */
export function useTimeline(steps: TimelineStep[], enabled = true): void {
  // El guion es fijo por montaje (los escenarios remontan via key), así que
  // deliberadamente NO reagendamos si el array cambia de identidad por render.
  const stepsRef = useRef(steps);
  useEffect(() => {
    if (!enabled) return;
    const timers = stepsRef.current.map((s) => setTimeout(s.run, s.at));
    return () => timers.forEach(clearTimeout);
  }, [enabled]);
}

/** Reloj de HUD: cb(segundosTranscurridos) una vez por segundo mientras corre. */
export function useTicker(running: boolean, cb: (elapsedS: number) => void): void {
  const cbRef = useRef(cb);
  // Patrón latest-ref: la escritura va en un efecto (el compiler de React
  // prohíbe tocar refs durante el render).
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => cbRef.current(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
}

/** Segundos que lleva montado el componente (para animar métricas). */
export function useElapsed(running = true): number {
  const [s, setS] = useState(0);
  useTicker(running, setS);
  return s;
}

// ---------------------------------------------------------------------------
// Formateadores compartidos — espejo de ios/FAHYBRIK/Workout/CountdownFormat.swift
// y de cómo los HUDs pintan ritmo/tiempo. Una sola fuente para todas las pantallas.
// ---------------------------------------------------------------------------

/** 125 → «2:05»; 3725 → «1:02:05». */
export function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Ritmo de ergómetro: segundos por 500 m → «1:52». */
export function fmtPace500(secondsPer500: number): string {
  if (!Number.isFinite(secondsPer500) || secondsPer500 <= 0) return '—';
  return fmtClock(Math.round(secondsPer500));
}

/** Ritmo de carrera: segundos por km → «4:35». */
export function fmtPaceKm(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—';
  return fmtClock(Math.round(secondsPerKm));
}

/** Zona FC 1–5 a partir de bpm y FCmáx — espejo de HRZoneClassifier (ZoneColors.swift). */
export function hrZone(bpm: number, hrMax: number): 1 | 2 | 3 | 4 | 5 {
  if (hrMax <= 0) return 1;
  const pct = bpm / hrMax;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}
