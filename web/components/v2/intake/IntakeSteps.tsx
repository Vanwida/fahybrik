'use client';

// v2 · INTAKE · STEPS — the left-column decision controls of the intake review.
// Each step is presentational + controlled by the IntakeReview orchestrator, which
// assembles them into the commit payload (POST /api/coach/intake/[id]). AGNOSTIC:
// block names come from the coach's suggestions (never a hardcoded phase catalogue);
// nothing here invents method.

import { useId } from 'react';

import { ArrowUp, Check, CircleAlert, Lock, Rocket } from 'lucide-react';
import { Button, Checkbox, StatusBadge, Tag } from '@/components/v2/ui';
import { Textarea } from '@/components/ui/textarea';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import type { IntakeProfile, IntakeWarning } from '@/lib/coach/intake';
import type { IntakeBaselineTest } from '@fahybrid/shared/schema/coach-intake';
import { cn } from '@/lib/utils';

// Warnings whose resolution is the event anchor itself — never manually confirmed.
const EVENT_WARNING_KINDS = new Set<IntakeWarning['kind']>(['a_event_invalid', 'a_event_close']);

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
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] t-meta font-semibold text-[color:var(--v2-muted)]"
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
          <StatusBadge variant="soft" size="sm" tone="ok" label="Anclado" />
        ) : (
          <StatusBadge variant="soft" size="sm" tone="danger" label="Falta la fecha" />
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
            <span className="t-tnum text-xs text-[color:var(--v2-muted)]">
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
          <CircleAlert aria-hidden strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-v2-danger" />
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

// Step 3 (Estructura del bloque + elección «periodización / plan solo para él»)
// vive en `IntakeBlockStructure.tsx` — tiene estado propio y este archivo ya
// andaba cerca del tope de 500 líneas.

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
        <Tag>Decisión</Tag>
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
      <span className="t-label text-v2-faint">{title}</span>
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
    <li className={cn('rounded-ctl px-2 py-1.5', checked ? 'bg-v2-surface-2' : null)}>
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle()}
        label={<span className={cn('t-body', checked ? 'text-v2-fg' : 'text-v2-muted')}>{test.label}</span>}
      />
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
          <StatusBadge variant="soft" size="sm" tone="ok" label="Sin avisos" />
        ) : (
          <StatusBadge
            variant="soft"
            size="sm"
            tone={ackedCount === manual.length ? 'ok' : 'warn'}
            label={`${ackedCount}/${manual.length} confirmados`}
          />
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
              <StatusBadge
                size="sm"
                tone={eventResolved ? 'ok' : 'neutral'}
                icon={eventResolved ? undefined : ArrowUp}
                label={eventResolved ? 'Resuelto' : 'Se resuelve al anclar el evento'}
              />
            </WarningRow>
          ))}
          {manual.map((w) => {
            const acked = acknowledged.has(w.kind);
            return (
              <WarningRow key={w.kind} warning={w}>
                {acked ? (
                  <StatusBadge size="sm" tone="ok" label="Confirmado" />
                ) : (
                  <Button size="sm" icon={Check} onClick={() => onAck(w.kind)}>
                    Confirmar
                  </Button>
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
    <div className="flex items-start gap-2.5 rounded-ctl bg-v2-surface-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge size="sm" tone={critical ? 'danger' : 'warn'} label={critical ? 'Crítico' : 'Aviso'} />
          <span className="t-body-sm font-medium text-v2-fg">{warning.label}</span>
        </div>
        <span className="t-meta text-[color:var(--v2-muted)]">{warning.detail}</span>
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
        <Tag>Opcional</Tag>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <Checkbox
        checked={send}
        onCheckedChange={(v) => onChangeSend(v)}
        label={<span className="t-body font-medium">Enviar mensaje al atleta al asignar</span>}
      />

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
        <span id={idNotas} className="t-label text-v2-faint">
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
  readyHint,
  onAssign,
}: {
  checks: GateCheck[];
  canAssign: boolean;
  submitting: boolean;
  error: string | null;
  /** Qué va a crear exactamente el botón — cambia según el modo del paso 3. */
  readyHint: string;
  onAssign: () => void;
}) {
  const blockers = checks.filter((c) => c.state !== 'ok').length;
  return (
    <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2.5 rounded-panel border border-v2-border bg-v2-elevated p-3 shadow-pop lg:bottom-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="t-label text-v2-faint">Listo para asignar</span>
        {checks.map((c) => (
          <StatusBadge
            key={c.key}
            size="sm"
            tone={c.state === 'ok' ? 'ok' : c.state === 'blocked' ? 'danger' : 'neutral'}
            label={c.label}
          />
        ))}
      </div>

      {error ? (
        <p className="t-meta font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="t-meta text-[color:var(--v2-faint)]">
          {canAssign
            ? readyHint
            : `${blockers} ${blockers === 1 ? 'punto' : 'puntos'} por resolver.`}
        </span>
        <Button
          variant="primary"
          size="lg"
          icon={canAssign ? Rocket : Lock}
          loading={submitting}
          disabled={!canAssign}
          onClick={onAssign}
        >
          Asignar plan
        </Button>
      </div>
    </div>
  );
}
