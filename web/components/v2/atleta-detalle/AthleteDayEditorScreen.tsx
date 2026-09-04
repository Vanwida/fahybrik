'use client';

// AthleteDayEditorScreen — the PER-ATHLETE day editor (Fase 2). Reuses the exact
// library SessionEditor (block/item/prescription editor + honest save gate),
// pointed at the athlete's INSTANCE template, saving through the instance PATCH
// endpoint so isolation holds. A day with multiple sessions stacks one editor per
// session; an empty day shows an honest empty state.
//
// Quitar entreno / descanso: llama al PATCH { kind: 'rest' } — NO guarda el
// SessionEditor con bloques vacíos (eso reescribe segmentos y deja la asignación).

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';
import type { AthleteDayEditorData } from '@/lib/dashboard/coach/athlete-day-editor';
import { RunZonesProvider } from '@/components/v2/editor/run-zones-context';

export function AthleteDayEditorScreen({ data }: { data: AthleteDayEditorData }) {
  const multi = data.sessions.length > 1;
  const hasScheduled = data.sessions.some((s) => s.status === 'scheduled');

  return (
    // La regla del ritmo: this is the ONE surface with a real athlete behind the
    // editor, so it provides his run bands; the library provides nothing and the
    // ruler never renders there.
    <RunZonesProvider
      value={data.run_zones.length > 0 ? { athlete_name: data.athlete_name.split(' ')[0] ?? data.athlete_name, zones: data.run_zones } : null}
    >
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-5">
      {/* Header — back to plan + the day being edited */}
      <div className="flex flex-col gap-1.5">
        <Link
          href={data.back_href}
          className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="arrow_back" size={15} />
          Plan de {data.athlete_name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="v2-display text-2xl capitalize text-[color:var(--v2-fg)] sm:text-3xl">
            {data.day_label}
          </h1>
          {hasScheduled ? (
            <QuitarEntrenoButton athleteId={data.athlete_id} isoDate={data.iso_date} />
          ) : null}
        </div>
      </div>

      {data.sessions.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title="Sin entreno este día"
          description="Este día no tiene ninguna sesión asignada al atleta. Vuelve al plan para elegir otro día o asignar una sesión."
          action={
            <Link
              href={data.back_href}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-body font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
            >
              <MIcon name="arrow_back" size={17} />
              Volver al plan
            </Link>
          }
        />
      ) : (
        data.sessions.map((s, i) => (
          <section key={s.template_id} className="flex flex-col gap-2.5">
            {multi ? (
              <h2 className="v2-micro">
                Sesión {i + 1}
                {s.title ? ` · ${s.title}` : ''}
              </h2>
            ) : null}
            <SessionEditor
              model={s.model}
              back={null}
              save={{
                url: `/api/coach/athletes/${data.athlete_id}/plan/day/${data.iso_date}`,
                method: 'PATCH',
                extra: { template_id: s.template_id },
              }}
            />
          </section>
        ))
      )}
    </div>
    </RunZonesProvider>
  );
}

function QuitarEntrenoButton({
  athleteId,
  isoDate,
}: {
  athleteId: string;
  isoDate: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/plan/day/${isoDate}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'rest' }),
      });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(body?.error?.message ?? 'No se pudo quitar el entreno');
        return;
      }
      router.refresh();
    } catch {
      setError('No se pudo quitar el entreno');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void quitar()}
        disabled={busy}
        aria-label="Quitar entreno"
        className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)] disabled:opacity-50"
      >
        <MIcon name="bedtime" size={16} />
        {busy ? 'Quitando…' : 'Quitar entreno'}
      </button>
      {error ? (
        <p className="text-xs font-semibold text-[color:var(--v2-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
