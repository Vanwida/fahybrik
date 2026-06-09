'use client';

// LibrarySessionDrawer — el MISMO drawer de sesión del calendario (SessionDrawer,
// fase 1) montado sobre la biblioteca única de /programar (spec §3a):
//   - Sesión PROPIA (entreno del coach): editable con autosave + undo/redo;
//     los tags (formato/ATR/nivel/grupo) se editan en la barra del header.
//   - Sesión de PABLO (bloque de biblioteca): prescripción original read-only
//     + "Duplicar como propia" → crea un entreno propio y abre su edición.
// La máquina de estado vive en use-library-session.ts; aquí solo la vista.

import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import { clonePartWithNewUids } from '@/lib/dashboard/programming/day-composition';
import {
  createItemFromExercise,
  createPartFromPresetId,
} from '@/lib/dashboard/programming/part-factory';
import { SessionDrawer } from '@/components/dashboard/session-drawer';
import { BlockLibraryPicker } from '@/components/dashboard/programming/studio/BlockLibraryPicker';
import {
  PabloIAComposeModal,
  type PabloIAComposeMode,
} from '@/components/dashboard/programming/studio/PabloIAComposeModal';
import { SessionMetaBar } from './SessionMetaBar';
import { useLibrarySession, type LibraryDrawerItem } from './use-library-session';

export type { LibraryDrawerItem };

// El modal Pablo IA compone "un día"; en el contexto de la biblioteca no hay
// día real — se ancla a lunes/sesión 0 solo para satisfacer su contrato.
const PABLO_IA_LIBRARY_MODE: PabloIAComposeMode = {
  kind: 'day',
  day_of_week: 1,
  session_index: 0,
};

interface LibrarySessionDrawerProps {
  item: LibraryDrawerItem | null;
  methodologyGroups: MethodologyGroup[];
  onClose: () => void;
  /** Tras crear/guardar — el caller refresca el grid (router.refresh). */
  onMutated: () => void;
}

export function LibrarySessionDrawer({
  item,
  methodologyGroups,
  onClose,
  onMutated,
}: LibrarySessionDrawerProps) {
  const s = useLibrarySession({ item, onClose, onMutated });

  if (!item) return null;

  const kicker = s.readOnly ? 'Biblioteca · Pablo' : 'Biblioteca · Sesión propia';
  const statePill = s.readOnly ? 'Solo lectura' : 'Plantilla';
  const phaseHint = s.meta?.target_block === 'any' ? null : (s.meta?.target_block ?? null);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Sesión — ${s.session?.focus ?? 'cargando'}`}
    >
      <button
        type="button"
        aria-label="Cerrar sesión"
        className="absolute inset-0 bg-black/70"
        onClick={s.handleClose}
      />
      <div className="relative z-10 h-full w-full max-w-2xl shadow-2xl">
        {s.loading || (!s.session && !s.loadError) ? (
          <div className="flex h-full items-center justify-center border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-sm text-[color:var(--text-muted)]">
            Cargando sesión…
          </div>
        ) : s.loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-8 text-center">
            <p className="text-sm text-[color:var(--danger)]" role="alert">
              {s.loadError}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <SessionDrawer
            kicker={kicker}
            statePill={statePill}
            session={s.session ?? undefined}
            exercises={s.exercises}
            read_only={s.readOnly}
            header_extra={
              !s.readOnly && s.meta ? (
                <SessionMetaBar
                  meta={s.meta}
                  methodologyGroups={methodologyGroups}
                  onChange={s.handleChangeMeta}
                />
              ) : s.saveError && s.readOnly ? (
                <p
                  role="alert"
                  className="border-b border-[color:var(--border-subtle)] px-5 py-2 text-xs text-[color:var(--danger)]"
                >
                  {s.saveError}
                </p>
              ) : null
            }
            saveState={{
              dirty: s.dirty,
              saving: s.saving || s.duplicating,
              savedFlash: s.savedFlash,
              saveError: s.saveError,
              canUndo: s.history.canUndo,
              canRedo: s.history.canRedo,
              onUndo: s.handleUndo,
              onRedo: s.handleRedo,
            }}
            onClose={s.handleClose}
            onChangeTitle={(title) =>
              s.commitSession((prev) => ({ ...prev, focus: title || undefined }))
            }
            onChangePart={(next) =>
              s.patchBlocks((blocks) => blocks.map((p) => (p.uid === next.uid ? next : p)))
            }
            onRemovePart={(uid) =>
              s.patchBlocks((blocks) => blocks.filter((p) => p.uid !== uid))
            }
            onDuplicatePart={(uid) =>
              s.patchBlocks((blocks) => {
                const idx = blocks.findIndex((p) => p.uid === uid);
                if (idx < 0) return blocks;
                const copy = clonePartWithNewUids(blocks[idx]!);
                return [...blocks.slice(0, idx + 1), copy, ...blocks.slice(idx + 1)];
              })
            }
            onDuplicateAsOwn={(uid) => {
              if (s.readOnly) {
                void s.handleDuplicateAsOwnTemplate();
                return;
              }
              // Dentro de un entreno propio: el bloque de biblioteca se vuelve
              // copia editable (pierde la referencia, conserva el verbatim).
              s.patchBlocks((blocks) =>
                blocks.map((p) => {
                  if (p.uid !== uid) return p;
                  const own = clonePartWithNewUids(p);
                  delete own.source_block_id;
                  delete own.block_modifiers;
                  return own;
                }),
              );
            }}
            onAddExercise={(partUid, exercise) =>
              s.patchBlocks((blocks) =>
                blocks.map((p) =>
                  p.uid === partUid
                    ? { ...p, items: [...p.items, createItemFromExercise(exercise)] }
                    : p,
                ),
              )
            }
            onAddBlockLibrary={() => s.setBlockPickerOpen(true)}
            onAddBlockPabloIA={() => s.setPabloIAOpen(true)}
            onAddBlockCustom={(presetId) => {
              const part = createPartFromPresetId(presetId);
              if (part) s.patchBlocks((blocks) => [...blocks, part]);
            }}
          />
        )}
      </div>

      <BlockLibraryPicker
        open={s.blockPickerOpen}
        blocks={s.libraryBlocks}
        groups={methodologyGroups}
        loading={s.loadingBlocks}
        phaseHint={phaseHint}
        onClose={() => s.setBlockPickerOpen(false)}
        onAdd={s.handleAddBlockFromLibrary}
      />

      <PabloIAComposeModal
        open={s.pabloIAOpen}
        mode={PABLO_IA_LIBRARY_MODE}
        atrBlockHint={phaseHint}
        onAcceptBlocks={(blocks) => s.patchBlocks((prev) => [...prev, ...blocks])}
        onClose={() => s.setPabloIAOpen(false)}
      />
    </div>
  );
}
