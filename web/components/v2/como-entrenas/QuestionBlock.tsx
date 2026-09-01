'use client';

// Una pregunta del instrumento: casillas, no ensayo. Layout stack o fila
// según el catálogo. La nota (si hay) es una línea, no el recuadro de #23.

import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { cn } from '@/lib/utils';
import { INTERVIEW_NOTE_MAX, type InterviewQuestionDef } from '@fahybrid/shared/domain/coach/method-interview';

export function QuestionBlock({
  question,
  value,
  multiValue,
  note,
  onSelect,
  onToggle,
  onNote,
}: {
  question: InterviewQuestionDef;
  value: string | null;
  multiValue: readonly string[];
  note: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onNote: (text: string) => void;
}) {
  const isMulti = question.kind === 'multi';

  return (
    <article className="flex flex-col gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4">
      <header className="flex flex-col gap-1">
        <p className="v2-micro text-[color:var(--v2-accent-text)]">{question.title}</p>
        {question.prompt ? (
          <h3 className="text-sm font-semibold text-[color:var(--v2-fg)]">{question.prompt}</h3>
        ) : null}
      </header>

      {isMulti ? (
        <div className="flex flex-col gap-2" role="group" aria-label={question.title}>
          {question.options.map((opt) => (
            <Checkbox
              key={opt.id}
              label={opt.label}
              checked={multiValue.includes(opt.id)}
              onCheckedChange={() => onToggle(opt.id)}
            />
          ))}
        </div>
      ) : question.layout === 'row' ? (
        <ChipGroup
          mono={false}
          ariaLabel={question.title}
          value={value}
          onChange={onSelect}
          options={question.options.map((opt) => ({ value: opt.id, label: opt.label }))}
        />
      ) : (
        <div role="radiogroup" aria-label={question.title} className="flex flex-col gap-1.5">
          {question.options.map((opt) => {
            const on = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(opt.id)}
                className={cn(
                  'v2-focus rounded-[var(--v2-r-m)] border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  on
                    ? 'border-[color:var(--v2-fg)] bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                    : 'border-[color:var(--v2-border-strong)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {question.note_id ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[color:var(--v2-muted)]">{question.note_hint}</span>
          <Textarea
            value={note}
            maxLength={INTERVIEW_NOTE_MAX}
            contador
            rows={2}
            onChange={(e) => onNote(e.target.value)}
          />
        </label>
      ) : null}
    </article>
  );
}
