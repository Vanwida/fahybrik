// m/s → s/km, punto a punto. La traza NUNCA trae `pace` (docs/DECISIONS.md,
// "La carrera guarda su NEGATIVO": deliberado, para no guardar una
// interpretación) — esto es la conversión de unidad, no una interpretación:
// mismo dato, la unidad en la que corre piensa un corredor. Vive en
// `shared/domain` porque es aritmética pura reutilizable por cualquier
// lector, no una vista concreta.

export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

/**
 * Convierte una serie de velocidad (m/s) a ritmo (s/km), punto a punto.
 * Omite —nunca fabrica— los puntos con velocidad ≤ 0: parado no tiene un
 * ritmo, tiene una pausa, y un ritmo infinito no es un dato.
 */
export function speedSeriesToPace(speed: RunningTraceSeries): RunningTraceSeries {
  const n = Math.min(speed.offsets_s.length, speed.values.length);
  const offsets_s: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = speed.offsets_s[i];
    const v = speed.values[i];
    if (t == null || v == null || !Number.isFinite(t) || !Number.isFinite(v) || v <= 0) continue;
    offsets_s.push(t);
    values.push(1000 / v);
  }
  return { offsets_s, values };
}
