'use client';

// SessionEditor — SCREEN 5 client orchestrator ("Modelar una sesión — sin texto
// libre"). Split layout: left SessionStructureRail (blocks grouped CALENTAMIENTO/
// PRINCIPAL/VUELTA) + right BlockEditor (the 3-axis adaptive PrescriptionFields).
// Local state owns the working session; "Añadir bloque" opens the SCREEN 9 modal.
// Persistence is wired through onSave (TODO(endpoint) below) — the structured
// model is ready to POST to the templates loader's update path.

import { useState } from 'react';
import Link from 'next/link';
import type {
  EditorBlock,
  LibraryBlockRow,
  SessionEditorModel,
  StructureGroup,
} from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/dashboard/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { SessionStructureRail } from './SessionStructureRail';
import { BlockEditor } from './BlockEditor';
import { AddBlockModal } from './AddBlockModal';
import { serializeSessionSegments } from '@/lib/dashboard/v2/editor-serialize';

// Honest save state — no fake timer. The button reflects the real request status.
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Guardar sesión',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Reintentar',
};
const SAVE_ICON: Record<SaveState, string> = {
  idle: 'save',
  saving: 'progress_activity',
  saved: 'check_circle',
  error: 'error',
};

export function SessionEditor({
  model,
  libraryBlocks,
}: {
  model: SessionEditorModel;
  libraryBlocks: LibraryBlockRow[];
}) {
  const [name, setName] = useState(model.name);
  const [templateId, setTemplateId] = useState<string | null>(model.template_id);
  const [blocks, setBlocks] = useState<EditorBlock[]>(model.blocks);
  const [selectedUid, setSelectedUid] = useState<string | null>(
    model.blocks[0]?.uid ?? null,
  );
  const [addToGroup, setAddToGroup] = useState<StructureGroup | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const selected = blocks.find((b) => b.uid === selectedUid) ?? null;

  const updateBlock = (next: EditorBlock) =>
    setBlocks((prev) => prev.map((b) => (b.uid === next.uid ? next : b)));

  const addBlock = (block: EditorBlock) => {
    const placed: EditorBlock = { ...block, group: addToGroup ?? block.group };
    setBlocks((prev) => [...prev, placed]);
    setSelectedUid(placed.uid);
    setAddToGroup(null);
  };

  const duplicateBlock = (uid: string) => {
    const src = blocks.find((b) => b.uid === uid);
    if (!src) return;
    const copy: EditorBlock = {
      ...src,
      uid: `${src.uid}-copy-${Date.now()}`,
      title: `${src.title} (copia)`,
      items: src.items.map((it) => ({ ...it, uid: `${it.uid}-copy-${Date.now()}` })),
    };
    setBlocks((prev) => [...prev, copy]);
    setSelectedUid(copy.uid);
  };

  const handleSave = async () => {
    setSaveState('saving');
    try {
      // EditorBlock[] → template_segments[] grouped by block_position. The
      // structured Prescription is kept as prescription_json; params_json is the
      // re-derived scalar summary. Items with no exercise are dropped server-side.
      const segments = serializeSessionSegments(blocks);

      const payload = {
        name,
        format: model.format,
        is_draft: model.is_draft,
        segments,
      };

      const res = templateId
        ? await fetch(`/api/coach/templates/${templateId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/coach/templates', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) throw new Error(`save failed (${res.status})`);
      // On create, adopt the returned id so subsequent saves update in place.
      if (!templateId) {
        const data = (await res.json().catch(() => null)) as { id?: string } | null;
        if (data?.id) setTemplateId(String(data.id));
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {/* Top bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Link
            href="/v2/biblioteca?tab=sesiones"
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} />
            Biblioteca · sesiones
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre de la sesión"
            placeholder="Nueva sesión"
            className="v2-display v2-focus block w-auto min-w-[6rem] max-w-full [field-sizing:content] rounded-[var(--v2-r-s)] bg-transparent text-3xl text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] sm:text-4xl"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={model.is_draft ? 'warn' : 'ok'} variant="soft">
              {model.is_draft ? 'borrador' : 'publicado'}
            </Pill>
            <Pill tone="neutral" variant="soft">
              <span className="v2-num">{blocks.length}</span>&nbsp;bloques
            </Pill>
            {model.used_in_plans > 0 ? (
              <Pill tone="info" variant="soft">
                usada en <span className="v2-num">&nbsp;{model.used_in_plans}</span>&nbsp;planes
              </Pill>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving'}
          aria-live="polite"
          className={
            saveState === 'error'
              ? 'v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger,#c0362c)] px-4 text-sm font-bold text-white transition-colors'
              : 'v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60'
          }
        >
          <MIcon name={SAVE_ICON[saveState]} size={17} />
          {SAVE_LABEL[saveState]}
        </button>
      </div>

      {/* Split: rail + block editor */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[330px_1fr]">
        <aside>
          <SessionStructureRail
            blocks={blocks}
            selectedUid={selectedUid}
            onSelect={setSelectedUid}
            onAddBlock={(group) => setAddToGroup(group)}
          />
        </aside>

        <main className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-card)]">
          {selected ? (
            <BlockEditor
              block={selected}
              onChange={updateBlock}
              onDuplicate={() => duplicateBlock(selected.uid)}
              onSave={handleSave}
            />
          ) : (
            <EmptyState
              icon="dashboard_customize"
              title="Sin bloque seleccionado"
              description="Añade un bloque desde el panel izquierdo para empezar a modelar la sesión."
            />
          )}
        </main>
      </div>

      {addToGroup !== null ? (
        <AddBlockModal
          destinationLabel={groupLabel(addToGroup)}
          libraryBlocks={libraryBlocks}
          onClose={() => setAddToGroup(null)}
          onAdd={addBlock}
        />
      ) : null}
    </div>
  );
}

function groupLabel(group: StructureGroup): string {
  switch (group) {
    case 'calentamiento':
      return 'Calentamiento';
    case 'principal':
      return 'Principal';
    case 'vuelta':
      return 'Vuelta a la calma';
  }
}
