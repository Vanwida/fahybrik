// UnderConstruction — the themed placeholder for v2 screens not yet built. A
// tasteful "en construcción · llega en este build" state inside the shell, so the
// nav is fully navigable now and later agents drop their screen in. Server-safe.

import { MIcon } from '@/components/dashboard/MIcon';

export function UnderConstruction({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">{title}</h1>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-6 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]">
          <MIcon name={icon} size={30} />
        </span>
        <p className="text-sm font-semibold text-[color:var(--v2-fg)]">En construcción</p>
        <p className="w-full max-w-sm text-pretty text-xs leading-relaxed text-[color:var(--v2-muted)]">
          Esta pantalla llega en este build. Hoy ya está completa — el resto de la nueva versión se
          construye a continuación.
        </p>
      </div>
    </div>
  );
}
