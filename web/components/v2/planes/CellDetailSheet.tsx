'use client';

// El detalle de una celda: el compositor de siempre (RIR, descansos, %RM, series
// iguales o por serie, «El atleta ve…») para afinar lo que la línea rápida no
// dice, en un panel lateral NO modal — la rejilla sigue viva detrás. Se guarda
// solo (≈0,7 s después del último cambio). Una línea sin ejercicio no se guarda
// (regla del catálogo), pero no frena el resto del día: sigue en el editor con su
// aviso y espera. Al cerrar se vuelca lo pendiente; si quedan líneas sin ejercicio,
// se pregunta antes de descartarlas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WeekDay, WeekSession } from '@fahybrid/shared/schema/program-templates';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { Button, Dialog, Field, IconButton, Input, SectionHeader, Sheet, Textarea } from '@/components/v2/ui';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { editorBlocksToParts, partToEditorBlock, persistableBlocks } from '@/lib/dashboard/programming/editor-bridge';
import { emptyDay, freshUid, sameDay, workoutSessions } from '@/lib/dashboard/programming/grid-model';

const EMPTY_LINE: Prescription = { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 8 } }] };
const LETTERS = 'ABCDEFGHIJKLMNOP';

interface DraftEntreno {
  key: string;
  focus: string;
  notes: string;
  blocks: EditorBlock[];
  original: WeekSession;
}

function toDraft(day: WeekDay): DraftEntreno[] {
  return workoutSessions(day).map((s, i) => ({
    key: `s${i}`,
    focus: s.focus ?? '',
    notes: s.notes ?? '',
    blocks: (s.blocks ?? []).map(partToEditorBlock),
    original: s,
  }));
}

/** El día que se guarda a partir de los borradores, y cuántas líneas sin ejercicio se quedan fuera. */
function fromDraft(day: WeekDay, drafts: DraftEntreno[]): { day: WeekDay; unsaved: number } {
  let unsaved = 0;
  const sessions: WeekSession[] = drafts.map((d) => {
    const persist = persistableBlocks(d.blocks, d.original.blocks ?? []);
    unsaved += persist.unsaved;
    const s: WeekSession = { ...d.original, kind: 'workout', blocks: editorBlocksToParts(persist.blocks, d.original.blocks ?? []) };
    if (d.focus.trim()) s.focus = d.focus.trim().slice(0, 120);
    else delete s.focus;
    if (d.notes.trim()) s.notes = d.notes.trim();
    else delete s.notes;
    return s;
  });
  if (sessions.length === 0) {
    // Sin entrenos, lo escrito a nivel de día (foco, notas) se conserva.
    const empty = emptyDay(day.day_of_week);
    if (day.focus) empty.focus = day.focus;
    if (day.notes) empty.notes = day.notes;
    return { day: empty, unsaved };
  }
  const next: WeekDay = { ...day, sessions };
  delete next.kind;
  delete next.recovery_suggestions;
  return { day: next, unsaved };
}

