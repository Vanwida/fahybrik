'use client';

// Estudio: papers de ESTE coach. Subir, listar, buscar. La IA no los usa
// para armar planes — solo este cajón.

import { useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import {
  ajustesButtonGhost,
  ajustesButtonPrimary,
  ajustesButtonSecondary,
  ajustesField,
} from '@/components/v2/ajustes/controls';
import { EmptyState } from '@/components/v2/EmptyState';
import { FillPanel, PageFrame } from '@/components/v2/PageFrame';
import type { PaperSummary } from '@/lib/rag/papers';
import { cn } from '@/lib/utils';

const LIST_ENDPOINT = '/api/coach/papers';
const SEARCH_ENDPOINT = '/api/coach/papers/search';

type SearchHit = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return fallback;
}

export function EstudioPapersView({ initialPapers }: { initialPapers: PaperSummary[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [papers, setPapers] = useState(initialPapers);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState<'upload' | 'search' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searching = hits !== null;
  const empty = papers.length === 0 && !searching;

  async function refreshList() {
    const res = await fetch(LIST_ENDPOINT);
    if (!res.ok) throw new Error('list');
    const data = (await res.json()) as { papers: PaperSummary[] };
    setPapers(data.papers);
  }

  async function uploadFile(file: File) {
    setBusy('upload');
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch(LIST_ENDPOINT, { method: 'POST', body: form });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(readError(payload, 'No se ha podido subir el paper.'));
        return;
      }
      setHits(null);
      setQuery('');
      await refreshList();
    } catch {
      setError('No se ha podido subir el paper.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setBusy('search');
    setError(null);
    try {
      const res = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(readError(payload, 'No se ha podido buscar.'));
        return;
      }
      const data = payload as { chunks: SearchHit[] };
      setHits(data.chunks);
    } catch {
      setError('No se ha podido buscar.');
    } finally {
      setBusy(null);
    }
  }

  async function archive(id: string) {
    setBusy('archive');
    setError(null);
    try {
      const res = await fetch(`${LIST_ENDPOINT}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(readError(payload, 'No se ha podido archivar.'));
        return;
      }
      setPapers((prev) => prev.filter((p) => p.id !== id));
      setHits((prev) => (prev ? prev.filter((h) => h.document_id !== id) : prev));
    } catch {
      setError('No se ha podido archivar.');
    } finally {
      setBusy(null);
    }
  }

  const uploadButton = (
    <button
      type="button"
      className={ajustesButtonPrimary}
      disabled={busy === 'upload'}
      onClick={() => fileRef.current?.click()}
    >
      <MIcon name="upload_file" size={16} />
      {busy === 'upload' ? 'Subiendo…' : 'Subir PDF'}
    </button>
  );

  return (
    <PageFrame
      altura={empty ? 'centra' : 'llena'}
      head={
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">
                Estudio
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--v2-muted)]">
                Papers y PDFs tuyos. Se buscan aquí. No sirven para crear planes.
              </p>
            </div>
            <div className="shrink-0">{uploadButton}</div>
          </div>
          <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="estudio-q">
              Buscar en tus papers
            </label>
            <input
              id="estudio-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en tus papers"
              className={cn(ajustesField, 'sm:flex-1')}
            />
            <div className="flex gap-2">
              <button type="submit" className={ajustesButtonSecondary} disabled={busy === 'search'}>
                {busy === 'search' ? 'Buscando…' : 'Buscar'}
              </button>
              {searching ? (
                <button
                  type="button"
                  className={ajustesButtonGhost}
                  onClick={() => {
                    setHits(null);
                    setQuery('');
                  }}
                >
                  Ver lista
                </button>
              ) : null}
            </div>
          </form>
          {error ? (
            <p className="text-sm text-[color:var(--v2-danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      }
    >
      {empty ? (
        <EmptyState
          icon="article"
          title="Todavía no hay papers"
          description="Sube un PDF para buscarlo después. Esto no cambia cómo se programa."
          action={uploadButton}
        />
      ) : searching ? (
        <FillPanel
          head={
            <p className="px-4 py-3 text-sm text-[color:var(--v2-muted)]">
              {hits.length === 0
                ? 'Nada se parece a esa búsqueda.'
                : `${hits.length} pasaje${hits.length === 1 ? '' : 's'}`}
            </p>
          }
        >
          <ul>
            {hits.map((hit) => (
              <li
                key={hit.chunk_id}
                className="border-t border-[color:var(--v2-border)] px-4 py-3 first:border-t-0"
              >
                <p className="text-sm font-semibold text-[color:var(--v2-fg)]">
                  {hit.document_title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--v2-muted)]">
                  {hit.content.length > 360 ? `${hit.content.slice(0, 360)}…` : hit.content}
                </p>
              </li>
            ))}
          </ul>
        </FillPanel>
      ) : (
        <FillPanel
          head={
            <p className="px-4 py-3 text-sm text-[color:var(--v2-muted)]">
              {papers.length} paper{papers.length === 1 ? '' : 's'}
            </p>
          }
        >
          <ul>
            {papers.map((paper) => (
              <li
                key={paper.id}
                className="flex flex-col gap-2 border-t border-[color:var(--v2-border)] px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                    {paper.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--v2-muted)]">
                    {formatWhen(paper.ingested_at)}
                    {paper.byte_size != null ? ` · ${formatBytes(paper.byte_size)}` : ''}
                    {` · ${paper.chunk_count} fragmento${paper.chunk_count === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  className={ajustesButtonGhost}
                  disabled={busy === 'archive'}
                  onClick={() => void archive(paper.id)}
                >
                  Archivar
                </button>
              </li>
            ))}
          </ul>
        </FillPanel>
      )}
    </PageFrame>
  );
}
