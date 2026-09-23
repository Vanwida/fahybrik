'use client';

// Una pieza de la biblioteca (bloque o entreno): título, sus bloques A/B/C con el
// compositor de siempre, la línea rápida para añadir, y etiquetas. Si la pieza se
// importó solo como TEXTO (por revisar), el texto original se lee AL LADO del
// editor para escribirla deprisa; al guardarla el texto se conserva.
// «Revisar en fila» (?cola=1) ofrece la siguiente pieza por revisar al guardar.

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { prescriptionToText, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { Button, Card, Field, IconButton, Input, PageHeader, SectionHeader, useToast } from '@/components/v2/ui';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';
import { QuickLineInput } from '@/components/v2/planes/QuickLineInput';
import { serializeBlockExercises, serializeSessionSegments } from '@/lib/dashboard/v2/editor-serialize';
import { partToEditorBlock } from '@/lib/dashboard/programming/editor-bridge';
import { freshUid } from '@/lib/dashboard/programming/grid-model';

const EMPTY_LINE: Prescription = { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 8 } }] };
const LETTERS = 'ABCDEFGHIJKLMNOP';

export interface LibraryItemModel {
  kind: 'bloque' | 'entreno';
  id: string | null;
  title: string;
  /** Texto original (bloques importados). */
  prose: string | null;
  blocks: EditorBlock[];
  tags: string[];
  methodology_group_id: number | null;
  format: string | null;
  is_draft: boolean;
}

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

export function LibraryItemEditor({ model, cola, nextReviewId }: { model: LibraryItemModel; cola: boolean; nextReviewId: string | null }) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [id, setId] = useState(model.id);
  const [title, setTitle] = useState(model.title);
  const [blocks, setBlocks] = useState<EditorBlock[]>(model.blocks);
  const [tags, setTags] = useState(model.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const noun = model.kind === 'bloque' ? 'bloque' : 'entreno';
  const back = `/${locale}/programar/biblioteca?ver=${model.kind === 'bloque' ? 'bloques' : 'entrenos'}${cola ? '&filtro=revisar' : ''}`;

  const change = (next: EditorBlock[]) => {
    setBlocks(next);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    const lines = blocks.flatMap((b) => b.items);
    if (!title.trim()) return setError('Ponle un nombre.');
    if (lines.length === 0) return setError('Añade al menos una línea con su ejercicio para guardar.');
    if (lines.some((l) => l.exercise_id == null)) return setError('Hay una línea sin ejercicio: elígelo o quítala.');
    setSaving(true);
    setError(null);
    let url: string;
    let payload: Record<string, unknown>;
    if (model.kind === 'bloque') {
      const summary = blocks.map((b) => b.items.map((it) => `${it.exercise_name} · ${prescriptionToText(it.prescription)}`).join(' / ')).join('\n');
      payload = {
        title: title.trim(),
        // El texto original no se pisa: es la fuente que el coach escribió.
        description: (model.prose?.trim() || summary || title).slice(0, 4000),
        methodology_group_id: model.methodology_group_id ?? 1,
        format: blocks[0]?.format ?? null,
        exercises: serializeBlockExercises(blocks),
      };
      url = id ? `/api/coach/blocks/${id}` : '/api/coach/blocks';
    } else {
      const segments = serializeSessionSegments(blocks).map((s, i) => ({ ...s, position: i }));
      payload = { name: title.trim(), format: model.format ?? 'sets', is_draft: false, segments };
      url = id ? `/api/coach/templates/${id}` : '/api/coach/templates';
    }
    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as { id?: string | number; error?: { message?: string } } | null) : null;
    if (!res?.ok) {
      setSaving(false);
      return setError(res ? `No se guardó: ${body?.error?.message ?? 'revisa las líneas'}.` : 'Sin conexión. Vuelve a intentarlo.');
    }
    const newId = id ?? (body?.id != null ? String(body.id) : null);
    // Etiquetas: lo que hay ahora, frente a lo que había.
    const now = parseTags(tags);
    if (newId && (now.join('|') !== model.tags.join('|') || !id)) {
      await fetch('/api/coach/editor/library-bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'tag', items: [{ kind: model.kind, id: Number(newId) }], add: now, remove: model.tags.filter((t) => !now.includes(t)) }),
      }).catch(() => null);
    }
    setSaving(false);
    setSaved(true);
    if (!id && newId) {
      setId(newId);
      router.replace(`/${locale}/programar/biblioteca/${model.kind}/${newId}`);
    }
    toast({ title: `${noun === 'bloque' ? 'Bloque' : 'Entreno'} guardado` });
  };

  const editor = (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader title="Bloques" count={blocks.length || null} />
      {blocks.length === 0 ? <p className="t-body-sm text-v2-muted">Todavía sin líneas. Escríbelas abajo como siempre.</p> : null}
      {blocks.map((b, i) => (
        <div key={b.uid} className="rounded-panel border border-v2-border bg-v2-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="t-label text-v2-faint">Bloque {LETTERS[i]}</span>
            <IconButton icon={Trash2} label={`Quitar el bloque ${LETTERS[i]}`} size="sm" onClick={() => change(blocks.filter((x) => x.uid !== b.uid))} />
          </div>
          <BlockEditor
            block={b}
            onChange={(next) => change(blocks.map((x) => (x.uid === b.uid ? next : x)))}
            onAddItem={() => change(blocks.map((x) => (x.uid === b.uid ? { ...x, items: [...x.items, { uid: freshUid(), exercise_id: null, exercise_name: '', prescription: EMPTY_LINE }] } : x)))}
          />
        </div>
      ))}
      <QuickLineInput
        placeholder="sentadilla 5x5 @75% r120 · 8x400m r1' z4"
        onAccept={(parts) => change([...blocks, ...parts.map(partToEditorBlock)])}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        className="self-start"
        onClick={() => change([...blocks, { uid: freshUid(), title: `Bloque ${LETTERS[blocks.length] ?? ''}`.trim(), format: 'sets', items: [{ uid: freshUid(), exercise_id: null, exercise_name: '', prescription: EMPTY_LINE }] }])}
      >
        Bloque vacío
      </Button>
      <Field label="Etiquetas" optional hint="Separadas por comas.">
        {({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} value={tags} onChange={(e) => { setTags(e.target.value); setSaved(false); }} className="max-w-md" />}
      </Field>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: back, label: 'Biblioteca' }}
        title={
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
            aria-label={`Nombre del ${noun}`}
            maxLength={160}
            size="lg"
            className="h-10 w-[min(560px,80vw)] border-transparent bg-transparent px-1 text-[20px] font-semibold hover:border-v2-border"
          />
        }
        actions={
          <>
            {error ? <p role="alert" className="t-body-sm text-v2-danger">{error}</p> : saved ? <p className="t-meta text-v2-faint">Guardado</p> : null}
            {cola && saved && nextReviewId ? (
              <Button iconEnd={ArrowRight} onClick={() => router.push(`/${locale}/programar/biblioteca/bloque/${nextReviewId}?cola=1`)}>
                Siguiente por revisar
              </Button>
            ) : null}
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Guardar
            </Button>
          </>
        }
      />
      {model.prose ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Card className="self-start lg:sticky lg:top-16">
            <SectionHeader title="Texto original" className="mb-2" />
            <p className="whitespace-pre-line t-body text-v2-fg">{model.prose}</p>
          </Card>
          {editor}
        </div>
      ) : (
        <div className="max-w-[880px]">{editor}</div>
      )}
    </div>
  );
}

