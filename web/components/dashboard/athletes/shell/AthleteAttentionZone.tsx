'use client';

// "Tus decisiones" — la COLA DE ACCIÓN del coach para este atleta (UX redesign
// hierarchy §3): cada item ROUTEA a un flujo. Hoy: intake pendiente (→ revisar
// intake) y propuesta de Pablo IA pendiente (→ abre la superficie de revisión).
// Modelo TASK-CARDS: un GRID responsive de tarjetas compactas autocontenidas
// (icono + título + detalle de 1 línea + SU acción que routea, DENTRO de la
// tarjeta) que usan el ancho — sin franjas a ancho completo con hueco muerto.
// Estilo "to-do" (franja de acento a la izquierda + superficie neutra), NO alarma
// roja: el rojo se reserva para lo genuinamente urgente. El contador cuenta SOLO
// lo accionable. "Evaluar la semana" NO es una decisión contada — vive como
// acción permanente (ghost) bajo las tarjetas.

import { Link } from '@/i18n/navigation';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type { MonthlyBlockProposal } from '@/lib/dashboard/coach/monthly-block-proposal';
import type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
import type { AtrTransitionReadiness } from '@/lib/dashboard/coach/atr-transition-detector';
import { MIcon } from '@/components/dashboard/MIcon';
import { Button, buttonVariants } from '@/components/ui/button';
import { EvaluateWeekButton } from '@/components/dashboard/athletes/EvaluateWeekButton';
import { cn } from '@/lib/utils';

interface AthleteAttentionZoneProps {
  athleteId: string;
  /** Nombre del atleta — para construir la propuesta recién creada al evaluar. */
  athleteName: string;
  intakePending: boolean;
  pendingProposal: PendingAdjustment | null;
  monthlyBlockProposal: MonthlyBlockProposal | null;
  programmingStatus: ProgrammingStatus;
  /** Readiness ATR del detector (surface-only): si `ready`, ofrece pasar de bloque. */
  transition: AtrTransitionReadiness;
  /** Abre la superficie canónica de revisión (Antes/Propuesto · Aprobar/Rechazar). */
  onReviewOpen: () => void;
  /** Abre "Programar bloque" (AssignFlow) para materializar el siguiente bloque. */
  onProgramNextBlock: () => void;
  /**
   * La propuesta recién creada por "Evaluar semana" — la shell la prefiere sobre
   * la prop del servidor para que la revisión no espere al router.refresh.
   */
  onProposalCreated: (proposal: PendingAdjustment) => void;
}

type Urgency = 'high' | 'normal';

interface AttentionItem {
  key: string;
  urgency: Urgency;
  icon: string;
  title: string;
  detail: string;
  action: React.ReactNode;
}

// Orden de pintado por urgencia (ranking §3): intake (high) antes que
// propuestas (normal). La evaluación de semana ya no es un item — es acción
// permanente fuera del grid.
const URGENCY_RANK: Record<Urgency, number> = { high: 0, normal: 1 };

// Una tarjeta compacta y autocontenida: franja de acento + icono + título +
// detalle (2 líneas máx) + su acción DENTRO. Nunca deja la acción varada lejos
// del texto (§7). La de mayor urgencia recibe el tratamiento más fuerte.
function AttentionCard({ item }: { item: AttentionItem }) {
  return (
    <li
      className={cn(
        'card-elevated relative flex min-w-0 flex-col gap-2 overflow-hidden p-4 pl-[calc(var(--s-l)+3px)]',
      )}
    >
      {/* Franja de acento a la izquierda — high = --accent, normal = --status-warning. */}
      <span
        aria-hidden
        className={cn(
          'absolute bottom-3 left-0 top-3 w-[3px] rounded-r-[2px]',
          item.urgency === 'high'
            ? 'bg-[color:var(--accent)]'
            : 'bg-[color:var(--status-warning)]',
        )}
      />
      <div className="flex min-w-0 items-start gap-2">
        <MIcon
          name={item.icon}
          size={18}
          className={cn(
            'mt-0.5 shrink-0',
            item.urgency === 'high'
              ? 'text-[color:var(--accent)]'
              : 'text-[color:var(--text-muted)]',
          )}
          aria-hidden
        />
        <p className="min-w-0 text-[13px] font-semibold text-[color:var(--fg)]">{item.title}</p>
      </div>
      <p className="line-clamp-2 text-xs text-[color:var(--text-muted)]">{item.detail}</p>
      <div className="mt-1">{item.action}</div>
    </li>
  );
}

