'use client';

// El editor de un programa (PLAN §6 «Programar», informe D §4.1): todas las
// semanas a la vista, como una hoja de cálculo. Flechas mueven, ⇧ amplía, Enter
// escribe en la celda con la línea rápida, ⌘Enter abre el detalle, ⌘C/⌘V copian
// celda/semana/rango, ⌘D duplica hacia abajo, Supr vacía (con deshacer), ⌘Z/⇧⌘Z.
// Cada cambio se guarda solo. Descanso es un estado del día detrás de un menú,
// nunca un borrado de un toque.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BookOpen, Eye, TrendingUp, UserPlus } from 'lucide-react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import type { ProgressionSteps } from '@fahybrid/shared/domain/coach/progression-steps';
import type { LibraryRow } from '@/lib/dashboard/programming/library';
import type { ProgramRow } from '@/lib/dashboard/programming/programs';
import { Button, Dialog, PageHeader, Sheet, useToast, type MenuEntry } from '@/components/v2/ui';
import { AssignSheet } from '@/components/v2/shared/AssignSheet';
import {
  cellAt,
  clearRange,
  cloneDay,
  copyRange,
  duplicateDown,
  emptyDay,
  hasAuthoredContent,
  moveCursor,
  pasteInto,
  rangeOf,
  rangeSize,
  restDay,
  rowRange,
  type ArrowKey,
  type GridClipboard,
  type GridPos,
  type GridRange,
} from '@/lib/dashboard/programming/grid-model';
import { appendPart, appendSession } from '@/lib/dashboard/programming/quick-line';
import { weekVolume } from '@/lib/dashboard/programming/week-volume';
import type { CellWrite } from '@/lib/dashboard/programming/grid-model';
import { useProgramGrid } from './use-program-grid';
import { ProgramGrid } from './ProgramGrid';
import { CellQuickEditor } from './CellQuickEditor';
import { CellDetailSheet } from './CellDetailSheet';
import { ProgressDialog } from './ProgressDialog';
import { useModKey } from './mod-key';
import { AthletePreview } from './AthletePreview';
import { LIB_DRAG_TYPE, LibraryPanel } from './LibraryPanel';
import { SaveIndicator } from './SaveIndicator';
import { ProgramMenu } from './ProgramMenu';
import { ShortcutBar } from './ShortcutBar';

const CELL_DRAG_TYPE = 'application/x-programar-celda';
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export interface ProgramEditorProps {
  program: ProgramRow;
  weeks: Array<{ id: string; focus: string | null; days: WeekDay[] }>;
  steps: ProgressionSteps;
  library: LibraryRow[];
  levels: Array<{ id: string; name: string; label: string }>;
  maxWeeks: number;
}

