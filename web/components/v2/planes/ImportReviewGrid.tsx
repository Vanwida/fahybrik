'use client';

// ImportReviewGrid — #28 review step (Fork C: grid + drill-in). Weeks × days, each
// day tinted by its honest tone (grey rest / green typed / amber review / red
// unresolved / grey-struck skipped). Per imported week, an EXPLICIT target-week
// selector (Fork B — the coach maps each imported week onto a container week;
// nothing auto-fits) plus an include/exclude toggle; each non-rest day has its own
// toggle too, so the coach picks EXACTLY what gets imported — excluding a day with
// an unresolved exercise unblocks confirming the rest. Clicking a non-rest day
// opens the day drawer to fix it. "Confirmar" is gated: every INCLUDED week mapped
// + zero unresolved exercises among INCLUDED days (nothing untyped is ever saved).

import { useState } from 'react';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { ImportNotices } from './ImportNotices';
import {
  acceptDayProposals,
  dayHiddenCount,
  dayProposedFields,
  dayReviewLineCount,
  dayTone,
  totalExcludedDays,
  totalIncomplete,
  totalUnresolved,
  totalWritableDays,
  unmappedWeekCount,
  type DayTone,
  type MicroWeekRef,
  type ReviewDay,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';
import { ArrowLeft, CircleAlert, CircleMinus, CirclePlus, Info, ListPlus, Wand2, CheckCheck } from 'lucide-react';
import { Button, IconButton, Select, StatusBadge, Tag, type StatusTone } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { ImportDayReviewDrawer } from './ImportDayReviewDrawer';
import { ImportMissingExercisesPanel } from './ImportMissingExercisesPanel';
import {
  applyMissingExerciseDecisions,
  collectMissingExercises,
  realMissingCount,
} from '@/lib/dashboard/v2/import-missing';
import {
  applyGapPlan,
  completeWeeksDoses,
  hasCompletableGaps,
  planGapResolution,
} from '@/lib/dashboard/v2/import-complete-gaps';
import type { ScoredCandidate } from '@/lib/dashboard/exercises/near-match';

// `incomplete` shares the danger hue with `unresolved` because it shares the
// consequence — both block Confirmar. Amber would promise the coach he can ship
// it, which is a lie. The TAG carries the distinction: which of the two things
// this day is missing, and therefore what he has to go do.
const TONE_CELL: Record<DayTone, string> = {
  rest: 'border-dashed border-v2-border text-v2-faint',
  skipped: 'border-dashed border-v2-border',
  ok: 'border-v2-border',
  review: 'border-v2-border',
  incomplete: 'border-v2-border',
  unresolved: 'border-v2-border',
};

const TONE_TAG: Record<Exclude<DayTone, 'rest'>, { label: string; tone: StatusTone }> = {
  ok: { label: 'tipado', tone: 'ok' },
  review: { label: 'revisar', tone: 'warn' },
  incomplete: { label: 'sin cantidad', tone: 'danger' },
  unresolved: { label: 'ejercicio?', tone: 'danger' },
  skipped: { label: 'no entra', tone: 'neutral' },
};

/** The clickable (or inert) content area of a day cell. Rendered as a SIBLING of
 *  the include/exclude toggle so the grid never nests a button inside a button. */
function CellBody({
  as,
  onClick,
  ariaLabel,
  children,
}: {
  as: 'button' | 'div';
  onClick?: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const layout = 'flex flex-1 flex-col items-start gap-1 px-2 py-2 text-left';
  if (as === 'button') {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn('h-auto justify-start whitespace-normal rounded-[inherit] font-normal', layout)}
      >
        {children}
      </Button>
    );
  }
  return <div className={layout}>{children}</div>;
}

