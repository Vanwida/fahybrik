// SettingRow — a labelled read-only field inside an Ajustes card. A tracked
// uppercase micro-label over its value, with an optional leading icon. Purely
// presentational; server-renderable (no client hooks). Keeps the Ajustes page
// dense + scannable and avoids repeating the label/value markup per field.

import { MIcon } from '@/components/dashboard/MIcon';

export function SettingRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  /** Material Symbols name for the leading glyph (decorative). */
  icon?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      {icon ? (
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]"
        >
          <MIcon name={icon} size={18} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="v2-micro">{label}</span>
        <span className="truncate text-sm font-medium text-[color:var(--v2-fg)]">{value}</span>
      </div>
    </div>
  );
}
