'use client';

// El panel ES el editor (P4): el entreno de este atleta ese día, con los MISMOS
// controles de prescripción que la biblioteca (BlockEditor: series, carga, RIR,
// ritmo, zona, descanso…) y la regla de ritmo con SUS zonas. Guardar escribe en
// su copia (se bifurca de la biblioteca si hacía falta) y el calendario se
// recarga. Nunca guarda líneas sin ejercicio (el mismo portón que la biblioteca).

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, PenLine, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, IconButton, Input, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';
import { AddBlockModal } from '@/components/v2/editor/AddBlockModal';
import { SuggestWorkoutModal } from '@/components/v2/editor/SuggestWorkoutModal';
import { RunZonesProvider } from '@/components/v2/editor/run-zones-context';
import { serializeSessionSegments } from '@/lib/dashboard/v2/editor-serialize';
import { saveGateFor } from '@/lib/dashboard/v2/item-validity';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { FichaSessionEditor } from '@/lib/dashboard/v2/ficha-session';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';

function blockSummary(b: EditorBlock): string {
  const names = b.items.map((i) => i.exercise_name).filter(Boolean);
  if (names.length === 0) return 'sin líneas';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ');
}

export function SessionEditorBody({
  editor,
  startWithAi,
  onSaved,
  onDirtyChange,
}: {
  editor: FichaSessionEditor;
  startWithAi: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { shell } = useFicha();
  const { toast } = useToast();
  const [name, setName] = useState(editor.title);
  const [blocks, setBlocks] = useState<EditorBlock[]>(editor.model.blocks);
  const [open, setOpen] = useState<string | null>(editor.model.blocks[0]?.uid ?? null);
  const [adding, setAdding] = useState(false);
  const [ai, setAi] = useState(startWithAi);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const gate = saveGateFor(blocks);

  const setDirty = (d: boolean) => {
    setDirtyState(d);
    onDirtyChange(d);
  };
  const change = (next: EditorBlock[]) => {
    setBlocks(next);
    setDirty(true);
  };

  const save = async () => {
    if (!gate.ok || !name.trim()) return;
    setSaving(true);
    try {
      await apiJson(`/api/coach/athletes/${shell.athlete_id}/sessions/${editor.assignment_id}/editor`, {
        method: 'PATCH',
        body: { name: name.trim(), segments: serializeSessionSegments(blocks) },
      });
      setDirty(false);
      toast({ title: 'Entreno guardado', description: `${shell.name.split(' ')[0]} lo verá así.`, tone: 'ok' });
      onSaved();
    } catch (err) {
      toast({ title: 'No se ha podido guardar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const zones =
    editor.run_zones.length > 0
      ? { athlete_name: shell.name.split(' ')[0] ?? shell.name, zones: editor.run_zones }
      : null;

  return (
    <RunZonesProvider value={zones}>
      <div className="flex flex-col gap-4">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          aria-label="Nombre del entreno (lo lee el atleta)"
          size="lg"
          className="t-title-sm"
          invalid={!name.trim()}
        />
        {editor.shared_template ? (
          <p className="t-meta text-v2-faint">
            Viene de tu biblioteca: al guardar se crea su copia y la biblioteca no cambia.
          </p>
        ) : null}

        {blocks.length === 0 ? (
          <EmptyState
            variant="page"
            className="py-8"
            title="Entreno vacío"
            description="Añade un bloque o redáctalo con IA a partir de un foco."
            action={
              <>
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  Añadir bloque
                </Button>
                <Button icon={PenLine} variant="ghost" onClick={() => setAi(true)}>
                  Redactar con IA
                </Button>
              </>
            }
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {blocks.map((b, i) => {
              const isOpen = open === b.uid;
              return (
                <li key={b.uid} className={cn('rounded-panel border border-v2-border bg-v2-surface', isOpen && 'border-v2-border-strong')}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <IconButton
                      icon={isOpen ? ChevronDown : ChevronRight}
                      label={isOpen ? 'Plegar bloque' : 'Editar bloque'}
                      size="sm"
                      onClick={() => setOpen(isOpen ? null : b.uid)}
                    />
                    <span className="w-5 shrink-0 t-label text-v2-faint">{String.fromCharCode(65 + i)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-medium text-v2-fg">{b.title || 'Bloque'}</span>
                      {!isOpen ? <span className="block truncate t-meta text-v2-muted">{blockSummary(b)}</span> : null}
                    </span>
                    <IconButton
                      icon={Copy}
                      label="Duplicar bloque"
                      size="sm"
                      onClick={() => {
                        const stamp = Date.now();
                        const copy = { ...b, uid: `${b.uid}-c${stamp}`, items: b.items.map((it) => ({ ...it, uid: `${it.uid}-c${stamp}` })) };
                        change([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)]);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Quitar bloque"
                      size="sm"
                      onClick={() => change(blocks.filter((x) => x.uid !== b.uid))}
                    />
                  </div>
                  {isOpen ? (
                    <div className="border-t border-v2-border p-3">
                      <BlockEditor
                        block={b}
                        athleteName={shell.name.split(' ')[0]}
                        onChange={(next) => change(blocks.map((x) => (x.uid === next.uid ? next : x)))}
                        onSave={() => void save()}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {blocks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Añadir bloque
            </Button>
            <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setAi(true)}>
              Redactar con IA
            </Button>
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-v2-border bg-v2-elevated px-5 py-3">
          {!gate.ok ? <span className="mr-auto t-body-sm text-v2-danger">{gate.reason}</span> : dirty ? <span className="mr-auto t-body-sm text-v2-muted">Cambios sin guardar</span> : null}
          <Button variant="primary" loading={saving} disabled={!gate.ok || !name.trim() || !dirty} onClick={() => void save()}>
            Guardar entreno
          </Button>
        </div>
      </div>

      {adding ? (
        <AddBlockModal
          destinationLabel={name || 'Entreno'}
          onClose={() => setAdding(false)}
          onAdd={(block) => {
            change([...blocks, block]);
            setOpen(block.uid);
            setAdding(false);
          }}
        />
      ) : null}
      {ai ? (
        <SuggestWorkoutModal
          destinationLabel={name || 'Entreno'}
          athleteId={shell.athlete_id}
          onClose={() => setAi(false)}
          onInsert={(newBlocks) => {
            change([...blocks, ...newBlocks]);
            if (newBlocks[0]) setOpen(newBlocks[0].uid);
            setAi(false);
          }}
        />
      ) : null}
    </RunZonesProvider>
  );
}
