'use client';

// Biblioteca › Ejercicios: el catálogo que ve este coach (la base, la base con su
// voz, y los suyos) como tabla. Se busca en castellano, en inglés y por sus
// sinónimos. Abrir una fila edita el ejercicio; «Nuevo ejercicio» crea uno suyo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterChip,
  IconButton,
  Input,
  Menu,
  SkeletonRows,
  Tag,
  type DataTableColumn,
} from '@/components/v2/ui';
import { EXERCISE_ORIGIN_META, MODALITY_LABELS, type OriginFacet } from '@/lib/dashboard/exercises/catalog-ui';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';
import { EjercicioEditor, type ExerciseSeed } from './EjercicioEditor';
import { BorrarEjercicioDialog } from './BorrarEjercicioDialog';

type EditorState = { mode: 'edit'; ex: CoachExerciseRow } | { mode: 'create'; seed: ExerciseSeed | null } | null;

export function EjerciciosTable({ createSignal }: { createSignal: number }) {
  const [rows, setRows] = useState<CoachExerciseRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState<OriginFacet>('todos');
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<CoachExerciseRow | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ exercises: CoachExerciseRow[] }>) : null))
      .then((data) => {
        if (!alive) return;
        if (data?.exercises) setRows(data.exercises);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [reload]);

  // «+ Nuevo › Ejercicio» desde la cabecera de la Biblioteca.
  const [lastSignal, setLastSignal] = useState(createSignal);
  if (createSignal !== lastSignal) {
    setLastSignal(createSignal);
    setEditor({ mode: 'create', seed: null });
  }

  const indexed = useMemo(
    () => (rows ?? []).filter((r) => !r.archived_at).map((r) => ({ r, idx: searchIndex([r.name, r.name_es ?? '', r.name_en ?? '', r.search_terms].join(' ')) })),
    [rows],
  );
  const counts = useMemo(() => {
    const c = { todos: indexed.length, base: 0, customized: 0, own: 0 };
    for (const { r } of indexed) c[r.origin] += 1;
    return c;
  }, [indexed]);
  const visible = indexed.filter((x) => (facet === 'todos' || x.r.origin === facet) && matchesQuery(x.idx, q)).map((x) => x.r);

  const onSaved = useCallback((row: CoachExerciseRow) => {
    setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? row : r)) : prev));
    setEditor(null);
  }, []);
  const onCreated = useCallback((row: CoachExerciseRow) => {
    setRows((prev) => (prev ? [row, ...prev] : [row]));
    setEditor(null);
  }, []);

  const columns: DataTableColumn<CoachExerciseRow>[] = [
    { id: 'name', header: 'Ejercicio', sortValue: (r) => r.name.toLowerCase(), cell: (r) => <span className="truncate font-medium text-v2-fg">{r.name}</span> },
    { id: 'en', header: 'En inglés', width: '24%', hideBelow: 'md', sortValue: (r) => (r.name_en ?? '').toLowerCase(), cell: (r) => <span className="truncate text-v2-muted">{r.name_en ?? '—'}</span> },
    { id: 'mod', header: 'Modalidad', width: '140px', hideBelow: 'sm', sortValue: (r) => r.modality ?? '', cell: (r) => <span className="text-v2-muted">{r.modality ? MODALITY_LABELS[r.modality] : '—'}</span> },
    { id: 'origin', header: 'Origen', width: '140px', sortValue: (r) => r.origin, cell: (r) => <Tag>{EXERCISE_ORIGIN_META[r.origin].label}</Tag> },
    {
      id: 'actions',
      header: <span className="sr-only">Acciones</span>,
      width: '48px',
      cell: (r) => (
        <Menu
          trigger={<IconButton icon={MoreHorizontal} label={`Acciones de ${r.name}`} size="sm" />}
          items={[
            { label: 'Editar', icon: Pencil, onSelect: () => setEditor({ mode: 'edit', ex: r }) },
            ...(r.origin === 'own' ? [{ label: 'Borrar…', icon: Trash2, danger: true, onSelect: () => setDeleting(r) }] : []),
          ]}
        />
      ),
    },
  ];

  if (failed) return <ErrorState description="El catálogo de ejercicios no ha cargado." onRetry={() => { setFailed(false); setReload((n) => n + 1); }} />;
  if (rows === null) return <SkeletonRows rows={8} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (castellano o inglés)" aria-label="Buscar ejercicios" className="w-full sm:w-72" />
        {(['todos', 'own', 'customized', 'base'] as const).map((f) => (
          <FilterChip key={f} active={facet === f} count={counts[f]} onClick={() => setFacet(f)}>
            {f === 'todos' ? 'Todos' : EXERCISE_ORIGIN_META[f].label}
          </FilterChip>
        ))}
        <Button size="sm" icon={Plus} className="ml-auto" onClick={() => setEditor({ mode: 'create', seed: null })}>
          Nuevo ejercicio
        </Button>
      </div>
      <DataTable
        aria-label="Ejercicios"
        rows={visible}
        columns={columns}
        getRowId={(r) => r.id}
        defaultSort={{ id: 'name', dir: 'asc' }}
        onRowOpen={(r) => setEditor({ mode: 'edit', ex: r })}
        virtualize={visible.length > 300}
        maxHeight={visible.length > 300 ? 'calc(100dvh - 260px)' : undefined}
        stickyTop={visible.length > 300 ? 0 : 48}
        empty={<EmptyState title={q ? `Ningún ejercicio con «${q}»` : 'Nada con este filtro'} action={q ? <Button size="sm" icon={Plus} onClick={() => setEditor({ mode: 'create', seed: null })}>Crear «{q}»</Button> : undefined} />}
      />
      {editor ? (
        <EjercicioEditor
          key={editor.mode === 'edit' ? `edit-${editor.ex.id}` : `create-${editor.seed?.name ?? ''}`}
          ex={editor.mode === 'edit' ? editor.ex : null}
          seed={editor.mode === 'create' ? (editor.seed ?? (q ? { name: q, category: 'strength', modality: 'strength' } : null)) : null}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          onCreated={onCreated}
          onCreateOwn={(seed) => setEditor({ mode: 'create', seed })}
        />
      ) : null}
      {deleting ? (
        <BorrarEjercicioDialog
          ex={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => {
            setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
