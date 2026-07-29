'use client';

// SesionCard — una SESIÓN: un entreno completo (`templates` madre). Es lo que
// ejecuta el atleta; se forkea por atleta al asignarla (instance_athlete_id).
// La card enlaza al editor de sesión (/biblioteca/sesion/[id] = templates.id).
//
// Antes esta card pintaba un `blocks` (un bloque disfrazado de sesión). Ahora
// pinta la sesión de verdad: un bloque es la PIEZA, la sesión es el ENTRENO.
// Una sesión no tiene prosa verbatim (su contenido son segments), así que en vez
// de un preview de texto mostramos de qué está hecha.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type { V2SesionItem } from '@/lib/dashboard/v2/biblioteca-data';

export function SesionCard({ sesion, index }: { sesion: V2SesionItem; index: number }) {
  const meta = MODALITY_META[sesion.modality];

  return (
    <Link
      href={`/biblioteca/sesion/${sesion.id}`}
      aria-label={`Editar sesión ${sesion.title}`}
      className={cn(
        'v2-stagger v2-focus flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        borderLeftWidth: '3px',
        borderLeftColor: `var(${meta.colorVar})`,
      }}
    >
      {/* Título + borrador */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--v2-fg)]">
          {sesion.title}
        </h3>
        {sesion.is_draft ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-label font-semibold"
            style={{ background: 'var(--v2-warn-soft)', color: 'var(--v2-warn)' }}
            title="Borrador — aún no la has dado por buena"
          >
            <MIcon name="edit_note" size={13} aria-hidden />
            borrador
          </span>
        ) : null}
      </div>

      {/* Grupo (opcional: templates.methodology_group_id es nullable) + forma */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {sesion.group_label ? (
          <span
            className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-label font-semibold"
            style={{ background: `var(${meta.softVar})`, color: `var(${meta.colorVar})` }}
          >
            {sesion.group_label}
          </span>
        ) : null}
        {sesion.format_label ? (
          <span className="text-label text-[color:var(--v2-faint)]">{sesion.format_label}</span>
        ) : null}
      </div>

      {/* De qué está hecha */}
      <p className="mt-2 text-xs text-[color:var(--v2-muted)]">
        {sesion.segment_count === 0 ? (
          <span className="text-[color:var(--v2-faint)]">Vacía — sin ejercicios todavía</span>
        ) : (
          <>
            <span className="v2-num">{sesion.block_count}</span>{' '}
            {sesion.block_count === 1 ? 'bloque' : 'bloques'}
            {' · '}
            <span className="v2-num">{sesion.segment_count}</span>{' '}
            {sesion.segment_count === 1 ? 'ejercicio' : 'ejercicios'}
          </>
        )}
      </p>
    </Link>
  );
}
