'use client';

// EjercicioRow — una fila del catálogo: el movimiento y DE DÓNDE viene.
//
// El origen es el trabajo de esta fila. El coach tiene ~80 ejercicios Base que no
// ha escrito él y unos pocos suyos; si no distingue unos de otros no entiende por
// qué a unos les puede cambiar la categoría y a otros no. Por eso el chip de
// origen va SIEMPRE, y en los Personalizados la fila dice además QUÉ tocó
// ("tu vídeo y tus claves") — así se sabe sin abrir el editor.
//
// El punto de color es la MODALIDAD (el eje categórico del v2, mig 0053), no el
// origen: dos cosas distintas, dos señales distintas. Nunca es la única señal —
// el subtítulo lleva la categoría escrita.

import { MIcon } from '@/components/ui/MIcon';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { MODALITY_META } from '@/components/v2/constants';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import {
  EXERCISE_ORIGIN_META,
  exerciseSubtitle,
  forkedSummary,
} from '@/lib/dashboard/exercises/catalog-ui';

export function EjercicioRow({
  ex,
  onEdit,
}: {
  ex: CoachExerciseRow;
  onEdit: (ex: CoachExerciseRow) => void;
}) {
  const slug = modalityColorSlug(ex.modality);
  const origin = EXERCISE_ORIGIN_META[ex.origin];
  const subtitle = exerciseSubtitle(ex);
  const forked = forkedSummary(ex);

  return (
    <li>
      {/* Toda la fila abre el editor: es la única acción que tiene, así que
          convertirla en un botón-icono escondido sería esconder la función. */}
      <button
        type="button"
        onClick={() => onEdit(ex)}
        className="v2-focus group flex w-full items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--v2-border-strong)] hover:bg-[color:var(--v2-elevated)] sm:px-3.5"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: `var(${MODALITY_META[slug].colorVar})` }}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {ex.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[color:var(--v2-muted)]">
            {/* La modalidad, escrita: el punto de color solo no la comunica. */}
            <span className="sr-only">{MODALITY_META[slug].label}. </span>
            {subtitle}
            {forked ? (
              <>
                {subtitle ? ' · ' : null}
                <span style={{ color: `var(${EXERCISE_ORIGIN_META.customized.fgVar})` }}>
                  {forked}
                </span>
              </>
            ) : null}
          </span>
        </span>

        <span
          className="shrink-0 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
          style={{
            background: `var(${origin.bgVar})`,
            color: `var(${origin.fgVar})`,
          }}
        >
          {origin.label}
        </span>

        {/* El chevron se oculta en móvil para devolverle ese ancho al subtítulo.
            Las clases de display van en un SPAN y no en el <MIcon>: la clase
            `.material-symbols-outlined` trae su propio `display:inline-block` y
            pisa a `hidden` (comprobado: el icono seguía saliendo a 390). Mismo
            envoltorio que usa EmptyState. */}
        <span className="hidden shrink-0 text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-fg)] sm:block">
          <MIcon name="chevron_right" size={18} />
        </span>
      </button>
    </li>
  );
}
