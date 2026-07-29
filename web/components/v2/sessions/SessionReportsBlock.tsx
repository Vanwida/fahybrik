'use client';

// Sesiones 1:1 (#14) — the coach's videollamada write-ups, shown as a history + an
// inline form to add/edit a report. Reused on the lead card (isLead → outcome + price)
// and the athlete tab (1:1 seguimiento, no sales fields). Nothing discussed is lost:
// every report persists and stays consultable, and feeds the post-call email (#11).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/v2/Card';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { AuthorStamp } from '@/components/v2/AuthorStamp';
import {
  SESSION_OUTCOMES,
  SESSION_OUTCOME_LABEL,
  SESSION_OUTCOME_TONE,
  type SessionOutcome,
} from '@fahybrid/shared/domain/sessions/outcome';
import type { SessionReportView } from '@/lib/coach/session-reports';

type Subject = { lead_id: string } | { athlete_id: string };

const FIELD =
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** ISO → value for <input type="datetime-local"> (local wall clock, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface FormState {
  occurred_at: string; // datetime-local
  duration_minutes: string;
  outcome: string;
  quoted_price_eur: string;
  notes: string;
  next_steps: string;
}

function emptyForm(): FormState {
  return {
    occurred_at: toLocalInput(new Date().toISOString()),
    duration_minutes: '30',
    outcome: '',
    quoted_price_eur: '',
    notes: '',
    next_steps: '',
  };
}

function formFromReport(r: SessionReportView): FormState {
  return {
    occurred_at: toLocalInput(r.occurred_at),
    duration_minutes: String(r.duration_minutes),
    outcome: r.outcome ?? '',
    quoted_price_eur: r.quoted_price_eur != null ? String(r.quoted_price_eur) : '',
    notes: r.notes ?? '',
    next_steps: r.next_steps ?? '',
  };
}

export function SessionReportsBlock({
  subject,
  sessions,
  appointmentId,
  isLead,
  autoOpenTick,
}: {
  subject: Subject;
  sessions: SessionReportView[];
  appointmentId?: string | null;
  isLead: boolean;
  /** Bumped by the parent (e.g. marking a cita "Completada") to auto-open the new-parte
   *  form in the same gesture. The coach can still cancel = "completar sin parte". */
  autoOpenTick?: number;
}) {
  const router = useRouter();
  // null = closed · 'new' = add form · <id> = editing that report.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #11 post-call summary: the report whose summary email is being composed.
  const [summaryReport, setSummaryReport] = useState<SessionReportView | null>(null);

  const openNew = () => {
    setForm(emptyForm());
    setError(null);
    setEditing('new');
  };
  const openEdit = (r: SessionReportView) => {
    setForm(formFromReport(r));
    setError(null);
    setEditing(r.id);
  };
  const close = () => {
    setEditing(null);
    setError(null);
  };

  // Coupling (#14): when the parent bumps autoOpenTick (a cita marked "Completada"),
  // open the new-parte form in the same gesture — pre-linked to that cita. The coach can
  // still cancel = "completar sin parte". Ignores the initial mount (tick 0/undefined).
  useEffect(() => {
    if (autoOpenTick && autoOpenTick > 0) openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenTick]);

  const body = () => {
    const b: Record<string, unknown> = {
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
      notes: form.notes.trim() || undefined,
      next_steps: form.next_steps.trim() || undefined,
      outcome: isLead && form.outcome ? form.outcome : null,
      quoted_price_eur: isLead && form.quoted_price_eur.trim() ? Number(form.quoted_price_eur) : null,
    };
    return b;
  };

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const isNew = editing === 'new';
      const url = isNew ? '/api/coach/session-reports' : `/api/coach/session-reports/${editing}`;
      const payload = isNew ? { ...subject, appointment_id: appointmentId ?? null, ...body() } : body();
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudo guardar el parte.');
        return;
      }
      close();
      router.refresh();
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm('¿Borrar este parte? No se puede deshacer.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/coach/session-reports/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="v2-display text-lg text-[color:var(--v2-fg)]">Sesiones 1:1</h2>
        {editing == null ? (
          <button
            type="button"
            onClick={openNew}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} />
            Registrar sesión
          </button>
        ) : null}
      </div>

      {/* Form (add / edit) */}
      {editing != null ? (
        <div className="flex flex-col gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Fecha y hora</span>
              <input
                type="datetime-local"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Duración (min)</span>
              <input
                type="number"
                min={5}
                max={300}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className={FIELD}
              />
            </label>
          </div>

          {isLead ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Resultado</span>
                <select
                  value={form.outcome}
                  onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                  className={FIELD}
                >
                  <option value="">—</option>
                  {SESSION_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {SESSION_OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Precio acordado (€/mes)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.quoted_price_eur}
                  onChange={(e) => setForm({ ...form, quoted_price_eur: e.target.value })}
                  className={FIELD}
                  placeholder="—"
                />
              </label>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="v2-micro">Lo que hablasteis</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={FIELD + ' resize-y leading-relaxed'}
              placeholder="Notas de la llamada — la fuente del email de resumen."
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="v2-micro">Próximos pasos</span>
            <textarea
              rows={2}
              value={form.next_steps}
              onChange={(e) => setForm({ ...form, next_steps: e.target.value })}
              className={FIELD + ' resize-y leading-relaxed'}
              placeholder="Qué toca después."
            />
          </label>

          {error ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar parte'}
            </button>
          </div>
        </div>
      ) : null}

      {/* History */}
      {sessions.length === 0 && editing == null ? (
        <EmptyState
          icon="videocam"
          title="Sin sesiones registradas"
          description="Al terminar una videollamada, registra aquí lo que hablasteis."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="v2-num text-sm font-semibold text-[color:var(--v2-fg)]">{fmtDate(s.occurred_at)}</span>
                <span className="text-xs text-[color:var(--v2-muted)]">{s.duration_minutes} min</span>
                {s.outcome ? (
                  <Pill tone={SESSION_OUTCOME_TONE[s.outcome as SessionOutcome]} variant="soft">
                    {SESSION_OUTCOME_LABEL[s.outcome as SessionOutcome]}
                  </Pill>
                ) : null}
                {s.quoted_price_eur != null ? (
                  <span className="v2-num text-xs font-semibold text-[color:var(--v2-fg)]">
                    {s.quoted_price_eur}€/mes
                  </span>
                ) : null}
                {isLead && s.from_lead === false ? null : null}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Editar"
                    onClick={() => openEdit(s)}
                    className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-fg)]"
                  >
                    <MIcon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Borrar"
                    onClick={() => remove(s.id)}
                    className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-danger)]"
                  >
                    <MIcon name="delete" size={16} />
                  </button>
                </div>
              </div>
              {s.notes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--v2-fg)]">{s.notes}</p>
              ) : null}
              {s.next_steps ? (
                <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
                  <span className="v2-micro">Próximos pasos · </span>
                  <span className="whitespace-pre-wrap">{s.next_steps}</span>
                </p>
              ) : null}
              {/* #11 — post-call summary email (leads only). */}
              {s.from_lead && (s.notes || s.next_steps) ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setSummaryReport(s)}
                    className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
                  >
                    <MIcon name="mail" size={15} />
                    {s.summary_email_sent_at ? 'Reenviar resumen' : 'Enviar resumen al lead'}
                  </button>
                  {s.summary_email_sent_at ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[color:var(--v2-muted)]">
                      <MIcon name="check" size={14} className="text-[color:var(--v2-ok)]" />
                      Resumen enviado · {fmtDate(s.summary_email_sent_at)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* Authorship sello (#43): "parte por X" + "editó Y" on a real edit.
                  Each self-hides when unattributed (historical rows). */}
              {s.created_by_name || s.last_edited_by_name ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                  <AuthorStamp
                    kind="coach"
                    name={s.created_by_name}
                    verb="escribió el parte"
                    at={s.created_at}
                  />
                  <AuthorStamp
                    kind="coach"
                    name={s.last_edited_by_name}
                    verb="editó"
                    at={s.updated_at}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {summaryReport ? (
        <SummaryModal
          report={summaryReport}
          onClose={() => setSummaryReport(null)}
          onSent={() => {
            setSummaryReport(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

// #11 — compose + preview the post-call summary email. Pre-filled from the parte
// (notes + next steps); edits here affect ONLY this send, never the saved parte.
function SummaryModal({
  report,
  onClose,
  onSent,
}: {
  report: SessionReportView;
  onClose: () => void;
  onSent: () => void;
}) {
  const [summary, setSummary] = useState(report.notes ?? '');
  const [nextSteps, setNextSteps] = useState(report.next_steps ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadySent = report.summary_email_sent_at != null;

  async function send() {
    if (busy) return;
    if (alreadySent && !confirm('Ya se envió un resumen. ¿Reenviar?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/session-reports/${report.id}/send-summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: summary.trim(), next_steps: nextSteps.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudo enviar el resumen.');
        return;
      }
      onSent();
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-[color:var(--v2-scrim)]" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Resumen al lead</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-fg)]">
            <MIcon name="close" size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs text-[color:var(--v2-muted)]">
          Repasa el texto antes de enviarlo. Editar aquí no cambia el parte guardado.
        </p>
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="v2-micro">Lo que hablasteis</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} className={FIELD + ' resize-y leading-relaxed'} />
        </label>
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="v2-micro">Próximos pasos</span>
          <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} className={FIELD + ' resize-y leading-relaxed'} />
        </label>
        {error ? <p className="mb-2 text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]">
            Cancelar
          </button>
          <button type="button" onClick={send} disabled={busy || !summary.trim()} className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50">
            <MIcon name="send" size={16} />
            {busy ? 'Enviando…' : alreadySent ? 'Reenviar' : 'Enviar resumen'}
          </button>
        </div>
      </div>
    </div>
  );
}
