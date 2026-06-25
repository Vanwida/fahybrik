// ModalityCard — a Card with a colored LEFT BORDER encoding training modality
// (running / ergo / strength / conditioning / warm-up). The border color is the
// modality axis (components/v2/constants); the card always carries a text label
// elsewhere so color is never the sole signal. Reused by session/plan surfaces.

import { Card } from '@/components/v2/Card';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { cn } from '@/lib/utils';

export function ModalityCard({
  modality,
  children,
  interactive = false,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  modality: V2Modality;
  interactive?: boolean;
}) {
  const meta = MODALITY_META[modality];
  return (
    <Card
      interactive={interactive}
      className={cn('border-l-[3px]', className)}
      style={{ borderLeftColor: `var(${meta.colorVar})` }}
      {...rest}
    >
      {children}
    </Card>
  );
}
