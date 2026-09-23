'use client';

// «Cómo entrenas» dentro de Ajustes › Método: la entrevista por capítulos y,
// encima, el párrafo que la resume — se reescribe al tocar cualquier casilla y
// el coach puede corregirlo a mano. Es lo que leen el plan, el chat y el
// conector. Se guarda solo (PUT /api/coach/method-interview, 0,7 s después del
// último toque).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, RotateCcw } from 'lucide-react';
import {
  CHAPTER_IDS,
  INTERVIEW_CHAPTERS,
  INTERVIEW_MIRROR_MAX,
  INTERVIEW_NOTE_MAX,
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
import { Button, Card, Checkbox, SectionHeader, Tabs, Textarea, type TabItem } from '@/components/v2/ui';
import { SaveStatus, readApiError, type SaveState } from '@/components/v2/ajustes/autosave';
import { ChoiceList } from './ChoiceList';

const ENDPOINT = '/api/coach/method-interview';
const SAVE_WAIT_MS = 700;

function chapterDone(id: ChapterId, answers: CoachMethodAnswers): { done: number; total: number } {
  const qs = questionsForChapter(id);
  let done = 0;
  for (const q of qs) {
    const v = answers[q.id as keyof CoachMethodAnswers];
    if (q.kind === 'multi' ? Array.isArray(v) && v.length > 0 : v != null) done += 1;
  }
  return { done, total: qs.length };
}

export function MetodoInterview({ initial }: { initial: CoachMethodInterviewResponse }) {
  const [answers, setAnswers] = useState<CoachMethodAnswers>(initial.answers);
  const [mirrorText, setMirrorText] = useState(initial.mirror_text);
  const [mirrorEdited, setMirrorEdited] = useState(initial.mirror_is_edited);
  const [generated, setGenerated] = useState(initial.generated_mirror);
  const [status, setStatus] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<ChapterId>('craft');

  const pending = useRef<{ answers: CoachMethodAnswers; mirror_text?: string }>({ answers: initial.answers });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answered = answeredQuestionCount(answers);

  const applyLocal = useCallback(
    (patch: { answers?: CoachMethodAnswers; mirror_text?: string | null }) => {
      const next = applyInterviewUpdate(
        { answers, generated_mirror: generated, mirror_text: mirrorText, mirror_is_edited: mirrorEdited },
        patch,
      );
      setAnswers(next.answers);
      setGenerated(next.generated_mirror);
      setMirrorText(next.mirror_text);
      setMirrorEdited(next.mirror_is_edited);
      return next;
    },
    [answers, generated, mirrorText, mirrorEdited],
  );

  const persist = useCallback(async (body: { answers: CoachMethodAnswers; mirror_text?: string }) => {
    setStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setStatus('error');
        setSaveError(await readApiError(res, 'No se ha podido guardar.'));
        return;
      }
      const data = (await res.json()) as CoachMethodInterviewResponse;
      setGenerated(data.generated_mirror);
      setMirrorEdited(data.mirror_is_edited);
      setStatus('saved');
    } catch {
      setStatus('error');
      setSaveError('Sin conexión. No se ha guardado.');
    }
  }, []);

  const schedule = useCallback(
    (nextAnswers: CoachMethodAnswers, nextMirror?: string) => {
      pending.current = { answers: nextAnswers, ...(nextMirror !== undefined ? { mirror_text: nextMirror } : {}) };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(pending.current), SAVE_WAIT_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const selectSingle = (field: SingleField, id: string) => {
    const next = applyLocal({ answers: { ...answers, [field]: answers[field] === id ? null : id } });
    schedule(next.answers);
  };
  const toggleMulti = (field: MultiField, id: string) => {
    const cur = [...(answers[field] ?? [])];
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(id);
    const next = applyLocal({ answers: { ...answers, [field]: cur.length === 0 ? null : cur } });
    schedule(next.answers);
  };
  const writeNote = (field: NoteField, text: string) => {
    const next = applyLocal({ answers: { ...answers, [field]: text } });
    schedule(next.answers);
  };
  const editMirror = (text: string) => {
    const next = applyLocal({ mirror_text: text });
    schedule(next.answers, next.mirror_text);
  };
  const resetMirror = () => {
    const next = applyLocal({ mirror_text: generated });
    schedule(next.answers, next.mirror_text);
  };

  // Un capítulo terminado lleva ✓ en su pestaña; el resto, nada (el recuento
  // total ya está en la cabecera).
  const tabs = useMemo<TabItem<ChapterId>[]>(
    () =>
      INTERVIEW_CHAPTERS.map((c) => {
        const { done, total } = chapterDone(c.id, answers);
        return { value: c.id, label: c.title, icon: done === total ? CircleCheck : undefined };
      }),
    [answers],
  );
  const chapterDef = INTERVIEW_CHAPTERS.find((c) => c.id === chapter) ?? INTERVIEW_CHAPTERS[0]!;
  const idx = CHAPTER_IDS.indexOf(chapter);
  const nextChapter = idx < CHAPTER_IDS.length - 1 ? CHAPTER_IDS[idx + 1] : null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="como-entrenas">
      <SectionHeader
        id="como-entrenas"
        title="Cómo entrenas"
        count={`${answered}/${INTERVIEW_QUESTION_COUNT}`}
        action={<SaveStatus state={status} error={saveError} />}
      />

      <Card padding="none" className="divide-y divide-v2-border">
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="metodo-espejo" className="t-body font-medium text-v2-fg">
              Tu sistema, en un párrafo
            </label>
            {mirrorEdited ? (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetMirror}>
                Volver al generado
              </Button>
            ) : null}
          </div>
          <Textarea
            id="metodo-espejo"
            value={mirrorText}
            maxLength={INTERVIEW_MIRROR_MAX}
            rows={5}
            placeholder="Responde las preguntas de abajo y aquí se escribe tu sistema."
            onChange={(e) => editMirror(e.target.value)}
            aria-describedby="metodo-espejo-hint"
          />
          <p id="metodo-espejo-hint" className="t-meta text-v2-faint">
            {mirrorEdited
              ? 'Corregido por ti. El plan, el chat y el conector leen este texto.'
              : 'Sale de tus respuestas. Corrige lo que no suene a ti.'}
          </p>
        </div>

        <div className="flex flex-col gap-4 px-4 py-3.5">
          <Tabs items={tabs} value={chapter} onValueChange={setChapter} aria-label="Capítulos de la entrevista" />
          <p className="t-body-sm text-v2-muted">{chapterDef.scene}</p>

          {questionsForChapter(chapter).map((q) => {
            const noteId = q.note_id as NoteField | undefined;
            return (
              <fieldset key={q.id} className="flex flex-col gap-2">
                <legend className="mb-1 flex flex-col gap-0.5">
                  <span className="t-body font-medium text-v2-fg">{q.title}</span>
                  {q.prompt ? <span className="t-body-sm text-v2-muted">{q.prompt}</span> : null}
                </legend>
                {q.kind === 'multi' ? (
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt) => (
                      <Checkbox
                        key={opt.id}
                        label={opt.label}
                        checked={(answers[q.id as MultiField] ?? []).includes(opt.id)}
                        onCheckedChange={() => toggleMulti(q.id as MultiField, opt.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <ChoiceList
                    label={q.title}
                    options={q.options}
                    value={answers[q.id as SingleField]}
                    onSelect={(id) => selectSingle(q.id as SingleField, id)}
                    columns={q.layout === 'row' ? 2 : 1}
                  />
                )}
                {noteId ? (
                  <label className="mt-1 flex flex-col gap-1.5">
                    <span className="t-meta text-v2-muted">{q.note_hint}</span>
                    <Textarea
                      value={answers[noteId] ?? ''}
                      maxLength={INTERVIEW_NOTE_MAX}
                      rows={2}
                      onChange={(e) => writeNote(noteId, e.target.value)}
                    />
                  </label>
                ) : null}
              </fieldset>
            );
          })}

          {nextChapter ? (
            <div className="flex justify-end">
              <Button onClick={() => setChapter(nextChapter)}>
                Siguiente: {INTERVIEW_CHAPTERS[idx + 1]!.title}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
