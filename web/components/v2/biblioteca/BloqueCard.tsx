'use client';

// BloqueCard — un BLOQUE: la pieza reutilizable del coach (`blocks`). El punto
// de color codifica la modalidad (misma leyenda que el carril); el cuerpo lleva
// el título, su grupo metodológico, la procedencia del Excel (source_ref) y la
// prosa verbatim.
//
// Marcas honestas, y son DISTINTAS entre sí:
//   · "sin tipar"  → no tiene ejercicios estructurados: el atleta NO puede
//     ejecutarlo y no se puede insertar en un día (solo existe la prosa).
//   · "sin dosis"  → tipado, pero N líneas dicen el ejercicio y no cuánto trabajo
//     ("Cable Fly · 5 series", ¿de cuántas reps?). El mismo listón que bloquea el
//     Confirmar del grid, así que la Biblioteca y el gate nunca se contradicen.
//     Se arregla AQUÍ, en la fuente, una vez — no en cada día que use el bloque.
//   · "sin desglosar" (needs_review) → el coach lo marcó para repasar. Un bloque
//     puede estar tipado Y marcado para revisar: no son lo mismo.
// La card entera enlaza al editor de bloque (/biblioteca/bloque/[id]).

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type { V2BloqueItem } from '@/lib/dashboard/v2/biblioteca-data';

/** Normaliza para comparar título y prosa: sin acentos, sin signos, sin dobles
 *  espacios y en minúsculas. Sólo para DECIDIR si sobra, nunca para pintar. */
function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** La prosa del bloque SIN repetir el título que ya va encima.
 *
 *  Los bloques importados del Excel traen la prosa verbatim, y esa prosa empieza
 *  casi siempre por el propio título: la tarjeta gastaba ~150 px en decir dos
 *  veces lo mismo, con 99 tarjetas en pantalla. Si al quitar el título no queda
 *  nada que añadir, la tarjeta se calla — cada elemento se gana su sitio (§8.2). */
function prosaSinRepetirTitulo(title: string, description: string): string | null {
  const t = normaliza(title);
  const d = normaliza(description);
  if (!d) return null;
  if (d === t) return null;
  if (d.startsWith(t) && t.length > 0) {
    // Recorta por la misma cantidad de palabras que ocupa el título.
    const palabrasTitulo = t.split(' ').length;
    const resto = description.trim().split(/\s+/).slice(palabrasTitulo).join(' ');
    const limpio = resto.replace(/^[\s·:.,;–—-]+/, '').trim();
    return limpio.length > 0 ? limpio : null;
  }
  return description;
}

export function BloqueCard({ bloque, index }: { bloque: V2BloqueItem; index: number }) {
  const meta = MODALITY_META[bloque.modality];
  const prosa = prosaSinRepetirTitulo(bloque.title, bloque.description);

  return (
    <Link
      href={`/biblioteca/bloque/${bloque.id}`}
      aria-label={`Editar bloque ${bloque.title}`}
      className={cn(
        'v2-stagger v2-focus flex flex-col rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{ ['--v2-stagger-i' as string]: index }}
    >
      {/* Título + estado (excluyentes: o sin tipar, o sin dosis, o nada) */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="v2-display min-w-0 text-[15.5px] text-[color:var(--v2-fg)]">
          {bloque.title}
        </h3>
        {bloque.readiness === 'sin_tipar' ? (
          <StateBadge
            icon="pending"
            label="sin tipar"
            title="Solo texto: el atleta no puede ejecutarlo ni se puede insertar en un día"
          />
        ) : null}
        {bloque.readiness === 'sin_dosis' ? (
          // Los motivos del gate ya están escritos para el coach y en español: se
          // muestran VERBATIM. Prefijarlos duplicaba el texto ("Dice el ejercicio
          // pero no cuánto trabajo. Sin dosis: no dice cuánto trabajo hacer…").
          <StateBadge icon="edit_note" label="sin dosis" title={bloque.undosed_reasons.join(' ')} />
        ) : null}
      </div>

      {/* Grupo + procedencia del Excel (desambigua títulos repetidos). El punto
          de color es la MODALIDAD (misma leyenda que el carril); el chip del
          grupo del coach es neutro — el grupo es SU categoría, no la nuestra. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: `var(${meta.colorVar})` }}
        />
        <span className="sr-only">{meta.label}. </span>
        <span className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-faint)]">
          {bloque.group_label}
        </span>
        {bloque.source_ref ? (
          <span className="text-label text-[color:var(--v2-faint)]">{bloque.source_ref}</span>
        ) : null}
      </div>

      {/* Prosa verbatim — para los importados dice el entreno entero. Si lo único
          que dice es el título que ya está arriba, no se pinta. */}
      {prosa ? (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[color:var(--v2-muted)]">
          {prosa}
        </p>
      ) : null}

      {/* Qué contiene. Un bloque puede traer VARIAS piezas (block_position). */}
      {bloque.typed ? (
        <p className="mt-2 text-label text-[color:var(--v2-faint)]">
          <span className="v2-num">{bloque.exercise_count}</span>{' '}
          {bloque.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
          {bloque.part_count > 1 ? (
            <>
              {' · '}
              <span className="v2-num">{bloque.part_count}</span> piezas
            </>
          ) : null}
        </p>
      ) : null}

      {/* CUÁNTAS líneas le faltan — el coach necesita saber el tamaño del arreglo
          antes de abrir, no solo que "algo" falta. */}
      {bloque.readiness === 'sin_dosis' ? (
        <p className="mt-1 text-label font-semibold" style={{ color: 'var(--v2-warn)' }}>
          <span className="v2-num">{bloque.undosed_count}</span>{' '}
          {bloque.undosed_count === 1 ? 'línea sin dosis' : 'líneas sin dosis'} · ábrelo para
          completarlas
        </p>
      ) : null}
    </Link>
  );
}

/** Marca de estado. Un bloque tiene UNO: sin tipar o sin dosis (o ninguno). */
function StateBadge({ icon, label, title }: { icon: string; label: string; title: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em]"
      style={{ background: 'var(--v2-warn-soft)', color: 'var(--v2-warn)' }}
      title={title}
    >
      <MIcon name={icon} size={13} aria-hidden />
      {label}
    </span>
  );
}
