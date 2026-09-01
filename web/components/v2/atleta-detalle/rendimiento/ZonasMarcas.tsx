'use client';

// LAS MARCAS DEL COACH, mientras las escribe.
//
// Una marca es DATO, no dibujo: un rango de semanas con una etiqueta corta y un
// tono. Por eso se edita en una lista con campos y no arrastrando un rotulador
// sobre la gráfica — lo que se guarda se vuelve a pintar a cualquier tamaño, se
// busca seis meses después y viaja dentro de un comunicado que ya sabe si el
// atleta lo ha abierto.
//
// El tono no es una nota: es cómo quiere el coach que se lea esa banda. El
// sistema no opina sobre si un reparto de zonas está bien (eso es método suyo);
// sólo le da tres formas de decirlo y las pinta.

import { MIcon } from '@/components/ui/MIcon';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { MAX_RANGE_LABEL_CHARS, type RangeTone } from '@fahybrid/shared/domain/zone-chart';
import { RANGE_TONE_COACH_LABEL, RANGE_TONE_ORDER } from '@/lib/dashboard/v2/zonas-feedback';
import type { RangoBorrador } from '@/lib/dashboard/v2/del-coach-borrador';
import { formatWeekLong, ZONE_TOKENS_V2 } from '@/lib/zones/chart';

const OPCIONES_TONO = RANGE_TONE_ORDER.map((t) => ({ value: t, label: RANGE_TONE_COACH_LABEL[t] }));

/** Cuántas semanas cubre una marca, ambas puntas inclusive. */
function semanasDe(r: RangoBorrador): number {
  const a = Date.parse(`${r.week_start}T00:00:00Z`);
  const b = Date.parse(`${r.week_end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.round((b - a) / (7 * 86_400_000)) + 1;
}

/**
 * LOS DOS BOTONES DEL GESTO. «Marcar» enciende los toques sobre la gráfica;
 * «Dar feedback» abre el compositor con la nota ya montada.
 *
 * «Dar feedback» está SIEMPRE, con marcas o sin ellas: mandarle a un atleta su
 * gráfica de seis meses y una frase ya es feedback, y obligar a marcar algo
 * antes convertiría una ayuda en un peaje.
 */
export function BarraDeMarcado({
  marcando,
  desde,
  rangos,
  onMarcar,
  onDarFeedback,
}: {
  marcando: boolean;
  /** Hay una marca a medias: falta la segunda semana. */
  desde: string | null;
  rangos: number;
  onMarcar: () => void;
  onDarFeedback: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onMarcar}
        aria-pressed={marcando}
        className={
          marcando
            ? 'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)]/12 px-3 text-label font-semibold text-[color:var(--v2-fg)]'
            : 'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-3 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]'
        }
      >
        <MIcon name={marcando ? 'done' : 'edit_square'} size={15} />
        {marcando ? 'Terminar de marcar' : 'Marcar un tramo'}
      </button>

      <button
        type="button"
        onClick={onDarFeedback}
        className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-label font-bold text-[color:var(--v2-accent-fg)] transition-opacity hover:opacity-90"
      >
        <MIcon name="campaign" size={15} />
        Dar feedback
      </button>

      <span className="text-label text-[color:var(--v2-muted)]">
        {marcando
          ? desde
            ? 'Ahora toca la última semana del tramo.'
            : 'Toca la primera semana del tramo.'
          : rangos > 0
            ? `${rangos} ${rangos === 1 ? 'marca' : 'marcas'} sobre la gráfica. Van dentro de la nota que publiques.`
            : 'Marca los tramos que quieras señalarle y se dibujan dentro de su nota.'}
      </span>
    </div>
  );
}

export function ZonasMarcas({
  rangos,
  onCambiar,
  onQuitar,
}: {
  rangos: RangoBorrador[];
  onCambiar: (key: string, patch: Partial<RangoBorrador>) => void;
  onQuitar: (key: string) => void;
}) {
  if (rangos.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {rangos.map((r) => {
        const semanas = semanasDe(r);
        return (
          <li
            key={r.key}
            className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: ZONE_TOKENS_V2.tone[r.tone] }}
              />
              <input
                value={r.label}
                maxLength={MAX_RANGE_LABEL_CHARS}
                onChange={(e) => onCambiar(r.key, { label: e.target.value })}
                placeholder="Qué ves aquí"
                aria-label={`Qué ves en las semanas del ${formatWeekLong(r.week_start)} al ${formatWeekLong(r.week_end)}`}
                className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] px-2.5 py-1.5 text-body text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]"
              />
              <button
                type="button"
                onClick={() => onQuitar(r.key)}
                aria-label="Quitar esta marca"
                className="v2-focus shrink-0 rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)]"
              >
                <MIcon name="close" size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-label text-[color:var(--v2-muted)]">
                Del {formatWeekLong(r.week_start)} al {formatWeekLong(r.week_end)} ·{' '}
                <span className="v2-num">{semanas}</span> {semanas === 1 ? 'semana' : 'semanas'}
              </span>
              <ChipGroup
                options={OPCIONES_TONO}
                value={r.tone}
                onChange={(tone: RangeTone) => onCambiar(r.key, { tone })}
                ariaLabel="Cómo lo marcas"
                mono={false}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
