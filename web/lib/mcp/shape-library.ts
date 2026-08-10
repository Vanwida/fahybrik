// Lo que el conector pone en el cable para LA BIBLIOTECA y LA METODOLOGÍA.
//
// Resultados de búsqueda: cortos por definición. Cada fila lleva el id con el que
// se pide el detalle, el nombre CON EL QUE EL COACH LO LLAMA (el merge de su
// override gana a la base) y UNA línea de qué es. Nada más: si el asistente
// necesita el desglose, ya tiene el id.
//
// LOS TRES PELDAÑOS de la biblioteca son entidades distintas y se cuentan aparte
// aunque se busquen juntas: un EJERCICIO es un movimiento del catálogo, un BLOQUE
// es una pieza de metodología del coach (a veces solo prosa, sin tipar), y una
// PLANTILLA es una sesión entera. Devolverlos revueltos en una lista haría que el
// asistente ofreciera un ejercicio donde hace falta una sesión.

import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import type { BlockWithStructure, BlockReadiness } from '@/lib/dashboard/coach/blocks';
import type { TemplateListRow } from '@/lib/dashboard/coach/templates';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import type { DocumentSummary } from '@/lib/rag/repository';

/** Cuántos caracteres de la prosa de un bloque sin tipar valen como resumen. */
const BLOCK_PROSE_CHARS = 140;

/** Qué le falta a un bloque para que un atleta pueda ejecutarlo. */
const READINESS_ES: Record<BlockReadiness, string> = {
  sin_tipar: 'sin desglosar: solo tiene el texto, no se puede poner en un día',
  sin_dosis: 'desglosado pero con líneas sin dosis',
  listo: 'listo para poner en un día',
};

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function toExerciseHit(e: CoachExerciseRow): Record<string, unknown> {
  return {
    exercise_id: e.id,
    // El nombre del coach si renombró la base; si no, la base. Es el único que él
    // reconoce.
    name: e.name,
    slug: e.slug,
    category: e.category,
    modality: e.modality,
    /** base = del catálogo; customized = base que él tocó; own = suyo entero. */
    origin: e.origin,
    equipment: e.equipment,
  };
}

export function toBlockHit(
  b: BlockWithStructure,
  readiness: BlockReadiness,
): Record<string, unknown> {
  return {
    block_id: b.id,
    title: b.title,
    methodology_group_id: b.methodology_group_id,
    format: b.format,
    /** De qué va, en una línea: el verbatim con el que lo escribió. */
    content: oneLine(b.description, BLOCK_PROSE_CHARS),
    exercise_count: b.exercise_count,
    /** Cuántas piezas mete en el día (un bloque no siempre es una). */
    part_count: b.part_count,
    readiness,
    readiness_es: READINESS_ES[readiness],
  };
}

export function toTemplateHit(t: TemplateListRow): Record<string, unknown> {
  return {
    template_id: t.id,
    name: t.name,
    format: t.format,
    /** Cuántas líneas y en cuántos bloques — el tamaño de la sesión. */
    exercise_count: t.segment_count,
    block_count: t.block_count,
    /** Un borrador todavía no está para programar. */
    is_draft: t.is_draft,
    target_level: t.target_level,
    updated_at: t.updated_at,
  };
}

export function libraryResumen(params: {
  query: string;
  exercises: number | null;
  blocks: number | null;
  templates: number | null;
}): string {
  const parts: string[] = [];
  const push = (n: number | null, one: string, many: string) => {
    if (n == null) return;
    parts.push(`${n} ${n === 1 ? one : many}`);
  };
  push(params.exercises, 'ejercicio', 'ejercicios');
  push(params.blocks, 'bloque', 'bloques');
  push(params.templates, 'plantilla', 'plantillas');

  const total = (params.exercises ?? 0) + (params.blocks ?? 0) + (params.templates ?? 0);
  if (total === 0) return `Nada en tu biblioteca para «${params.query}».`;

  const body =
    parts.length <= 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `«${params.query}»: ${body}.`;
}

// ---------------------------------------------------------------------------
// search_methodology
// ---------------------------------------------------------------------------

/**
 * Un pasaje del corpus del coach, CON su procedencia. Sin la fuente el asistente
 * no puede decir de dónde sale lo que afirma, y una cita sin fuente en boca de un
 * entrenador vale menos que nada.
 */
export function toPassage(c: RetrievedChunk): Record<string, unknown> {
  return {
    document_id: c.document_id,
    document_title: c.document_title,
    /** De qué tipo es la fuente: texto, transcripción, documento subido, nota de voz. */
    source_type: c.document_source_type,
    /** Qué trozo del documento es (0 = el primero), por si hay que leer alrededor. */
    chunk_index: c.chunk_index,
    /** 1 = idéntico a lo preguntado. Es coseno, no una nota. */
    similarity: Math.round(c.similarity * 1000) / 1000,
    content: c.content,
  };
}

export function methodologyResumen(params: {
  query: string;
  chunks: RetrievedChunk[];
  documents: DocumentSummary[];
}): string {
  const total = params.documents.length;
  const corpus = `${total} ${total === 1 ? 'documento' : 'documentos'}`;
  if (params.chunks.length === 0) {
    return `Nada en tu metodología sobre «${params.query}», y tienes ${corpus} indexados.`;
  }
  // De QUÉ documentos sale: es lo que permite al asistente citar sin abrir nada.
  const titles = [...new Set(params.chunks.map((c) => c.document_title))];
  const n = params.chunks.length;
  return `${n} ${n === 1 ? 'pasaje' : 'pasajes'} sobre «${params.query}», de ${titles.map((t) => `«${t}»`).join(', ')}.`;
}

/**
 * Lo que se le dice al coach que no ha indexado nada. NO un array vacío: un array
 * vacío es «no hay nada sobre eso», y aquí lo que no hay es corpus — dos cosas
 * distintas que llevan a consejos opuestos.
 */
export const NO_METHODOLOGY_MESSAGE =
  'Todavía no tienes ningún documento de metodología indexado, así que no hay nada donde buscar. Sube tus textos, transcripciones o notas de voz en Metodología del panel y vuelve a preguntar.';
