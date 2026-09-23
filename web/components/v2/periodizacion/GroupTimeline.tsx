'use client';

// El plan del grupo de un vistazo: la cadena de programas sobre el calendario,
// con el volumen planificado de cada semana (barras = minutos que escribe la
// prescripción; «≥» cuando algún entreno no escribe su reloj) y las carreras de
// sus atletas marcadas en su fecha. Derivado de la receta, no una previsión.

import { Flag } from 'lucide-react';
import type { GroupDetail } from '@fahybrid/shared/schema/groups';
import type { GroupRace, PlanWeekVolume } from '@/lib/dashboard/programming/group-plan';
import { shortDate } from '@/components/v2/shared/format';
import { formatMinutes } from '@/lib/dashboard/programming/week-volume';

const DAY_MS = 86_400_000;
const WEEK_W = 44;

function days(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function GroupTimeline({ group, volumes, races }: { group: GroupDetail; volumes: Record<string, PlanWeekVolume[]>; races: GroupRace[] }) {
  const items = group.calendar.items;
  if (group.programs.length === 0) return <p className="t-body-sm text-v2-muted">Añade programas al plan para verlo aquí.</p>;
  if (items.length === 0) {
    return <p className="t-body-sm text-v2-muted">El plan empieza cuando el grupo tenga atletas con fecha. Asígnalo o añade atletas.</p>;
  }
  const start = items[0]!.start_date;
  const end = items[items.length - 1]!.end_date;
  const totalWeeks = Math.max(1, Math.round((days(start, end) + 1) / 7));
  const width = totalWeeks * WEEK_W;
  const max = Math.max(60, ...items.flatMap((it) => (volumes[it.program_id] ?? []).map((v) => v.minutes)));
  const today = new Date().toISOString().slice(0, 10);
  const todayX = today >= start && today <= end ? (days(start, today) / 7) * WEEK_W : null;
  const visibleRaces = races.filter((r) => r.date >= start && r.date <= addDays(end, 56));
  const trackW = Math.max(width, visibleRaces.length ? ((days(start, visibleRaces[visibleRaces.length - 1]!.date) + 7) / 7) * WEEK_W : 0);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width: trackW, minWidth: '100%' }}>
        {/* Volumen por semana */}
        <div className="flex h-24 items-end" aria-label="Volumen planificado por semana">
          {items.flatMap((it) =>
            (volumes[it.program_id] ?? []).map((v, i) => {
              const h = v.minutes > 0 ? Math.max(4, Math.round((v.minutes / max) * 88)) : 2;
              return (
                <div key={`${it.position}-${i}`} className="flex flex-col items-center justify-end" style={{ width: WEEK_W }}>
                  <span className="mb-0.5 t-meta leading-none text-v2-faint t-tnum">{v.minutes > 0 ? `${v.open ? '≥' : ''}${Math.round(v.minutes / 60 * 10) / 10}`.replace('.', ',') : ''}</span>
                  <div
                    className="w-6 rounded-t-[3px] bg-v2-fg/70"
                    style={{ height: h }}
                    title={`${it.name} · semana ${i + 1}: ${v.minutes > 0 ? `${v.open ? 'al menos ' : ''}${formatMinutes(v.minutes)}` : 'sin tiempo escrito'}${v.parts.length ? ` · ${v.parts.map((p) => p.label).join(' · ')}` : ''}`}
                  />
                </div>
              );
            }),
          )}
        </div>
        {/* Programas */}
        <div className="mt-1 flex">
          {items.map((it) => {
            const w = Math.max(1, Math.round((days(it.start_date, it.end_date) + 1) / 7)) * WEEK_W;
            return (
              <div key={it.position} style={{ width: w }} className="pr-1">
                <div className="truncate rounded-ctl border border-v2-border bg-v2-surface-2 px-2 py-1.5 t-body-sm font-medium text-v2-fg" title={it.name}>
                  {it.name}
                </div>
                <p className="mt-1 truncate t-meta text-v2-faint">{shortDate(it.start_date)}</p>
              </div>
            );
          })}
        </div>
        {todayX != null ? (
          <div className="pointer-events-none absolute top-0 bottom-6 border-l border-dashed border-v2-info" style={{ left: todayX }}>
            <span className="absolute -top-0.5 left-1 t-meta text-v2-info">hoy</span>
          </div>
        ) : null}
        {visibleRaces.map((r) => {
          const x = (days(start, r.date) / 7) * WEEK_W;
          return (
            <div key={`${r.name}-${r.date}`} className="pointer-events-none absolute top-0 bottom-6 border-l border-v2-fg/40" style={{ left: x }}>
              <span className="absolute top-0 left-1 flex items-center gap-1 whitespace-nowrap t-meta font-medium text-v2-fg">
                <Flag aria-hidden className="size-3" strokeWidth={2} />
                {r.name} · {shortDate(r.date)}
                {r.athletes > 1 ? ` · ${r.athletes}` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 t-meta text-v2-faint">Horas por semana que escribe la prescripción · la línea discontinua es hoy</p>
    </div>
  );
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
