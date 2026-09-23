'use client';

// La vista previa de la fila activa (J/K o ratón): todas sus líneas tipadas,
// o el arranque del texto original si está por revisar. Sin abrir nada.

import type { LibraryRow } from '@/lib/dashboard/programming/library';
import { Card, Tag } from '@/components/v2/ui';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';

const LETTERS = 'ABCDEFGH';

export function LibraryPreview({ row, className }: { row: LibraryRow; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-3', className)} aria-label="Vista previa">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: row.modality ? `var(${MODALITY_META[row.modality].colorVar})` : 'var(--v2-border-strong)' }} />
        <div className="min-w-0">
          <p className="t-title-sm text-v2-fg">{row.title}</p>
          <p className="t-meta text-v2-faint">
            {row.kind === 'entreno' ? 'Entreno' : 'Bloque'}
            {row.modality ? ` · ${MODALITY_META[row.modality].label}` : ''}
            {row.used_in > 0 ? ` · en ${row.used_in} ${row.used_in === 1 ? 'programa' : 'programas'}` : ''}
          </p>
        </div>
      </div>
      {row.status === 'por_revisar' ? (
        <p className="whitespace-pre-line t-body-sm text-v2-muted">{row.prose_excerpt ?? 'Sin texto'}…</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {row.lines.map((l, i) => (
            <li key={i} className="flex gap-2 t-body-sm text-v2-fg t-tnum">
              <span className="w-3 shrink-0 font-semibold text-v2-faint">{LETTERS[i] ?? '·'}</span>
              {l}
            </li>
          ))}
          {row.line_count > row.lines.length ? <li className="pl-5 t-meta text-v2-faint">+{row.line_count - row.lines.length} más</li> : null}
        </ol>
      )}
      {row.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
