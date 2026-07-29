'use client';

// LibraryBlockRail — "Insertar de la biblioteca" en el editor de día. El coach
// busca un bloque de SU biblioteca y lo mete en una sesión. Mismo patrón que
// SuggestWorkoutModal (la otra vía de "traer bloques hechos"): overlay por
// ModalPortal, el coach elige, y el resultado sale por `onInsert` como
// EditorBlock[] — o sea que un bloque insertado es indistinguible de uno hecho a
// mano y se edita igual.
//
// Dos cosas que el rail tiene que dejar claras ANTES de pulsar, porque el modelo
// real las impone y esconderlas engaña:
//
//   • Un bloque puede añadir VARIAS piezas. El título importado es solo el primer
//     fragmento del entreno: "10' row z2" es en realidad row + ski + bike + run.
//     La fila lo avisa (`part_count > 1`) en vez de sorprender con 4 bloques.
//   • Los bloques SIN TIPAR no se pueden insertar. 27 de los 99 del coach son solo
//     prosa en `description` y `EditorBlock` no tiene dónde guardarla: insertarlos
//     la perdería en silencio. Salen deshabilitados y con el motivo escrito.
//
// La búsqueda mira título Y `source_ref` a propósito: los títulos importados se
// repiten (4 títulos entre 9 bloques), y "S9 – Martes" es lo único que distingue
// un "10' row z2" del otro.

import { useEffect, useMemo, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { EditorBlock, LibraryBlockRow } from '@/lib/dashboard/v2/editor-types';
import { getMethodologyGroups, type MethodologyGroupOption } from './ai-suggest-workout';

/** Minúsculas sin acentos — los títulos del coach los llevan ("Simulación", "Zona 2"). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matches(row: LibraryBlockRow, q: string): boolean {
  if (!q) return true;
  return norm(row.title).includes(q) || norm(row.source_ref ?? '').includes(q);
}

async function fetchLibraryBlocks(): Promise<LibraryBlockRow[]> {
  const res = await fetch('/api/coach/editor/library-blocks', { credentials: 'include' });
  if (!res.ok) throw new Error('list failed');
  const body = (await res.json()) as { blocks?: LibraryBlockRow[] };
  return body.blocks ?? [];
}

/** Las piezas listas para insertar de UN bloque (uids frescos en cada llamada). */
async function fetchEditorBlocks(blockId: number): Promise<EditorBlock[]> {
  const res = await fetch(`/api/coach/blocks/${blockId}/editor-blocks`, {
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = 'No se pudo insertar el bloque.';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* se queda el mensaje por defecto */
    }
    throw new Error(msg);
  }
  const body = (await res.json()) as { blocks?: EditorBlock[] };
  return body.blocks ?? [];
}

export function LibraryBlockRail({
  destinationLabel,
  onClose,
  onInsert,
}: {
  destinationLabel: string;
  onClose: () => void;
  /** Las piezas del bloque elegido, para APILAR al final de la sesión. */
  onInsert: (blocks: EditorBlock[]) => void;
}) {
  const [rows, setRows] = useState<LibraryBlockRow[] | null>(null);
  const [groups, setGroups] = useState<MethodologyGroupOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [insertingId, setInsertingId] = useState<number | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchLibraryBlocks()
      .then((b) => {
        if (live) setRows(b);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    void getMethodologyGroups().then((g) => {
      if (live) setGroups(g);
    });
    return () => {
      live = false;
    };
  }, []);

  // Solo los grupos que el coach REALMENTE tiene en su biblioteca — un chip que
  // filtra a cero es un callejón sin salida.
  const groupChips = useMemo(() => {
    if (!rows) return [];
    const present = new Set(rows.map((r) => r.methodology_group_id));
    return groups.filter((g) => present.has(g.id));
  }, [rows, groups]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = norm(query.trim());
    return rows.filter(
      (r) => (groupId === null || r.methodology_group_id === groupId) && matches(r, q),
    );
  }, [rows, query, groupId]);

  async function insert(row: LibraryBlockRow) {
    if (!row.typed || insertingId !== null) return;
    setInsertingId(row.id);
    setInsertError(null);
    try {
      const blocks = await fetchEditorBlocks(row.id);
      if (blocks.length === 0) {
        setInsertError('Ese bloque no tiene ejercicios que insertar.');
        return;
      }
      onInsert(blocks);
      onClose();
    } catch (e) {
      setInsertError(e instanceof Error ? e.message : 'No se pudo insertar el bloque.');
    } finally {
      setInsertingId(null);
    }
  }

  return (
    <ModalPortal onEscape={onClose} escapeEnabled={insertingId === null}>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label="Insertar bloque de la biblioteca"
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => insertingId === null && onClose()}
          className="absolute inset-0 -z-10 h-full w-full cursor-default"
          tabIndex={-1}
        />
        {/* Ancho ARBITRARIO a propósito: globals.css redefine la escala de spacing
            con nombres de talla (--spacing-xl: 24px) y Tailwind resuelve
            --spacing-* antes que --container-* en max-w-*, así que `max-w-xl`
            colapsaría esto a 24px detrás del scrim. */}
        <div className="w-full max-w-[560px] overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] shadow-[0_30px_70px_rgba(0,0,0,0.55)]">
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <h2 className="v2-display text-lg text-[color:var(--v2-fg)]">Biblioteca de bloques</h2>
              <span className="truncate text-label text-[color:var(--v2-muted)]">
                {destinationLabel}
              </span>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              disabled={insertingId !== null}
              className="v2-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-40"
            >
              <MIcon name="close" size={20} />
            </button>
          </header>

          {/* Búsqueda + filtro por grupo */}
          <div className="flex flex-col gap-2.5 border-b border-[color:var(--v2-border)] px-4 py-3">
            <div className="relative">
              <MIcon
                name="search"
                size={16}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--v2-faint)]"
              />
              <label className="sr-only" htmlFor="library-rail-search">
                Buscar bloque por título o por origen
              </label>
              <input
                id="library-rail-search"
                type="search"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busca por título o por origen · ej: row z2 · S9"
                className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] py-2 pl-8 pr-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
              />
            </div>
            {groupChips.length > 0 ? (
              <div role="group" aria-label="Filtrar por grupo" className="flex flex-wrap gap-1.5">
                <GroupChip active={groupId === null} onClick={() => setGroupId(null)}>
                  Todos
                </GroupChip>
                {groupChips.map((g) => (
                  <GroupChip
                    key={g.id}
                    active={groupId === g.id}
                    onClick={() => setGroupId(groupId === g.id ? null : g.id)}
                  >
                    {g.name}
                  </GroupChip>
                ))}
              </div>
            ) : null}
          </div>

          {/* Lista */}
          <div className="max-h-[52vh] overflow-y-auto p-3">
            {loadError ? (
              <p role="alert" className="py-8 text-center text-sm text-[color:var(--v2-danger)]">
                No se pudo cargar la biblioteca. Reintenta.
              </p>
            ) : rows === null ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--v2-muted)]">
                <MIcon name="progress_activity" size={18} className="animate-spin" />
                Cargando tu biblioteca…
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--v2-faint)]">
                {rows.length === 0
                  ? 'Tu biblioteca de bloques está vacía todavía.'
                  : 'Ningún bloque coincide con la búsqueda.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((row) => (
                  <li key={row.id}>
                    <BlockRow
                      row={row}
                      inserting={insertingId === row.id}
                      busy={insertingId !== null}
                      onInsert={() => void insert(row)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {insertError ? (
              <p role="alert" className="mt-2 text-xs font-medium text-[color:var(--v2-danger)]">
                {insertError}
              </p>
            ) : null}
          </div>

          <div className="border-t border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-4 py-2.5">
            <p className="text-eyebrow leading-relaxed text-[color:var(--v2-faint)]">
              Se copia la estructura. Editarlo luego en la Biblioteca no cambia esta semana.
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-pill)] border px-2.5 text-label font-semibold transition-colors',
        active
          ? 'border-[color:var(--v2-fg)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)]'
          : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      {children}
    </button>
  );
}

