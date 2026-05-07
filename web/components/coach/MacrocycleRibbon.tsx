import type { MacrocycleRibbon as MacrocycleData } from '@/lib/coach/deep-dive-types';

interface MacrocycleRibbonProps {
  ribbon: MacrocycleData;
}

const BLOCK_COLOR: Record<string, string> = {
  ACC:   'var(--z2)',
  TRANS: 'var(--z3)',
  REAL:  'var(--accent)',
};

export function MacrocycleRibbon({ ribbon }: MacrocycleRibbonProps) {
  const total = ribbon.total_weeks;
  return (
    <section
      aria-label="Macrociclo"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        <span>Macrociclo</span>
        <span>
          {ribbon.current_block ? `${ribbon.current_block} W${ribbon.current_week}` : '—'}
          {ribbon.weeks_to_event != null ? ` · ${ribbon.weeks_to_event} sem A-event` : ''}
        </span>
      </div>

      <div
        role="img"
        aria-label={`Bloques ${ribbon.blocks.map((b) => `${b.type} ${b.weeks}sem`).join(', ')}`}
        className="mt-2 flex h-3 w-full gap-1"
      >
        {ribbon.blocks.map((b) => {
          const widthPct = (b.weeks / total) * 100;
          const color = BLOCK_COLOR[b.type] ?? 'var(--muted)';
          return (
            <div
              key={`${b.type}-${b.position}`}
              className="relative flex h-full overflow-hidden rounded-[2px]"
              style={{ width: `${widthPct}%`, background: 'color-mix(in srgb, var(--surface-elevated) 70%, transparent)' }}
              title={`${b.type} · ${b.weeks} sem`}
            >
              <span
                aria-hidden
                className="absolute left-0 top-0 h-full"
                style={{
                  width: '100%',
                  background: b.is_current
                    ? color
                    : `color-mix(in srgb, ${color} 35%, transparent)`,
                }}
              />
              <span className="relative ml-1 flex items-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--bg)]">
                {b.is_current ? b.type : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {ribbon.blocks.map((b) => (
          <span key={`label-${b.position}`}>
            {b.type} {b.weeks}w
          </span>
        ))}
        <span>A-event</span>
      </div>
    </section>
  );
}
