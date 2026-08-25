// Cycle document reader (card 128 · hueco 6). Turns a coach's OWN upload
// into `ImportedWeek[]` so `buildImportProposal` can type it. Two shapes:
//   · the structured JSON the corpus already uses (semanas / dias / bloques);
//   · markdown, via the existing document reader (cells → weeks/days).
//
// This is a READER, not a second importer. Dose typing stays in the grammar.
// `import_plan_html.ts` is the old one-coach file path and is not touched.

import { z } from 'zod';
import { readPlanDocument } from '@fahybrid/shared/domain/import/document';
import { foldAccents } from '@fahybrid/shared/domain/import/document-markdown';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import type { ImportedCard, ImportedDay, ImportedWeek } from './imported-week';

export const CYCLE_DOCUMENT_MAX_CHARS = 400_000;

const cycleBloqueSchema = z.object({
  nombre: z.string(),
  contenido: z.string(),
});

const cycleDiaSchema = z.object({
  dia: z.string(),
  sesion: z.string().optional(),
  prioridad: z.string().optional(),
  priority: z.string().optional(),
  sustituible: z.string().optional(),
  substitute: z.string().optional(),
  alternativa: z.string().optional(),
  alternative: z.string().optional(),
  notas: z.string().optional(),
  bloques: z.array(cycleBloqueSchema).optional(),
});

const cycleSemanaSchema = z.object({
  numero: z.number().int().positive(),
  subtitulo: z.string().optional(),
  objetivo: z.string().optional(),
  dias: z.array(cycleDiaSchema),
});

export const cycleDocumentJsonSchema = z.object({
  semanas: z.array(cycleSemanaSchema).min(1),
});

export type CycleDocumentJson = z.infer<typeof cycleDocumentJsonSchema>;

const WEEKDAY_INDEX = new Map(
  DAY_LABELS_FULL.map((name, i) => [foldAccents(name), i + 1]),
);

export function weekdayToDow(raw: string): number | null {
  const folded = foldAccents(raw);
  const exact = WEEKDAY_INDEX.get(folded);
  if (exact) return exact;
  for (const [name, dow] of WEEKDAY_INDEX) {
    if (folded.startsWith(name.slice(0, 3))) return dow;
  }
  return null;
}

function cardsFromBloques(
  bloques: Array<{ nombre: string; contenido: string }> | undefined,
  notas?: string,
): ImportedCard[] {
  const cards: ImportedCard[] = [];
  for (const b of bloques ?? []) {
    const lines = b.contenido.split('\n').map((l) => l.trim()).filter(Boolean);
    cards.push({
      title: b.nombre.trim() || null,
      kind: 'workout',
      lines,
    });
  }
  const note = notas?.trim();
  if (note) {
    cards.push({ title: null, kind: 'note', lines: [note] });
  }
  return cards;
}

function dayFromJson(d: z.infer<typeof cycleDiaSchema>): ImportedDay | null {
  const dow = weekdayToDow(d.dia);
  if (dow == null) return null;
  const cards = cardsFromBloques(d.bloques, d.notas);
  const stimulus = d.sesion?.trim() || null;
  return {
    day_of_week: dow,
    dow: DAY_LABELS_FULL[dow - 1]!,
    stimulus,
    session_text: null,
    ...(cards.length > 0 ? { cards } : {}),
    ...((d.prioridad ?? d.priority) ? { prioridad: (d.prioridad ?? d.priority)! } : {}),
    ...((d.sustituible ?? d.substitute) ? { sustituible: (d.sustituible ?? d.substitute)! } : {}),
    ...((d.alternativa ?? d.alternative) ? { alternativa: (d.alternativa ?? d.alternative)! } : {}),
  };
}

function fillWeekDays(partial: ImportedDay[]): ImportedDay[] {
  const byDow = new Map(partial.map((d) => [d.day_of_week, d]));
  const days: ImportedDay[] = [];
  for (let dow = 1; dow <= 7; dow += 1) {
    days.push(
      byDow.get(dow) ?? {
        day_of_week: dow,
        dow: DAY_LABELS_FULL[dow - 1]!,
        stimulus: null,
        session_text: null,
        cards: [],
      },
    );
  }
  return days;
}

export function cycleJsonToImportedWeeks(doc: CycleDocumentJson): ImportedWeek[] {
  return doc.semanas.map((s) => ({
    week: s.numero,
    sheet: s.subtitulo?.trim() || `Semana ${s.numero}`,
    fell_back: false,
    days: fillWeekDays(s.dias.map(dayFromJson).filter((d): d is ImportedDay => d != null)),
  }));
}

function tryParseCycleJson(text: string): CycleDocumentJson | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const wrapped =
    Array.isArray(parsed) ? { semanas: parsed } : parsed;
  const ok = cycleDocumentJsonSchema.safeParse(wrapped);
  return ok.success ? ok.data : null;
}

/** Markdown cells that named a week become cards on that week/day. */
export function markdownToImportedWeeks(markdown: string): ImportedWeek[] {
  const cells = readPlanDocument(markdown);
  const byWeek = new Map<number, Map<number, ImportedCard[]>>();
  for (const cell of cells) {
    if (!cell.trainable || cell.week == null) continue;
    const dow = cell.day ? weekdayToDow(cell.day) : 1;
    if (dow == null) continue;
    let days = byWeek.get(cell.week);
    if (!days) {
      days = new Map();
      byWeek.set(cell.week, days);
    }
    const cards = days.get(dow) ?? [];
    cards.push({
      title: cell.h3 ?? cell.h2 ?? null,
      kind: 'workout',
      lines: cell.text.split('\n').map((l) => l.trim()).filter(Boolean),
    });
    days.set(dow, cards);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, days]) => {
      const partial: ImportedDay[] = [...days.entries()].map(([dow, cards]) => ({
        day_of_week: dow,
        dow: DAY_LABELS_FULL[dow - 1]!,
        stimulus: cards[0]?.title ?? null,
        session_text: null,
        cards,
      }));
      return {
        week,
        sheet: `Semana ${week}`,
        fell_back: false,
        days: fillWeekDays(partial),
      };
    });
}

export type CycleSourceKind = 'json' | 'markdown';

export function readCycleDocument(text: string): {
  kind: CycleSourceKind;
  weeks: ImportedWeek[];
} {
  const json = tryParseCycleJson(text);
  if (json) return { kind: 'json', weeks: cycleJsonToImportedWeeks(json) };
  return { kind: 'markdown', weeks: markdownToImportedWeeks(text) };
}
