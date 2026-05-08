import Link from 'next/link';
import { cn } from '@/lib/utils';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

export function Wordmark({ size = 'md', href, className }: WordmarkProps) {
  const inner = (
    <span
      className={cn(
        'font-display italic font-black tracking-tight select-none',
        SIZE_CLASS[size],
        className,
      )}
      aria-label="FAHYBRIK"
    >
      <span className="text-[color:var(--accent)]">[F]</span>
      <span className="text-[color:var(--fg)]">AHYBRIK</span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center">
      {inner}
    </Link>
  );
}
