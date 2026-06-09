interface MonthAssignmentBannerProps {
  assignment: {
    month_name: string;
    level: string;
    start_date: string;
    end_date: string;
    assignment_count: number;
  };
}

export function MonthAssignmentBanner({ assignment }: MonthAssignmentBannerProps) {
  return (
    <div className="card-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Mes asignado
        </p>
        <p className="font-semibold">{assignment.month_name}</p>
        <p className="text-xs text-[color:var(--muted)]">
          {assignment.start_date} → {assignment.end_date} · {assignment.assignment_count} sesiones
        </p>
      </div>
      <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-bold uppercase text-[color:var(--muted)]">
        {assignment.level}
      </span>
    </div>
  );
}
