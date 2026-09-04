// semana-model — derivaciones PURAS del tablero SEMANA del microciclo (rediseño
// ago-2026, docs/design/contrato-rediseno-editor-microciclos.md). Client-safe:
// todo se deriva de los datos ya servidos (MicroWeek / DayModalityInfo / el
// slots_json que devuelve GET /api/coach/program-weeks/[id]) — cero schema nuevo.

import type { V2Modality } from '@/components/v2/constants';
import { DAY_LABELS_FULL, type DayBlockInfo, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import type {
  EditorSessionInput,
  WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { legacyItemToPrescription } from '@fahybrid/shared/domain/prescription';

// ── Slot de sesión (posicional) ──────────────────────────────────────────────
// El slot NO se persiste: es posicional (0 = AM, 1 = PM, 2+ = Extra), la misma
// convención de editor-data.mapSession / DayEditor.NEXT_SLOT. La hora no existe
// en el dato de semana, así que el chip enseña solo el slot (honestidad §7).
export function slotLabelForIndex(index: number): string {
  return index === 0 ? 'AM' : index === 1 ? 'PM' : 'EXTRA';
}

// ── Bloque sin dosis utilizable ──────────────────────────────────────────────
// Contrato: «un bloque sin dosis = ningún item con prescripción utilizable». El
// dato de semana trae las líneas TRUNCADAS (primeras 2 por bloque), así que solo
// se afirma lo PROBABLE: bloque vacío, o bloque cuyas líneas están completas
// (item_count ≤ líneas servidas) y ninguna trae texto de dosis. Un bloque de 3+
// items con las 2 visibles sin dosis NO se marca (no se puede probar desde aquí;
// la derivación exacta vive con la prescripción completa, lado editor).
export function blockSinDosis(block: DayBlockInfo): boolean {
  if (block.item_count === 0) return true;
  if (block.item_count > block.lines.length) return false;
  return block.lines.length > 0 && block.lines.every((l) => !l.dose);
}

/** Bloques sin dosis utilizable en un día (todas sus sesiones). */
export function daySinDosisCount(day: DayModalityInfo): number {
  return day.sessions.reduce(
    (n, s) => n + s.blocks.filter(blockSinDosis).length,
    0,
  );
}

/** Bloques sin dosis utilizable en la semana entera. */
export function weekSinDosisCount(days: DayModalityInfo[]): number {
  return days.reduce((n, d) => n + daySinDosisCount(d), 0);
}

/**
 * Dónde vive el control Descanso del tablero. Un día CON sesiones no puede
 * colgarlo debajo de las SessionCard (son Links a `?dia=`): 15ab1d0b lo puso
 * tras el footer y el coach no podía seleccionarlo — el hit target del día
 * son las cards. `before-sessions` = action row encima de los Links.
 */
export function dayRestControlSlot(
  day: Pick<DayModalityInfo, 'session_count' | 'is_rest'>,
): 'before-sessions' | 'empty-card' | 'rest-link' {
  if (day.session_count > 0) return 'before-sessions';
  if (day.is_rest) return 'rest-link';
  return 'empty-card';
}

/** 1..7 del primer día con un bloque sin dosis — para que el chip ámbar abra donde hay trabajo. */
export function firstSinDosisDay(days: DayModalityInfo[]): number | null {
  const day = days.find((d) => daySinDosisCount(d) > 0);
  return day ? day.day_of_week : null;
}

// ── Reparto de modalidades (barras apiladas, por nº de bloques) ──────────────
// `null` = bloque sin clasificar: segmento neutro, nunca se disfraza de una
// modalidad real (el color jamás miente; el texto «N bl / N ej» acompaña siempre).
export interface ModalitySegment {
  modality: V2Modality | null;
  count: number;
}

export function modalitySegments(blocks: DayBlockInfo[]): ModalitySegment[] {
  const counts = new Map<V2Modality | null, number>();
  const order: Array<V2Modality | null> = [];
  for (const b of blocks) {
    if (!counts.has(b.modality)) order.push(b.modality);
    counts.set(b.modality, (counts.get(b.modality) ?? 0) + 1);
  }
  return order.map((modality) => ({ modality, count: counts.get(modality) ?? 0 }));
}

/** Todos los bloques de un día, en orden de sesión (AM → PM → extra). */
export function dayBlocks(day: DayModalityInfo): DayBlockInfo[] {
  return day.sessions.flatMap((s) => s.blocks);
}

/** Todos los bloques de la semana, en orden Lun→Dom. */
export function weekBlocks(days: DayModalityInfo[]): DayBlockInfo[] {
  return days.flatMap(dayBlocks);
}

/** Suma de bloques / ejercicios de la semana (contadores del weekstrip). */
export function weekBlockCount(days: DayModalityInfo[]): number {
  return days.reduce((n, d) => n + d.block_count, 0);
}
export function weekItemCount(days: DayModalityInfo[]): number {
  return days.reduce((n, d) => n + d.item_count, 0);
}

// Modalidades distintas presentes en la semana (orden de aparición) — puntitos
// de las pestañas S1..SN y resumen honesto de cobertura.
export function weekModalities(days: DayModalityInfo[]): V2Modality[] {
  const seen = new Set<V2Modality>();
  const out: V2Modality[] = [];
  for (const d of days) {
    for (const m of d.modalities) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

// ── Frontera SEMANA↔DÍA (contrato, interfaz pineada) ─────────────────────────
// Shape EXACTO del `DayRailDay` que DÍA exporta desde DayEditor.tsx. Se declara
// aquí estructuralmente para que SEMANA construya el outline sin esperar a DÍA
// (tipado estructural: cuando DayRailDay exista, esto encaja tal cual).
export interface SemanaOutlineDay {
  dia: number;
  nombre: string;
  resumen: string;
  modalidades: string[];
  descanso: boolean;
}

/**
 * El outline de la semana para el rail del editor de DÍA: por día, nombre corto
 * (Lun…Dom), resumen honesto (título de la 1ª sesión, o su primer bloque si la
 * sesión no tiene título; 'descanso' / 'vacío' si no hay entreno) y modalidades.
 */
export function buildWeekOutline(days: DayModalityInfo[]): SemanaOutlineDay[] {
  return days.map((d, i) => ({
    dia: d.day_of_week,
    nombre: DAY_LABELS_FULL[i]?.slice(0, 3) ?? `D${d.day_of_week}`,
    resumen:
      d.session_count > 0
        ? d.sessions[0]?.focus ?? d.sessions[0]?.blocks[0]?.title ?? 'entreno'
        : d.is_rest
          ? 'descanso'
          : 'vacío',
    modalidades: d.modalities,
    descanso: d.is_rest,
  }));
}

// ── Día persistido → sesiones en el wire del editor ──────────────────────────
// «Copiar otro día aquí» reusa el endpoint EXISTENTE de copia de día
// (PUT /api/coach/program-weeks/[id]/day/copy), que espera las sesiones del día
// ORIGEN en el wire del editor. Esta conversión es la composición de las dos
// piezas canónicas ya escritas: el mapeo del loader (editor-data.mapSession/
// mapPart/mapItem: slot posicional, prescripción estructurada o derivada de
// legacy) y el wire del editor (DayEditor.sessionsToWire: mismos campos, ni uno
// más). config_json / coach_note / group / notas de bloque NO viajan: el
// serializer del servidor las preserva por uid contra el día origen persistido —
// que es exactamente lo que enviamos, así que el clon es fiel.
export function rawDayToWireSessions(day: WeekDay): EditorSessionInput[] {
  return (day.sessions ?? []).map((s, i) => ({
    uid: `session-${i}`,
    slot: i === 0 ? 'am' : i === 1 ? 'pm' : 'extra',
    ...(s.focus ? { focus: s.focus } : {}),
    blocks: (s.blocks ?? []).map((b, bi) => ({
      uid: b.uid || `block-${bi}`,
      title: b.title,
      format: b.format,
      methodology_group_id: b.methodology_group_id ?? null,
      source_block_id: b.source_block_id ?? null,
      // Un bloque OPCIONAL sigue siéndolo en la copia — dropearlo aquí sería
      // perder el atributo en silencio, no solo un problema de tipos.
      ...(b.optional ? { optional: true } : {}),
      items: (b.items ?? []).map((it) => ({
        uid: it.uid,
        exercise_id: Number(it.exercise_id),
        exercise_name: it.exercise_name,
        prescription:
          it.prescription_json ??
          legacyItemToPrescription({
            params_json: (it.params_json ?? null) as Record<string, unknown> | null,
            notes: it.notes ?? null,
          }),
        ...(it.notes ? { notes: it.notes } : {}),
      })),
    })),
  }));
}
