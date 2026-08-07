'use client';

// use-day-sessions — el estado local de las sesiones del día y TODAS sus
// mutaciones (extraído de DayEditor.tsx en el rediseño para respetar el techo de
// 500 líneas). Semántica idéntica a la de siempre: estado local + Prescription
// estructurada; quien persiste es el orquestador (day-editor-io.ts).

import { useState } from 'react';
import type { EditorBlock, EditorItem, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ParsedLine } from '@fahybrid/shared/domain/import/notation';
import { createBlockFromArchetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { withPickedExercise } from '@/lib/dashboard/v2/pick-exercise';
import type { PickedExercise } from './ExercisePicker';
import { blockFromQuickLines } from './quickline-block';

// Slot de la siguiente sesión de un día según cuántas tiene (AM → PM → Extra).
// Exportado: el orquestador etiqueta con él su botón «Añadir sesión».
export const NEXT_SLOT: Record<number, EditorSession['slot']> = { 0: 'am', 1: 'pm' };

export function useDaySessions(initial: EditorSession[]) {
  const [sessions, setSessions] = useState<EditorSession[]>(initial);

  // Título del entreno (session.focus) — un input junto a la cabecera de sesión.
  const setSessionFocus = (uid: string, focus: string) =>
    setSessions((prev) => prev.map((s) => (s.uid === uid ? { ...s, focus } : s)));

  // Nota del entreno (session.notes) — lo que el atleta lee antes de empezar.
  // Mismo patrón que el título: autoritativa desde el input, y vaciarla la borra
  // (el wire descarta el vacío y el serializer persiste el borrado).
  const setSessionNote = (uid: string, notes: string) =>
    setSessions((prev) => prev.map((s) => (s.uid === uid ? { ...s, notes } : s)));

  const addSession = () => {
    const slot = NEXT_SLOT[sessions.length] ?? 'extra';
    setSessions((prev) => [
      ...prev,
      { uid: `session-${prev.length}-${Date.now()}`, slot, blocks: [] },
    ]);
  };

  // «＋ Bloque» (picker inline) — el coach elige un TIPO; se crea un bloque listo
  // SIN sección (agnóstico) y se añade al final. El coach lo nombra en línea.
  const addBlockOfType = (sessionUid: string, archetype: ArchetypeId) => {
    const block = createBlockFromArchetype(archetype);
    setSessions((prev) =>
      prev.map((s) => (s.uid === sessionUid ? { ...s, blocks: [...s.blocks, block] } : s)),
    );
  };

  // El seam GENÉRICO «añade estos bloques a esta sesión» — lo usan las dos vías
  // que traen bloques ya hechos: «Redactar con IA» (#33) y la Biblioteca.
  const addBlocksToSession = (sessionUid: string, newBlocks: EditorBlock[]) => {
    setSessions((prev) =>
      prev.map((s) => (s.uid === sessionUid ? { ...s, blocks: [...s.blocks, ...newBlocks] } : s)),
    );
  };

  // Quickline (decisión 2): UNA entrada → UN bloque tipado en la sesión activa
  // (la primera si ninguna se tocó; si el día no tiene, se crea la AM). Lo no
  // entendido entra a revisar con su verbatim — blockFromQuickLines es honesto.
  const addQuickBlock = (lines: ParsedLine[], activeSessionUid: string | null) => {
    const block = blockFromQuickLines(lines);
    setSessions((prev) => {
      if (prev.length === 0) {
        return [{ uid: `session-0-${Date.now()}`, slot: 'am' as const, blocks: [block] }];
      }
      const target = prev.find((s) => s.uid === activeSessionUid) ?? prev[0]!;
      return prev.map((s) =>
        s.uid === target.uid ? { ...s, blocks: [...s.blocks, block] } : s,
      );
    });
  };

  const removeBlock = (sessionUid: string, blockUid: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid ? { ...s, blocks: s.blocks.filter((b) => b.uid !== blockUid) } : s,
      ),
    );
  };

  const updateBlock = (sessionUid: string, next: EditorBlock) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid
          ? { ...s, blocks: s.blocks.map((b) => (b.uid === next.uid ? next : b)) }
          : s,
      ),
    );
  };

  // Reordena los bloques de una sesión (asa de arrastre — dnd-kit da el orden).
  const reorderBlocks = (sessionUid: string, orderedUids: string[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.uid !== sessionUid) return s;
        const byUid = new Map(s.blocks.map((b) => [b.uid, b]));
        const blocks = orderedUids
          .map((uid) => byUid.get(uid))
          .filter((b): b is EditorBlock => b !== undefined);
        // Solo una permutación de verdad (nunca perder/añadir un bloque aquí).
        return blocks.length === s.blocks.length ? { ...s, blocks } : s;
      }),
    );
  };

  // Renombra un bloque en línea (la etiqueta del coach — la lee el atleta).
  const renameBlock = (sessionUid: string, blockUid: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid
          ? { ...s, blocks: s.blocks.map((b) => (b.uid === blockUid ? { ...b, title } : b)) }
          : s,
      ),
    );
  };

  // Alterna «Opcional» de un bloque (fase 2, ago-2026) — mismo patrón que
  // renameBlock: autoritativo desde el input, el serializer lo persiste tal
  // cual, incluida la vuelta a false (editor-serialize.ts, `?? false`).
  const toggleOptional = (sessionUid: string, blockUid: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid
          ? {
              ...s,
              blocks: s.blocks.map((b) =>
                b.uid === blockUid ? { ...b, optional: !b.optional } : b,
              ),
            }
          : s,
      ),
    );
  };

  // Reordena un ejercicio dentro de su bloque (↑/↓).
  const moveItem = (sessionUid: string, blockUid: string, itemUid: string, dir: -1 | 1) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid !== sessionUid
          ? s
          : {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.uid !== blockUid) return b;
                const i = b.items.findIndex((it) => it.uid === itemUid);
                const j = i + dir;
                if (i < 0 || j < 0 || j >= b.items.length) return b;
                const items = b.items.slice();
                [items[i], items[j]] = [items[j]!, items[i]!];
                return { ...b, items };
              }),
            },
      ),
    );
  };

  // «añadir ejercicio» → primero el catálogo, luego la línea ya enlazada (sin
  // huérfanas A3). El item nuevo hereda la prescripción semilla del bloque.
  const addPickedItemToBlock = (sessionUid: string, blockUid: string, ex: PickedExercise) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid !== sessionUid
          ? s
          : {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.uid !== blockUid) return b;
                const seed = b.items[0]?.prescription ?? {
                  scheme: 'sets' as const,
                  modality: 'strength' as const,
                  sets: [{ measure: { kind: 'reps' as const, value: 8 } }],
                };
                const fresh: EditorItem = {
                  uid: `item-${Date.now()}`,
                  exercise_id: null,
                  exercise_name: '',
                  prescription: seed,
                };
                const patch = withPickedExercise(fresh, ex);
                return { ...b, items: [...b.items, { ...fresh, ...patch }] };
              }),
            },
      ),
    );
  };

  return {
    sessions,
    setSessionFocus,
    setSessionNote,
    addSession,
    addBlockOfType,
    addBlocksToSession,
    addQuickBlock,
    removeBlock,
    updateBlock,
    reorderBlocks,
    renameBlock,
    toggleOptional,
    moveItem,
    addPickedItemToBlock,
  };
}