export function ProgramEditor({ program, weeks, steps, library, levels, maxWeeks }: ProgramEditorProps) {
  const locale = useLocale();
  const router = useRouter();
  const { toast, dismiss } = useToast();
  const mod = useModKey();
  const g = useProgramGrid(program.id, weeks);
  const bounds = useMemo(() => ({ rows: g.grid.length, cols: 7 }), [g.grid.length]);
  const [focusById, setFocusById] = useState<Record<string, string | null>>({});
  const weekMeta = weeks.map((w) => ({ id: w.id, focus: w.id in focusById ? focusById[w.id]! : w.focus }));

  const [cursor, setCursor] = useState<GridPos>({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState<GridPos>({ row: 0, col: 0 });
  const range: GridRange | null = anchor.row === cursor.row && anchor.col === cursor.col ? null : rangeOf(anchor, cursor);
  const selection: GridRange = range ?? rangeOf(cursor, cursor);

  const gridRef = useRef<HTMLDivElement>(null);
  const clipboard = useRef<GridClipboard | null>(null);
  const [editing, setEditing] = useState<GridPos | null>(null);
  const [detail, setDetail] = useState<GridPos | null>(null);
  const [preview, setPreview] = useState(false);
  const [progress, setProgress] = useState<null | 'load' | 'sets' | 'deload'>(null);
  const [assign, setAssign] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [confirmRest, setConfirmRest] = useState<GridPos | null>(null);
  const [dropAt, setDropAt] = useState<GridPos | null>(null);
  const [removeWeek, setRemoveWeek] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const undoToast = useRef<string | null>(null);

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });
  const cellEl = (p: GridPos) => gridRef.current?.querySelector<HTMLElement>(`[data-row="${p.row}"][data-col="${p.col}"]`) ?? null;

  useEffect(() => {
    cellEl(cursor)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor]);

  const doUndo = useCallback(() => {
    const label = g.undo();
    if (undoToast.current) dismiss(undoToast.current);
    undoToast.current = null;
    if (label) toast({ title: `Deshecho: ${label.toLowerCase()}` });
  }, [g, toast, dismiss]);

  /** Escribe + aviso con deshacer para lo que pisa contenido. */
  const commitWithUndo = useCallback(
    (writes: CellWrite[], label: string, title: string) => {
      const n = g.commit(writes, label);
      if (n === 0) return 0;
      undoToast.current = toast({ title, undo: doUndo });
      return n;
    },
    [g, toast, doUndo],
  );

  const commitCell = useCallback(
    (p: GridPos, day: WeekDay, label: string) => g.commit([{ row: p.row, col: p.col, day }], label),
    [g],
  );

  const setRest = (p: GridPos) => {
    commitWithUndo([{ row: p.row, col: p.col, day: restDay(p.col + 1) }], 'Descanso', `Semana ${p.row + 1} · ${DAY_NAMES[p.col]}: descanso`);
    setConfirmRest(null);
  };
  const askRest = (p: GridPos) => {
    if (hasAuthoredContent(cellAt(g.grid, p.row, p.col))) setConfirmRest(p);
    else setRest(p);
  };

  const cells = (r: GridRange) => rangeSize(r).cells;
  const copy = () => {
    clipboard.current = copyRange(g.grid, selection);
    const n = cells(selection);
    toast({ title: n === 1 ? 'Día copiado' : `${n} días copiados` });
  };
  const paste = () => {
    if (!clipboard.current) return;
    const writes = pasteInto(clipboard.current, selection, bounds);
    const n = commitWithUndo(writes, 'Pegado', writes.length === 1 ? 'Pegado' : `Pegado en ${writes.length} días`);
    if (n === 0) toast({ title: 'Ya estaba igual' });
  };
  const clear = () => {
    const n = commitWithUndo(clearRange(selection, bounds), 'Vaciado', cells(selection) === 1 ? 'Día vaciado' : `${cells(selection)} días vaciados`);
    if (n === 0) toast({ title: 'No había nada que vaciar' });
  };
  const duplicate = () => {
    const writes = duplicateDown(g.grid, selection, bounds);
    if (writes.length === 0) return toast({ title: 'No hay semana debajo' });
    commitWithUndo(writes, 'Duplicado', `Duplicado en la semana ${writes[0]!.row + 1}${writes.at(-1)!.row > writes[0]!.row ? `–${writes.at(-1)!.row + 1}` : ''}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      const next = moveCursor(cursor, key as ArrowKey, bounds, mod);
      setCursor(next);
      if (!e.shiftKey) setAnchor(next);
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      if (mod) setDetail(cursor);
      else setEditing(cursor);
      return;
    }
    if (key === 'Escape') {
      setAnchor(cursor);
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      clear();
      return;
    }
    if (!mod) return;
    const k = key.toLowerCase();
    if (k === 'c') {
      e.preventDefault();
      copy();
    } else if (k === 'v') {
      e.preventDefault();
      paste();
    } else if (k === 'd') {
      e.preventDefault();
      duplicate();
    } else if (k === 'a') {
      e.preventDefault();
      setAnchor({ row: 0, col: 0 });
      setCursor({ row: bounds.rows - 1, col: 6 });
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      e.stopPropagation();
      const label = g.redo();
      if (label) toast({ title: `Rehecho: ${label.toLowerCase()}` });
    } else if (k === 'z') {
      e.preventDefault();
      e.stopPropagation();
      doUndo();
    }
  };

  const onPointerSelect = useCallback((row: number, col: number, e: MouseEvent) => {
    if (e.button !== 0) return;
    setCursor({ row, col });
    if (!e.shiftKey) setAnchor({ row, col });
    requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
  }, [setCursor, setAnchor]);
  const onOpen = useCallback((row: number, col: number) => setEditing({ row, col }), [setEditing]);

  // ── Arrastrar ──────────────────────────────────────────────────────────────
  const onDragStartCell = useCallback((row: number, col: number, e: DragEvent) => {
    e.dataTransfer.setData(CELL_DRAG_TYPE, JSON.stringify({ row, col }));
    e.dataTransfer.effectAllowed = 'copyMove';
  }, []);
  const onDragOverCell = useCallback((row: number, col: number, e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(CELL_DRAG_TYPE) && !types.includes(LIB_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = types.includes(LIB_DRAG_TYPE) || e.altKey ? 'copy' : 'move';
    setDropAt((p) => (p?.row === row && p.col === col ? p : { row, col }));
  }, []);
  const onDragLeaveCell = useCallback(() => setDropAt(null), []);

  const insertLibrary = useCallback(
    async (item: { kind: LibraryRow['kind']; id: string; title?: string }, at: GridPos) => {
      const res = await fetch(`/api/coach/editor/library-item?kind=${item.kind}&id=${item.id}`, { credentials: 'include' }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as { title?: string; parts?: WeekDay['sessions'][number]['blocks']; session?: WeekDay['sessions'][number] | null; error?: { message: string } } | null) : null;
      if (!res?.ok || !body?.parts) {
        toast({ title: body?.error?.message ?? 'No se pudo insertar', tone: 'danger' });
        return;
      }
      const day = cellAt(g.gridRef.current, at.row, at.col);
      const next = item.kind === 'entreno' && body.session ? appendSession(day, body.session) : body.parts.reduce((d, part) => appendPart(d, part), day);
      const label = `«${body.title ?? item.title ?? (item.kind === 'entreno' ? 'Entreno' : 'Bloque')}» en semana ${at.row + 1} · ${DAY_NAMES[at.col]}`;
      g.commit([{ row: at.row, col: at.col, day: next }], 'Insertado');
      undoToast.current = toast({ title: label, undo: doUndo });
    },
    [g, toast, doUndo],
  );

  const onDropCell = useCallback(
    (row: number, col: number, e: DragEvent) => {
      e.preventDefault();
      setDropAt(null);
      const lib = e.dataTransfer.getData(LIB_DRAG_TYPE);
      if (lib) {
        const item = JSON.parse(lib) as { kind: LibraryRow['kind']; id: string };
        setCursor({ row, col });
        setAnchor({ row, col });
        void insertLibrary(item, { row, col });
        return;
      }
      const raw = e.dataTransfer.getData(CELL_DRAG_TYPE);
      if (!raw) return;
      const from = JSON.parse(raw) as GridPos;
      if (from.row === row && from.col === col) return;
      const src = cellAt(g.gridRef.current, from.row, from.col);
      const writes: CellWrite[] = [{ row, col, day: cloneDay(src, col + 1) }];
      const copyOnly = e.altKey;
      if (!copyOnly) writes.push({ row: from.row, col: from.col, day: emptyDay(from.col + 1) });
      commitWithUndo(writes, copyOnly ? 'Copiado' : 'Movido', `${copyOnly ? 'Copiado' : 'Movido'} a semana ${row + 1} · ${DAY_NAMES[col]}`);
      setCursor({ row, col });
      setAnchor({ row, col });
    },
    [g, commitWithUndo, insertLibrary, setCursor, setAnchor],
  );

  const weekMenu = useCallback(
    (row: number): MenuEntry[] => [
      { label: 'Seleccionar semana', onSelect: () => { setAnchor({ row, col: 0 }); setCursor({ row, col: 6 }); focusGrid(); } },
      { label: 'Copiar semana', shortcut: mod('C'), onSelect: () => { clipboard.current = copyRange(g.grid, rowRange(row, bounds)); toast({ title: `Semana ${row + 1} copiada` }); } },
      { label: 'Pegar aquí', shortcut: mod('V'), disabled: !clipboard.current, onSelect: () => { if (clipboard.current) commitWithUndo(pasteInto(clipboard.current, rowRange(row, bounds), bounds), 'Pegado', `Pegado en la semana ${row + 1}`); } },
      { label: 'Duplicar en la siguiente', shortcut: mod('D'), disabled: row === bounds.rows - 1, onSelect: () => commitWithUndo(duplicateDown(g.grid, rowRange(row, bounds), bounds), 'Duplicado', `Semana ${row + 1} duplicada en la ${row + 2}`) },
      { type: 'separator' },
      { label: 'Progresar…', icon: TrendingUp, onSelect: () => { setAnchor({ row, col: 0 }); setCursor({ row, col: 6 }); setProgress('load'); } },
      { label: 'Descarga…', onSelect: () => { setAnchor({ row, col: 0 }); setCursor({ row, col: 6 }); setProgress('deload'); } },
      { type: 'separator' },
      { label: 'Vaciar semana', danger: true, onSelect: () => commitWithUndo(clearRange(rowRange(row, bounds), bounds), 'Vaciado', `Semana ${row + 1} vaciada`) },
      { label: 'Quitar semana…', danger: true, disabled: bounds.rows <= 1, onSelect: () => setRemoveWeek(row) },
    ],
    [g.grid, bounds, toast, commitWithUndo, mod],
  );

  const cursorDay = cellAt(g.grid, cursor.row, cursor.col);
  const editingDay = editing ? cellAt(g.grid, editing.row, editing.col) : null;
  const detailDay = detail ? cellAt(g.grid, detail.row, detail.col) : null;
  const libraryItems = library;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: `/${locale}/programar/programas`, label: 'Programas' }}
        title={program.name}
        subtitle={[
          `${g.grid.length} ${g.grid.length === 1 ? 'semana' : 'semanas'}`,
          program.level ? program.level.name : null,
          ...program.tags,
          program.used_by > 0 ? `usado por ${program.used_by} ${program.used_by === 1 ? 'atleta' : 'atletas'}` : 'sin atletas',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <SaveIndicator status={g.status} error={g.error} onRetry={() => void g.retry()} />
            <Button icon={Eye} onClick={() => setPreview(true)}>
              Vista atleta
            </Button>
            <Button icon={TrendingUp} className="max-sm:hidden" onClick={() => setProgress('load')}>
              Progresar selección…
            </Button>
            <Button icon={BookOpen} className="max-sm:hidden min-[1600px]:hidden" onClick={() => setLibOpen(true)}>
              Biblioteca
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => setAssign(true)}>
              Asignar…
            </Button>
            <ProgramMenu program={program} levels={levels} weekCount={g.grid.length} maxWeeks={maxWeeks} hasPending={g.hasPending} onChanged={() => router.refresh()} importWeeks={weekMeta.map((w, i) => ({ id: w.id, index: i, label: w.focus ?? `Semana ${i + 1}`, session_count: weekVolume(g.grid[i] ?? []).sessions }))} />
          </>
        }
      />

      <div className="flex min-h-0 gap-4">
        <div className="max-h-[calc(100dvh-var(--v2-topbar-h,48px)-196px)] min-h-[320px] min-w-0 flex-1 overflow-auto rounded-panel border border-v2-border bg-v2-surface">
          <ProgramGrid
            ref={gridRef}
            grid={g.grid}
            weeks={weekMeta}
            cursor={cursor}
            range={range}
            dropAt={dropAt}
            onPointerSelect={onPointerSelect}
            onOpen={onOpen}
            onKeyDown={onKeyDown}
            onDragStartCell={onDragStartCell}
            onDragOverCell={onDragOverCell}
            onDropCell={onDropCell}
            onDragLeaveCell={onDragLeaveCell}
            onSelectWeek={(row) => { setAnchor({ row, col: 0 }); setCursor({ row, col: 6 }); focusGrid(); }}
            weekMenu={weekMenu}
            onFocusSaved={(id, focus) => setFocusById((m) => ({ ...m, [id]: focus }))}
          />
        </div>
        <LibraryPanel
          items={libraryItems}
          onInsert={(item) => void insertLibrary(item, cursor)}
          className="hidden max-h-[calc(100dvh-var(--v2-topbar-h,48px)-196px)] w-72 shrink-0 min-[1600px]:flex"
        />
      </div>

      <ShortcutBar cursor={cursor} range={range} />

      {editing && editingDay ? (
        <CellQuickEditor
          key={`${editing.row}:${editing.col}`}
          anchor={() => cellEl(editing)}
          row={editing.row}
          col={editing.col}
          day={editingDay}
          onCommit={(day, label) => commitCell(editing, day, label)}
          onClose={() => { setEditing(null); focusGrid(); }}
          onDetail={() => { setDetail(editing); setEditing(null); }}
          onRest={() => { askRest(editing); setEditing(null); }}
        />
      ) : null}
      {detail && detailDay ? (
        <CellDetailSheet
          open
          onOpenChange={(o) => { if (!o) { setDetail(null); focusGrid(); } }}
          row={detail.row}
          col={detail.col}
          day={detailDay}
          onCommit={(day, label) => commitCell(detail, day, label)}
        />
      ) : null}
      {progress ? (
        <ProgressDialog
          open
          onOpenChange={(o) => { if (!o) { setProgress(null); focusGrid(); } }}
          grid={g.grid}
          range={selection}
          bounds={bounds}
          steps={steps}
          initialMode={progress}
          onApply={(writes, label) => {
            const n = g.commit(writes, label);
            if (n > 0) undoToast.current = toast({ title: label, undo: doUndo });
          }}
        />
      ) : null}
      <AthletePreview open={preview} onOpenChange={setPreview} row={cursor.row} col={cursor.col} day={cursorDay} weekFocus={weekMeta[cursor.row]?.focus ?? null} />
      <Sheet open={libOpen} onOpenChange={setLibOpen} modal={false} size="sm" title="Biblioteca">
        <LibraryPanel items={libraryItems} onInsert={(item) => void insertLibrary(item, cursor)} className="h-full" />
      </Sheet>
      <Dialog
        open={!!confirmRest}
        onOpenChange={(o) => { if (!o) setConfirmRest(null); }}
        size="sm"
        title="¿Marcar como descanso?"
        description={confirmRest ? `El ${DAY_NAMES[confirmRest.col]} de la semana ${confirmRest.row + 1} tiene entreno. Pasa a ser día de descanso y el entreno se quita (puedes deshacerlo).` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRest(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => confirmRest && setRest(confirmRest)}>
              Marcar descanso
            </Button>
          </>
        }
      />
      <Dialog
        open={removeWeek != null}
        onOpenChange={(o) => { if (!o) setRemoveWeek(null); }}
        size="sm"
        title={removeWeek != null ? `¿Quitar la semana ${removeWeek + 1}?` : ''}
        description="Se borra con lo que tenga y las siguientes suben un puesto. A quien ya la tiene asignada no le cambia nada."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveWeek(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={removing}
              onClick={async () => {
                if (removeWeek == null) return;
                if (g.hasPending()) return toast({ title: 'Espera un momento: aún se está guardando' });
                setRemoving(true);
                const res = await fetch(`/api/coach/program-months/${program.id}/weeks/${weeks[removeWeek]!.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
                setRemoving(false);
                const n = removeWeek + 1;
                setRemoveWeek(null);
                if (!res?.ok) return toast({ title: 'No se pudo quitar la semana', tone: 'danger' });
                setCursor({ row: 0, col: 0 });
                setAnchor({ row: 0, col: 0 });
                toast({ title: `Semana ${n} quitada` });
                router.refresh();
              }}
            >
              Quitar semana
            </Button>
          </>
        }
      />
      {assign ? <AssignSheet open onClose={() => setAssign(false)} programId={program.id} onAssigned={() => router.refresh()} /> : null}
    </div>
  );
}
