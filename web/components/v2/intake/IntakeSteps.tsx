'use client';

// v2 · INTAKE · STEPS — the left-column decision controls of the intake review.
// Each step is presentational + controlled by the IntakeReview orchestrator, which
// assembles them into the commit payload (POST /api/coach/intake/[id]). AGNOSTIC:
// block names come from the coach's suggestions (never a hardcoded phase catalogue);
// nothing here invents method.

import { useId } from 'react';

import { MIcon } from '@/components/ui/MIcon';
import { Textarea } from '@/components/ui/textarea';
import { Pill } from '@/components/v2/Pill';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import type { BlockEmphasis } from '@/lib/coach/intake-suggestions';
import type { IntakeProfile, IntakeWarning } from '@/lib/coach/intake';
import type { IntakeBaselineTest, IntakeBlockSpec } from '@fahybrid/shared/schema/coach-intake';
import { cn } from '@/lib/utils';

// Warnings whose resolution is the event anchor itself — never manually confirmed.
const EVENT_WARNING_KINDS = new Set<IntakeWarning['kind']>(['a_event_invalid', 'a_event_close']);

const EMPHASIS_LABEL: Record<BlockEmphasis['bias'], string> = {
  running: 'Carrera',
  strength: 'Fuerza',
  hyrox_specific: 'HYROX específico',
  balanced: 'Equilibrado',
};

const WEEKS_MIN = 1;
const WEEKS_MAX = 20;
const WELCOME_MAX = 2000;

function fmtEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(d)
    .replace(/\.$/, '');
}