const UNTYPED_REASON = 'Sin tipar — no se puede insertar';

function BlockRow({
  row,
  inserting,
  busy,
  onInsert,
}: {
  row: LibraryBlockRow;
  inserting: boolean;
  busy: boolean;
  onInsert: () => void;
}) {
  const disabled = !row.typed || busy;
  return (
    <button
      type="button"
      onClick={onInsert}
      disabled={disabled}
      title={row.typed ? undefined : UNTYPED_REASON}
      aria-label={
        row.typed
          ? `Insertar ${row.title}${row.part_count > 1 ? ` · añade ${row.part_count} bloques` : ''}`
          : `${row.title} · ${UNTYPED_REASON}`
      }
      className={cn(
        'v2-focus relative block w-full overflow-hidden rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] py-2 pl-3 pr-2.5 text-left transition-colors',
        row.typed
          ? 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-accent)] disabled:hover:border-[color:var(--v2-border)]'
          : 'border-[color:var(--v2-border)] opacity-55',
        busy && 'cursor-wait',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--v2-mod-${row.modality_slug})` }}
      />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--v2-fg)]">
          {row.title}
        </p>
        {inserting ? (
          <MIcon
            name="progress_activity"
            size={15}
            className="shrink-0 animate-spin text-[color:var(--v2-accent)]"
          />
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
        {row.source_ref ? (
          <span className="v2-num text-[color:var(--v2-muted)]">{row.source_ref}</span>
        ) : null}
        {row.typed && row.part_count > 1 ? (
          // El aviso que evita la sorpresa: el título es solo el primer fragmento.
          <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--v2-info)]">
            <MIcon name="layers" size={12} />
            añade <span className="v2-num">{row.part_count}</span> bloques
          </span>
        ) : null}
        {!row.typed ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--v2-warn)]">
            <MIcon name="edit_note" size={12} />
            {UNTYPED_REASON}
          </span>
        ) : null}
      </div>
    </button>
  );
}
