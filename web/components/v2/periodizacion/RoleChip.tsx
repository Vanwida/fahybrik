'use client';

// RoleChip — the role badge for a phase (swatch + label), colored on v2 tokens
// via the role-style ramp. Used in phase rows, the role picker and the legend.

import { roleV2Color, roleV2Soft, ROLE_LABEL, type PhaseRole } from './role-style';
import { cn } from '@/lib/utils';

export function RoleChip({
  role,
  className,
}: {
  role: PhaseRole;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] border px-2 py-0.5',
        'text-[10px] font-bold uppercase tracking-wide',
        className,
      )}
      style={{
        background: roleV2Soft(role),
        color: roleV2Color(role),
        borderColor: `color-mix(in srgb, ${roleV2Color(role)} 35%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: roleV2Color(role) }}
      />
      {ROLE_LABEL[role]}
    </span>
  );
}
