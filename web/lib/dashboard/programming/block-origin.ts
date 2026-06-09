import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';

/**
 * Origen de un bloque del día, de cara al coach (fricción F9 — "bloque" era
 * ambiguo). Un bloque insertado desde la Biblioteca de Pablo lleva
 * `source_block_id`; cualquier otro (formato a medida con ejercicios del
 * catálogo) es "a medida". No hay un tercer estado persistido: los bloques que
 * propone Pablo IA desde la biblioteca también llevan `source_block_id` y se
 * muestran como de biblioteca (referencian bloques reales de Pablo).
 */
export type BlockOrigin = 'library' | 'custom';

export interface BlockOriginInfo {
  origin: BlockOrigin;
  /** Etiqueta corta para el chip de la tarjeta. */
  label: string;
}

const ORIGIN_LABEL: Record<BlockOrigin, string> = {
  library: 'Biblioteca',
  custom: 'A medida',
};

export function blockOrigin(part: Pick<WeekDayPart, 'source_block_id'>): BlockOrigin {
  return part.source_block_id != null ? 'library' : 'custom';
}

export function blockOriginInfo(part: Pick<WeekDayPart, 'source_block_id'>): BlockOriginInfo {
  const origin = blockOrigin(part);
  return { origin, label: ORIGIN_LABEL[origin] };
}
