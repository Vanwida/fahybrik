'use client';

// Lo prescrito frente a lo hecho, línea a línea (se conserva de la ficha vieja:
// «prescrito 4×4 @120 kg» junto a «5 @140 kg»). Para entrenos ya hechos o ya
// pasados. Honesto: sin registro por ejercicio lo dice, nunca inventa un número.

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState, KPI, KPIRow, SectionHeader, Skeleton } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { HechoChips, ItemPrescritoHecho, SplitsTable, actualTokens } from '@/components/v2/sesion/ItemPrescritoHecho';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import type { RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';

const NO_BLOCKS: Record<CoachSessionDetail['content_state'], string | null> = {
  blocks: null,
  clock: 'Usó la app como cronómetro y no anotó los movimientos. El formato, el tiempo y el esfuerzo son reales.',
  no_content: 'Este entreno no tiene ejercicios.',
  no_template: 'Este entreno no tiene contenido asociado.',
};

export function SessionResult({ athleteId, sessionId }: { athleteId: string; sessionId: string }) {
  const [detail, setDetail] = useState<CoachSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    apiJson<{ session: CoachSessionDetail }>(`/api/coach/athletes/${athleteId}/sessions/${sessionId}/detail`, {
      signal: ctrl.signal,
    })
      .then((r) => {
        setDetail(r.session);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se ha podido cargar lo que hizo'));
      });
    return () => ctrl.abort();
  }, [athleteId, sessionId, attempt]);

  if (error) return <ErrorState title={error} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!detail) {
    return (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const byItem = new Map<string, SegmentActual[]>();
  const unmatched: SegmentActual[] = [];
  for (const a of detail.segment_actuals) {
    if (a.item_uid) byItem.set(a.item_uid, [...(byItem.get(a.item_uid) ?? []), a]);
    else unmatched.push(a);
  }
  const verdictByLap = new Map<string, RunComplianceVerdict>();
  for (const t of detail.run_compliance?.tramos ?? []) {
    if (t.position != null) verdictByLap.set(`${t.item_uid}#${t.position}`, t.verdict);
  }
  const ex = detail.execution;
  const summary = detail.run_compliance?.summary;

  return (
    <div className="flex flex-col gap-5">
      {ex ? (
        <KPIRow>
          <KPI label="Duración" value={ex.duration_min} unit="min" />
          <KPI label="Esfuerzo" value={ex.rpe} unit="/ 10" />
          {summary && summary.evaluable > 0 ? (
            <KPI label="Tramos en banda" value={summary.pct_dentro} unit="%" caption={`${summary.dentro} de ${summary.evaluable}`} />
          ) : ex.score_label ? (
            <KPI label="Resultado" value={ex.score_label} />
          ) : null}
        </KPIRow>
      ) : (
        <EmptyState title="Sin registro de este entreno" description="no hay ejecución guardada" />
      )}

      {ex?.trace.available ? (
        <Link
          href={`/atletas/${athleteId}/sesion/${sessionId}`}
          className="flex items-center justify-between rounded-panel border border-v2-border bg-v2-surface px-3 py-2.5 t-body text-v2-fg outline-none hover:border-v2-border-strong focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
        >
          <span>
            Ver la carrera <span className="text-v2-muted">· curva y tramo a tramo</span>
          </span>
          <ChevronRight aria-hidden className="size-4 text-v2-muted" />
        </Link>
      ) : null}

      {ex?.athlete_notes ? (
        <blockquote className="border-l-2 border-v2-border-strong pl-3 t-body text-v2-fg">
          «{ex.athlete_notes}»<span className="mt-0.5 block t-meta text-v2-faint">lo que escribió al terminar</span>
        </blockquote>
      ) : null}

      {ex && detail.segment_actuals.length === 0 ? (
        <p className="t-body-sm text-v2-muted">Registró el total (tiempo y esfuerzo), sin detalle por ejercicio.</p>
      ) : null}

      {detail.workout && detail.workout.blocks.length > 0 ? (
        detail.workout.blocks.map((block) => (
          <section key={block.uid} className="flex flex-col gap-2">
            <SectionHeader title={block.title} />
            <div className="flex flex-col gap-1.5">
              {block.items.map((item) => (
                <ItemPrescritoHecho key={item.uid} item={item} actuals={byItem.get(item.uid) ?? []} verdictByLap={verdictByLap} />
              ))}
            </div>
          </section>
        ))
      ) : NO_BLOCKS[detail.content_state] ? (
        <p className="t-body-sm text-v2-muted">{NO_BLOCKS[detail.content_state]}</p>
      ) : null}

      {unmatched.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Registrado sin asociar a una línea" />
          {unmatched.map((a) => (
            <div key={a.position} className="flex flex-col gap-1.5 rounded-ctl border border-v2-border px-3 py-2">
              <HechoChips tokens={actualTokens(a)} />
              {a.erg_splits && a.erg_splits.length > 0 ? (
                <SplitsTable splits={a.erg_splits} dragFactor={a.drag_factor} calPerHour={a.avg_calories_per_hour} />
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
