'use client';

// Columna «Estado» del cockpit (informe C §4): readiness frente a SU base de 28
// días (independiente del check-in, R3), sueño, agujetas, el último check-in con
// «Responder», la lesión activa con «Adaptar sesiones» (abre el diálogo, R8), la
// carrera objetivo, la nota privada (editable, R9) y los marcadores que el coach
// elige (R7). Lo que falta es UNA línea que dice qué falta.

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button, ErrorState } from '@/components/v2/ui';
import { ReadinessMini } from '@/components/v2/shared';
import { relativeDayLabel } from '@/components/v2/shared/format';
import type { CalSession, FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { formatClock, formatHours, formatHoursDelta, raceCountdown } from '@/lib/dashboard/v2/ficha-format';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';
import { InjuryBlock } from './InjuryBlock';
import { KeyMarkersBlock } from './KeyMarkersBlock';
import { NoteBlock } from './NoteBlock';

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-baseline justify-between gap-3 t-body-sm', className)}>
      <span className="shrink-0 text-v2-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-v2-fg t-tnum">{children}</span>
    </div>
  );
}

const Missing = ({ children }: { children: React.ReactNode }) => <span className="text-v2-faint">{children}</span>;

export function EstadoColumn({
  estado,
  upcoming,
  onRetry,
}: {
  estado: FichaEstado | null;
  /** Entrenos pendientes (para adaptar por lesión). */
  upcoming: CalSession[];
  onRetry: () => void;
}) {
  const { shell, openChat } = useFicha();
  const [ackReply, setAckReply] = useState(false);
  if (!estado) {
    return (
      <aside aria-label="Estado" className="flex flex-col gap-3">
        <ErrorState title="No se ha podido cargar su estado" onRetry={onRetry} />
      </aside>
    );
  }
  const ck = estado.last_checkin;
  const sleep = estado.sleep;
  const race = shell.race;

  return (
    <aside aria-label="Estado" className="flex min-w-0 flex-col gap-4 rounded-panel border border-v2-border bg-v2-surface p-4">
      {estado.readiness ? (
        <ReadinessMini readiness={estado.readiness} today={shell.today} size="panel" />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="t-label text-v2-faint">Readiness</span>
          <Missing>Sin lecturas todavía · llegan al conectar su reloj o con sus check-ins</Missing>
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-v2-border pt-3">
        <Row label="Sueño (media 7 d)">
          {sleep ? (
            <>
              {formatHours(sleep.avg_7d_hours)}
              {sleep.baseline_hours != null ? (
                <span
                  className={cn(
                    'ml-1.5',
                    sleep.avg_7d_hours - sleep.baseline_hours <= -0.5 ? 'text-v2-warn' : 'text-v2-muted',
                  )}
                >
                  {formatHoursDelta(sleep.avg_7d_hours - sleep.baseline_hours)}
                </span>
              ) : null}
            </>
          ) : (
            <Missing>sin datos</Missing>
          )}
        </Row>
        <Row label="Agujetas">
          {ck?.soreness != null ? `${ck.soreness} / 5` : <Missing>sin datos</Missing>}
        </Row>
        <Row label="Fatiga">{ck?.fatigue != null ? `${ck.fatigue} / 5` : <Missing>sin datos</Missing>}</Row>
      </div>

      <div className="flex flex-col gap-2 border-t border-v2-border pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-label text-v2-faint">Check-in</span>
          {ck ? <span className="t-meta text-v2-faint">{relativeDayLabel(ck.on, shell.today)} · {ck.score}</span> : null}
        </div>
        {ck ? (
          <>
            {ck.notes ? <p className="t-body text-v2-fg">«{ck.notes}»</p> : <Missing>Sin comentario</Missing>}
            {!ck.answered && !ackReply ? (
              <Button
                size="sm"
                icon={MessageCircle}
                className="self-start"
                onClick={() => {
                  setAckReply(true);
                  openChat();
                }}
              >
                Responder
              </Button>
            ) : ck.answered ? (
              <span className="t-meta text-v2-faint">Ya le escribiste después</span>
            ) : null}
          </>
        ) : (
          <Missing>No ha hecho ningún check-in</Missing>
        )}
      </div>

      <InjuryBlock injury={estado.injury} upcoming={upcoming} />

      <div className="flex flex-col gap-1 border-t border-v2-border pt-3">
        <span className="t-label text-v2-faint">Carrera objetivo</span>
        {race ? (
          <>
            <span className="t-body font-medium text-v2-fg">{race.name}</span>
            <span className="t-body-sm text-v2-muted t-tnum">
              {[
                raceCountdown(race.days, race.date),
                race.category_label,
                race.goal_time_seconds != null ? `objetivo ${formatClock(race.goal_time_seconds)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <Missing>Sin carrera objetivo · la elige el atleta en su app</Missing>
        )}
      </div>

      <NoteBlock note={estado.note} />
      <KeyMarkersBlock markers={estado.markers} />
    </aside>
  );
}
