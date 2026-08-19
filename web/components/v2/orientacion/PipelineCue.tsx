'use client';

// v2 · ORIENTACIÓN · PRIMITIVE 2 — PipelineCue.
//
// A slim "Paso N de 4" ribbon that answers "¿dónde estoy en el flujo?". The four
// steps are the coach's build order: Niveles & Fases → Sesiones → Microciclos →
// Secuencias → (opera solo). Progress is REAL (passed from the server loader): a
// dot is "done" only when that stage has the coach's content.
//
// Three render modes (the approved lifecycle):
//   · first-run  — full ribbon with the 5 named nodes + the "opera solo" tail.
//   · compact    — one line: badge "Paso N de 5" + the line + the 5 dots (persistent).
//   · collapsed  — only the badge + dots (after the coach minimises it).
//
// Persistent in minimal mode (decision 2): valuable across the multi-session build.
// The coach can collapse it to just the badge; that choice persists per coach +
// section. It NEVER blocks (not a wizard) — the coach can build out of order.
//
// `activeKeys` = which step(s) this section owns (Periodización: 1 & 4; Biblioteca:
// 2,3). The "current" node is the first active step that is not yet done, else
// the last active step (so a fully-built section still reads as "step 4/4, here").

import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import type { PipelineProgress, PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import { PIPELINE_STEP_META, PIPELINE_TOTAL, pipelineIndex } from './pipeline';
import { usePersistentState, useHydrated } from './persistent-store';

const COLLAPSE_PREFIX = 'v2.orient.cue';

type CueMode = 'compact' | 'collapsed';

function collapseKey(coachKey: string, sectionKey: string): string {
  return `${COLLAPSE_PREFIX}.${coachKey}.${sectionKey}`;
}

/** The node we treat as "current": first active+unfinished, else last active. */
function currentKey(activeKeys: readonly PipelineStepKey[], progress: PipelineProgress): PipelineStepKey {
  const pending = activeKeys.find((k) => !progress[k]);
  return pending ?? activeKeys[activeKeys.length - 1]!;
}

/** Compact label: "Paso N de 4" or "Pasos N–M de 4" when a section owns a
 *  contiguous range. */
function stepBadgeLabel(
  activeKeys: readonly PipelineStepKey[],
  current: PipelineStepKey,
): string {
  const ords = activeKeys.map((k) => PIPELINE_STEP_META[pipelineIndex(k)]!.ord).sort((a, b) => a - b);
  const lo = ords[0]!;
  const hi = ords[ords.length - 1]!;
  // Contiguous owned range (e.g. Biblioteca 2–3) reads as "Pasos 2–3 de 4".
  const contiguous = hi - lo === ords.length - 1 && ords.length > 1;
  if (contiguous) return `Pasos ${lo}–${hi} de ${PIPELINE_TOTAL}`;
  // Non-contiguous owned steps (Periodización owns 1 & 4) would render as a
  // malformed "Pasos 1, 4 de 4". Show the coach's CURRENT step instead — a single
  // honest "estás aquí" ordinal that is never ambiguous. The dots still convey
  // which steps the section owns.
  const curOrd = PIPELINE_STEP_META[pipelineIndex(current)]!.ord;
  return `Paso ${curOrd} de ${PIPELINE_TOTAL}`;
}

export function PipelineCue({
  coachKey,
  sectionKey,
  activeKeys,
  progress,
  /** One-line copy for compact mode (the "lo que toca" descriptor). */
  line,
  /** Show the "opera solo · Hoy" tail node in the first-run ribbon. */
  showOperaSolo = true,
}: {
  coachKey: string;
  sectionKey: string;
  activeKeys: readonly PipelineStepKey[];
  progress: PipelineProgress;
  line: React.ReactNode;
  showOperaSolo?: boolean;
}) {
  // Persisted collapse state (compact | collapsed). A null stored value = first
  // visit → show the full ribbon once, then write "compact" so later visits are
  // quiet. The first-run write is a localStorage write in an effect (NOT setState),
  // so it never triggers cascading renders.
  const key = collapseKey(coachKey, sectionKey);
  const { value: storedMode, set: setStoredMode } = usePersistentState<CueMode>(key);
  const hydrated = useHydrated();

  const firstRun = storedMode == null;
  const markedSeen = useRef(false);
  useEffect(() => {
    if (storedMode == null && !markedSeen.current) {
      markedSeen.current = true;
      setStoredMode('compact');
    }
  }, [storedMode, setStoredMode]);

  const cur = currentKey(activeKeys, progress);
  const curIdx = pipelineIndex(cur);
  const active = new Set(activeKeys);

  // Render order: before hydration → compact (deterministic, no ribbon flash);
  // first visit on the client → full ribbon; later → the stored compact/collapsed.
  const effectiveMode: 'firstrun' | CueMode = !hydrated
    ? 'compact'
    : firstRun
      ? 'firstrun'
      : (storedMode ?? 'compact');

  // ── First-run: full ribbon with named nodes ────────────────────────────────
  if (effectiveMode === 'firstrun') {
    return (
      <div className="mb-4 flex flex-wrap items-stretch rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2 py-3">
        {PIPELINE_STEP_META.map((s, i) => {
          const done = progress[s.key];
          const isNow = s.key === cur;
          return (
            <FlowNode
              key={s.key}
              ord={s.ord}
              name={s.name}
              where={active.has(s.key) ? 'aquí' : s.where}
              done={done}
              now={isNow}
              showArrow={i < PIPELINE_STEP_META.length - 1 || showOperaSolo}
            />
          );
        })}
        {showOperaSolo ? (
          <FlowNode ord="∞" name="Opera solo" where="Hoy" done={false} now={false} info showArrow={false} />
        ) : null}
      </div>
    );
  }

  const badge = stepBadgeLabel(activeKeys, cur);

  // ── Collapsed: only badge + dots ────────────────────────────────────────────
  if (effectiveMode === 'collapsed') {
    return (
      <div className="mb-4 inline-flex w-auto items-center gap-2.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] py-1 pl-3 pr-2 text-label">
        <span
          className="rounded-[var(--v2-r-pill)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-wide"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent-text)' }}
        >
          {badge}
        </span>
        <Dots curIdx={curIdx} progress={progress} active={active} />
        <button
          type="button"
          onClick={() => setStoredMode('compact')}
          aria-label="Mostrar el flujo"
          className="v2-focus inline-flex rounded-[var(--v2-r-xs)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-accent-text)]"
        >
          <MIcon name="unfold_more" size={15} />
        </button>
      </div>
    );
  }

  // ── Compact (default steady state): one line ────────────────────────────────
  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] py-1 pl-3 pr-2 text-label">
      <span
        className="shrink-0 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-wide"
        style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent-text)' }}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1 truncate text-[color:var(--v2-muted)] [&_b]:font-bold [&_b]:text-[color:var(--v2-fg)]">
        {line}
      </span>
      <Dots curIdx={curIdx} progress={progress} active={active} />
      <button
        type="button"
        onClick={() => setStoredMode('collapsed')}
        aria-label="Contraer el flujo"
        className="v2-focus inline-flex shrink-0 rounded-[var(--v2-r-xs)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-accent-text)]"
      >
        <MIcon name="unfold_less" size={15} />
      </button>
    </div>
  );
}

