// Cómo se LEE la tanda en vivo: 1 / 2 / 3, no solo la serie en curso.
// La ventana es la misma del riel (cerrada de antes, actual, siguiente).

export const TANDA_TODAS_HASTA = 4;
export const TANDA_VENTANA = 3;

export type TandaEstado = 'hecha' | 'actual' | 'futura' | 'saltada';

export type TandaPaso = {
  n: number;
  estado: TandaEstado;
};

export type TandaStrip = {
  pasos: readonly TandaPaso[];
  total: number;
};

export function tandaIndices(total: number, actual: number): number[] {
  if (total <= 0) return [];
  const cursor = Math.min(Math.max(0, actual), Math.max(0, total - 1));
  if (total <= TANDA_TODAS_HASTA) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const ancho = Math.min(TANDA_VENTANA, total);
  const inicio = Math.min(Math.max(0, cursor - 1), Math.max(0, total - ancho));
  return Array.from({ length: ancho }, (_, k) => inicio + k);
}

export function tandaStrip(input: {
  total: number;
  actual: number;
  hechas: readonly number[];
  saltadas?: readonly number[];
}): TandaStrip {
  const hechas = new Set(input.hechas);
  const saltadas = new Set(input.saltadas ?? []);
  return {
    total: input.total,
    pasos: tandaIndices(input.total, input.actual).map((i) => {
      const estado: TandaEstado = saltadas.has(i)
        ? 'saltada'
        : hechas.has(i)
          ? 'hecha'
          : i === input.actual
            ? 'actual'
            : 'futura';
      return { n: i + 1, estado };
    }),
  };
}

export function tandaSeLee(strip: TandaStrip): string {
  return strip.pasos.map((p) => String(p.n)).join(' / ');
}

export function tandaEsVentana(strip: TandaStrip): boolean {
  return strip.pasos.length < strip.total;
}
