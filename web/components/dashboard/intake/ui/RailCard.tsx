// Condensed read-only card for the intake evidence rail. micro-label title +
// a 16px Material icon header, then the caller's body. Mirrors the mock's
// `.rail-card` treatment with design-system tokens only.

import type { ReactNode } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';

export function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="card-elevated p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <span className="micro-label">{title}</span>
        <MIcon name={icon} size={16} className="text-[color:var(--text-muted)]" />
      </header>
      {children}
    </section>
  );
}