// ── Dots ────────────────────────────────────────────────────────────────────
function Dots({
  curIdx,
  progress,
  active,
}: {
  curIdx: number;
  progress: PipelineProgress;
  active: Set<PipelineStepKey>;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
      {PIPELINE_STEP_META.map((s, i) => {
        const done = progress[s.key];
        const isNow = i === curIdx || (active.has(s.key) && !done);
        return (
          <span
            key={s.key}
            className="h-1.5 w-1.5 rounded-full"
            style={
              isNow
                ? { background: 'var(--v2-accent)', boxShadow: '0 0 0 3px var(--v2-accent-soft)' }
                : done
                  ? { background: 'var(--v2-accent)', opacity: 0.55 }
                  : { background: 'var(--v2-border-strong)' }
            }
          />
        );
      })}
    </span>
  );
}

// ── FlowNode (first-run ribbon) ───────────────────────────────────────────────
function FlowNode({
  ord,
  name,
  where,
  done,
  now,
  info = false,
  showArrow,
}: {
  ord: number | string;
  name: string;
  where: string;
  done: boolean;
  now: boolean;
  info?: boolean;
  showArrow: boolean;
}) {
  const numStyle = info
    ? { background: 'var(--v2-info-soft)', color: 'var(--v2-info)' }
    : now
      ? { background: 'var(--v2-accent)', color: 'var(--v2-accent-fg)' }
      : done
        ? { background: 'var(--v2-accent-soft)', color: 'var(--v2-accent-text)' }
        : { background: 'var(--v2-surface-2)', color: 'var(--v2-faint)' };
  const nameColor = info
    ? 'var(--v2-info)'
    : now
      ? 'var(--v2-accent)'
      : 'var(--v2-muted)';
  return (
    <div className="flex items-center">
      <div className="min-w-[92px] px-2 text-center">
        <span
          className="v2-num mb-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-eyebrow font-bold"
          style={numStyle}
        >
          {ord}
        </span>
        <div className="text-label font-bold leading-tight" style={{ color: nameColor }}>
          {name}
        </div>
        <div className="mt-0.5 text-nano font-bold uppercase tracking-wide text-[color:var(--v2-faint)]">
          {where}
        </div>
      </div>
      {showArrow ? (
        <span className="flex shrink-0 items-center text-[color:var(--v2-faint)]" aria-hidden>
          <MIcon name="chevron_right" size={16} />
        </span>
      ) : null}
    </div>
  );
}
