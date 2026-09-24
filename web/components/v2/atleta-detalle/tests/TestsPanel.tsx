'use client';

// Tests del atleta, en Rendimiento → Fuerza. Un solo sitio: programar, ver
// el número y abrir el informe (si el test lo tiene). El estado sale de
// loadBatteryStatus, el mismo read que la app del atleta.

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Pill } from '@/components/v2/Pill';
import { FichaCard, FichaLabel } from '../resumen/piezas';
import { ProgramarTestSheet } from './ProgramarTestSheet';
import { CmjInforme } from './CmjInforme';
import { Compositor } from '../del-coach/Compositor';
import { notaDeTest } from '@/lib/dashboard/v2/zonas-feedback';
import type { Borrador } from '@/lib/dashboard/v2/del-coach-borrador';
import type { CalibrationTestStatus } from '@/lib/coach/battery-status';
import { Plus } from 'lucide-react';
import { Button, EmptyState, buttonVariants } from '@/components/v2/ui';

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
  onFeedback,
}: {
  test: CalibrationTestStatus;
  athleteId: string;
  onFeedback?: (test: CalibrationTestStatus) => void;
}) {
  const pending = test.result_pending;
  const done = test.result_captured;
  const [open, setOpen] = useState(false);
  const report = test.jump_report;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate t-body-sm font-semibold">{test.label}</span>
        <span className="t-tnum t-meta text-[color:var(--v2-muted)]">{formatDay(test.scheduled_for)}</span>
        {test.jump_profile?.lri != null ? (
          <span className="t-meta text-[color:var(--v2-muted)]">
            LRI {test.jump_profile.lri.toFixed(2).replace('.', ',')}
            {test.jump_profile.lri_label ? ` · ${test.jump_profile.lri_label}` : ''}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {done ? (
          report ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="t-tnum text-v2-fg underline-offset-2 hover:underline">
              {test.result_label}
            </Button>
          ) : (
            <span className="t-tnum t-body-sm font-semibold">{test.result_label}</span>
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
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-ctl bg-v2-fg px-2.5 t-meta font-semibold text-v2-bg hover:bg-[color:var(--v2-accent-press)]"
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
      {open && report ? (
        <CmjInforme
          report={report}
          onClose={() => setOpen(false)}
          onFeedback={
            onFeedback
              ? () => {
                  setOpen(false);
                  onFeedback(test);
                }
              : undefined
          }
        />
      ) : null}
    </li>
  );
}

export function TestsPanel({
  athleteId,
  athleteName,
  coachName,
  tests,
  library,
}: {
  athleteId: string;
  athleteName: string;
  coachName?: string;
  tests: CalibrationTestStatus[];
  /** La batería del coach, para el sheet de «Programar test». */
  library: { id: string; name: string; last_done: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [componiendo, setComponiendo] = useState<Borrador | null>(null);

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
            <Button size="sm" icon={Plus} onClick={() => setOpen(true)} disabled={library.length === 0}>
              Programar test
            </Button>
          </div>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            className="mt-2"
            title={library.length === 0 ? 'Todavía no tienes batería de tests' : 'No hay tests programados'}
            action={
              library.length === 0 ? (
                <Link href="/programar/tests" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
                  Crearla en Programar › Tests
                </Link>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
                  Programar uno
                </Button>
              )
            }
          />
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--v2-border)]">
            {ordered.map((t) => (
              <TestRow
                key={t.assignment_id}
                test={t}
                athleteId={athleteId}
                onFeedback={
                  coachName
                    ? (test) =>
                        setComponiendo(
                          notaDeTest({ assignment_id: test.assignment_id, title: test.label }),
                        )
                    : undefined
                }
              />
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

      {componiendo && coachName ? (
        <Compositor
          modo="publicar"
          destinatarios={[{ athlete_id: athleteId, full_name: athleteName }]}
          coachName={coachName}
          partida={{ b: componiendo, id: null }}
          onCerrar={() => setComponiendo(null)}
          onHecho={() => setComponiendo(null)}
        />
      ) : null}
    </>
  );
}
