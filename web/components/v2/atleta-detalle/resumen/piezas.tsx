// Piezas de tarjeta que aún usan los paneles de tests: la tarjeta plana del
// sistema (Card) y la ceja en mayúsculas (t-label).

import { Card } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export function FichaCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={className}>{children}</Card>;
}

export function FichaLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('t-label text-v2-faint', className)}>{children}</p>;
}
