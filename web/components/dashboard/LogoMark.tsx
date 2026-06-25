import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string | undefined;
  /** Tamaño tipográfico del wordmark (sm | md | lg). */
  size?: 'sm' | 'md' | 'lg' | undefined;
  wordmarkClassName?: string | undefined;
}

const SIZE_CLASS: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/** Wordmark FAHYBRID — F naranja + AHYBRIK blanco (mismo patrón que dashboard web). */
export function BrandLogo({
  className,
  size = 'md',
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-display italic font-black tracking-tight select-none',
        SIZE_CLASS[size],
        className,
      )}
      aria-label="FAHYBRID"
    >
      <span className="text-[color:var(--accent)]">F</span>
      <span className={cn('text-[color:var(--fg)]', wordmarkClassName)}>AHYBRIK</span>
    </span>
  );
}

/** Alias compacto para nav — mismo wordmark. */
export function LogoMark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: BrandLogoProps['size'];
}) {
  return <BrandLogo className={className} size={size} />;
}
