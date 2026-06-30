'use client';

// HoyBoard — the client orchestrator for the flagship Hoy screen. Renders the
// top bar (display title + real count chips + search + coach avatar) and the
// 4-lane board. Owns the search query: typing filters cards by athlete name
// across every lane (counts in the headers reflect the filtered view). Data is
// computed server-side (buildHoyLanes) and passed in via props.

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { HoyLane } from '@/components/v2/hoy/HoyLane';
import { NivelSugeridoStrip } from '@/components/v2/hoy/NivelSugeridoCard';
import { AltasPendientesStrip } from '@/components/v2/hoy/AltasPendientesStrip';
import { AsignacionSugeridaStrip } from '@/components/v2/hoy/AsignacionSugeridaCard';
import { SiguienteMicrocicloStrip } from '@/components/v2/hoy/SiguienteMicrocicloCard';
import { AjusteSemanalStrip } from '@/components/v2/hoy/AjusteSemanalCard';
import { ActividadHoyStrip } from '@/components/v2/hoy/ActividadHoyStrip';
import type { ActivityToday } from '@/lib/dashboard/coach/activity-today';
import {
  IntroStrip,
  InfoDot,
  TeachingEmptyState,
  useOrientationState,
  type IntroMicroStep,
} from '@/components/v2/orientacion';
import { Link } from '@/i18n/navigation';
import type { V2HoyData, V2LaneCard } from '@/lib/dashboard/v2/hoy-lanes';
import type { PendingIntakeAthlete } from '@/lib/coach/intake';
import { cn } from '@/lib/utils';

function matches(card: V2LaneCard, q: string): boolean {
  return card.athlete_name.toLowerCase().includes(q);
}

// ── Inline orientation (shared primitives) ──────────────────────────────────
// Hoy is OPERATE, not build → it sits OUTSIDE the construction pipeline, so it
// carries NO PipelineCue. The orientation here reframes the mental model
// ("vigilas, no asignas"), not an order of steps.
const SECTION_KEY = 'hoy';

const HOY_INTRO_LINE: React.ReactNode = (
  <>
    <b>Hoy</b> reúne solo lo que necesita tu decisión. El sistema sigue tu método solo — tú aceptas las excepciones.
  </>
);

const HOY_INTRO_STEPS: IntroMicroStep[] = [
  {
    title: 'El sistema propone',
    body: <>Cada atleta cae en su secuencia y recibe el plan automáticamente.</>,
  },
  {
    title: 'Solo sube lo que decide',
    body: <>Aquí aparece lo que se sale del molde: una señal, un mensaje, un ajuste.</>,
  },
  {
    title: 'Tú aceptas o ajustas',
    body: <>Una bandeja vacía significa que todo va según tu método.</>,
  },
];

