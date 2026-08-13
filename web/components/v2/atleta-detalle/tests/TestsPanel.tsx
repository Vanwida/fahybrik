'use client';

// The athlete's tests, in the coach's ficha (#34). This is where Pablo went looking
// and found nothing: the ficha said plenty about zones and 1RMs but never about the
// tests that PRODUCE them, so a battery that had reached nobody looked identical to
// one that was working.
//
// Three states, and the middle one is the point:
//   • Programado  — it is in their plan, not done yet
//   • Hecho · sin resultado — it RAN and nobody wrote the number down. That test
//     recalculated nothing: no zones, no 1RM, no progression. It is the only row
//     here that asks the coach for something, so it is the only one in amber.
//   • Hecho — with the captured number
//
// The status comes straight from loadBatteryStatus, the same read the athlete's app
// uses, so the two sides can never disagree about whether a test counted.

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { Pill } from '@/components/v2/Pill';
import { Panel } from '../parts';
import { ProgramarTestSheet } from './ProgramarTestSheet';
import type { CalibrationTestStatus } from '@/lib/coach/battery-status';

const DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return DATE_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

function isFuture(iso: string): boolean {
  return iso > new Date().toISOString().slice(0, 10);
}

function TestRow({
  test,
  athleteId,
}: {
  test: CalibrationTestStatus;
  athleteId: string;
}) {
  const pending = test.result_pending;
  const done = test.result_captured;
  const [open, setOpen] = useState(false);
  const report = test.jump_profile;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{test.label}</span>
        <span className="text-xs text-[color:var(--v2-faint)]">{formatDay(test.scheduled_for)}</span>
        {test.jump_profile?.lri != null ? (
          <span className="text-xs text-[color:var(--v2-faint)]">
            LRI {test.jump_profile.lri.toFixed(2).replace('.', ',')}
            {test.jump_profile.lri_label ? ` · ${test.jump_profile.lri_label}` : ''}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {done ? (
          report ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="v2-focus font-mono text-sm font-semibold text-[color:var(--v2-fg)] underline-offset-2 hover:underline"
            >
              {test.result_label}
            </button>
          ) : (
            <span className="font-mono text-sm font-semibold text-[color:var(--v2-fg)]">
              {test.result_label}
            </span>
          )
        ) : null}
        {done ? (
          <Pill tone="ok" variant="soft">Hecho</Pill>
        ) : pending ? (
          <>
            <Pill tone="warn" variant="soft">Falta el resultado</Pill>
            {/* El form de escritura vive en Ritmos / Zonas — un solo camino circular. */}
            <Link
              href={`/atletas/${athleteId}?tab=ritmos`}
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-2.5 text-label font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
            >
              Registrar
            </Link>
          </>
        ) : isFuture(test.scheduled_for) ? (
          <Pill tone="info" variant="soft">Programado</Pill>
        ) : (
          <Pill tone="neutral" variant="soft">Sin hacer</Pill>
        )}
      </div>
      {open && report ? (
        <div
          role="dialog"
          aria-label="Informe del test"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--v2-fg)]">{test.label}</p>
                <p className="text-xs text-[color:var(--v2-faint)]">{formatDay(test.scheduled_for)}</p>
              </div>
              <button type="button" className="text-xs text-[color:var(--v2-muted)]" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>
            <p className="font-mono text-3xl font-bold text-[color:var(--v2-accent)]">
              {Math.round(report.unloaded_cm)} cm
            </p>
            <p className="mt-1 text-xs text-[color:var(--v2-faint)]">sin carga · nivel {report.height_level}/5</p>
            {report.loaded_cm != null ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-[color:var(--v2-faint)]">Con carga</p>
                  <p className="font-mono font-semibold">{Math.round(report.loaded_cm)} cm</p>
                </div>
                <div>
                  <p className="text-[color:var(--v2-faint)]">LRI</p>
                  <p className="font-mono font-semibold">
                    {report.lri != null ? report.lri.toFixed(2).replace('.', ',') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[color:var(--v2-faint)]">Lectura</p>
                  <p className="font-semibold">{report.lri_label ?? '—'}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TestsPanel({
  athleteId,
  athleteName,
  tests,
  library,
}: {
  athleteId: string;
  athleteName: string;
  tests: CalibrationTestStatus[];
  /** The coach's test library, for the "Programar test" sheet. */
  library: { id: string; name: string; last_done: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  // Newest first: what he just scheduled and what just happened are the two things
  // worth seeing, and old tests only matter as history.
  const ordered = useMemo(
    () => [...tests].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for)),
    [tests],
  );
  const missingResult = ordered.filter((t) => t.result_pending).length;

  return (
    <>
      <Panel
        title="Tests"
        action={
          <div className="flex items-center gap-2">
            {missingResult > 0 ? (
              <Pill tone="warn" variant="soft">
                {missingResult} sin resultado
              </Pill>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={library.length === 0}
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <MIcon name="add" size={15} />
              Programar test
            </button>
          </div>
        }
        bodyClassName="flex flex-col"
      >
        {ordered.length === 0 ? (
          <EmptyState
            icon="timer"
            title="Todavía no tiene ningún test"
            description={
              library.length === 0
                ? 'Crea tu batería en Método › Tests y podrás programárselos desde aquí.'
                : 'Prográmale uno y aparecerá en su plan y en su app ese día.'
            }
            className="border-none py-6"
          />
        ) : (
          ordered.map((t) => <TestRow key={t.assignment_id} test={t} athleteId={athleteId} />)
        )}
      </Panel>

      {open ? (
        <ProgramarTestSheet
          athleteId={athleteId}
          athleteName={athleteName}
          library={library}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
