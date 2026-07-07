'use client';

// FAHYBRID public onboarding — client orchestrator.
//
// One question per screen, tap-first, branching-aware. The persistent topbar
// (progress + block counter + back/reset) frames a `.ob-stage` where only the
// screens animate (slide + fade). State is keyed by DB column; two-phase
// persistence fires a fire-and-forget draft at the email step and a blocking
// full submit at the end (see flow.ts). Renders FROM @fahybrid/shared — copy,
// options and branching are never re-typed here.

import { useEffect, useRef, useState } from 'react';
import {
  leadFirstName,
  resolveLeadTitle,
  type LeadAnswers,
} from '@fahybrid/shared/domain/leads/questions';
import {
  FINAL_ID,
  INTRO_ID,
  buildCompleteBody,
  buildDraftBody,
  nextStepId,
  questionById,
  submitComplete,
  submitDraft,
  topbarInfo,
  type NavDir,
} from './flow';
import {
  FinalScreen,
  IntroScreen,
  QuestionScreen,
  type AnswerPatch,
  type ScreenCallbacks,
} from './screens';
import { BackIcon, ResetIcon } from './icons';
import './onboarding.css';

// Delay before focusing the first field of a freshly-mounted screen, so it lands
// after the slide settles (matches the mockup). Skipped under reduced motion.
const FOCUS_DELAY_MS = 360;

type Phase = 'enter' | 'leave';
interface Pane {
  key: number;
  stepId: string;
  dir: NavDir;
  phase: Phase;
}

function applyPatch(base: LeadAnswers, patch: AnswerPatch): LeadAnswers {
  const next: LeadAnswers = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}

