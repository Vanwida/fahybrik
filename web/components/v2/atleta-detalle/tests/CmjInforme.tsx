'use client';

// Informe de UNA ocurrencia de salto. La misma ficha para coach y atleta.
// Los números salen de buildCmjReport; aquí solo se pintan.

import { formatJumpHeightCm, formatLri } from '@fahybrid/shared/domain/jump/method';
import { pctPoints, type CmjReport, type ScaleBand } from '@fahybrid/shared/domain/test-report/cmj';
import { cn } from '@/lib/utils';

function fechaCorta(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : raw;
}

function Scale({ bands, kind }: { bands: ScaleBand[]; kind: 'height' | 'lri' }) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-1" aria-label={kind === 'height' ? 'Baremo de altura' : 'Baremo LRI'}>
      {bands.map((b) => (
        <div
          key={b.level}
          className={cn(
            'rounded-[var(--v2-r-m)] px-1 py-2 text-center',
            b.active
              ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
              : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]">{b.level}</p>
          <p className="mt-1 text-[10px] leading-tight">{b.range_label}</p>
        </div>
      ))}
    </div>
  );
}

export function CmjInforme({
  report,
  onClose,
  onFeedback,
}: {
  report: CmjReport;
  onClose?: () => void;
  /** Abre Del coach con este informe ya montado. Como «Dar feedback» de zonas. */
  onFeedback?: () => void;
}) {
  const fecha = fechaCorta(report.date_label);

  return (
    <div
      role="dialog"
      aria-label="Informe del test"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-[color:color-mix(in_srgb,var(--v2-bg)_92%,transparent)] p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <article
        className="my-auto w-full max-w-[560px] rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-card)] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]">
              Informe del test
            </p>
            <h2 className="mt-1 font-[family-name:var(--v2-font-display)] text-[22px] font-extrabold leading-none tracking-[-0.03em]">
              {report.title}
            </h2>
            {fecha ? <p className="v2-num mt-1.5 text-[12px] text-[color:var(--v2-muted)]">{fecha}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {onFeedback ? (
              <button
                type="button"
                onClick={onFeedback}
                className="v2-focus inline-flex h-8 items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-[12px] font-semibold text-[color:var(--v2-accent-fg)]"
              >
                Dar feedback
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="v2-focus text-[12.5px] font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
              >
                Cerrar
              </button>
            ) : null}
          </div>
        </header>

        <section className="mt-6">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]">
            Sin carga
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="font-[family-name:var(--v2-font-display)] text-[52px] font-extrabold leading-none tracking-[-0.04em] text-[color:var(--v2-accent)]">
              {Math.round(report.unloaded_cm)}
              <span className="ml-1 text-[16px] font-medium text-[color:var(--v2-muted)]">cm</span>
            </p>
            <div className="text-right">
              <p className="font-[family-name:var(--v2-font-display)] text-[28px] font-extrabold leading-none">
                {report.height_level}/5
              </p>
              <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--v2-muted)]">
                {report.height_label}
              </p>
            </div>
          </div>
          <Scale bands={report.height_scale} kind="height" />
        </section>

        {report.loaded_cm != null ? (
          <section className="mt-6 border-t border-[color:var(--v2-border)] pt-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]">
              Con carga{report.load_kg != null ? ` · ${Math.round(report.load_kg)} kg` : ''}
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="font-[family-name:var(--v2-font-display)] text-[40px] font-extrabold leading-none tracking-[-0.03em]">
                {Math.round(report.loaded_cm)}
                <span className="ml-1 text-[14px] font-medium text-[color:var(--v2-muted)]">cm</span>
              </p>
              {report.loaded_height_level != null ? (
                <p className="text-[13px] font-semibold text-[color:var(--v2-muted)]">
                  nivel {report.loaded_height_level}/5
                </p>
              ) : null}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <dt className="text-[color:var(--v2-muted)]">Caída</dt>
                <dd className="v2-num mt-0.5 font-semibold">
                  {report.drop_abs_cm != null ? formatJumpHeightCm(report.drop_abs_cm) : '—'}
                </dd>
                {report.drop_abs_cm != null ? (
                  <p className="mt-0.5 text-[11px] text-[color:var(--v2-muted)]">
                    {Math.round(report.unloaded_cm)} → {Math.round(report.loaded_cm)}
                  </p>
                ) : null}
              </div>
              <div>
                <dt className="text-[color:var(--v2-muted)]">Relativa</dt>
                <dd className="v2-num mt-0.5 font-semibold">
                  {report.drop_rel != null ? `${pctPoints(report.drop_rel)} %` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--v2-muted)]">Carga / peso</dt>
                <dd className="v2-num mt-0.5 font-semibold">
                  {report.load_rel != null ? `${pctPoints(report.load_rel)} %` : '—'}
                </dd>
              </div>
            </dl>

            {report.lri != null ? (
              <div className="mt-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]">
                      LRI
                    </p>
                    <p className="mt-1 font-[family-name:var(--v2-font-display)] text-[36px] font-extrabold leading-none tracking-[-0.03em] text-[color:var(--v2-accent)]">
                      {formatLri(report.lri)}
                    </p>
                  </div>
                  <div className="text-right">
                    {report.lri_level != null ? (
                      <p className="font-[family-name:var(--v2-font-display)] text-[22px] font-extrabold leading-none">
                        {report.lri_level}/5
                      </p>
                    ) : null}
                    {report.lri_label ? (
                      <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--v2-muted)]">
                        {report.lri_label}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Scale bands={report.lri_scale} kind="lri" />
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 border-t border-[color:var(--v2-border)] pt-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]">
            Lectura
          </p>
          <p className="mt-2 text-[14px] leading-snug">{report.lectura}</p>
        </section>

        <footer className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-[color:var(--v2-border)] pt-4 text-[12px] text-[color:var(--v2-muted)]">
          {report.body_mass_kg != null ? (
            <p>
              Peso <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{Math.round(report.body_mass_kg)} kg</span>
            </p>
          ) : (
            <span />
          )}
          {report.attempts.length > 0 ? (
            <p>
              {report.attempts.length} {report.attempts.length === 1 ? 'intento' : 'intentos'}
              {' · '}
              se queda {formatJumpHeightCm(report.unloaded_cm)}
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