export function CellDetailSheet({
  open,
  onOpenChange,
  row,
  col,
  day,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: number;
  col: number;
  day: WeekDay;
  onCommit: (day: WeekDay, label: string) => void;
}) {
  const [drafts, setDrafts] = useState<DraftEntreno[]>(() => toDraft(day));
  const [dirty, setDirty] = useState(false);
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  // Otra celda, o la misma cambiada desde fuera (deshacer, pegar): se relee.
  const cellKey = `${row}:${col}`;
  const lastKey = useRef(cellKey);
  useEffect(() => {
    if (lastKey.current !== cellKey || !dirty) {
      lastKey.current = cellKey;
      setDrafts(toDraft(day));
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de celda o de contenido
  }, [cellKey, day]);

  // Las refs dan a los manejadores (temporizador, cierre) siempre lo último.
  const draftsRef = useRef(drafts);
  const dirtyRef = useRef(dirty);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    draftsRef.current = drafts;
    dirtyRef.current = dirty;
    onCommitRef.current = onCommit;
  }, [drafts, dirty, onCommit]);

  /** Guarda ya lo guardable de los borradores; devuelve las líneas sin ejercicio que no entran. */
  const saveNow = useCallback((): number => {
    const { day: next, unsaved } = fromDraft(dayRef.current, draftsRef.current);
    if (!sameDay(next, dayRef.current)) onCommitRef.current(next, 'Edición en detalle');
    if (unsaved > 0) {
      // Lo guardado pasa a ser la referencia de «última versión guardada» de cada
      // entreno: si luego se vacía un ejercicio ya guardado, se restaura ése.
      setDrafts((list) =>
        list.length !== next.sessions.length || list.every((d, i) => JSON.stringify(d.original) === JSON.stringify(next.sessions[i]))
          ? list
          : list.map((d, i) => ({ ...d, original: next.sessions[i]! })),
      );
    }
    return unsaved;
  }, []);

  const unsavedLines = fromDraft(day, drafts).unsaved;

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      // Con líneas sin ejercicio pendientes el borrador sigue «sucio»: lo guardado
      // no debe repintar el editor y borrarlas.
      if (saveNow() === 0) setDirty(false);
    }, 700);
    return () => window.clearTimeout(t);
  }, [drafts, dirty, saveNow]);

  // Si el panel desaparece (otra celda, cierre desde fuera) lo pendiente se vuelca.
  useEffect(
    () => () => {
      if (dirtyRef.current) saveNow();
    },
    [saveNow],
  );

  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => {
    if (dirtyRef.current && saveNow() > 0) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  };
  const discardAndClose = () => {
    dirtyRef.current = false;
    setConfirmClose(false);
    onOpenChange(false);
  };

  const update = (i: number, patch: Partial<DraftEntreno>) => {
    setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setDirty(true);
  };
  const updateBlock = (i: number, uid: string, next: EditorBlock | null) =>
    update(i, { blocks: drafts[i]!.blocks.flatMap((b) => (b.uid === uid ? (next ? [next] : []) : [b])) });

  const addBlock = (i: number) =>
    update(i, {
      blocks: [
        ...drafts[i]!.blocks,
        { uid: freshUid(), title: `Bloque ${LETTERS[drafts[i]!.blocks.length] ?? ''}`.trim(), format: 'sets', items: [{ uid: freshUid(), exercise_id: null, exercise_name: '', prescription: EMPTY_LINE }] },
      ],
    });

  const addEntreno = () => {
    setDrafts((list) => [...list, { key: `n${Date.now()}`, focus: '', notes: '', blocks: [], original: { kind: 'workout', template_id: null, blocks: [] } }]);
    setDirty(true);
  };

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}
      modal={false}
      size="lg"
      title={`Semana ${row + 1} · ${DAY_LABELS_FULL[col]}`}
      description={
        unsavedLines > 0
          ? `${unsavedLines === 1 ? 'Hay una línea sin ejercicio' : `Hay ${unsavedLines} líneas sin ejercicio`}: elige el ejercicio para que se guarde. El resto del día ya se guarda.`
          : dirty
            ? 'Guardando…'
            : 'Se guarda solo.'
      }
    >
      <div className="flex flex-col gap-8">
        {drafts.length === 0 ? <p className="t-body-sm text-v2-muted">Este día no tiene entreno.</p> : null}
        {drafts.map((d, i) => (
          <section key={d.key} className="flex flex-col gap-3" aria-label={`Entreno ${i + 1}`}>
            <SectionHeader
              title={drafts.length > 1 ? `Entreno ${i + 1}` : 'Entreno'}
              action={
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { setDrafts((l) => l.filter((_, j) => j !== i)); setDirty(true); }}>
                  Quitar entreno
                </Button>
              }
            />
            <Field label="Título" optional>
              {({ id }) => (
                <Input id={id} value={d.focus} maxLength={120} onChange={(e) => update(i, { focus: e.target.value })} />
              )}
            </Field>
            <Field label="Nota para el atleta" optional>
              {({ id }) => (
                <Textarea id={id} value={d.notes} maxLength={800} rows={2} onChange={(e) => update(i, { notes: e.target.value })} />
              )}
            </Field>
            {d.blocks.map((b, bi) => (
              <div key={b.uid} className="rounded-panel border border-v2-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="t-label text-v2-faint">Bloque {LETTERS[bi]}</span>
                  <IconButton icon={Trash2} label={`Quitar el bloque ${LETTERS[bi]}`} size="sm" onClick={() => updateBlock(i, b.uid, null)} />
                </div>
                <BlockEditor
                  block={b}
                  onChange={(next) => updateBlock(i, b.uid, next)}
                  onAddItem={() =>
                    updateBlock(i, b.uid, { ...b, items: [...b.items, { uid: freshUid(), exercise_id: null, exercise_name: '', prescription: EMPTY_LINE }] })
                  }
                  showOptionalToggle
                />
              </div>
            ))}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => addBlock(i)} className="self-start">
              Añadir bloque
            </Button>
          </section>
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={addEntreno} className="self-start">
          Añadir otro entreno este día
        </Button>
      </div>
    </Sheet>
    <Dialog
      open={confirmClose}
      onOpenChange={setConfirmClose}
      size="sm"
      title="¿Salir con líneas sin ejercicio?"
      description={`${unsavedLines === 1 ? 'Hay una línea sin ejercicio' : `Hay ${unsavedLines} líneas sin ejercicio`} y no se guardan. El resto del día ya está guardado. Si sales, esa${unsavedLines === 1 ? '' : 's'} línea${unsavedLines === 1 ? '' : 's'} se pierde${unsavedLines === 1 ? '' : 'n'}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setConfirmClose(false)}>
            Seguir editando
          </Button>
          <Button variant="destructive" onClick={discardAndClose}>
            Salir y descartar
          </Button>
        </>
      }
    />
    </>
  );
}
