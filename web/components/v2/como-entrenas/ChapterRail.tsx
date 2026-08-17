'use client';

import { cn } from '@/lib/utils';
import {
  INTERVIEW_CHAPTERS,
  questionsForChapter,
  type ChapterId,
  type CoachMethodAnswers,
  type MultiField,
} from '@fahybrid/shared/domain/coach/method-interview';

function chapterAnswered(chapterId: ChapterId, answers: CoachMethodAnswers): { done: number; total: number } {
  const questions = questionsForChapter(chapterId);
  let done = 0;
  for (const q of questions) {
    if (q.kind === 'multi') {
      if ((answers[q.id as MultiField] ?? []).length > 0) done += 1;
    } else if (answers[q.id as keyof CoachMethodAnswers] != null) {
      done += 1;
    }
  }
  return { done, total: questions.length };
}

export function ChapterRail({
  current,
  answers,
  onSelect,
}: {
  current: ChapterId;
  answers: CoachMethodAnswers;
  onSelect: (id: ChapterId) => void;
}) {
  return (
    <nav aria-label="Capítulos" className="flex flex-col gap-1">
      {INTERVIEW_CHAPTERS.map((ch) => {
        const { done, total } = chapterAnswered(ch.id, answers);
        const on = ch.id === current;
        return (
          <button
            key={ch.id}
            type="button"
            onClick={() => onSelect(ch.id)}
            className={cn(
              'v2-focus flex items-start gap-3 rounded-[var(--v2-r-m)] px-3 py-2.5 text-left transition-colors',
              on
                ? 'bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            <span className={cn('v2-num text-xs font-bold', on ? 'opacity-70' : 'text-[color:var(--v2-faint)]')}>
              {String(ch.number).padStart(2, '0')}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{ch.title}</span>
              <span className={cn('text-xs', on ? 'opacity-70' : 'text-[color:var(--v2-faint)]')}>
                {done}/{total}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function ChapterChips({
  current,
  answers,
  onSelect,
}: {
  current: ChapterId;
  answers: CoachMethodAnswers;
  onSelect: (id: ChapterId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Capítulos"
      className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {INTERVIEW_CHAPTERS.map((ch) => {
        const { done, total } = chapterAnswered(ch.id, answers);
        const on = ch.id === current;
        return (
          <button
            key={ch.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(ch.id)}
            className={cn(
              'v2-focus shrink-0 rounded-[var(--v2-r-pill)] border px-3 py-1.5 text-xs font-semibold',
              on
                ? 'border-[color:var(--v2-fg)] bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)]',
            )}
          >
            {ch.number} · {ch.title}
            <span className="ml-1.5 opacity-70">
              {done}/{total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
