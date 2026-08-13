'use client';

// Tests del atleta, en Rendimiento → Fuerza. Un solo sitio: programar, ver
// el número y abrir el informe (si el test lo tiene). El estado sale de
// loadBatteryStatus, el mismo read que la app del atleta.

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { FichaCard, FichaLabel } from '../resumen/piezas';
import { ProgramarTestSheet } from './ProgramarTestSheet';
import { CmjInforme } from './CmjInforme';
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
  const report = test.jump_report;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">{test.label}</span>
        <span className="v2-num text-[12px] text-[color:var(--v2-muted)]">{formatDay(test.scheduled_for)}</span>
        {test.jump_profile?.lri != null ? (
          <span className="text-[12px] text-[color:var(--v2-muted)]">
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
              className="v2-focus v2-num text-[13px] font-semibold underline-offset-2 hover:underline"
            >
              {test.result_label}
            </button>
          ) : (
            <span className="v2-num text-[13px] font-semibold">{test.result_label}</span>
          )
        ) : null}
        {done ? (
          <Pill tone="ok" variant="soft">
            Hecho
          </Pill>
        ) : pending ? (
          <>
            <Pill tone="warn" variant="soft">
              Falta el resultado
            </Pill>
            <Link
              href={`/atletas/${athleteId}?tab=rendimiento&vista=zonas`}
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[8px] bg-[color:var(--v2-accent)] px-2.5 text-[12px] font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
            >
              Registrar
            </Link>
          </>
        ) : isFuture(test.scheduled_for) ? (
          <Pill tone="info" variant="soft">
            Programado
          </Pill>
        ) : (
          <Pill tone="neutral" variant="soft">
            Sin hacer
          </Pill>
        )}
      </div>
      {open && report ? <CmjInforme report={report} onClose={() => setOpen(false)} /> : null}
    </li>
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
  /** La batería del coach, para el sheet de «Programar test». */
  library: { id: string; name: string; last_done: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  const ordered = useMemo(
    () => [...tests].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for)),
    [tests],
  );
  const missingResult = ordered.filter((t) => t.result_pending).length;

  return (
    <>
      <FichaCard>
        <div className="flex items-baseline justify-between gap-2">
          <FichaLabel>Tests</FichaLabel>
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
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[color:var(--v2-accent)] px-3 text-[12px] font-semibold text-[color:var(--v2-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <MIcon name="add" size={15} />
              Programar test
            </button>
          </div>
        </div>

        {ordered.length === 0 ? (
          <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">
            {library.length === 0 ? (
              'Crea tu batería en Método › Tests y podrás programárselos desde aquí.'
            ) : (
              <>
                No hay tests programados.{' '}
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="font-semibold text-[color:var(--v2-accent)]"
                >
                  Programar →
                </button>
              </>
            )}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--v2-border)]">
            {ordered.map((t) => (
              <TestRow key={t.assignment_id} test={t} athleteId={athleteId} />
            ))}
          </ul>
        )}
      </FichaCard>

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