export function OnboardingFlow({ locale }: { locale: string }) {
  const [answers, setAnswers] = useState<LeadAnswers>({});
  const [panes, setPanes] = useState<Pane[]>(() => [
    { key: 0, stepId: INTRO_ID, dir: 'fwd', phase: 'enter' },
  ]);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Booking token minted by the phase-2 submit — lets the lead pick a
  // videollamada slot on the final screen (see FinalScreen / BookingSlotPicker).
  const [bookingToken, setBookingToken] = useState<string | null>(null);

  const historyRef = useRef<string[]>([]);
  const paneKeyRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const liveStepId = panes[panes.length - 1]?.stepId ?? INTRO_ID;
  const liveKey = panes[panes.length - 1]?.key ?? 0;
  const nombre = leadFirstName(typeof answers.nombre === 'string' ? answers.nombre : '');
  const email = typeof answers.email === 'string' ? answers.email : '';

  // ── Reduced-motion preference (drives whether we render a leaving pane) ──
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ── Autofocus the first field of the live screen after it mounts ──
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const screens = stage.querySelectorAll('.ob-screen');
    const live = screens[screens.length - 1] as HTMLElement | undefined;
    const field = live?.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea');
    if (!field) return;
    const t = window.setTimeout(
      () => field.focus({ preventScroll: true }),
      reduceMotion ? 0 : FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(t);
  }, [liveKey, reduceMotion]);

  // ── Transition primitive ──
  const navigate = (nextId: string, dir: NavDir) => {
    paneKeyRef.current += 1;
    const key = paneKeyRef.current;
    setPanes((prev) => {
      const live = prev[prev.length - 1];
      const entering: Pane = { key, stepId: nextId, dir, phase: 'enter' };
      if (reduceMotion || !live) return [entering];
      const leaving: Pane = { ...live, phase: 'leave', dir };
      return [leaving, entering];
    });
  };

  const onPaneAnimationEnd = (pane: Pane) => {
    if (pane.phase !== 'leave') return;
    setPanes((prev) => prev.filter((p) => p.key !== pane.key));
  };

  // ── Navigation handlers ──
  const goForward = (merged: LeadAnswers) => {
    const nx = nextStepId(liveStepId, merged);
    if (!nx) return;
    historyRef.current.push(liveStepId);
    navigate(nx, 'fwd');
  };

  const cb: ScreenCallbacks = {
    locale,
    onStart: () => {
      const nx = nextStepId(INTRO_ID, answers);
      if (!nx) return;
      historyRef.current.push(INTRO_ID);
      navigate(nx, 'fwd');
    },
    onAdvance: (patch) => {
      const merged = applyPatch(answers, patch);
      setAnswers(merged);
      goForward(merged);
    },
    onEmailAdvance: (value) => {
      const merged = applyPatch(answers, { email: value });
      setAnswers(merged);
      // Phase 1: fire-and-forget partial capture. Never blocks the user.
      submitDraft(buildDraftBody(merged, value));
      goForward(merged);
    },
    onComplete: async (patch) => {
      const merged = applyPatch(answers, patch);
      setAnswers(merged);
      // Phase 2: blocking full submit. Advance only on success.
      const { ok, token } = await submitComplete(buildCompleteBody(merged));
      if (ok) {
        if (token) setBookingToken(token);
        const nx = nextStepId(liveStepId, merged) ?? FINAL_ID;
        historyRef.current.push(liveStepId);
        navigate(nx, 'fwd');
      }
      return ok;
    },
  };

  const goBack = () => {
    const prev = historyRef.current.pop();
    if (prev === undefined) return;
    navigate(prev, 'back');
  };

  const resetAll = () => {
    historyRef.current = [];
    setAnswers({});
    navigate(INTRO_ID, 'back');
  };

  // ── Derived topbar state ──
  const tb = topbarInfo(liveStepId, answers);
  // Back is available on every question screen (each is reachable only via a
  // forward step, so history is always non-empty there) but never on intro/final.
  const showBack = liveStepId !== INTRO_ID && liveStepId !== FINAL_ID;

  let liveAnnounce = '';
  if (liveStepId === FINAL_ID) {
    liveAnnounce = `Solicitud recibida. Perfecto${nombre ? `, ${nombre}` : ''}.`;
  } else if (liveStepId !== INTRO_ID) {
    const q = questionById(liveStepId);
    if (q) liveAnnounce = resolveLeadTitle(q, nombre);
  }

  const renderPane = (stepId: string) => {
    if (stepId === INTRO_ID) return <IntroScreen cb={cb} />;
    if (stepId === FINAL_ID)
      return <FinalScreen nombre={nombre} email={email} bookingToken={bookingToken} />;
    const q = questionById(stepId);
    return q ? <QuestionScreen question={q} answers={answers} nombre={nombre} cb={cb} /> : null;
  };

  return (
    <div className="ob-wrap">
      <div className="ob-grain" aria-hidden="true" />
      <div className="ob-watermark" aria-hidden="true" />
      <div className="ob-app">
        {tb.show ? (
          <div className="ob-topbar">
            <div className="ob-progress">
              <div className="ob-progressbar" style={{ width: `${tb.pct}%` }} />
            </div>
            <div className="ob-topbar-row">
              <button
                type="button"
                className={`ob-iconbtn${showBack ? '' : ' is-hidden'}`}
                aria-label="Atrás"
                aria-hidden={showBack ? undefined : true}
                tabIndex={showBack ? 0 : -1}
                onClick={goBack}
              >
                <BackIcon />
              </button>
              <button
                type="button"
                className="ob-iconbtn"
                aria-label="Empezar de nuevo"
                title="Empezar de nuevo"
                onClick={resetAll}
              >
                <ResetIcon />
              </button>
            </div>
            <div className="ob-topbar-label">
              <span className="ob-tick" aria-hidden="true" />
              <span>{tb.label}</span>
            </div>
          </div>
        ) : null}

        <div className="ob-stage" ref={stageRef}>
          {panes.map((p) => (
            <div
              key={p.key}
              className="ob-screen"
              data-phase={p.phase}
              data-dir={p.dir}
              aria-hidden={p.phase === 'leave' ? true : undefined}
              inert={p.phase === 'leave'}
              onAnimationEnd={() => onPaneAnimationEnd(p)}
            >
              {renderPane(p.stepId)}
            </div>
          ))}
        </div>
      </div>

      {/* Polite screen-reader announcement on each screen change. */}
      <div className="ob-sr-only" role="status" aria-live="polite">
        {liveAnnounce}
      </div>
    </div>
  );
}
