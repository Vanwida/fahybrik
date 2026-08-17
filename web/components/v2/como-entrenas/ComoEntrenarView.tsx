'use client';

// Entrevista por capítulos. Tocar casillas genera el espejo. Guardar
// reemplaza la fila. No es un recuadro vacío.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FillPanel, PageFrame } from '@/components/v2/PageFrame';
import {
  CHAPTER_IDS,
  INTERVIEW_CHAPTERS,
  INTERVIEW_QUESTION_COUNT,
  answeredQuestionCount,
  applyInterviewUpdate,
  questionsForChapter,
  type ChapterId,
  type CoachMethodAnswers,
  type MultiField,
  type NoteField,
  type SingleField,
} from '@fahybrid/shared/domain/coach/method-interview';
import type { CoachMethodInterviewResponse } from '@fahybrid/shared/schema/coach-method-interview';
import { ChapterChips, ChapterRail } from './ChapterRail';
import { MirrorCard } from './MirrorCard';
import { QuestionBlock } from './QuestionBlock';

const ENDPOINT = '/api/coach/method-interview';
const SAVE_WAIT_MS = 700;

function isChapterId(raw: string | null): raw is ChapterId {
  return raw != null && (CHAPTER_IDS as readonly string[]).includes(raw);
}

export function ComoEntrenarView({ initial }: { initial: CoachMethodInterviewResponse }) {
  const [answers, setAnswers] = useState<CoachMethodAnswers>(initial.answers);
  const [mirrorText, setMirrorText] = useState(initial.mirror_text);
  const [mirrorEdited, setMirrorEdited] = useState(initial.mirror_is_edited);
  const [generated, setGenerated] = useState(initial.generated_mirror);
  const [answered, setAnswered] = useState(initial.answered_count);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [chapter, setChapter] = useState<ChapterId>(() => {
    if (typeof window === 'undefined') return 'craft';
    const fromUrl = new URLSearchParams(window.location.search).get('capitulo');
    return isChapterId(fromUrl) ? fromUrl : 'craft';
  });

  const pending = useRef<{
    answers: CoachMethodAnswers;
    mirror_text?: string;
  }>({ answers: initial.answers });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyLocal = useCallback(
    (patch: { answers?: CoachMethodAnswers; mirror_text?: string | null }) => {
      const next = applyInterviewUpdate(
        {
          answers,
          generated_mirror: generated,
          mirror_text: mirrorText,
          mirror_is_edited: mirrorEdited,
        },
        patch,
      );
      setAnswers(next.answers);
      setGenerated(next.generated_mirror);
      setMirrorText(next.mirror_text);
      setMirrorEdited(next.mirror_is_edited);
      setAnswered(answeredQuestionCount(next.answers));
      return next;
    },
    [answers, generated, mirrorText, mirrorEdited],
  );

  const persist = useCallback(async (body: { answers: CoachMethodAnswers; mirror_text?: string }) => {
    setStatus('saving');
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers: body.answers,
          ...(body.mirror_text !== undefined ? { mirror_text: body.mirror_text } : {}),
        }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = (await res.json()) as CoachMethodInterviewResponse;
      setAnswers(data.answers);
      setGenerated(data.generated_mirror);
      setMirrorText(data.mirror_text);
      setMirrorEdited(data.mirror_is_edited);
      setAnswered(data.answered_count);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);

  const scheduleSave = useCallback(
    (nextAnswers: CoachMethodAnswers, nextMirror?: string) => {
      pending.current = {
        answers: nextAnswers,
        ...(nextMirror !== undefined ? { mirror_text: nextMirror } : {}),
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void persist(pending.current);
      }, SAVE_WAIT_MS);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('capitulo', chapter);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [chapter]);

  const chapterDef = INTERVIEW_CHAPTERS.find((c) => c.id === chapter) ?? INTERVIEW_CHAPTERS[0]!;
  const questions = useMemo(() => questionsForChapter(chapter), [chapter]);

  const selectSingle = (field: SingleField, id: string) => {
    const nextAnswers = { ...answers, [field]: answers[field] === id ? null : id };
    const next = applyLocal({ answers: nextAnswers });
    scheduleSave(next.answers);
  };

  const toggleMulti = (field: MultiField, id: string) => {
    const current = [...(answers[field] ?? [])];
    const idx = current.indexOf(id);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(id);
    const nextAnswers = { ...answers, [field]: current.length === 0 ? null : current };
    const next = applyLocal({ answers: nextAnswers });
    scheduleSave(next.answers);
  };

  const writeNote = (field: NoteField, text: string) => {
    const nextAnswers = { ...answers, [field]: text };
    const next = applyLocal({ answers: nextAnswers });
    scheduleSave(next.answers);
  };

  const editMirror = (text: string) => {
    const next = applyLocal({ mirror_text: text });
    scheduleSave(next.answers, next.mirror_text);
  };

  const resetMirror = () => {
    const next = applyLocal({ mirror_text: generated });
    scheduleSave(next.answers, next.mirror_text);
  };

  const chapterIndex = CHAPTER_IDS.indexOf(chapter);
  const prevChapter = chapterIndex > 0 ? CHAPTER_IDS[chapterIndex - 1] : null;
  const nextChapter = chapterIndex < CHAPTER_IDS.length - 1 ? CHAPTER_IDS[chapterIndex + 1] : null;

  return (
    <PageFrame
      altura="llena"
      head={
        <header className="flex flex-col gap-2 border-b border-[color:var(--v2-border)] pb-4">
          <p className="v2-micro">Instrumento · el sistema, no el eslogan</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">Cómo entrenas</h1>
            <p className="text-xs text-[color:var(--v2-muted)]">
              {answered} de {INTERVIEW_QUESTION_COUNT}
              {status === 'saving' ? ' · Guardando' : null}
              {status === 'saved' ? ' · Guardado' : null}
              {status === 'error' ? ' · No se ha podido guardar' : null}
            </p>
          </div>
        </header>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <aside className="hidden w-56 shrink-0 lg:block">
          <ChapterRail current={chapter} answers={answers} onSelect={setChapter} />
        </aside>
        <div className="lg:hidden">
          <ChapterChips current={chapter} answers={answers} onSelect={setChapter} />
        </div>

        <FillPanel
          className="min-h-0"
          bodyClassName="flex flex-col gap-3 p-4"
          foot={
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--v2-border)] px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!prevChapter}
                onClick={() => prevChapter && setChapter(prevChapter)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!nextChapter}
                onClick={() => nextChapter && setChapter(nextChapter)}
              >
                Siguiente
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-1">
            <p className="v2-micro">
              {chapterDef.number} · {chapterDef.title}
            </p>
            <p className="text-sm text-[color:var(--v2-muted)]">{chapterDef.scene}</p>
          </div>
          {questions.map((q) => (
            <QuestionBlock
              key={q.id}
              question={q}
              value={answers[q.id as SingleField]}
              multiValue={answers[q.id as MultiField] ?? []}
              note={q.note_id ? (answers[q.note_id as NoteField] ?? '') : ''}
              onSelect={(id) => selectSingle(q.id as SingleField, id)}
              onToggle={(id) => toggleMulti(q.id as MultiField, id)}
              onNote={(text) => q.note_id && writeNote(q.note_id as NoteField, text)}
            />
          ))}
        </FillPanel>

        <FillPanel className="min-h-60 lg:w-[min(28rem,36%)]" bodyClassName="p-4">
          <MirrorCard
            generated={generated}
            value={mirrorText}
            edited={mirrorEdited}
            onChange={editMirror}
            onReset={resetMirror}
          />
        </FillPanel>
      </div>
    </PageFrame>
  );
}
