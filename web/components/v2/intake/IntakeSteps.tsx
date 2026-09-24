'use client';

// v2 · ALTA · PASOS — las decisiones de la columna izquierda del alta, sobre los
// primitivos. Cada paso es presentacional y lo controla IntakeReview, que arma el
// envío (POST /api/coach/intake/[id]). Nada de método cableado: los tests son la
// batería del coach; la carrera, la del atleta; el plan, el del coach
// (IntakePlanStep).

import { Check, Lock, Rocket, TriangleAlert } from 'lucide-react';
import {
  BOTTOM_BAR_ATTR,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  List,
  ListRow,
  StatusBadge,
  Tag,
  Textarea,
  buttonVariants,
} from '@/components/v2/ui';
import { Link } from '@/i18n/navigation';
import type { IntakeProfile, IntakeWarning } from '@/lib/coach/intake';
import type { IntakeBaselineTest } from '@fahybrid/shared/schema/coach-intake';
import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';

// Avisos que resuelve la carrera misma (se cambian en su perfil): no se confirman.
export const EVENT_WARNING_KINDS = new Set<IntakeWarning['kind']>(['a_event_invalid', 'a_event_close']);

const WELCOME_MAX = 2000;

// ── Carrera objetivo ──────────────────────────────────────────────────────────
export function RaceStep({ targetEvent }: { targetEvent: IntakeProfile['target_event'] }) {
  const valid = targetEvent != null && !targetEvent.is_in_past;
  return (
    <Card>
      <CardHeader
        title="Carrera objetivo"
        className="mb-1"
        action={valid ? <Tag>{targetEvent.days_to_event} d</Tag> : null}
      />
      {valid ? (
        <p className="t-body text-v2-fg">
          <span className="font-medium">{targetEvent.name}</span>
          <span className="text-v2-muted">
            {' · '}
            {shortDate(targetEvent.iso_date)} {targetEvent.iso_date.slice(0, 4)}
            {targetEvent.division ? ` · ${targetEvent.division}` : ''}
          </span>
        </p>
      ) : (
        <p className="t-body text-v2-muted">
          {targetEvent?.is_in_past ? `${targetEvent.name} ya pasó` : 'No entrena para ninguna fecha'} · la elige en su app
        </p>
      )}
    </Card>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
/** La batería del coach: entra sola con su primer plan (semana cero / semana 1). */
export function TestsStep({ tests }: { tests: IntakeBaselineTest[] }) {
  return (
    <Card padding={tests.length > 0 ? 'none' : 'md'}>
      <CardHeader
        title="Tests"
        subtitle={tests.length > 0 ? 'Tu batería: entra sola con su primer plan' : undefined}
        className={tests.length > 0 ? 'px-4 pt-4' : 'mb-1'}
      />
      {tests.length === 0 ? (
        <EmptyState
          title="No tienes batería de tests"
          action={
            <Link href="/programar/tests" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              Crearla
            </Link>
          }
        />
      ) : (
        <List aria-label="Tests" className="rounded-none border-x-0 border-b-0">
          {tests.map((t) => (
            <ListRow key={t.slug} density="compact" title={t.label} />
          ))}
        </List>
      )}
    </Card>
  );
}

// ── Avisos ────────────────────────────────────────────────────────────────────
export function WarningsStep({
  warnings,
  acknowledged,
  onAck,
}: {
  warnings: IntakeWarning[];
  acknowledged: ReadonlySet<string>;
  onAck: (kind: string) => void;
}) {
  const manual = warnings.filter((w) => !EVENT_WARNING_KINDS.has(w.kind));
  if (manual.length === 0) return null;
  const acked = manual.filter((w) => acknowledged.has(w.kind)).length;
  return (
    <Card padding="none">
      <CardHeader
        title="Avisos"
        subtitle="Léelos antes de asignar"
        className="px-4 pt-4"
        action={<span className="t-meta text-v2-muted t-tnum">{acked} de {manual.length} vistos</span>}
      />
      <List aria-label="Avisos" className="rounded-none border-x-0 border-b-0">
        {manual.map((w) => (
          <ListRow
            key={w.kind}
            leading={
              <TriangleAlert
                aria-label={w.severity === 'critical' ? 'Importante' : 'Aviso'}
                strokeWidth={1.75}
                className={w.severity === 'critical' ? 'size-4 text-v2-danger' : 'size-4 text-v2-warn'}
              />
            }
            title={w.label}
            detail={<span className="whitespace-normal">{w.detail}</span>}
            className="py-2.5"
            trailing={
              acknowledged.has(w.kind) ? (
                <StatusBadge size="sm" tone="ok" label="Visto" />
              ) : (
                <Button size="sm" variant="secondary" icon={Check} onClick={() => onAck(w.kind)} className="pointer-coarse:h-11">
                  Visto
                </Button>
              )
            }
          />
        ))}
      </List>
    </Card>
  );
}

// ── Bienvenida y notas ────────────────────────────────────────────────────────
export function WelcomeNotesStep({
  send,
  body,
  notes,
  onChangeSend,
  onChangeBody,
  onChangeNotes,
}: {
  send: boolean;
  body: string;
  notes: string;
  onChangeSend: (v: boolean) => void;
  onChangeBody: (v: string) => void;
  onChangeNotes: (v: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title="Bienvenida" className="mb-0" />
      <Checkbox
        checked={send}
        onCheckedChange={(v) => onChangeSend(v)}
        label="Enviarle este mensaje al asignar"
        className="pointer-coarse:min-h-11"
      />
      <Textarea
        aria-label="Mensaje de bienvenida"
        value={body}
        disabled={!send}
        maxLength={WELCOME_MAX}
        onChange={(e) => onChangeBody(e.target.value)}
        rows={4}
        placeholder="Mensaje de bienvenida…"
      />
      <Field label="Notas para ti" optional hint="No las ve el atleta">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={notes}
            maxLength={WELCOME_MAX}
            onChange={(e) => onChangeNotes(e.target.value)}
            rows={2}
          />
        )}
      </Field>
    </Card>
  );
}

// ── Pie · asignar ─────────────────────────────────────────────────────────────
export function AssignBar({
  pending,
  canAssign,
  submitting,
  error,
  line,
  onAssign,
}: {
  /** Lo que falta, en palabras («Elige su nivel», «2 avisos por leer»). */
  pending: string[];
  canAssign: boolean;
  submitting: boolean;
  error: string | null;
  /** Lo que recibe (la línea del plan). */
  line: string | null;
  onAssign: () => void;
}) {
  return (
    <div {...{ [BOTTOM_BAR_ATTR]: '' }} className="sticky bottom-[calc(var(--v2-tabbar-h,0px)+env(safe-area-inset-bottom)+8px)] z-10 flex flex-col gap-2 rounded-panel border border-v2-border bg-v2-elevated p-3 shadow-pop sm:flex-row sm:items-center sm:gap-4 lg:bottom-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {error ? (
          <p role="alert" className="t-body-sm font-medium text-v2-danger">
            {error}
          </p>
        ) : canAssign ? (
          <p className="t-body-sm text-v2-fg">{line}</p>
        ) : (
          <p className="t-body-sm text-v2-muted">{pending.join(' · ')}</p>
        )}
      </div>
      <Button
        variant="primary"
        size="lg"
        icon={canAssign ? Rocket : Lock}
        loading={submitting}
        disabled={!canAssign}
        onClick={onAssign}
        className="pointer-coarse:h-11"
      >
        Asignar plan
      </Button>
    </div>
  );
}