export function ImportReviewGrid({
  reviewWeeks,
  microWeeks,
  notices,
  onChange,
  onConfirm,
  confirming,
  error,
  onBack,
  onAddPhoto,
}: {
  reviewWeeks: ReviewWeek[];
  microWeeks: MicroWeekRef[];
  /** Lo que la IA no pudo honrar del foco. Se enseña ANTES de la parrilla. */
  notices?: WeekNotice[];
  onChange: (next: ReviewWeek[]) => void;
  onConfirm: () => void;
  confirming: boolean;
  error: string | null;
  onBack: () => void;
  /** Vuelve al paso de las fotos, para la captura de una tarjeta que salió cortada.
   *  Solo existe cuando la propuesta vino de una foto. */
  onAddPhoto?: () => void;
}) {
  const [editing, setEditing] = useState<{ weekIdx: number; dayIdx: number } | null>(null);
  const [creatingMissing, setCreatingMissing] = useState(false);
  const [completingGaps, setCompletingGaps] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  // Cuántos NOMBRES distintos faltan, no cuántas líneas: 51 líneas de una semana
  // real son 30 nombres, y es por nombre por lo que se decide.
  const missingCount = realMissingCount(collectMissingExercises(reviewWeeks));
  const canCompleteGaps = hasCompletableGaps(reviewWeeks);

  /**
   * Un clic: resuelve ejercicios (match / crear / descartar basura) y siembra
   * dosis genéricas. El coach refina después en el microciclo.
   */
  const completeGaps = async () => {
    if (completingGaps || !canCompleteGaps) return;
    setCompletingGaps(true);
    setGapError(null);
    try {
      const missing = collectMissingExercises(reviewWeeks);
      const matchesByToken = new Map<string, ScoredCandidate[]>();
      const tokens = missing.filter((m) => !m.notAnExercise).map((m) => m.token);
      if (tokens.length > 0) {
        const res = await fetch('/api/coach/exercises/missing', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tokens }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            matches?: Array<{ token: string; candidates: ScoredCandidate[] }>;
          };
          for (const m of data.matches ?? []) {
            matchesByToken.set(m.token, m.candidates);
          }
        }
      }

      const planned = planGapResolution(missing, matchesByToken);
      const plan = {
        merge: [...planned.merge],
        create: [...planned.create],
        discardKeys: [...planned.discardKeys],
      };
      let created: Array<{ id: string; name: string }> = [];

      if (plan.create.length > 0) {
        const res = await fetch('/api/coach/exercises/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            exercises: plan.create.map((c) => ({
              name: c.name,
              category: c.category,
              modality: c.modality,
            })),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: {
              code?: string;
              message?: string;
              details?: { collisions?: Array<{ name: string; existing: string }> };
            };
          } | null;
          // Ya existen: fusionar con el match más cercano y reintentar el resto.
          if (res.status === 409 && data?.error?.details?.collisions) {
            const collisionNames = new Set(
              data.error.details.collisions.map((c) => c.name.toLowerCase()),
            );
            const stillCreate = [];
            for (const spec of plan.create) {
              if (!collisionNames.has(spec.name.toLowerCase())) {
                stillCreate.push(spec);
                continue;
              }
              const cands = matchesByToken.get(spec.name) ?? [];
              const best = cands[0];
              if (best) {
                plan.merge.push({
                  key: spec.key,
                  exercise_id: best.id,
                  exercise_name: best.name,
                });
              } else {
                setGapError(
                  data.error?.message ??
                    `«${spec.name}» ya está en tu catálogo. Ábrelo el día y únelo a mano.`,
                );
                return;
              }
            }
            plan.create = stillCreate;
            if (plan.create.length > 0) {
              const retry = await fetch('/api/coach/exercises/bulk', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  exercises: plan.create.map((c) => ({
                    name: c.name,
                    category: c.category,
                    modality: c.modality,
                  })),
                }),
              });
              if (!retry.ok) {
                const err = (await retry.json().catch(() => null)) as {
                  error?: { message?: string };
                } | null;
                setGapError(err?.error?.message ?? 'No se pudieron crear los ejercicios.');
                return;
              }
              const body = (await retry.json()) as {
                created: Array<{ id: string; name: string }>;
              };
              created = body.created;
            }
          } else {
            setGapError(data?.error?.message ?? 'No se pudieron crear los ejercicios.');
            return;
          }
        } else {
          const body = (await res.json()) as {
            created: Array<{ id: string; name: string }>;
          };
          created = body.created;
        }
      }

      // Solo dosis (ejercicios ya resueltos) o plan completo.
      if (
        plan.create.length === 0 &&
        plan.merge.length === 0 &&
        plan.discardKeys.length === 0
      ) {
        onChange(completeWeeksDoses(reviewWeeks));
      } else {
        onChange(applyGapPlan(reviewWeeks, plan, created));
      }
    } catch {
      setGapError('No se pudo completar. Inténtalo de nuevo.');
    } finally {
      setCompletingGaps(false);
    }
  };

  const setTarget = (weekIdx: number, target: string | null) => {
    onChange(reviewWeeks.map((w, i) => (i === weekIdx ? { ...w, target_week_id: target } : w)));
  };

  /** Reemplaza UNA sesión del día (el resto del día se queda como estaba). */
  const setSession = (
    weekIdx: number,
    dayIdx: number,
    sessionIdx: number,
    session: EditorSession,
  ) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx
          ? w
          : {
              ...w,
              days: w.days.map((d, j) =>
                j !== dayIdx
                  ? d
                  : { ...d, sessions: d.sessions.map((s, k) => (k === sessionIdx ? session : s)) },
              ),
            },
      ),
    );
  };

  const setWeekIncluded = (weekIdx: number, included: boolean) => {
    onChange(reviewWeeks.map((w, i) => (i === weekIdx ? { ...w, included } : w)));
  };

  const setDayIncluded = (weekIdx: number, dayIdx: number, included: boolean) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx
          ? w
          : { ...w, days: w.days.map((d, j) => (j === dayIdx ? { ...d, included } : d)) },
      ),
    );
  };

  const patchDay = (weekIdx: number, dayIdx: number, next: (day: ReviewDay) => ReviewDay) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx ? w : { ...w, days: w.days.map((d, j) => (j === dayIdx ? next(d) : d)) },
      ),
    );
  };

  const unresolved = totalUnresolved(reviewWeeks);
  const incomplete = totalIncomplete(reviewWeeks);
  const unmapped = unmappedWeekCount(reviewWeeks);
  const writable = totalWritableDays(reviewWeeks);
  const excluded = totalExcludedDays(reviewWeeks);
  const canConfirm =
    !confirming && unresolved === 0 && incomplete === 0 && unmapped === 0 && writable > 0;

  const editingWeek = editing ? reviewWeeks[editing.weekIdx] : null;
  const editingDay = editingWeek ? editingWeek.days[editing!.dayIdx] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {notices && notices.length > 0 ? <ImportNotices notices={notices} /> : null}
        {reviewWeeks.map((week, weekIdx) => (
          <section key={`${week.sheet}-${weekIdx}`} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="t-title-sm text-v2-fg">
                  Semana <span className="t-tnum">{week.week}</span>
                </h3>
                <span className="t-body-sm text-v2-faint">· {week.sheet}</span>
                {week.fell_back ? <Tag icon={Info}>se leyó la estándar</Tag> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Include/exclude the whole imported week. */}
                <Button
                  size="sm"
                  variant={week.included ? 'ghost' : 'secondary'}
                  icon={week.included ? CircleMinus : CirclePlus}
                  onClick={() => setWeekIncluded(weekIdx, !week.included)}
                  aria-label={
                    week.included ? `No importar la semana ${week.week}` : `Importar la semana ${week.week}`
                  }
                >
                  {week.included ? 'No importar' : 'Importar esta semana'}
                </Button>

                {/* Fork B — explicit mapping (an excluded week needs no destination). */}
                <label className="flex items-center gap-1.5 t-body-sm text-v2-muted">
                  <span>Meter en</span>
                  <Select
                    size="sm"
                    aria-label={`Semana del programa para la semana ${week.week}`}
                    value={week.target_week_id ?? 'none'}
                    onValueChange={(v) => setTarget(weekIdx, v === 'none' ? null : v)}
                    disabled={!week.included}
                    options={[
                      { value: 'none', label: 'Elige semana' },
                      ...microWeeks.map((mw) => ({
                        value: mw.id,
                        label: `Semana ${mw.index + 1}${mw.label ? ` · ${mw.label}` : ''}`,
                        hint: mw.session_count > 0 ? `${mw.session_count} entrenos` : 'vacía',
                      })),
                    ]}
                  />
                </label>
              </div>
            </div>

            <div
              className={cn(
                'grid grid-cols-4 gap-1.5 sm:grid-cols-7',
                week.included ? '' : 'opacity-60',
              )}
            >
              {week.days.map((day, dayIdx) => {
                const tone = dayTone(day, week.included);
                // Con doble sesión la celda resume las DOS ("Series · Fuerza"):
                // enseñar solo la primera escondería medio día de entreno.
                const headline =
                  day.sessions
                    .map((s) => s.focus ?? s.blocks[0]?.title)
                    .filter(Boolean)
                    .join(' · ') || (tone === 'rest' ? 'Descanso' : '—');
                // A rest day writes nothing → inert. With the week excluded the
                // week-level control governs → cells are display-only too.
                const clickable = tone !== 'rest' && week.included;
                const cellLabel = `${day.dow} de la semana ${week.week}`;
                // Un día ámbar puede serlo por tres motivos MUY distintos y la
                // píldora dice cuál, ordenados por lo que le toca hacer al coach:
                //   1. «N sin ver» — hay trabajo que la foto no enseñó: o lo escribe
                //      a mano o vuelve a fotografiar. Es lo único que falta de verdad.
                //   2. «revisar»   — hay texto que no se pudo tipar: pide sus OJOS.
                //   3. «N huecos»  — valores ya rellenados con sus defaults: solo
                //      pide un visto bueno, así que va el último.
                // El orden importa: con «huecos» arriba, un día con diez huecos ya
                // tapados y dos líneas sin tipar se leía como si no quedara nada que
                // mirar, que es justo lo contrario de la verdad.
                const hidden = tone === 'review' ? dayHiddenCount(day) : 0;
                const toReview = tone === 'review' ? dayReviewLineCount(day) : 0;
                const proposed = tone === 'review' ? dayProposedFields(day).length : 0;
                const tagLabel =
                  hidden > 0
                    ? `${hidden} sin ver`
                    : toReview > 0
                      ? TONE_TAG.review.label
                      : proposed > 0
                        ? `${proposed} hueco${proposed === 1 ? '' : 's'}`
                        : tone === 'rest'
                          ? ''
                          : TONE_TAG[tone].label;
                return (
                  <div
                    key={day.day_of_week}
                    className={cn(
                      'relative flex min-h-[68px] flex-col rounded-ctl border bg-v2-surface',
                      TONE_CELL[tone],
                    )}
                  >
                    {clickable ? (
                      /* Small include/exclude toggle, top-right (sibling of the main
                         button — never nested). */
                      <IconButton
                        icon={day.included ? CircleMinus : CirclePlus}
                        size="sm"
                        onClick={() => setDayIncluded(weekIdx, dayIdx, !day.included)}
                        label={day.included ? `No importar ${cellLabel}` : `Importar ${cellLabel}`}
                        className="absolute right-0.5 top-0.5 z-10 size-6 w-6"
                      />
                    ) : null}

                    <CellBody
                      as={clickable ? 'button' : 'div'}
                      onClick={clickable ? () => setEditing({ weekIdx, dayIdx }) : undefined}
                      ariaLabel={clickable ? `Revisar ${cellLabel}` : undefined}
                    >
                      <span className="t-label text-v2-faint">{day.dow.slice(0, 3)}</span>
                      <span
                        className={cn(
                          'line-clamp-2 flex-1 t-meta',
                          tone === 'skipped' ? 'text-v2-faint line-through' : 'text-v2-muted',
                        )}
                      >
                        {headline}
                      </span>
                      {tone !== 'rest' ? <StatusBadge size="sm" tone={TONE_TAG[tone].tone} label={tagLabel} /> : null}
                    </CellBody>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="space-y-2 border-t border-v2-border px-5 py-3">
        {error || gapError ? (
          <p role="alert" className="flex items-center gap-1.5 t-body-sm text-v2-danger">
            <CircleAlert aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
            {error ?? gapError}
          </p>
        ) : unresolved > 0 || incomplete > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <StatusBadge
              tone="danger"
              label={
                unresolved > 0
                  ? unresolved === 1
                    ? '1 línea sin ejercicio del catálogo'
                    : `${unresolved} líneas sin ejercicio del catálogo`
                  : incomplete === 1
                    ? '1 línea sin cantidad'
                    : `${incomplete} líneas sin cantidad`
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              {canCompleteGaps ? (
                <Button
                  size="sm"
                  icon={Wand2}
                  loading={completingGaps}
                  disabled={confirming}
                  onClick={() => void completeGaps()}
                >
                  {completingGaps ? 'Completando…' : 'Completar huecos'}
                </Button>
              ) : null}
              {missingCount > 0 ? (
                <Button size="sm" variant="ghost" icon={ListPlus} onClick={() => setCreatingMissing(true)} disabled={completingGaps}>
                  {missingCount === 1 ? 'Elegir a mano' : `Elegir a mano (${missingCount})`}
                </Button>
              ) : null}
            </div>
            {canCompleteGaps ? (
              <p className="w-full t-meta text-v2-faint">
                Completar rellena ejercicios y cantidades genéricas, marcados como propuestos; los ajustas luego en
                el programa.
              </p>
            ) : null}
          </div>
        ) : unmapped > 0 ? (
          <StatusBadge tone="warn" label="Asigna cada semana importada a una semana del programa." />
        ) : writable === 0 ? (
          <StatusBadge tone="warn" label="No queda ningún día seleccionado. Incluye al menos uno." />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="lg" icon={ArrowLeft} onClick={onBack} disabled={confirming || completingGaps}>
            Atrás
          </Button>
          <span className="ml-auto t-body-sm text-v2-muted">
            {excluded > 0 ? (
              <>
                Se deja{excluded === 1 ? '' : 'n'} fuera <span className="t-tnum">{excluded}</span> día
                {excluded === 1 ? '' : 's'}
              </>
            ) : null}
          </span>
          <Button
            variant="primary"
            size="lg"
            icon={CheckCheck}
            loading={confirming}
            disabled={!canConfirm || completingGaps}
            onClick={onConfirm}
          >
            {confirming
              ? 'Guardando…'
              : writable > 0
                ? `Confirmar ${writable} día${writable === 1 ? '' : 's'}`
                : 'Confirmar'}
          </Button>
        </div>
      </footer>

      {creatingMissing ? (
        <ImportMissingExercisesPanel
          weeks={reviewWeeks}
          onResolved={(decisions) => {
            onChange(applyMissingExerciseDecisions(reviewWeeks, decisions));
            setCreatingMissing(false);
          }}
          onClose={() => setCreatingMissing(false)}
        />
      ) : null}

      {editing && editingDay ? (
        <ImportDayReviewDrawer
          day={editingDay}
          dayLabel={`Semana ${editingWeek!.week} · ${editingDay.dow}`}
          onChangeSession={(sessionIdx, session) =>
            setSession(editing.weekIdx, editing.dayIdx, sessionIdx, session)
          }
          onChangeIncluded={(included) => setDayIncluded(editing.weekIdx, editing.dayIdx, included)}
          onAcceptProposals={() =>
            patchDay(editing.weekIdx, editing.dayIdx, acceptDayProposals)
          }
          onAddPhoto={onAddPhoto}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
