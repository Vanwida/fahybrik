'use client';

// useHoldRepeat — mantener pulsado repite la acción (steppers del compositor).
// Un toque = un paso; mantener 420 ms arranca la repetición a 110 ms. Los dos
// números son percepción, no preferencia: por debajo de ~400 ms un toque normal
// dispara repeticiones fantasma, y por encima de ~120 ms la repetición se siente
// a tirones. Devuelve props de puntero listos para untar en el botón.

import { useCallback, useEffect, useRef } from 'react';

const HOLD_DELAY_MS = 420;
const REPEAT_INTERVAL_MS = 110;

export function useHoldRepeat(step: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
  }, []);

  const start = useCallback(
    (e: React.PointerEvent) => {
      // Solo botón principal / toque; un click derecho no debe repetir.
      if (e.button !== 0) return;
      e.preventDefault();
      stepRef.current();
      timer.current = setTimeout(() => {
        interval.current = setInterval(() => stepRef.current(), REPEAT_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    [],
  );

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