export function AthleteAttentionZone({
  athleteId,
  athleteName,
  intakePending,
  pendingProposal,
  monthlyBlockProposal,
  programmingStatus,
  transition,
  onReviewOpen,
  onProgramNextBlock,
  onProposalCreated,
}: AthleteAttentionZoneProps) {
  const items: AttentionItem[] = [];

  // 1) Intake pendiente — bloquea asignar plan → la más urgente.
  if (intakePending) {
    items.push({
      key: 'intake',
      urgency: 'high',
      icon: 'how_to_reg',
      title: 'Intake pendiente',
      detail: 'Terminó el onboarding — revísalo para poder asignar el plan.',
      action: (
        <Link
          href={`/atletas/${athleteId}/intake`}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Revisar intake
        </Link>
      ),
    });
  }

  // 2) Propuesta de Pablo IA pendiente — ajuste semanal y/o bloque mensual.
  const reviewables: string[] = [];
  if (pendingProposal) reviewables.push('ajuste semanal');
  if (monthlyBlockProposal) {
    reviewables.push(`bloque mensual · ${monthlyBlockProposal.month_name}`);
  }
  if (!monthlyBlockProposal && programmingStatus === 'month_2_pending') {
    reviewables.push('cierre de bloque — propuesta del siguiente');
  }
  if (reviewables.length > 0) {
    items.push({
      key: 'proposal',
      urgency: 'normal',
      icon: 'pending_actions',
      title: 'Propuesta de Pablo IA pendiente',
      detail: reviewables.join(' · '),
      action: (
        <Button type="button" variant="secondary" size="sm" onClick={onReviewOpen}>
          Revisar propuesta
        </Button>
      ),
    });
  }

  // 3) Transición ATR — el detector marca que el atleta está listo para avanzar
  // al siguiente bloque. Decisión normal (paso adelante, NO alarma): su acción
  // abre "Programar bloque" para materializar el siguiente bloque. El detector
  // es conservador y no auto-promociona — Pablo confirma aquí.
  if (transition.ready) {
    // `transition.to` / `.from` ya vienen RESUELTOS (label de fase del coach, o
    // legacy ATR vía el resolver) — no re-mapear con atrPhaseLabel.
    const nextPhase = transition.to;
    items.push({
      key: 'atr-transition',
      urgency: 'normal',
      icon: 'trending_up',
      title: `Listo para pasar a ${nextPhase}`,
      detail: transition.rationale[0] ?? `Cierra ${transition.from} y abre ${nextPhase}.`,
      action: (
        <Button type="button" variant="secondary" size="sm" onClick={onProgramNextBlock}>
          Programar bloque
        </Button>
      ),
    });
  }

  // Solo lo accionable cuenta para el badge — "Evaluar la semana" es una rutina
  // siempre disponible y NO debe inflar el contador (cry-wolf §8). Se ordena
  // por urgencia (ranking §3).
  const actionable = [...items].sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency],
  );

  return (
    <section
      aria-label="Tus decisiones"
      className="overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
    >
      <header className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] px-4 py-2.5">
        <MIcon
          name="checklist"
          size={16}
          className="text-[color:var(--text-muted)]"
          aria-hidden
        />
        <h2 className="font-heading-sm text-[color:var(--fg)]">Tus decisiones</h2>
        {actionable.length > 0 ? (
          <span
            className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)] px-1.5 text-[11px] font-bold text-[color:var(--text-muted)]"
            aria-label={`${actionable.length} decisiones pendientes`}
          >
            {actionable.length}
          </span>
        ) : null}
      </header>

      {actionable.length > 0 ? (
        // Grid auto-fill: 2–4 tarjetas a lo ancho que USAN el espacio; en
        // anchos estrechos apilan. Min ~280px por tarjeta (§ sin hueco muerto).
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[var(--gutter)] p-4">
          {actionable.map((item) => (
            <AttentionCard key={item.key} item={item} />
          ))}
        </ul>
      ) : (
        // Estado en calma: nada que decidir ahora (no badge engañoso §8).
        <p className="px-4 py-3 text-xs text-[color:var(--text-muted)]">
          Nada que decidir ahora — todo al día.
        </p>
      )}

      {/* Acción permanente con menor énfasis bajo una línea de separación: la
          evaluación de semana es rutina, no una alerta (§8). La acción va JUNTO
          a su texto (left-aligned), nunca estirada con el botón varado al borde
          derecho (§7 — sin hueco horizontal muerto). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[color:var(--border-subtle)] px-4 py-2.5">
        <MIcon
          name="fact_check"
          size={16}
          className="shrink-0 text-[color:var(--text-muted)]"
          aria-hidden
        />
        <span className="text-xs text-[color:var(--text-muted)]">
          ¿La semana anterior fue como debía, o necesita ajuste?
        </span>
        <EvaluateWeekButton
          athleteId={athleteId}
          athleteName={athleteName}
          onNeedsAdjustment={onReviewOpen}
          onProposalCreated={onProposalCreated}
        />
      </div>
    </section>
  );
}
