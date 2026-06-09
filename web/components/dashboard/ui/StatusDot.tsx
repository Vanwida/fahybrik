import { cn } from '@/lib/utils';
import type { StatusDotVariant } from '@/lib/dashboard/constants/session-status';
import { SESSION_STATUS_COLOR } from '@/lib/dashboard/constants/session-status';

const SIZE_CLASS = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
} as const;

interface StatusDotProps {
  variant: StatusDotVariant;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export function StatusDot({ variant, size = 'sm', className }: StatusDotProps) {
  return (
    <span
      className={cn('shrink-0 rounded-full', SIZE_CLASS[size], className)}
      style={{ background: SESSION_STATUS_COLOR[variant] }}
      aria-hidden
    />
  );
}
