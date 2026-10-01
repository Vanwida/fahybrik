'use client';

import { MessageCircle } from 'lucide-react';
import { shortDate } from '@/components/v2/shared/format';
import { Button } from '@/components/v2/ui';
import {
  adaptiveFlagCopy, checkinDimensionRows, checkinFreshnessLabel, checkinScoreTone,
  checkinValueTone, CHECKIN_DOW_LABEL,
} from '@/lib/dashboard/coach/checkin-presentation';
import type { FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';

const TONE = { ok: 'text-v2-ok', warn: 'text-v2-warn', danger: 'text-v2-danger' };

/** Resumen breve, con las cinco respuestas y los huecos a un toque. */
export function CheckinBlock({ checkin, week }: {
  checkin: FichaEstado['last_checkin'];
  week: FichaEstado['checkin_week'];
}) {
  const { openChat } = useFicha();
  if (!checkin) return (
    <section className="flex flex-col gap-2 border-t border-v2-border pt-3" aria-label="Check-in">
      <span className="t-label text-v2-faint">Check-in</span>
      <span className="t-body-sm text-v2-faint">No ha hecho ningún check-in</span>
    </section>
  );
  const flag = adaptiveFlagCopy(checkin.adaptive_flag);
  return (
    <section className="flex flex-col gap-2 border-t border-v2-border pt-3" aria-label="Check-in">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-v2-faint">Check-in</span>
        <span className={cn('t-meta t-tnum', checkin.days_ago === 0 ? TONE[checkinScoreTone(checkin.sub_score)] : 'text-v2-faint')}>
          {checkin.sub_score}/100
        </span>
      </div>
      <span className={cn('t-body-sm', checkin.days_ago === 0 ? 'text-v2-muted' : 'text-v2-faint')}>
        {checkinFreshnessLabel(checkin)} · {shortDate(checkin.recorded_for)}
      </span>
      {checkin.notes ? <p className="t-body text-v2-fg">«{checkin.notes}»</p> : null}
      <details className="group/checkin">
        <summary className="cursor-pointer rounded-ctl py-2 t-body-sm font-medium text-v2-fg outline-none focus-visible:ring-2 focus-visible:ring-v2-accent">
          Ver las 5 respuestas y los últimos 7 días
        </summary>
        <div className="flex flex-col gap-3 pb-1">
          <p className="t-meta text-v2-faint">1 = peor · 5 = mejor</p>
          <dl className="flex flex-col gap-1.5">
            {checkinDimensionRows(checkin).map((r) => (
              <div key={r.key} className="flex items-baseline justify-between gap-3 t-body-sm">
                <dt className="text-v2-muted">{r.label}</dt>
                <dd className={cn('t-tnum', r.value == null || checkin.days_ago > 0 ? 'text-v2-faint' : TONE[checkinValueTone(r.value)])}>
                  {r.value == null ? 'sin respuesta' : `${r.value}/5`}
                </dd>
              </div>
            ))}
          </dl>
          <ol aria-label="Check-ins de los últimos 7 días" className="grid grid-cols-7 gap-1">
            {week.map((d) => (
              <li key={d.iso} className="flex flex-col items-center gap-1 t-meta" title={`${d.iso} · ${d.sub_score == null ? 'sin check-in' : `${d.sub_score}/100`}`}>
                <span className="text-v2-faint">{CHECKIN_DOW_LABEL[d.dow]}</span>
                <span className={cn('t-tnum', d.sub_score == null ? 'text-v2-faint' : TONE[checkinScoreTone(d.sub_score)])}>
                  {d.sub_score == null ? '—' : d.sub_score}
                </span>
                <span className="sr-only">{d.iso}{d.sub_score == null ? ': sin check-in' : '/100'}</span>
              </li>
            ))}
          </ol>
          {flag ? <p className="t-body-sm text-v2-muted">{flag}</p> : null}
        </div>
      </details>
      {!checkin.answered ? (
        <Button size="sm" icon={MessageCircle} className="self-start" onClick={openChat}>Responder</Button>
      ) : <span className="t-meta text-v2-faint">Ya le escribiste después</span>}
    </section>
  );
}
