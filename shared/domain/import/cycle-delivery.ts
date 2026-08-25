// Cycle import — CONTRACT OF DELIVERY, never of content (card 133 / 128 hueco 6).
//
// Recortar lo que un entrenador puede prescribir es recortarle el producto.
// Aquí solo se limita CÓMO nos lo entrega: un tramo revisable, un techo por
// importación, y un umbral de cobertura para poder confirmar. El contenido
// lo dicta él; lo no tipado entra como nota declarada, jamás como
// prescripción a medias.
//
// El umbral NO se inventa. Es el trinquete vivo del corpus de 1.238 líneas
// (web/tests/import/corpus-macrociclo.test.ts, 2026-08-25): 71 % (884 de
// 1.238). Si el banco sube, este número sube en el mismo lote. No es
// metodología de un coach: es la calidad de NUESTRA gramática.

/** Unidad de importación: un tramo, no las 12 semanas de golpe. */
export const CYCLE_IMPORT_STRETCH_MIN = 4;
/** Techo duro por importación. Doce semanas no las revisa nadie. */
export const CYCLE_IMPORT_STRETCH_MAX = 6;

/**
 * Trinquete de cobertura del corpus (card 128 · hueco 5).
 * Confirm se niega por debajo. Revisar la propuesta siempre se puede.
 */
export const CYCLE_IMPORT_COVERAGE_RATCHET_PCT = 71;

export type CycleCoverageSummary = {
  total_items: number;
  detected: number;
};

export type CycleStretchError =
  | { code: 'empty_source'; message: string }
  | { code: 'unknown_weeks'; message: string }
  | { code: 'over_ceiling'; message: string }
  | { code: 'inverted_range'; message: string };

export type CycleStretchOk<T> = {
  weeks: T[];
  week_from: number;
  week_to: number;
};

/** Porcentaje entero 0–100. Sin ítems no hay cobertura que medir: 0. */
export function coveragePct(summary: CycleCoverageSummary): number {
  if (summary.total_items <= 0) return 0;
  if (summary.detected <= 0) return 0;
  return Math.floor((summary.detected / summary.total_items) * 100);
}

/** True solo si hay líneas y el porcentaje llega al trinquete. */
export function coverageAllowsConfirm(summary: CycleCoverageSummary): boolean {
  if (summary.total_items <= 0) return false;
  return coveragePct(summary) >= CYCLE_IMPORT_COVERAGE_RATCHET_PCT;
}

export function coverageRefuseMessage(summary: CycleCoverageSummary): string {
  const pct = coveragePct(summary);
  return (
    `La cobertura tipada es ${pct} % (${summary.detected} de ${summary.total_items}). ` +
    `Hace falta ${CYCLE_IMPORT_COVERAGE_RATCHET_PCT} % (trinquete del corpus) para confirmar. ` +
    `Puedes revisar las líneas; confirmar el tramo entero no, todavía.`
  );
}

/**
 * Recorta una lista de semanas numeradas al tramo pedido.
 * `week_from` / `week_to` son los números que trae la fuente (1-based),
 * no índices. Si el documento cabe entero en el techo y no hay rango,
 * se toma todo. Si hay más semanas que el techo y no hay rango, se niega.
 */
export function sliceCycleWeeks<T extends { week: number }>(params: {
  weeks: readonly T[];
  week_from?: number | undefined;
  week_to?: number | undefined;
}): CycleStretchOk<T> | CycleStretchError {
  const numbered = [...params.weeks].filter((w) => Number.isInteger(w.week) && w.week > 0);
  if (numbered.length === 0) {
    return {
      code: 'empty_source',
      message: 'Este documento no trae ninguna semana de entreno.',
    };
  }
  numbered.sort((a, b) => a.week - b.week);

  const hasRange = params.week_from != null || params.week_to != null;
  if (!hasRange) {
    if (numbered.length > CYCLE_IMPORT_STRETCH_MAX) {
      return {
        code: 'over_ceiling',
        message:
          `El documento tiene ${numbered.length} semanas. ` +
          `Importa un tramo de ${CYCLE_IMPORT_STRETCH_MIN} a ${CYCLE_IMPORT_STRETCH_MAX} ` +
          `(el techo por importación).`,
      };
    }
    return {
      weeks: numbered,
      week_from: numbered[0]!.week,
      week_to: numbered[numbered.length - 1]!.week,
    };
  }

  const from = params.week_from ?? numbered[0]!.week;
  const to = params.week_to ?? from;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    return {
      code: 'inverted_range',
      message: 'Indica un tramo con semanas enteras mayores que cero.',
    };
  }
  if (from > to) {
    return {
      code: 'inverted_range',
      message: `El tramo ${from} a ${to} está al revés: la primera semana no puede ir después de la última.`,
    };
  }
  const span = to - from + 1;
  if (span > CYCLE_IMPORT_STRETCH_MAX) {
    return {
      code: 'over_ceiling',
      message:
        `Un tramo de ${span} semanas pasa el techo de ${CYCLE_IMPORT_STRETCH_MAX}. ` +
        `Elige ${CYCLE_IMPORT_STRETCH_MAX} o menos.`,
    };
  }

  const sliced = numbered.filter((w) => w.week >= from && w.week <= to);
  if (sliced.length === 0) {
    const known = numbered.map((w) => w.week).join(', ');
    return {
      code: 'unknown_weeks',
      message: `En este documento no hay semanas ${from} a ${to}. Trae: ${known}.`,
    };
  }
  return { weeks: sliced, week_from: from, week_to: to };
}
