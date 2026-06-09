import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, hover, className, onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]',
        hover && 'transition hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]',
        onClick && 'text-left',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
