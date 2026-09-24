'use client';

// Cómo llama el coach a su eje de clasificación («Nivel» por defecto, o lo que
// haya puesto en Ajustes › Método). Para los componentes de cliente que no
// reciben el dato de su loader: una sola petición por carga de página
// (GET /api/coach/level-axis), compartida por todos los que la piden. Mientras
// llega, y si falla, se pinta el defecto del producto — nunca un hueco.

import { useEffect, useState } from 'react';
import { DEFAULT_LEVEL_AXIS_LABEL, effectiveLevelAxisLabel } from '@fahybrid/shared/domain/coach/level-axis';

let pending: Promise<string> | null = null;
let cached: string | null = null;

function fetchLabel(): Promise<string> {
  pending ??= fetch('/api/coach/level-axis', { credentials: 'include' })
    .then((r) => (r.ok ? (r.json() as Promise<{ level_axis_label?: string | null }>) : null))
    .then((d) => {
      cached = effectiveLevelAxisLabel(d?.level_axis_label ?? null);
      return cached;
    })
    .catch(() => {
      pending = null;
      return DEFAULT_LEVEL_AXIS_LABEL;
    });
  return pending;
}

export function useLevelAxisLabel(): string {
  const [label, setLabel] = useState(cached ?? DEFAULT_LEVEL_AXIS_LABEL);
  useEffect(() => {
    if (cached) return;
    let live = true;
    void fetchLabel().then((l) => {
      if (live) setLabel(l);
    });
    return () => {
      live = false;
    };
  }, []);
  return label;
}
