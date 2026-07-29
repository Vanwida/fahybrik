'use client';

// BlockLibraryEditor — the LIBRARY BLOCK editor. A library block is structurally
// a mini-session (blocks row + block_exercises grouped by block_position), so this
// REUSES the exact session-editor engine: SessionStructureRail + BlockEditor +
// AddBlockModal + the honest saveGate. The only differences vs SessionEditor are
// the metadata header (methodology group + level/days tags) and the persistence
// target (/api/coach/blocks instead of /api/coach/templates).

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { EditorBlock, BlockEditorModel, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { MODALITY_META } from '@/components/v2/constants';
import { SessionStructureRail } from './SessionStructureRail';
import { BlockEditor } from './BlockEditor';
import { AddBlockModal } from './AddBlockModal';
import { v2SelectCell } from './fields';
import { serializeBlockExercises } from '@/lib/dashboard/v2/editor-serialize';
import { firstUndosedBlockUid } from '@/lib/dashboard/v2/block-dose';
import { saveGateFor } from '@/lib/dashboard/v2/item-validity';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { Modality } from '@fahybrid/shared/domain/prescription';

// Honest save state — the button reflects the real request status (no fake timer).
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Guardar bloque',
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

// Default block format when none is set (a from-scratch strength block).
const DEFAULT_BLOCK_FORMAT = 'strength_block';

interface GroupOption {
  id: number;
  name: string;
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

// The dominant modality across all items, for the display-only color pill.
function dominantModality(blocks: EditorBlock[]): Modality | null {
  const counts = new Map<Modality, number>();
  for (const block of blocks) {
    for (const item of block.items) {
      const m = item.prescription.modality;
      if (!m) continue;
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  let best: Modality | null = null;
  let bestN = 0;
  for (const [m, n] of counts) {
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

export function BlockLibraryEditor({
  model,
  groups,
}: {
  model: BlockEditorModel;
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(model.title);
  const [methodologyGroupId, setMethodologyGroupId] = useState<number>(model.methodology_group_id);
  const [blocks, setBlocks] = useState<EditorBlock[]>(model.blocks);
  // Abre donde hay trabajo: si alguna pieza no dice cuánto trabajo hacer, esa. El
  // coach llega aquí desde la marca "sin dosis" de la Biblioteca a arreglar eso —
  // hacerle buscar la pieza sería mandarle a cazar lo que ya sabemos dónde está.
  // Se calcula una vez, al montar: si se recalculara, arreglar la dosis movería el
  // foco solo mientras escribe.
  const [selectedUid, setSelectedUid] = useState<string | null>(
    () => firstUndosedBlockUid(model.blocks) ?? model.blocks[0]?.uid ?? null,
  );
  const [addToGroup, setAddToGroup] = useState<StructureGroup | null>(null);
  const [blockId, setBlockId] = useState<number | null>(model.block_id);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const selected = blocks.find((b) => b.uid === selectedUid) ?? null;
  const gate = saveGateFor(blocks);

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
    if (!gate.ok) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      // EditorBlock satisfies SessionBlockSerInput → reuse the shared serializer.
      const exercises = serializeBlockExercises(blocks);

      // A readable verbatim description: each item's "Ejercicio · dosis", blocks
      // joined by newline. Falls back to the title when there is nothing yet.
      const description =
        blocks
          .map((b) =>
            b.items
              .map((it) => `${it.exercise_name} · ${prescriptionToText(it.prescription)}`)
              .join(' / '),
          )
          .filter((line) => line.length > 0)
          .join('\n') || title;

      const format = blocks[0]?.format ?? DEFAULT_BLOCK_FORMAT;

      const payload = {
        title,
        description,
        methodology_group_id: methodologyGroupId,
        format,
        exercises,
      };

      const res =
        blockId == null
          ? await fetch('/api/coach/blocks', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/coach/blocks/${blockId}`, {
              method: 'PUT',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });

      if (!res.ok) throw new Error(`save failed (${res.status})`);

      if (blockId == null) {
        const data = (await res.json().catch(() => null)) as { id?: number | string } | null;
        if (data?.id != null) {
          const newId = Number(data.id);
          setBlockId(newId);
          router.replace(`/biblioteca/sesion/${newId}`);
        }
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  };

  const modality = dominantModality(blocks);
  const modalityMeta = modality ? MODALITY_META[modalityColorSlug(modality)] : null;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {/* Top bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Link
            href="/biblioteca?tab=sesiones"
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} />
            Biblioteca · sesiones
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título del bloque"
            placeholder="Nuevo bloque"
            className="v2-display v2-focus block w-auto min-w-[6rem] max-w-full [field-sizing:content] rounded-[var(--v2-r-s)] bg-transparent text-3xl text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] sm:text-4xl"
          />

          {/* Metadata row: methodology group + modality pill */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-[color:var(--v2-muted)]">
              <span className="font-semibold">Grupo</span>
              <select
                aria-label="Grupo metodológico"
                value={methodologyGroupId}
                onChange={(e) => setMethodologyGroupId(Number(e.target.value))}
                className={v2SelectCell}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            {modalityMeta ? (
              <span
                className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: `var(${modalityMeta.softVar})`, color: `var(${modalityMeta.colorVar})` }}
              >
                {modalityMeta.label}
              </span>
            ) : null}
            <Pill tone="neutral" variant="soft">
              <span className="v2-num">{blocks.length}</span>&nbsp;
              {blocks.length === 1 ? 'sub-bloque' : 'sub-bloques'}
            </Pill>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving' || !gate.ok}
          aria-live="polite"
          title={gate.ok ? undefined : gate.reason ?? undefined}
          className={
            saveState === 'error'
              ? 'v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger)] px-4 text-sm font-bold text-white transition-colors'
              : 'v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60'
          }
        >
          <MIcon name={SAVE_ICON[saveState]} size={17} />
          {SAVE_LABEL[saveState]}
        </button>
      </div>

      {/* Honest gate — never a fake "Guardado". Tells the coach exactly why. */}
      {!gate.ok ? (
        <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,80,79,.3)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5 text-[13px] text-[color:var(--v2-danger)]">
          <MIcon name="error" size={16} className="shrink-0" />
          <span>{gate.reason}</span>
        </div>
      ) : null}

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
              title="Sin sub-bloque seleccionado"
              description="Añade un sub-bloque desde el panel izquierdo para empezar a modelar el bloque."
            />
          )}
        </main>
      </div>

      {addToGroup !== null ? (
        <AddBlockModal
          destinationLabel={groupLabel(addToGroup)}
          destinationGroup={addToGroup}
          onClose={() => setAddToGroup(null)}
          onAdd={addBlock}
        />
      ) : null}
    </div>
  );
}