export function HoyBoard({
  data,
  today,
  coach_name,
  coachKey,
  pending_intakes,
  activity,
}: {
  data: V2HoyData;
  today: string;
  coach_name: string;
  coachKey: string;
  pending_intakes: PendingIntakeAthlete[];
  activity: ActivityToday;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const orient = useOrientationState(coachKey, SECTION_KEY);

  // The whole board is empty when no lane holds a card, no new athlete awaits a
  // level, and no auto-assignment proposal is pending — the "all in order" signal
  // (and we're not mid-search).
  const totalCards = data.lanes.reduce((n, l) => n + l.cards.length, 0);
  const boardEmpty =
    totalCards === 0 &&
    pending_intakes.length === 0 &&
    data.nivel_sugerido_cards.length === 0 &&
    data.asignacion_sugerida_cards.length === 0 &&
    data.siguiente_microciclo_cards.length === 0 &&
    data.week_adjustment_cards.length === 0;

  // Filter cards per lane by the search query (empty query → all cards).
  const filteredLanes = useMemo(
    () =>
      data.lanes.map((lane) => ({
        lane,
        cards: q ? lane.cards.filter((c) => matches(c, q)) : lane.cards,
      })),
    [data.lanes, q],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Hoy</span>
            <span className="text-[color:var(--v2-muted)]"> · {today}</span>
            {orient.hydrated && !orient.visible ? (
              <InfoDot onClick={orient.recall} label="Cómo funciona Hoy" className="ml-2" />
            ) : null}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral" variant="soft">
              <span className="v2-num">{data.total_athletes}</span>&nbsp;atletas
            </Pill>
            <Pill tone="danger" variant="soft">
              <span className="v2-num">{data.need_attention_count}</span>&nbsp;requieren atención
            </Pill>
            <Pill tone="info" variant="soft">
              <span className="v2-num">{data.awaiting_reply_count}</span>&nbsp;sin respuesta
            </Pill>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Search */}
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar atleta…"
              aria-label="Buscar atleta"
              className={cn(
                'v2-focus h-9 w-44 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] pl-8 pr-3 text-sm sm:w-56',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
                'focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>
          <AthleteAvatar name={coach_name} size="md" />
        </div>
      </div>

      {/* ── Inline orientation: intro strip (no pipeline cue — Hoy operates) ── */}
      {orient.visible ? (
        <div className="mt-5">
          <IntroStrip
            icon="visibility"
            line={HOY_INTRO_LINE}
            steps={HOY_INTRO_STEPS}
            expanded={orient.expanded}
            onToggle={orient.toggleExpanded}
            onDismiss={orient.dismiss}
          />
        </div>
      ) : null}

      {/* ── Altas sin revisar (onboarded athletes whose intake is unreviewed) ── */}
      <AltasPendientesStrip pending={pending_intakes} />

      {/* ── Nivel sugerido strip (new athletes awaiting level confirmation) ── */}
      <NivelSugeridoStrip cards={data.nivel_sugerido_cards} />

      {/* ── Asignación sugerida strip (classified athletes ready to auto-assign,
          or an actionable gap when their sequence cell can't resolve) ── */}
      <AsignacionSugeridaStrip cards={data.asignacion_sugerida_cards} />

      {/* ── Siguiente microciclo strip (athletes whose current microciclo is
          ending — one-click walk to the next step / repeat / level up) ── */}
      <SiguienteMicrocicloStrip cards={data.siguiente_microciclo_cards} />

      {/* ── Ajuste de semana strip (pending Pablo IA week-adjustment proposals —
          accept applies the slot changes, ignore rejects them) ── */}
      <AjusteSemanalStrip cards={data.week_adjustment_cards} />

      {/* ── Actividad de hoy (SABER glance — what the roster actually logged today,
          incl. off-plan entrenos libres; tap a row to drill into the executed
          session on the athlete's detail). Ambient, never a queue. ── */}
      <ActividadHoyStrip activity={activity} />

      {boardEmpty && !q ? (
        /* Empty board is a GOOD signal, not an error — teach the reframe. */
        <div className="mt-4">
          <TeachingEmptyState
            icon="check_circle"
            title="Nada requiere tu atención"
            whatToDo={
              <>
                Tus <span className="v2-num">{data.total_athletes}</span> atletas siguen su plan. El sistema sigue
                tu método solo.
              </>
            }
            why={
              <>
                <b>Esto es buena señal:</b> Hoy se llena solo cuando un atleta se sale del molde — una sesión fallada,
                un mensaje, alguien listo para subir de nivel.
              </>
            }
            action={
              <Link
                href="/atletas"
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3.5 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                Ver todos los atletas <MIcon name="arrow_forward" size={16} />
              </Link>
            }
          />
        </div>
      ) : (
        /* ── Board · 4 equal lanes ──────────────────────────────────────── */
        <div className="mt-4 grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {filteredLanes.map(({ lane, cards }) => (
            <HoyLane key={lane.id} lane={lane} cards={cards} />
          ))}
        </div>
      )}
    </div>
  );
}
