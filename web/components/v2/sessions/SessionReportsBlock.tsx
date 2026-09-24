'use client';

// Sesiones 1:1 (#14) — the coach's videollamada write-ups, shown as a history + an
// inline form to add/edit a report. Reused on the lead card (isLead → outcome + price)
// and the athlete tab (1:1 seguimiento, no sales fields). Nothing discussed is lost:
// every report persists and stays consultable, and feeds the post-call email (#11).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, Pencil, Plus, Send, Trash2, Video } from 'lucide-react';
import { Button, Card, Dialog, EmptyState, IconButton, Input, Select, StatusBadge, Textarea } from '@/components/v2/ui';
import { AuthorStamp } from '@/components/v2/AuthorStamp';
import {
  SESSION_OUTCOMES,
  SESSION_OUTCOME_LABEL,
  SESSION_OUTCOME_TONE,
  type SessionOutcome,
} from '@fahybrid/shared/domain/sessions/outcome';
import type { SessionReportView } from '@/lib/coach/session-reports';

type Subject = { lead_id: string } | { athlete_id: string };

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
  // Adjusted DURING RENDER, not in an effect: no fetch is involved, so there's
  // nothing an effect buys here — compare against the last tick seen and reset
  // the form in the same pass (the documented "adjusting state on prop change"
  // pattern, not a setState-in-effect).
  const [seenAutoOpenTick, setSeenAutoOpenTick] = useState(autoOpenTick);
  if (autoOpenTick !== seenAutoOpenTick) {
    setSeenAutoOpenTick(autoOpenTick);
    if (autoOpenTick && autoOpenTick > 0) openNew();
  }

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

  const label = (text: string) => <span className="t-meta text-v2-muted">{text}</span>;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-title-sm text-v2-fg">Sesiones 1:1</h2>
        {editing == null ? (
          <Button size="sm" icon={Plus} onClick={openNew}>
            Registrar sesión
          </Button>
        ) : null}
      </div>

      {/* Form (add / edit) */}
      {editing != null ? (
        <div className="flex flex-col gap-3 rounded-panel bg-v2-surface-2 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              {label('Fecha y hora')}
              <Input
                type="datetime-local"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              {label('Duración (min)')}
              <Input
                type="number"
                min={5}
                max={300}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className="t-tnum"
              />
            </label>
          </div>

          {isLead ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                {label('Resultado')}
                <Select
                  aria-label="Resultado"
                  value={form.outcome || 'none'}
                  onValueChange={(v) => setForm({ ...form, outcome: v === 'none' ? '' : v })}
                  options={[
                    { value: 'none', label: '—' },
                    ...SESSION_OUTCOMES.map((o) => ({ value: o as string, label: SESSION_OUTCOME_LABEL[o] })),
                  ]}
                  className="w-full"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                {label('Precio acordado (€/mes)')}
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.quoted_price_eur}
                  onChange={(e) => setForm({ ...form, quoted_price_eur: e.target.value })}
                  placeholder="—"
                  className="t-tnum"
                />
              </label>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            {label('Lo que hablasteis')}
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas de la llamada, la fuente del email de resumen."
            />
          </label>
          <label className="flex flex-col gap-1.5">
            {label('Próximos pasos')}
            <Textarea
              rows={2}
              value={form.next_steps}
              onChange={(e) => setForm({ ...form, next_steps: e.target.value })}
              placeholder="Qué toca después."
            />
          </label>

          {error ? (
            <p role="alert" className="t-body-sm text-v2-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Guardar parte
            </Button>
          </div>
        </div>
      ) : null}

      {/* History */}
      {sessions.length === 0 && editing == null ? (
        <EmptyState icon={Video} title="Sin sesiones registradas" description="al terminar una videollamada, apunta aquí lo que hablasteis" />
      ) : (
        <ul className="flex flex-col divide-y divide-v2-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="t-body font-medium text-v2-fg t-tnum">{fmtDate(s.occurred_at)}</span>
                <span className="t-meta text-v2-muted t-tnum">{s.duration_minutes} min</span>
                {s.outcome ? (
                  <StatusBadge
                    size="sm"
                    variant="soft"
                    tone={SESSION_OUTCOME_TONE[s.outcome as SessionOutcome]}
                    label={SESSION_OUTCOME_LABEL[s.outcome as SessionOutcome]}
                  />
                ) : null}
                {s.quoted_price_eur != null ? (
                  <span className="t-meta text-v2-fg t-tnum">{s.quoted_price_eur} €/mes</span>
                ) : null}
                <div className="ml-auto flex items-center gap-0.5">
                  <IconButton icon={Pencil} size="sm" label="Editar" onClick={() => openEdit(s)} />
                  <IconButton icon={Trash2} size="sm" label="Borrar" onClick={() => remove(s.id)} className="hover:text-v2-danger" />
                </div>
              </div>
              {s.notes ? <p className="whitespace-pre-wrap t-body text-v2-fg">{s.notes}</p> : null}
              {s.next_steps ? (
                <p className="t-body text-v2-muted">
                  <span className="font-medium text-v2-fg">Próximos pasos · </span>
                  <span className="whitespace-pre-wrap">{s.next_steps}</span>
                </p>
              ) : null}
              {/* #11 — post-call summary email (leads only). */}
              {s.from_lead && (s.notes || s.next_steps) ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Button size="sm" icon={Mail} onClick={() => setSummaryReport(s)}>
                    {s.summary_email_sent_at ? 'Reenviar resumen' : 'Enviar resumen al lead'}
                  </Button>
                  {s.summary_email_sent_at ? (
                    <StatusBadge size="sm" tone="ok" icon={Check} label={`Resumen enviado · ${fmtDate(s.summary_email_sent_at)}`} />
                  ) : null}
                </div>
              ) : null}
              {/* Authorship sello (#43): "parte por X" + "editó Y" on a real edit.
                  Each self-hides when unattributed (historical rows). */}
              {s.created_by_name || s.last_edited_by_name ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                  <AuthorStamp kind="coach" name={s.created_by_name} verb="escribió el parte" at={s.created_at} />
                  <AuthorStamp kind="coach" name={s.last_edited_by_name} verb="editó" at={s.updated_at} />
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
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      title="Resumen al lead"
      description="Repasa el texto antes de enviarlo. Editar aquí no cambia el parte guardado."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Send} loading={busy} disabled={!summary.trim()} onClick={send}>
            {alreadySent ? 'Reenviar' : 'Enviar resumen'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">Lo que hablasteis</span>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">Próximos pasos</span>
          <Textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} />
        </label>
        {error ? (
          <p role="alert" className="t-body-sm text-v2-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
