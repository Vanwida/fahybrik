// Condensed read-only card for the V2 intake evidence rail. micro-label title +
// a 16px Material icon header, then the caller's body. Built on the shared V2
// <Card> base with V2 tokens only.

import type { ReactNode } from 'react';
import { Card } from '@/components/v2/Card';
import { MIcon } from '@/components/ui/MIcon';

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
    <Card className="p-4">
      <section aria-label={title}>
        <header className="mb-3 flex items-center justify-between">
          <span className="v2-micro">{title}</span>
          <MIcon name={icon} size={16} className="text-[color:var(--v2-muted)]" />
        </header>
        {children}
      </section>
    </Card>
  );
}
