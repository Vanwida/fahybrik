import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';

// Shared header for a methodology sub-section: back link + area number + title.
export function SectionHeader({
  areaId,
  title,
  subtitle,
  phase,
}: {
  areaId: number;
  title: string;
  subtitle: string;
  phase: string;
}) {
  return (
    <header className="space-y-3">
      <Link
        href="/metodologia"
        className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-sm)] text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
      >
        <MIcon name="arrow_back" size={16} />
        Metodología
      </Link>
      <div className="flex items-center gap-2">
        <span className="micro-label">Área {areaId}</span>
        <span className="micro-label text-[color:var(--accent)]">· {phase}</span>
      </div>
      <h1 className="font-headline-lg">{title}</h1>
      <p className="max-w-2xl text-sm text-[color:var(--text-muted)]">{subtitle}</p>
    </header>
  );
}
