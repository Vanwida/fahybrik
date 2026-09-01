'use client';

// COBERTURA DE DATOS — desde cuándo hay señal, por fuente, y si el «antes del
// plan» es creíble. Va arriba del diagnóstico de Rendimiento porque sin esto el
// coach no sabe si la comparativa mide un plan o un vacío.

import { MIcon } from '@/components/ui/MIcon';
import { Panel } from '../parts';
import type { DataCoverage, SourceCoverage } from '@/lib/coach/data-coverage';

const SOURCE_LABEL: Record<string, string> = {
  healthkit: 'Apple Salud',
  garmin: 'Garmin',
  polar: 'Polar',
  whoop: 'Whoop',
  oura: 'Oura',
  coros: 'COROS',
  suunto: 'Suunto',
  amazfit: 'Amazfit',
  concept2: 'Concept2',
  wahoo: 'Wahoo',
  manual: 'Manual',
  gps: 'GPS',
  treadmill: 'Cinta',
};

const DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function fmtDay(iso: string): string {
  // Las fechas llegan como YYYY-MM-DD civiles; se pintan en UTC para no saltar de día.
  return DAY_FMT.format(new Date(`${iso}T12:00:00Z`));
}

function labelOf(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

function prePlanCopy(c: DataCoverage): { title: string; body: string; tone: 'ok' | 'warn' | 'faint' } {
  if (c.plan_start == null) {
    return {
      title: 'Sin plan asignado aún',
      body: 'Cuando arranque un plan, aquí se verá cuántos días de pasado hay con los que compararlo.',
      tone: 'faint',
    };
  }
  if (c.pre_plan_days == null) {
    return {
      title: 'Sin datos anteriores al plan',
      body: `El plan arrancó el ${fmtDay(c.plan_start)}. Todo lo que hay es de después: la comparativa «antes / con el plan» no tiene «antes». Pide al atleta conectar Apple Salud (el histórico entra al conectar).`,
      tone: 'warn',
    };
  }
  if (c.pre_plan_thin) {
    return {
      title: `Solo ${c.pre_plan_days} días antes del plan`,
      body: `Pocos para una comparativa sólida. El plan arrancó el ${fmtDay(c.plan_start)}. Con un import de histórico de Salud el «antes» gana meses.`,
      tone: 'warn',
    };
  }
  return {
    title: `${c.pre_plan_days} días de historia antes del plan`,
    body: `Desde ${c.earliest_day ? fmtDay(c.earliest_day) : '—'} hasta el arranque del plan (${fmtDay(c.plan_start)}). Suficiente para mirar el efecto del plan sin inventar el pasado.`,
    tone: 'ok',
  };
}

function SourceRow({ s }: { s: SourceCoverage }) {
  const bits: string[] = [];
  if (s.workouts > 0) bits.push(`${s.workouts} entreno${s.workouts === 1 ? '' : 's'}`);
  if (s.samples > 0) bits.push(`${s.samples.toLocaleString('es-ES')} muestras`);
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-[color:var(--v2-border)] py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{labelOf(s.source)}</span>
        <span className="v2-micro text-[color:var(--v2-muted)]">
          {fmtDay(s.first_day)} → {fmtDay(s.last_day)}
          <span className="text-[color:var(--v2-faint)]"> · {s.span_days} d</span>
        </span>
      </div>
      <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">{bits.join(' · ') || '—'}</span>
    </li>
  );
}

export function CoberturaDatos({ coverage }: { coverage: DataCoverage | null }) {
  if (coverage == null) return null;

  const empty = coverage.sources.length === 0;
  const pre = prePlanCopy(coverage);
  const toneClass =
    pre.tone === 'ok'
      ? 'border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft)] text-[color:var(--v2-ok)]'
      : pre.tone === 'warn'
        ? 'border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] text-[color:var(--v2-warn)]'
        : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]';

  return (
    <Panel title="Cobertura de datos">
      <div className="flex flex-col gap-3">
        <div className={`rounded-[var(--v2-r-m)] border px-3 py-2.5 ${toneClass}`}>
          <div className="flex items-start gap-2">
            <MIcon
              name={pre.tone === 'ok' ? 'check_circle' : pre.tone === 'warn' ? 'warning' : 'info'}
              size={16}
              className="mt-0.5 shrink-0"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold">{pre.title}</span>
              <span className="text-[11px] leading-snug opacity-90">{pre.body}</span>
            </div>
          </div>
        </div>

        {empty ? (
          <p className="text-xs text-[color:var(--v2-muted)]">
            Aún no ha entrado ninguna muestra ni entreno desde dispositivos. Cuando el atleta
            conecte Apple Salud (y opcionalmente importe su histórico) o un reloj, aparece aquí.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--v2-muted)]">
              {coverage.history_days != null ? (
                <span>
                  Historia total:{' '}
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                    {coverage.history_days} d
                  </span>
                  {coverage.earliest_day && coverage.latest_day ? (
                    <span className="text-[color:var(--v2-faint)]">
                      {' '}
                      ({fmtDay(coverage.earliest_day)} → {fmtDay(coverage.latest_day)})
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col">
              {coverage.sources.map((s) => (
                <SourceRow key={s.source} s={s} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
