'use client';

import {
  ONBOARDING_QUESTION_TYPE_LABELS,
  type OnboardingQuestionType,
} from '@fahybrid/shared/domain/coach/onboarding-form';
import { MIcon } from '@/components/ui/MIcon';
import { PanelButton } from './chrome';
import {
  addOption,
  addQuestion,
  addStep,
  patchOption,
  patchQuestion,
  removeOption,
  removeQuestion,
  removeStep,
  setQuestionType,
  setStepTitle,
  type FormDraft,
} from './draft';

const TYPES = Object.keys(ONBOARDING_QUESTION_TYPE_LABELS) as OnboardingQuestionType[];

export function CuestionarioEditor({
  draft,
  onChange,
  onSave,
  onClose,
  saving,
}: {
  draft: FormDraft;
  onChange: (next: FormDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[color:var(--v2-fg)]">
          {draft.id ? 'Editar cuestionario' : 'Nuevo cuestionario'}
        </p>
        <div className="flex gap-2">
          <PanelButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </PanelButton>
          <PanelButton variant="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </PanelButton>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="v2-micro">Nombre</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="v2-focus h-10 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-sm text-[color:var(--v2-fg)]"
          placeholder="Alta de Hyrox, por ejemplo"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="v2-micro">Correo que recibe cada alta</span>
        <input
          type="email"
          value={draft.destination_email}
          onChange={(e) => onChange({ ...draft, destination_email: e.target.value })}
          className="v2-focus h-10 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-sm text-[color:var(--v2-fg)]"
          placeholder="tu@club.com"
          autoComplete="email"
        />
        <span className="text-xs text-[color:var(--v2-muted)]">
          Vacío = no se envía a nadie. Cámbialo cuando quieras.
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-[color:var(--v2-fg)]">
        <input
          type="checkbox"
          checked={draft.is_default}
          onChange={(e) => onChange({ ...draft, is_default: e.target.checked })}
        />
        Usar este cuando entre un atleta
      </label>

      {draft.definition.steps.map((step, si) => (
        <section
          key={step.id}
          className="flex flex-col gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4"
        >
          <div className="flex items-center gap-2">
            <input
              value={step.title}
              onChange={(e) =>
                onChange({ ...draft, definition: setStepTitle(draft.definition, si, e.target.value) })
              }
              className="v2-focus h-9 min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-3 text-sm font-semibold text-[color:var(--v2-fg)]"
              placeholder={`Paso ${si + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange({ ...draft, definition: removeStep(draft.definition, si) })}
              className="v2-focus rounded p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]"
              aria-label="Quitar paso"
              disabled={draft.definition.steps.length <= 1}
            >
              <MIcon name="delete" size={18} />
            </button>
          </div>

          {step.questions.map((q, qi) => (
            <div key={q.id} className="flex flex-col gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-elevated)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={q.title}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      definition: patchQuestion(draft.definition, si, qi, { title: e.target.value }),
                    })
                  }
                  className="v2-focus h-9 min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-sm text-[color:var(--v2-fg)]"
                  placeholder="Pregunta"
                />
                <select
                  value={q.type}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      definition: setQuestionType(
                        draft.definition,
                        si,
                        qi,
                        e.target.value as OnboardingQuestionType,
                      ),
                    })
                  }
                  className="v2-focus h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2 text-xs text-[color:var(--v2-fg)]"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ONBOARDING_QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...draft, definition: removeQuestion(draft.definition, si, qi) })
                  }
                  className="v2-focus rounded p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]"
                  aria-label="Quitar pregunta"
                  disabled={step.questions.length <= 1}
                >
                  <MIcon name="close" size={16} />
                </button>
              </div>
              <input
                value={q.prompt ?? ''}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    definition: patchQuestion(draft.definition, si, qi, {
                      prompt: e.target.value || null,
                    }),
                  })
                }
                className="v2-focus h-8 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-xs text-[color:var(--v2-fg)]"
                placeholder="Ayuda (opcional)"
              />
              <label className="flex items-center gap-2 text-xs text-[color:var(--v2-muted)]">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      definition: patchQuestion(draft.definition, si, qi, {
                        required: e.target.checked,
                      }),
                    })
                  }
                />
                Obligatoria
              </label>
              {q.type === 'single' || q.type === 'multi' ? (
                <div className="flex flex-col gap-1.5">
                  {q.options.map((opt, oi) => (
                    <div key={opt.code} className="flex items-center gap-2">
                      <input
                        value={opt.label}
                        onChange={(e) =>
                          onChange({
                            ...draft,
                            definition: patchOption(draft.definition, si, qi, oi, e.target.value),
                          })
                        }
                        className="v2-focus h-8 min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-xs text-[color:var(--v2-fg)]"
                        placeholder={`Opción ${oi + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...draft,
                            definition: removeOption(draft.definition, si, qi, oi),
                          })
                        }
                        className="v2-focus rounded p-1 text-[color:var(--v2-faint)] hover:text-[color:var(--v2-danger)]"
                        aria-label="Quitar opción"
                        disabled={q.options.length <= 2}
                      >
                        <MIcon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...draft, definition: addOption(draft.definition, si, qi) })
                    }
                    className="v2-focus self-start text-xs font-semibold text-[color:var(--v2-accent-text)]"
                  >
                    Añadir opción
                  </button>
                </div>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            onClick={() => onChange({ ...draft, definition: addQuestion(draft.definition, si) })}
            className="v2-focus self-start text-xs font-semibold text-[color:var(--v2-accent-text)]"
          >
            Añadir pregunta
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...draft, definition: addStep(draft.definition) })}
        className="v2-focus inline-flex items-center gap-1 self-start text-sm font-semibold text-[color:var(--v2-accent-text)]"
      >
        <MIcon name="add" size={16} /> Añadir paso
      </button>
    </div>
  );
}
