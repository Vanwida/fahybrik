'use client';

// «Vista atleta»: el día seleccionado tal como lo lee el atleta en el móvil —
// título, nota del coach y cada bloque con la frase de su prescripción
// (`prescriptionToText`, la misma que ve en la app). Solo lectura.

import { Moon } from 'lucide-react';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { Dialog } from '@/components/v2/ui';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { cellState, workoutSessions } from '@/lib/dashboard/programming/grid-model';
import { itemPrescription } from '@/lib/dashboard/programming/progress-ops';

const LETTERS = 'ABCDEFGHIJKLMNOP';

export function AthletePreview({
  open,
  onOpenChange,
  row,
  col,
  day,
  weekFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: number;
  col: number;
  day: WeekDay;
  weekFocus: string | null;
}) {
  const state = cellState(day);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title="Vista atleta" description={`Semana ${row + 1} · ${DAY_LABELS_FULL[col]}`}>
      <div className="mx-auto w-[300px] rounded-[36px] border-[6px] border-v2-border-strong bg-v2-bg p-3 shadow-pop">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-v2-border-strong" aria-hidden />
        <div className="flex max-h-[480px] min-h-[360px] flex-col gap-4 overflow-y-auto px-1 pb-4">
          <div>
            <p className="t-label text-v2-faint">{DAY_LABELS_FULL[col]}</p>
            {weekFocus ? <p className="t-meta text-v2-muted">Semana {row + 1} · {weekFocus}</p> : null}
          </div>
          {state === 'rest' ? (
            <p className="flex items-center gap-2 t-title-sm text-v2-fg">
              <Moon aria-hidden className="size-4" strokeWidth={1.75} /> Descanso
            </p>
          ) : state === 'empty' ? (
            <p className="t-body-sm text-v2-muted">Hoy no hay entreno.</p>
          ) : (
            workoutSessions(day).map((s, si) => (
              <section key={si} className="flex flex-col gap-3">
                <h3 className="t-title-sm text-v2-fg">{s.focus || (s.blocks?.[0]?.title ?? 'Entreno')}</h3>
                {s.notes ? <p className="rounded-ctl bg-v2-surface-2 px-2.5 py-2 t-body-sm text-v2-muted">{s.notes}</p> : null}
                {(s.blocks ?? []).map((b, bi) => (
                  <div key={b.uid} className="rounded-panel border border-v2-border bg-v2-surface p-3">
                    <p className="mb-1.5 flex items-baseline gap-2 t-body-sm font-semibold text-v2-fg">
                      <span className="text-v2-faint">{LETTERS[bi]}</span>
                      {b.title}
                      {b.optional ? <span className="t-meta font-normal text-v2-faint">opcional</span> : null}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {b.items.map((it) => (
                        <li key={it.uid} className="flex flex-col">
                          <span className="t-body-sm text-v2-fg">{it.exercise_name}</span>
                          <span className="t-meta text-v2-muted t-tnum">{prescriptionToText(itemPrescription(it))}</span>
                          {it.notes ? <span className="t-meta text-v2-faint">{it.notes}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
