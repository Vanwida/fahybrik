'use client';

// Casilla de elección (un test del catálogo, un tipo de bloque): título + una
// línea de detalle, pulsable entera. Es un Button secundario que crece en alto;
// el pase por encima es neutro (sin acento: no es una selección).

import type { ReactNode } from 'react';
import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export function OptionTile({
  title,
  detail,
  leading,
  onClick,
  className,
}: {
  title: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className={cn(
        'h-auto min-h-12 w-full min-w-0 justify-start gap-3 whitespace-normal border-v2-border px-3 py-2 text-left font-normal',
        className,
      )}
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate t-body font-medium text-v2-fg">{title}</span>
        {detail ? <span className="t-meta text-v2-muted">{detail}</span> : null}
      </span>
    </Button>
  );
}
