'use client';

// AthleteDayEditorScreen — the PER-ATHLETE day editor (Fase 2). Reuses the exact
// library SessionEditor (block/item/prescription editor + honest save gate),
// pointed at the athlete's INSTANCE template, saving through the instance PATCH
// endpoint so isolation holds. A day with multiple sessions stacks one editor per
// session; an empty day shows an honest empty state.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';
import type { AthleteDayEditorData } from '@/lib/dashboard/coach/athlete-day-editor';

export function AthleteDayEditorScreen({ data }: { data: AthleteDayEditorData }) {
  const multi = data.sessions.length > 1;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {/* Header — back to plan + the day being edited */}
      <div className="flex flex-col gap-1.5">
        <Link
          href={data.back_href}
          className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="arrow_back" size={15} />
          Plan de {data.athlete_name}
        </Link>
        <h1 className="v2-display text-2xl capitalize text-[color:var(--v2-fg)] sm:text-3xl">
          {data.day_label}
        </h1>
      </div>

      {data.sessions.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title="Sin entreno este día"
          description="Este día no tiene ninguna sesión asignada al atleta. Vuelve al plan para elegir otro día o asignar una sesión."
          action={
            <Link
              href={data.back_href}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-[13px] font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
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
  );
}
