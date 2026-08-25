'use client';

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import type {
  RecipePromotePreview,
  RecipeTarget,
} from '@/lib/dashboard/coach/copy-instance-to-recipe-model';

type Preview = RecipePromotePreview;

function recipeLabel(target: RecipeTarget): string {
  if (target.kind === 'library_template') {
    return `la sesión de biblioteca «${target.name}»`;
  }
  return `la receta «${target.name}» (${target.day_label.toLowerCase()})`;
}

export function CopyToRecipeButton({
  athleteId,
  isoDate,
  templateId,
  preview,
}: {
  athleteId: string;
  isoDate: string;
  templateId: string;
  preview: Preview;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConfirm = preview.other_athletes > 0;

  const run = async (confirm: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${athleteId}/plan/day/${isoDate}/copy-to-recipe`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ template_id: templateId, confirm }),
        },
      );
      if (res.status === 409) {
        setOpen(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'No se pudo copiar a la receta');
        return;
      }
      setDone(true);
      setOpen(false);
      setTimeout(() => setDone(false), 2500);
    } catch {
      setError('No se pudo copiar a la receta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (needsConfirm ? setOpen(true) : void run(false))}
          disabled={busy || done}
          className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-3 text-[12.5px] font-semibold disabled:opacity-60"
        >
          <MIcon name={done ? 'check_circle' : 'content_copy'} size={16} />
          {done ? 'Copiado a la receta' : 'Copiar a la receta'}
        </button>
        <p className="text-[12.5px] text-[color:var(--v2-muted)]">
          Copia lo guardado de este atleta a {recipeLabel(preview.target)}.
        </p>
      </div>
      {error ? (
        <p className="text-[12.5px] text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {open ? (
        <ModalPortal onEscape={() => setOpen(false)} escapeEnabled={!busy}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
            onClick={() => !busy && setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal
              aria-labelledby="copy-to-recipe-title"
              onClick={(e) => e.stopPropagation()}
              className="flex w-full max-w-md flex-col gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]"
            >
              <h2
                id="copy-to-recipe-title"
                className="font-[family-name:var(--v2-font-display)] text-[20px] font-extrabold tracking-[-0.03em]"
              >
                ¿Copiar a la receta?
              </h2>
              <p className="text-[13.5px] leading-snug text-[color:var(--v2-fg)]">
                Vas a pisar {recipeLabel(preview.target)} con lo que este atleta
                ya tiene guardado.
              </p>
              {preview.other_athletes > 0 ? (
                <p className="text-[13.5px] leading-snug text-[color:var(--v2-fg)]">
                  {preview.other_athletes === 1
                    ? '1 atleta más sigue usando esa receta.'
                    : `${preview.other_athletes} atletas más siguen usando esa receta.`}{' '}
                  Sus copias ya asignadas no cambian. Quien reciba el plan
                  después verá esto.
                </p>
              ) : null}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-pill)] px-3 text-[12.5px] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(true)}
                  className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-60"
                >
                  {busy ? 'Copiando…' : 'Copiar y pisar la receta'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
