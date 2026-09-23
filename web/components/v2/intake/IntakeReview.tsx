'use client';

// v2 · ALTA PENDIENTE — revisar el cuestionario de entrada de un atleta nuevo y
// darle su plan. Izquierda: las decisiones (su plan, su nivel, avisos, carrera,
// tests, bienvenida). Derecha: lo que contestó. El pie dice en una línea qué
// recibe y cuándo lo ve, y «Asignar plan» lo firma (POST /api/coach/intake/[id]).
// Después, un aviso con lo que recibió y «Deshacer» (DELETE, repone lo que había),
// y la siguiente alta de la fila.
//
// `embedded` = dentro de la ficha de un atleta «Nuevo» (plan §6): sin cabecera
// propia, y al asignar se recarga la ficha.

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { EmptyState, PageHeader, buttonVariants, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { ClasificacionCard } from '@/components/v2/atleta-detalle/ClasificacionCard';
import { AthleteAnswers } from '@/components/v2/intake/AthleteAnswers';
import { IntakeRaces } from '@/components/v2/intake/IntakeRaces';
import { IntakePlanStep, defaultPlanDraft, planSummary, type PlanDraft } from '@/components/v2/intake/IntakePlanStep';
import {
  AssignBar,
  EVENT_WARNING_KINDS,
  RaceStep,
  TestsStep,
  WarningsStep,
  WelcomeNotesStep,
} from '@/components/v2/intake/IntakeSteps';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import type { CommitResult } from '@/lib/coach/intake-commit';
import { intakePlanLine } from '@/lib/coach/intake-plan-line';
import type { IntakeCommitInput } from '@fahybrid/shared/schema/coach-intake';
import { tenureSuffix } from '@/lib/dashboard/relative-time';
import { useLevelAxisLabel } from '@/components/v2/controls/useLevelAxisLabel';

/** La siguiente alta de la fila, con el resto de la fila detrás. */
function nextHref(queue: string[]): string {
  const [next, ...rest] = queue;
  return `/atletas/${next}/intake${rest.length > 0 ? `?fila=${rest.join(',')}` : ''}`;
}

const SEX_LABEL: Record<string, string> = { male: 'hombre', female: 'mujer', other: 'otro' };

function planPayload(d: PlanDraft, firstMonday: string | null): IntakeCommitInput['plan'] {
  if (d.kind === 'group' && d.group_id && firstMonday) return { kind: 'group', group_id: Number(d.group_id), start_date: firstMonday };
  if (d.kind === 'program' && d.program_id && d.start_date) return { kind: 'program', program_id: Number(d.program_id), start_date: d.start_date };
  if (d.kind === 'personal') return { kind: 'personal' };
  return { kind: 'keep' };
}

export function IntakeReview({
  review,
  athleteId,
  embedded = false,
  queue = [],
}: {
  review: IntakeReviewPayload;
  athleteId: string;
  embedded?: boolean;
  /** «Revisar en fila» (Hoy): las altas que vienen detrás, en orden. */
  queue?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const axisLabel = useLevelAxisLabel();
  const { profile, classification, plan_options: options } = review;
  const { athlete, suggestions, warnings, target_event } = profile;
  const firstName = athlete.full_name.split(/\s+/)[0] || athlete.full_name;

  const [plan, setPlan] = useState<PlanDraft>(() => defaultPlanDraft(options));
  const [welcomeSend, setWelcomeSend] = useState(true);
  const [welcomeBody, setWelcomeBody] = useState(suggestions.welcome_draft);
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manualWarnings = useMemo(() => warnings.filter((w) => !EVENT_WARNING_KINDS.has(w.kind)), [warnings]);
  const summary = planSummary(options, plan);
  const nivelOk = classification.levels.length === 0 || classification.level_id != null;
  const unread = manualWarnings.filter((w) => !acknowledged.has(w.kind)).length;
  const pending = [
    summary ? null : 'Elige qué plan recibe',
    nivelOk ? null : `Elige su ${axisLabel.toLowerCase()}`,
    unread > 0 ? `${unread} ${unread === 1 ? 'aviso' : 'avisos'} por leer` : null,
  ].filter((x): x is string => x != null);
  const canAssign = pending.length === 0;
  const today = options?.today ?? '';

  async function undo() {
    try {
      await apiJson(`/api/coach/intake/${athleteId}`, { method: 'DELETE' });
      toast({ title: `Alta de ${athlete.full_name} deshecha`, description: 'Vuelve a estar pendiente' });
      router.push(`/atletas/${athleteId}/intake${queue.length > 0 ? `?fila=${queue.join(',')}` : ''}`);
      router.refresh();
    } catch (err) {
      toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
    }
  }

  async function assign() {
    if (!canAssign || submitting) return;
    setSubmitting(true);
    setError(null);
    const body: IntakeCommitInput = {
      target_event_id: target_event && !target_event.is_in_past ? Number(target_event.event_id) : null,
      plan: planPayload(plan, options?.mondays[0] ?? null),
      plan_mode: plan.kind === 'personal' ? 'personal' : 'shared',
      // Nivel numérico del cuestionario (1-4): la lectura del algoritmo. El nivel
      // del coach es el del catálogo, que fija ClasificacionCard.
      level: suggestions.level,
      baseline_tests: suggestions.baseline_tests,
      welcome: { send: welcomeSend, body: welcomeSend ? welcomeBody.trim() || null : null },
      acknowledged_warnings: Array.from(acknowledged),
      notes: notes.trim() ? notes.trim() : null,
    };
    try {
      const res = await apiJson<CommitResult>(`/api/coach/intake/${athleteId}`, { method: 'POST', body });
      toast({
        title: `${athlete.full_name}: plan asignado`,
        // «Seguir con lo que tiene» no materializa nada: la línea es la de su plan actual.
        description: intakePlanLine(res.plan.kind === 'keep' && summary ? summary : res.plan, today),
        undo,
      });
      if (embedded) router.refresh();
      else if (queue.length > 0) router.push(nextHref(queue));
      else router.push(`/atletas/${athleteId}`);
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido asignar. Inténtalo de nuevo.'));
      setSubmitting(false);
    }
  }

  if (athlete.intake_completed_at != null) {
    return (
      <EmptyState
        variant="page"
        icon={CircleCheck}
        title="Alta ya revisada"
        description={`${athlete.full_name} ya tiene su plan en marcha`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href={`/atletas/${athleteId}`} className={buttonVariants({ variant: 'primary' })}>
              Ver su plan
              <ArrowRight aria-hidden strokeWidth={1.75} />
            </Link>
            {queue.length > 0 ? (
              <Link href={nextHref(queue)} className={buttonVariants({ variant: 'secondary' })}>
                Siguiente alta · quedan {queue.length}
              </Link>
            ) : null}
          </div>
        }
      />
    );
  }

  const tenure = tenureSuffix(athlete.onboarded_at);
  const meta = [
    athlete.age != null ? `${athlete.age} años` : null,
    athlete.sex ? (SEX_LABEL[athlete.sex] ?? null) : null,
    tenure ? (tenure === 'instantes' ? 'recién llegado' : `esperando ${tenure}`) : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-5">
      {embedded ? null : (
        <PageHeader
          back={{ href: '/hoy?vista=altas', label: 'Altas pendientes' }}
          title={athlete.full_name}
          subtitle={['Alta pendiente', ...meta].join(' · ')}
          actions={
            queue.length > 0 ? (
              <Link href={nextHref(queue)} className={buttonVariants({ variant: 'ghost', className: 'pointer-coarse:h-11' })}>
                Siguiente alta · quedan {queue.length}
                <ArrowRight aria-hidden strokeWidth={1.75} />
              </Link>
            ) : null
          }
        />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <IntakePlanStep options={options} draft={plan} onChange={setPlan} />
          <ClasificacionCard athleteId={athleteId} data={classification} />
          <WarningsStep
            warnings={warnings}
            acknowledged={acknowledged}
            onAck={(kind) => setAcknowledged((prev) => new Set(prev).add(kind))}
          />
          <RaceStep targetEvent={target_event} />
          <TestsStep tests={suggestions.baseline_tests} />
          <WelcomeNotesStep
            send={welcomeSend}
            body={welcomeBody}
            notes={notes}
            onChangeSend={setWelcomeSend}
            onChangeBody={setWelcomeBody}
            onChangeNotes={setNotes}
          />
        </div>
        <aside aria-label={`Lo que contestó ${firstName}`} className="flex min-w-0 flex-col gap-4">
          <AthleteAnswers profile={profile} />
          <IntakeRaces past={review.races.past} upcoming={review.races.upcoming} />
        </aside>
      </div>

      <AssignBar
        pending={pending}
        canAssign={canAssign}
        submitting={submitting}
        error={error}
        line={summary ? intakePlanLine(summary, today) : null}
        onAssign={assign}
      />
    </div>
  );
}
