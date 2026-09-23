'use client';

// Un entreno en el calendario: barra de modalidad, título entero (dos líneas) y su
// marca — ✓ hecho, ✕ debido sin hacer. Clic = abrirlo en el panel-editor;
// arrastrar = moverlo (solo lo pendiente, a hoy o después). Es un dato del
// calendario, no un botón de acción: por eso no es el primitivo Button.

import { Check, X } from 'lucide-react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';
import type { CalSession } from '@/lib/dashboard/v2/atleta-detalle-types';
import { formatMinutes } from '@/lib/dashboard/v2/ficha-format';

export const DRAG_MIME = 'application/x-fahybrid-session';

const MOD_VAR: Record<NonNullable<CalSession['modality']>, string> = {
  fuerza: 'var(--v2-mod-fuerza)',
  ergo: 'var(--v2-mod-ergo)',
  carrera: 'var(--v2-mod-carrera)',
  circuito: 'var(--v2-mod-circuito)',
  calentamiento: 'var(--v2-mod-calentamiento)',
};

function stateText(s: CalSession): string {
  if (s.done) return s.status === 'partial' ? 'hecho a medias' : 'hecho';
  if (s.missed) return 'sin hacer';
  if (s.excluded) return 'no cuenta (pausa o lesión)';
  return 'pendiente';
}

export function SessionChip({
  session,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  session: CalSession;
  onOpen: (id: string) => void;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const s = session;
  const minutes = s.planned_min != null ? `${s.planned_open ? '≥ ' : ''}${formatMinutes(s.planned_min)}` : null;
  const label = [s.title, s.modality_label, minutes, stateText(s)].filter(Boolean).join(' · ');
  return (
    <ButtonPrimitive
      type="button"
      draggable={s.editable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, s.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(s.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(s.id)}
      title={label}
      aria-label={label}
      className={cn(
        'group/ses relative flex w-full min-w-0 items-start gap-1.5 rounded-[5px] border border-v2-border bg-v2-bg py-1 pr-1 pl-1.5 text-left',
        'outline-none transition-[border-color,opacity] duration-[var(--v2-dur-fast)] hover:border-v2-border-strong',
        'focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
        s.editable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
        s.excluded && 'opacity-60',
      )}
    >
      <i
        aria-hidden
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{ background: s.modality ? MOD_VAR[s.modality] : 'var(--v2-border-strong)' }}
      />
      <span className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-4 font-medium text-v2-fg">{s.title}</span>
      {s.done ? (
        <Check aria-hidden strokeWidth={2.5} className="mt-px size-3.5 shrink-0 text-v2-ok" />
      ) : s.missed ? (
        <X aria-hidden strokeWidth={2.5} className="mt-px size-3.5 shrink-0 text-v2-danger" />
      ) : null}
    </ButtonPrimitive>
  );
}
