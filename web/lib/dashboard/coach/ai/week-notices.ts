/**
 * AVISOS de una semana generada — lo que la IA NO pudo hacer, dicho en voz alta.
 *
 * Regla del producto: un hueco que se rellena en silencio es un fallo. La app le
 * pidió un foco al coach, y si no puede honrarlo (porque su contenido no está
 * tipado, o porque el modelo se cayó) TIENE que decirlo — no maquillar la semana
 * con otra cosa y callarse. Este módulo es el vocabulario de esa honestidad.
 *
 * Puro y client-safe: lo construye el servidor y lo pinta el cliente sin duplicar
 * copy ni lógica en los dos lados.
 */

/** Ruta de la biblioteca de bloques del coach (destino de los avisos). */
export const BIBLIOTECA_HREF = '/biblioteca';

export type WeekNoticeCode =
  /** Bloques sin `block_exercises`: solo prosa → nada ejecutable que insertar. */
  | 'untyped_blocks'
  /** El modelo falló/no está configurado → la semana la compuso el heurístico. */
  | 'llm_fallback';

export interface WeekNotice {
  code: WeekNoticeCode;
  /** `warning` = afecta a lo que el coach pidió. `info` = contexto, no le rompe el foco. */
  tone: 'warning' | 'info';
  message: string;
  /** Destino para arreglarlo, cuando lo hay. */
  href?: string;
  cta?: string;
}

/** Un grupo metodológico con bloques sin tipar. */
export interface UntypedGroupSummary {
  /** `methodology_groups.name_es` — el nombre real, de la DB (nunca hardcodeado). */
  name: string;
  count: number;
  /** ¿El coach pidió este grupo en su foco? Decide si es warning o info. */
  requested: boolean;
}

/** "14 «Simulaciones» y 9 «WODs»" / "14 «Simulaciones», 9 «WODs» y 2 «Core»". */
function enumerate(groups: UntypedGroupSummary[]): string {
  const parts = groups.map((g) => `${g.count} «${g.name}»`);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]!}`;
}

/**
 * Aviso de contenido sin tipar. El caso real que lo motiva: las 14 simulaciones
 * y los 9 WODs de Pablo están escritos en prosa, sin ejercicios tipados, así que
 * "enfocado en HYROX" es hoy imposible de servir desde su biblioteca. Antes eso
 * salía como una semana normal y tan tranquilos; ahora se le dice.
 *
 * `null` cuando no hay nada que avisar — el llamador no filtra, solo concatena.
 */
export function untypedBlocksNotice(groups: UntypedGroupSummary[]): WeekNotice | null {
  if (groups.length === 0) return null;
  const requested = groups.filter((g) => g.requested);

  if (requested.length > 0) {
    return {
      code: 'untyped_blocks',
      tone: 'warning',
      message:
        `Tus ${enumerate(requested)} están sin tipar (son texto, sin ejercicios), ` +
        `así que no he podido usarlos — y es justo lo que pedías en el foco. ` +
        `La semana sale con el resto de tu biblioteca.`,
      href: BIBLIOTECA_HREF,
      cta: 'Tipar en la Biblioteca',
    };
  }

  const total = groups.reduce((n, g) => n + g.count, 0);
  return {
    code: 'untyped_blocks',
    tone: 'info',
    message: `He dejado fuera ${total} ${total === 1 ? 'bloque' : 'bloques'} sin tipar (${enumerate(groups)}): son texto, sin ejercicios que insertar.`,
    href: BIBLIOTECA_HREF,
    cta: 'Ver en la Biblioteca',
  };
}

/**
 * Aviso de fallback: el modelo no compuso y lo hizo el heurístico por grupos.
 * Un fallback MUDO es exactamente lo que hizo que esto reventara en producción
 * sin que nadie se enterara, así que aquí siempre se nombra.
 */
export function llmFallbackNotice(reason: string): WeekNotice {
  return {
    code: 'llm_fallback',
    tone: 'warning',
    message:
      `No he podido usar la IA para elegir los bloques (${reason}). ` +
      `Te he compuesto la semana repartiendo tu biblioteca por grupos, ` +
      `así que puede que no siga tu foco al pie de la letra: revísala.`,
  };
}
