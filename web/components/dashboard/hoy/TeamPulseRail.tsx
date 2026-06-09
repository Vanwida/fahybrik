// Columna derecha de HOY — "pulso del equipo" (spec §1): distribución de
// readiness (click = filtra el roster), cumplimiento medio de la semana y
// "Necesitan atención" (top 3, click → ficha). Server component: solo Links.

import { Link } from '@/i18n/navigation';
import type { TeamPulse } from '@/lib/dashboard/coach/team-pulse';
import {
  READINESS_BUCKET_LABEL,
  readinessBucket,
  type ReadinessBucket,
} from '@/lib/dashboard/constants/readiness';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

const BUCKET_DOT_CLASS: Record<ReadinessBucket, string> = {
  ok: 'bg-[color:var(--ok)]',
  caution: 'bg-[color:var(--warning)]',
  low: 'bg-[color:var(--danger)]',
};

const RAIL_CARD =
  'card-elevated px-6 pb-4 pt-6 hover:border-[color:var(--border-subtle)]';

export function TeamPulseRail({ pulse }: { pulse: TeamPulse }) {
  const { readiness, compliance, attention } = pulse;
  const buckets: ReadinessBucket[] = ['ok', 'caution', 'low'];
  const known = readiness.ok + readiness.caution + readiness.low;

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-20" aria-label="Pulso del equipo">
      {/* Readiness del equipo */}
      <section className={RAIL_CARD} aria-labelledby="rail-readiness">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="micro-label" id="rail-readiness">
            Readiness del equipo
          </h2>
          <Link
            href="/atletas"
            aria-label="Ver roster completo"
            className="focus-ring inline-flex items-center gap-0.5 rounded-[var(--r-s)] px-1 py-0.5 text-[11px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          >
            Roster <MIcon name="arrow_forward" size={13} />
          </Link>
        </div>
        {known > 0 ? (
          <div
            role="img"
            aria-label={`Distribución de readiness: ${readiness.ok} en verde, ${readiness.caution} en amarillo, ${readiness.low} en rojo`}
            className="mb-4 flex h-2.5 gap-[3px] overflow-hidden rounded-[var(--r-pill)]"
          >
            {buckets.map((b) =>
              readiness[b] > 0 ? (
                <span key={b} className={BUCKET_DOT_CLASS[b]} style={{ flex: readiness[b] }} />
              ) : null,
            )}
          </div>
        ) : (
          <p className="mb-4 text-xs text-[color:var(--text-muted)]">
            Sin check-ins todavía — el reparto aparecerá con los primeros datos.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {buckets.map((b) => (
            <Link
              key={b}
              href={`/atletas?readiness=${b}`}
              aria-label={`Filtrar roster: ${READINESS_BUCKET_LABEL[b]}, ${readiness[b]} atleta${readiness[b] === 1 ? '' : 's'}`}
              className="focus-ring -mx-2 flex items-center gap-3 rounded-[var(--r-s)] px-2 py-1.5 text-[13px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]"
            >
              <span
                aria-hidden
                className={cn('h-2 w-2 shrink-0 rounded-[var(--r-pill)]', BUCKET_DOT_CLASS[b])}
              />
              {READINESS_BUCKET_LABEL[b]}
              <span className="metric-num ml-auto text-sm font-semibold text-[color:var(--fg)]">
                {readiness[b]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Cumplimiento · semana */}
      <section className={RAIL_CARD} aria-labelledby="rail-compliance">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="micro-label" id="rail-compliance">
            Cumplimiento · semana
          </h2>
          {compliance.trend_pts != null ? (
            <span
              className={cn(
                'metric-num inline-flex items-center gap-0.5 text-xs font-semibold',
                compliance.trend_pts >= 0
                  ? 'text-[color:var(--ok)]'
                  : 'text-[color:var(--danger)]',
              )}
              aria-label={`${compliance.trend_pts >= 0 ? 'Sube' : 'Baja'} ${Math.abs(compliance.trend_pts)} puntos respecto a la semana pasada`}
            >
              <MIcon
                name={compliance.trend_pts >= 0 ? 'trending_up' : 'trending_down'}
                size={14}
              />
              {compliance.trend_pts >= 0 ? '+' : ''}
              {compliance.trend_pts}
            </span>
          ) : null}
        </div>
        <div className="metric-readout">
          <span className="metric-readout__value">
            {compliance.avg_pct != null ? compliance.avg_pct : '—'}
            {compliance.avg_pct != null ? <span className="metric-readout__unit">%</span> : null}
          </span>
        </div>
        <div
          role="img"
          aria-label="Cumplimiento del equipo por día, de lunes a domingo"
          className="mt-4 flex h-9 items-end gap-1"
        >
          {compliance.by_day.map((d, i) => (
            <span
              key={`${d.day_label}-${i}`}
              className={cn(
                'flex-1 rounded-t-[2px]',
                d.is_today
                  ? 'bg-[color:var(--accent)]'
                  : d.pct != null
                    ? 'bg-[color:color-mix(in_srgb,var(--accent)_75%,var(--surface-container-high))]'
                    : 'bg-[color:var(--surface-container-high)]',
              )}
              style={{ height: `${d.pct != null ? Math.max(8, d.pct) : 30}%` }}
            />
          ))}
        </div>
        <div aria-hidden className="mt-1.5 flex gap-1">
          {compliance.by_day.map((d, i) => (
            <span
              key={`${d.day_label}-label-${i}`}
              className="metric-num flex-1 text-center text-[9px] uppercase text-[color:var(--text-muted)]"
            >
              {d.day_label}
            </span>
          ))}
        </div>
      </section>

      {/* Necesitan atención */}
      <section className={RAIL_CARD} aria-labelledby="rail-attention">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="micro-label" id="rail-attention">
            Necesitan atención
          </h2>
        </div>
        {attention.length === 0 ? (
          <p className="py-2 text-xs text-[color:var(--text-muted)]">
            Nadie en rojo ahora mismo.
          </p>
        ) : (
          <div className="flex flex-col">
            {attention.map((a, i) => (
              <Link
                key={a.athlete_id}
                href={`/atletas/${a.athlete_id}`}
                aria-label={`Abrir ficha de ${a.full_name} — ${a.reason}`}
                className={cn(
                  'focus-ring -mx-2 flex items-center gap-3 rounded-[var(--r-m)] px-2 py-3 transition-colors hover:bg-[color:var(--surface-container)]',
                  i > 0 && 'border-t border-[color:var(--border-subtle)]',
                )}
              >
                <AthleteAvatar name={a.full_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[color:var(--fg)]">
                    {a.full_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-[color:var(--text-muted)]">
                    {a.reason}
                  </span>
                </span>
                {a.readiness_score != null ? (
                  <span
                    className={cn(
                      'metric-num shrink-0 text-[13px] font-semibold',
                      readinessBucket(a.readiness_score) === 'low'
                        ? 'text-[color:var(--danger)]'
                        : readinessBucket(a.readiness_score) === 'caution'
                          ? 'text-[color:var(--warning)]'
                          : 'text-[color:var(--ok)]',
                    )}
                  >
                    {a.readiness_score}%
                  </span>
                ) : null}
                <MIcon name="chevron_right" size={16} className="shrink-0 text-[color:var(--surface-variant)]" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