/** Numbered step gutter — keeps the decision flow scannable (mock steps 1-6). */
export function StepShell({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-label font-bold text-[color:var(--v2-muted)]"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

// ── Step 1 · Evento objetivo (A) ────────────────────────────────────────────────
export function EventAnchorStep({
  targetEvent,
}: {
  targetEvent: IntakeProfile['target_event'];
}) {
  const anchored = targetEvent != null && !targetEvent.is_in_past;
  return (
    <Panel
      title="Evento objetivo (A)"
      action={
        anchored ? (
          <Pill tone="ok" variant="soft">
            <MIcon name="check" size={13} className="mr-0.5" />
            Anclado
          </Pill>
        ) : (
          <Pill tone="danger" variant="soft">
            <MIcon name="block" size={13} className="mr-0.5" />
            Gate
          </Pill>
        )
      }
      bodyClassName="flex flex-col gap-2"
    >
      {anchored ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
              {targetEvent.name}
            </span>
            <span className="v2-num text-xs text-[color:var(--v2-muted)]">
              {fmtEventDate(targetEvent.iso_date)}
            </span>
            {targetEvent.division ? (
              <span className="text-xs text-[color:var(--v2-faint)]">· {targetEvent.division}</span>
            ) : null}
          </div>
          <p className="text-xs text-[color:var(--v2-muted)]">
            El plan se construye hacia atrás desde esta fecha.
          </p>
        </>
      ) : (
        <div className="flex items-start gap-2 text-xs text-[color:var(--v2-muted)]">
          <MIcon name="error" size={15} className="mt-0.5 text-[color:var(--v2-danger)]" />
          <span>
            {targetEvent?.is_in_past
              ? 'El evento objetivo está en el pasado. Reasigna una fecha válida en el perfil del atleta para poder asignar.'
              : 'Aún no anclado. Configura el evento objetivo (A) en el perfil del atleta para poder asignar el plan.'}
          </span>
        </div>
      )}
    </Panel>
  );
}

// ── Step 3 · Estructura del bloque (AGNOSTIC microciclos) ────────────────────────
export function BlockStructureStep({
  specs,
  emphasis,
  endDateIso,
  onChangeWeeks,
}: {
  specs: IntakeBlockSpec[];
  emphasis: BlockEmphasis;
  endDateIso: string | null;
  onChangeWeeks: (index: number, weeks: number) => void;
}) {
  const totalWeeks = specs.reduce((s, b) => s + b.weeks, 0);
  return (
    <Panel
      title="Estructura del bloque"
      action={
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{totalWeeks}</span>&nbsp;sem
        </Pill>
      }
      bodyClassName="flex flex-col gap-2.5"
    >
      <p className="text-xs text-[color:var(--v2-muted)]">
        Secuencia de microciclos hasta el evento{endDateIso ? ` · termina ${fmtEventDate(endDateIso)}` : ''}.
      </p>
      <ul className="flex flex-col gap-1.5">
        {specs.map((spec, i) => (
          <li
            key={`${spec.type}-${i}`}
            className="flex items-center justify-between gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2"
          >
            <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
              {spec.type}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <StepperButton
                icon="remove"
                label={`Reducir semanas de ${spec.type}`}
                disabled={spec.weeks <= WEEKS_MIN}
                onClick={() => onChangeWeeks(i, spec.weeks - 1)}
              />
              <span className="v2-num w-10 text-center text-sm font-semibold text-[color:var(--v2-fg)]">
                {spec.weeks} <span className="text-[color:var(--v2-faint)]">sem</span>
              </span>
              <StepperButton
                icon="add"
                label={`Añadir semanas a ${spec.type}`}
                disabled={spec.weeks >= WEEKS_MAX}
                onClick={() => onChangeWeeks(i, spec.weeks + 1)}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-1.5 text-label text-[color:var(--v2-faint)]">
        <MIcon name="lightbulb" size={13} className="mt-px" />
        <span>
          Énfasis sugerido · {EMPHASIS_LABEL[emphasis.bias]} — {emphasis.note}
        </span>
      </p>
    </Panel>
  );
}

function StepperButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}

// ── Step 4 · Tests de la semana 1 ────────────────────────────────────────────────
export function BaselineTestsStep({
  tests,
  included,
  onToggle,
}: {
  tests: IntakeBaselineTest[];
  included: ReadonlySet<string>;
  onToggle: (slug: string) => void;
}) {
  const passive = tests.filter((t) => t.kind === 'auto');
  const programmed = tests.filter((t) => t.kind === 'programmed');

  return (
    <Panel
      title="Tests de la semana 1"
      action={
        <Pill tone="neutral" variant="soft">
          Decisión
        </Pill>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {tests.length === 0 ? (
        <p className="text-xs text-[color:var(--v2-faint)]">Sin tests sugeridos.</p>
      ) : (
        <>
          {passive.length > 0 ? (
            <TestGroup title="Pasivos · automáticos">
              {passive.map((t) => (
                <TestRow
                  key={t.slug}
                  test={t}
                  checked={included.has(t.slug)}
                  onToggle={() => onToggle(t.slug)}
                />
              ))}
            </TestGroup>
          ) : null}
          {programmed.length > 0 ? (
            <TestGroup title="Programados · los agendas tú">
              {programmed.map((t) => (
                <TestRow
                  key={t.slug}
                  test={t}
                  checked={included.has(t.slug)}
                  onToggle={() => onToggle(t.slug)}
                />
              ))}
            </TestGroup>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function TestGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="v2-micro">{title}</span>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function TestRow({
  test,
  checked,
  onToggle,
}: {
  test: IntakeBaselineTest;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
        className={cn(
          'v2-focus flex w-full items-center gap-2.5 rounded-[var(--v2-r-s)] border px-3 py-2 text-left transition-colors',
          checked
            ? 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]'
            : 'border-dashed border-[color:var(--v2-border)] opacity-60 hover:opacity-100',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border',
            checked
              ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
              : 'border-[color:var(--v2-border-strong)]',
          )}
        >
          {checked ? <MIcon name="check" size={12} /> : null}
        </span>
        <span className="truncate text-sm text-[color:var(--v2-fg)]">{test.label}</span>
      </button>
    </li>
  );
}

// ── Step 5 · Avisos por confirmar ────────────────────────────────────────────────
export function WarningsStep({
  warnings,
  acknowledged,
  onAck,
  eventResolved,
}: {
  warnings: IntakeWarning[];
  acknowledged: ReadonlySet<string>;
  onAck: (kind: string) => void;
  eventResolved: boolean;
}) {
  const manual = warnings.filter((w) => !EVENT_WARNING_KINDS.has(w.kind));
  const event = warnings.filter((w) => EVENT_WARNING_KINDS.has(w.kind));
  const ackedCount = manual.filter((w) => acknowledged.has(w.kind)).length;

  return (
    <Panel
      title="Avisos por confirmar"
      action={
        manual.length === 0 ? (
          <Pill tone="ok" variant="soft">
            <MIcon name="check" size={13} className="mr-0.5" />
            Sin avisos
          </Pill>
        ) : (
          <Pill tone={ackedCount === manual.length ? 'ok' : 'warn'} variant="soft">
            <MIcon name="shield" size={13} className="mr-0.5" />
            {ackedCount}/{manual.length} confirmados
          </Pill>
        )
      }
      bodyClassName="flex flex-col gap-2"
    >
      {warnings.length === 0 ? (
        <p className="text-xs text-[color:var(--v2-faint)]">Sin avisos. Todo en orden.</p>
      ) : (
        <>
          {event.map((w) => (
            <WarningRow key={w.kind} warning={w}>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-label font-semibold',
                  eventResolved ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-muted)]',
                )}
              >
                <MIcon name={eventResolved ? 'check' : 'arrow_upward'} size={13} />
                {eventResolved ? 'Resuelto' : 'Se resuelve al anclar el evento'}
              </span>
            </WarningRow>
          ))}
          {manual.map((w) => {
            const acked = acknowledged.has(w.kind);
            return (
              <WarningRow key={w.kind} warning={w}>
                {acked ? (
                  <span className="inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-ok)]">
                    <MIcon name="check_circle" size={14} />
                    Confirmado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAck(w.kind)}
                    className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 py-1 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                  >
                    <MIcon name="check" size={13} />
                    Confirmar
                  </button>
                )}
              </WarningRow>
            );
          })}
        </>
      )}
    </Panel>
  );
}

function WarningRow({
  warning,
  children,
}: {
  warning: IntakeWarning;
  children: React.ReactNode;
}) {
  const critical = warning.severity === 'critical';
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <MIcon
        name={critical ? 'priority_high' : 'info'}
        size={16}
        className={cn('mt-0.5 shrink-0', critical ? 'text-[color:var(--v2-danger)]' : 'text-[color:var(--v2-info)]')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{warning.label}</span>
          <Pill tone={critical ? 'danger' : 'warn'} variant="soft">
            {critical ? 'Crítico' : 'Aviso'}
          </Pill>
        </div>
        <span className="text-label text-[color:var(--v2-muted)]">{warning.detail}</span>
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  );
}

// ── Step 6 · Bienvenida y notas ──────────────────────────────────────────────────
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
  // La etiqueta de las notas ya estaba escrita en pantalla pero suelta: nadie
  // la ataba al campo, así que el lector de pantalla anunciaba «cuadro de
  // texto» a secas (WCAG 4.1.2). Se ata a la que ya se ve, no se inventa otra.
  const idNotas = useId();

  return (
    <Panel
      title="Bienvenida y notas"
      action={
        <Pill tone="neutral" variant="soft">
          Opcional
        </Pill>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <button
        type="button"
        aria-pressed={send}
        onClick={() => onChangeSend(!send)}
        className="v2-focus flex items-center gap-2 text-left"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border',
            send
              ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
              : 'border-[color:var(--v2-border-strong)]',
          )}
        >
          {send ? <MIcon name="check" size={12} /> : null}
        </span>
        <span className="text-sm font-medium text-[color:var(--v2-fg)]">
          Enviar mensaje al atleta al asignar
        </span>
      </button>

      <Textarea
        aria-label="Mensaje de bienvenida"
        value={body}
        disabled={!send}
        maxLength={WELCOME_MAX}
        onChange={(e) => onChangeBody(e.target.value)}
        rows={4}
        placeholder="Mensaje de bienvenida…"
        contador
      />

      <div className="flex flex-col gap-1.5">
        <span id={idNotas} className="v2-micro">
          Notas internas · privadas
        </span>
        <Textarea
          aria-labelledby={idNotas}
          value={notes}
          maxLength={WELCOME_MAX}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={2}
          placeholder="Notas para ti, no visibles para el atleta…"
        />
      </div>
    </Panel>
  );
}

// ── Footer · "Listo para asignar" gate ──────────────────────────────────────────
export interface GateCheck {
  key: string;
  label: string;
  state: 'ok' | 'pending' | 'blocked';
}

export function AssignBar({
  checks,
  canAssign,
  submitting,
  error,
  onAssign,
}: {
  checks: GateCheck[];
  canAssign: boolean;
  submitting: boolean;
  error: string | null;
  onAssign: () => void;
}) {
  const blockers = checks.filter((c) => c.state !== 'ok').length;
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-2.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="v2-micro">Listo para asignar</span>
        {checks.map((c) => (
          <span
            key={c.key}
            className={cn(
              'inline-flex items-center gap-1 text-label font-semibold',
              c.state === 'ok'
                ? 'text-[color:var(--v2-ok)]'
                : c.state === 'blocked'
                  ? 'text-[color:var(--v2-danger)]'
                  : 'text-[color:var(--v2-muted)]',
            )}
          >
            <MIcon
              name={c.state === 'ok' ? 'check' : c.state === 'blocked' ? 'close' : 'pending'}
              size={13}
            />
            {c.label}
          </span>
        ))}
      </div>

      {error ? (
        <p className="text-label font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-[color:var(--v2-faint)]">
          {canAssign
            ? 'Se creará el primer microciclo en borrador para que lo revises antes de publicar.'
            : `${blockers} ${blockers === 1 ? 'punto' : 'puntos'} por resolver.`}
        </span>
        <button
          type="button"
          disabled={!canAssign || submitting}
          onClick={onAssign}
          className={cn(
            'v2-focus inline-flex h-10 items-center gap-2 rounded-[var(--v2-r-s)] px-4 text-sm font-semibold transition-colors',
            canAssign && !submitting
              ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
              : 'cursor-not-allowed bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]',
          )}
        >
          <MIcon
            name={submitting ? 'progress_activity' : canAssign ? 'rocket_launch' : 'lock'}
            size={17}
            className={submitting ? 'animate-spin' : undefined}
          />
          {submitting ? 'Asignando…' : 'Asignar plan'}
        </button>
      </div>
    </div>
  );
}
