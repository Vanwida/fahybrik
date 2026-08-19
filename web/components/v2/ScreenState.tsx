// Los estados de PANTALLA del dashboard — cargando · error · no encontrado.
//
// Existe porque las 20 rutas de (v2) no tenían NINGÚN límite de estado: al pasar
// de una sección a otra la pantalla anterior se quedaba congelada sin señal, y un
// `notFound()` caía al 404 global, fuera del shell y sin tema. §5 del contrato.
//
// `EmptyState` (al lado) sigue siendo lo correcto para "esta lista está vacía"
// DENTRO de una pantalla que ha cargado bien. Esto es lo otro: la pantalla
// ENTERA no puede mostrarse. Por eso aquí la SALIDA es obligatoria por tipo
// (`action` no es opcional) — un callejón sin salida es lo que tenía
// /microciclos/[id]: "no encontrado" y 610px de vacío debajo, sin vuelta.

import type { ReactNode } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

/** La columna de página, igual que la de cualquier pantalla del dashboard. */
function ScreenFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[var(--v2-container)] py-10', className)}>{children}</div>
  );
}

/**
 * Aviso a pantalla completa. **`action` es obligatorio**: o una salida real, o
 * una frase que declare por qué no la hay. Se centra en vez de apilarse arriba
 * (estrategia `centra` del §6.1: hay poco contenido y es deliberado).
 */
export function ScreenNotice({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
}: {
  icon: string;
  title: string;
  description: string;
  action: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <ScreenFrame className="flex min-h-[60vh] flex-col items-center justify-center">
      <span
        className={cn(
          'mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[var(--v2-r-card)]',
          tone === 'danger'
            ? 'bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]'
            : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]',
        )}
      >
        <MIcon name={icon} size={28} />
      </span>
      <h1 className="v2-display text-2xl text-[color:var(--v2-fg)]">{title}</h1>
      <p className="mt-2 max-w-[34rem] text-pretty text-center text-body leading-relaxed text-[color:var(--v2-muted)]">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{action}</div>
    </ScreenFrame>
  );
}

/** Botón/enlace de salida de un `ScreenNotice`. `as` deja usarlo con Link. */
export const screenNoticeActionClass =
  'v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-4 text-body font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]';

export const screenNoticeActionSecondaryClass =
  'v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-4 text-body font-bold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]';

/**
 * El esqueleto que se ve MIENTRAS carga una sección. No imita ninguna pantalla
 * concreta: dibuja la estructura que TODAS comparten (título + fila de datos +
 * cuerpo), para que el salto al contenido real no mueva la página de sitio.
 *
 * `aria-busy` + el texto para lector de pantalla son la señal accesible; la
 * animación es solo la visual, y `motion-reduce` la apaga.
 */
export function ScreenSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ScreenFrame>
      <div role="status" aria-busy="true" className="flex flex-col gap-6 motion-reduce:animate-none">
        <span className="sr-only">Cargando…</span>

        {/* Título + subtítulo */}
        <div className="flex flex-col gap-2.5">
          <Bar className="h-8 w-[min(280px,60%)]" />
          <Bar className="h-3.5 w-[min(420px,80%)]" />
        </div>

        {/* Fila de tarjetas de dato */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-[86px]" />
          ))}
        </div>

        {/* Cuerpo */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <Bar key={i} className="h-12" />
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}
