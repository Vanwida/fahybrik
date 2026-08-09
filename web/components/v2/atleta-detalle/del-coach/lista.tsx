'use client';

// LA FILA de la lista «Del coach» de un atleta.
//
// El orden de lectura no es el del mockup por casualidad: tipo · título · una
// línea · dónde le aparece · SEGUIMIENTO. Las cuatro primeras son contexto; la
// última es la razón de que la pestaña exista — hoy el coach manda un mensaje y
// lo único que sabe es que se ha enviado.
//
// Lo que reclama se ve ANTES de leer: filo ámbar a la izquierda y, sobre todo,
// arriba del todo (el carril lo decide `carriles`, no esta fila).

import { MIcon } from '@/components/ui/MIcon';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { formatRelative } from '@/lib/dashboard/relative-time';
import {
  KIND_LABEL,
  type CoachAthleteCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';
import {
  ANCHOR_COACH_LABEL,
  estaVencida,
  seguimiento,
  type Seguimiento,
  type TonoSeguimiento,
} from '@/lib/dashboard/v2/del-coach';
import { cn } from '@/lib/utils';

const COLOR_TONO: Record<TonoSeguimiento, string> = {
  accent: 'var(--v2-accent)',
  muted: 'var(--v2-muted)',
  ok: 'var(--v2-ok)',
  warn: 'var(--v2-warn)',
  info: 'var(--v2-info)',
};

/** El estado del atleta en una línea: punto de color, titular y su matiz. */
export function LineaSeguimiento({ seguimiento: s }: { seguimiento: Seguimiento }) {
  return (
    <span className="flex flex-col gap-1">
      <span
        className="inline-flex items-center gap-2 text-label font-semibold"
        style={{ color: COLOR_TONO[s.tono] }}
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: COLOR_TONO[s.tono] }}
        />
        {s.titular}
      </span>
      {s.nota ? (
        <span className="text-label leading-relaxed text-[color:var(--v2-muted)]">{s.nota}</span>
      ) : null}
    </span>
  );
}

/** El chip de tipo. El color sale del modelo: lo que pide acción se lleva el
 *  naranja, la nota informa y el foco acompaña. */
export function ChipTipoV2({ kind }: { kind: CoachAthleteCommunicationDTO['kind'] }) {
  const tone: PillTone = kind === 'note' ? 'neutral' : kind === 'focus' ? 'info' : 'accent';
  return (
    <Pill tone={tone} variant="soft">
      {KIND_LABEL[kind]}
    </Pill>
  );
}

export function FilaComunicado({
  c,
  onAbrir,
}: {
  c: CoachAthleteCommunicationDTO;
  onAbrir: () => void;
}) {
  const s = seguimiento(c);
  const alerta = estaVencida(c) || (c.kind === 'question' && c.blocks && s.tono === 'warn');

  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={cn(
          'v2-focus flex w-full flex-col gap-2 rounded-[var(--v2-r-m)] border p-3.5 text-left transition-colors',
          'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]',
          alerta && 'border-l-[3px] border-l-[color:var(--v2-warn)]',
          c.status === 'archived' && 'opacity-70',
        )}
      >
        <span className="flex flex-wrap items-center gap-2">
          <ChipTipoV2 kind={c.kind} />
          <span className="text-label text-[color:var(--v2-muted)]">
            {ANCHOR_COACH_LABEL[c.anchor_kind]}
          </span>
          <span className="flex-1" />
          {c.published_at ? (
            <span className="text-label text-[color:var(--v2-faint)]">
              {formatRelative(c.published_at)}
            </span>
          ) : null}
          <MIcon name="chevron_right" size={16} className="text-[color:var(--v2-faint)]" />
        </span>

        <span className="text-body font-semibold text-[color:var(--v2-fg)]">{c.title}</span>

        {c.body ? (
          <span className="line-clamp-2 text-label leading-relaxed text-[color:var(--v2-muted)]">
            {c.body}
          </span>
        ) : null}

        <LineaSeguimiento seguimiento={s} />
      </button>
    </li>
  );
}
