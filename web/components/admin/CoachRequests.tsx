'use client';

import { useCallback, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';

// Admin coach management (migration 0041).
//
// Lists every allowlist entry with its status (pending/approved/rejected) and
// sign-in state, lets the admin approve/reject pending requests, and add a
// coach directly (inserted approved). Server endpoints:
//   GET/POST /api/admin/coaches          (list / add approved)
//   POST     /api/admin/coaches/status   (approve / reject)

type CoachStatus = 'pending' | 'approved' | 'rejected';

interface AllowlistedCoach {
  email: string;
  status: CoachStatus;
  created_at: string;
  reviewed_at: string | null;
  has_signed_in: boolean;
}

type Banner =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const STATUS_LABEL: Record<CoachStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

function statusClasses(status: CoachStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:var(--accent)]';
    case 'pending':
      return 'border border-[color:var(--border-subtle)] text-[color:var(--text-muted)]';
    case 'rejected':
      return 'border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] line-through';
  }
}

export function CoachRequests({ initial_coaches }: { initial_coaches: AllowlistedCoach[] }) {
  const [coaches, setCoaches] = useState<AllowlistedCoach[]>(initial_coaches);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Per-row busy flag keyed by email so approve/reject buttons disable in place.
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>({ kind: 'idle' });

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coaches', { cache: 'no-store' });
      if (!res.ok) throw new Error('load_failed');
      const data = (await res.json()) as { coaches: AllowlistedCoach[] };
      setCoaches(data.coaches ?? []);
    } catch {
      setBanner({ kind: 'error', message: 'No se pudo refrescar la lista.' });
    }
  }, []);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!emailLooksValid(trimmed)) {
        setBanner({ kind: 'error', message: 'Introduce un email válido.' });
        return;
      }
      setSubmitting(true);
      setBanner({ kind: 'idle' });
      try {
        const res = await fetch('/api/admin/coaches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? 'No se pudo añadir el coach.');
        }
        const created = res.status === 201;
        setBanner({
          kind: 'success',
          message: created
            ? `Coach añadido y aprobado — entrará con ${trimmed} por enlace mágico.`
            : `${trimmed} ya estaba en la lista.`,
        });
        setEmail('');
        await reload();
      } catch (err) {
        setBanner({
          kind: 'error',
          message: err instanceof Error ? err.message : 'No se pudo añadir el coach.',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [email, reload],
  );

  const handleStatus = useCallback(
    async (target: string, status: 'approved' | 'rejected') => {
      setBusyEmail(target);
      setBanner({ kind: 'idle' });
      try {
        const res = await fetch('/api/admin/coaches/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: target, status }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? 'No se pudo actualizar.');
        }
        setBanner({
          kind: 'success',
          message:
            status === 'approved'
              ? `${target} aprobado.`
              : `${target} rechazado.`,
        });
        await reload();
      } catch (err) {
        setBanner({
          kind: 'error',
          message: err instanceof Error ? err.message : 'No se pudo actualizar.',
        });
      } finally {
        setBusyEmail(null);
      }
    },
    [reload],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Añadir coach directamente (aprobado) */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-5"
      >
        <label
          htmlFor="admin-coach-email"
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]"
        >
          Añadir coach (aprobado)
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="admin-coach-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="coach@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="h-11 flex-1 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-3.5 text-sm text-[color:var(--fg)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={submitting || email.trim() === ''}
            className="h-11 shrink-0 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 text-sm font-bold uppercase tracking-wide text-[color:var(--accent-on)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Añadiendo…' : 'Añadir'}
          </button>
        </div>
        {banner.kind !== 'idle' ? (
          <p
            role="status"
            aria-live="polite"
            className={
              banner.kind === 'success'
                ? 'text-sm text-[color:var(--success,#3fb950)]'
                : 'text-sm text-[color:var(--danger,#f85149)]'
            }
          >
            {banner.message}
          </p>
        ) : null}
      </form>

      {/* Lista de coaches / solicitudes */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          Coaches y solicitudes ({coaches.length})
        </h3>
        {coaches.length === 0 ? (
          <p className="text-sm text-[color:var(--text-muted)]">Aún no hay coaches.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--border-subtle)] rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]">
            {coaches.map((c) => {
              const busy = busyEmail === c.email;
              return (
                <li
                  key={c.email}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="truncate text-sm text-[color:var(--fg)]">{c.email}</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClasses(c.status)}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.has_signed_in ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                        · Activo
                      </span>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {c.status !== 'approved' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStatus(c.email, 'approved')}
                        className="flex h-8 items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-3 text-xs font-bold uppercase tracking-wide text-[color:var(--accent-on)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <MIcon name="check" size={15} />
                        Aprobar
                      </button>
                    ) : null}
                    {c.status !== 'rejected' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStatus(c.email, 'rejected')}
                        className="flex h-8 items-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--danger,#f85149)] hover:text-[color:var(--danger,#f85149)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <MIcon name="block" size={15} />
                        Rechazar
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
