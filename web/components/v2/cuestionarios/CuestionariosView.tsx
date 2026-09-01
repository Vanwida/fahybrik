'use client';

// Las preguntas de alta las pone el coach. Lista + editor.
// Preset típico editable y borrable. Puede crear más y duplicar.
// destination_email = a qué cuenta llega cada alta. Dato, no const.

import { useCallback, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ListRow, ListRowAction, ListRowGroup } from '@/components/ui/list-row';
import type { OnboardingFormRecord } from '@fahybrid/shared/schema/coach-onboarding';
import { definitionIsValid } from '@fahybrid/shared/domain/coach/onboarding-form';
import { DialogScrim, ErrorBanner, PanelButton } from './chrome';
import { CuestionarioEditor } from './CuestionarioEditor';
import { emptyFormDraft, recordToDraft, type FormDraft } from './draft';

function apiErrorMessage(json: unknown, fallback: string): string {
  const msg = (json as { error?: { message?: string } } | null)?.error?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

export function CuestionariosView({
  initialForms,
}: {
  initialForms: OnboardingFormRecord[];
}) {
  const [forms, setForms] = useState(initialForms);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OnboardingFormRecord | null>(null);

  const openNew = useCallback(() => {
    setDraft(emptyFormDraft());
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Ponle un nombre al cuestionario.');
      return;
    }
    if (!definitionIsValid(draft.definition)) {
      setError('Revisa los pasos: cada uno necesita nombre y al menos una pregunta con enunciado.');
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name,
      definition: draft.definition,
      is_default: draft.is_default,
      destination_email: draft.destination_email.trim() || null,
    };
    try {
      const res = await fetch(
        draft.id ? `/api/coach/onboarding-forms/${draft.id}` : '/api/coach/onboarding-forms',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as { form?: OnboardingFormRecord } | null;
      if (!res.ok || !json?.form) {
        setError(apiErrorMessage(json, 'No se ha guardado. Reintenta.'));
        return;
      }
      setForms((prev) => {
        const next = draft.id
          ? prev.map((f) => (f.id === json.form!.id ? json.form! : f))
          : [...prev, json.form!];
        return json.form!.is_default
          ? next.map((f) => ({ ...f, is_default: f.id === json.form!.id }))
          : next;
      });
      setDraft(null);
    } catch {
      setError('No se ha guardado. Reintenta.');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const duplicate = useCallback(async (form: OnboardingFormRecord) => {
    setError(null);
    try {
      const res = await fetch(`/api/coach/onboarding-forms/${form.id}/duplicate`, { method: 'POST' });
      const json = (await res.json().catch(() => null)) as { form?: OnboardingFormRecord } | null;
      if (!res.ok || !json?.form) {
        setError(apiErrorMessage(json, 'No se ha podido copiar.'));
        return;
      }
      setForms((prev) => [...prev, json.form!]);
      setDraft(recordToDraft(json.form));
    } catch {
      setError('No se ha podido copiar.');
    }
  }, []);

  const doDelete = useCallback(async (form: OnboardingFormRecord) => {
    setError(null);
    try {
      const res = await fetch(`/api/coach/onboarding-forms/${form.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(apiErrorMessage(json, 'No se ha podido borrar.'));
        return;
      }
      setForms((prev) => {
        const next = prev.filter((f) => f.id !== form.id);
        if (form.is_default && next[0]) next[0] = { ...next[0], is_default: true };
        return next;
      });
      if (draft?.id === form.id) setDraft(null);
    } catch {
      setError('No se ha podido borrar.');
    } finally {
      setConfirmDelete(null);
    }
  }, [draft?.id]);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--v2-border)] pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="v2-micro">Alta</p>
          <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">
            Cuestionarios
          </h1>
          <p className="text-sm text-[color:var(--v2-muted)]">
            Lo que responde el atleta al entrar. Uno de fábrica, se puede cambiar o borrar.
            Puedes crear más. El correo es a dónde llega cada alta.
          </p>
        </div>
        {!draft ? (
          <button
            type="button"
            onClick={openNew}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} /> Nuevo
          </button>
        ) : null}
      </div>

      <div className="mt-5">
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
      </div>

      {draft ? (
        <CuestionarioEditor
          draft={draft}
          onChange={setDraft}
          onSave={() => void save()}
          onClose={() => setDraft(null)}
          saving={saving}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {forms.length === 0 ? (
            <div className="rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] px-4 py-8 text-center text-sm text-[color:var(--v2-muted)]">
              Aún no hay ninguno. Crea el primero o espera a que nazca el típico.
            </div>
          ) : (
            <ListRowGroup>
              {forms.map((form, i) => (
                <ListRow
                  key={form.id}
                  index={i}
                  total={forms.length}
                  onMove={() => undefined}
                  selected={false}
                  actions={
                    <>
                      <ListRowAction icon="content_copy" label="Duplicar" onClick={() => void duplicate(form)} />
                      <ListRowAction icon="edit" label="Editar" onClick={() => setDraft(recordToDraft(form))} />
                      <ListRowAction icon="delete" label="Borrar" danger onClick={() => setConfirmDelete(form)} />
                    </>
                  }
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                      {form.name}
                    </span>
                    <span className="text-xs text-[color:var(--v2-muted)]">
                      {form.origin === 'preset' ? 'De fábrica · ' : ''}
                      {form.step_count} {form.step_count === 1 ? 'paso' : 'pasos'} ·{' '}
                      {form.question_count} {form.question_count === 1 ? 'pregunta' : 'preguntas'}
                      {form.is_default ? ' · El que se usa' : ''}
                      {form.destination_email ? ` · ${form.destination_email}` : ' · Sin correo'}
                    </span>
                  </div>
                </ListRow>
              ))}
            </ListRowGroup>
          )}
        </div>
      )}

      {confirmDelete ? (
        <DialogScrim onClose={() => setConfirmDelete(null)}>
          <div className="w-full max-w-[420px] rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] p-5">
            <p className="text-sm font-semibold text-[color:var(--v2-fg)]">
              ¿Borrar «{confirmDelete.name}»?
            </p>
            <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
              Se puede volver a crear uno nuevo. El típico se puede plantar otra vez.
            </p>
            <div className="mt-4 flex gap-2">
              <PanelButton variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </PanelButton>
              <PanelButton variant="danger" onClick={() => void doDelete(confirmDelete)}>
                Borrar
              </PanelButton>
            </div>
          </div>
        </DialogScrim>
      ) : null}
    </div>
  );
}
